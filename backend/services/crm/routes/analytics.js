/**
 * Analytics Routes
 * AFILIATORS Backend - CRM
 *
 * GET /api/analytics/funnel  — Conversion funnel with stage counts, conversion rates, avg time, revenue
 * GET /api/analytics/revenue — Revenue breakdown by status, month, type, and top leads
 */

const express = require('express');
const prisma = require('../../../core/prisma');
const { authenticateToken } = require('../../../core/middleware/auth');

const router = express.Router();
router.use(authenticateToken);

// ==================== CONSTANTS ====================

/**
 * Funnel stage definitions in display order.
 * Each maps one or more DB LeadStatus values to a Portuguese label.
 * PROPOSAL + NEGOTIATION are merged into a single "PROPOSTA" stage.
 */
const FUNNEL_STAGES = [
  { key: 'NOVO',       dbStatuses: ['NEW'],                     isTerminal: false, isLoss: false },
  { key: 'EM_CONTATO', dbStatuses: ['CONTACTED'],               isTerminal: false, isLoss: false },
  { key: 'QUALIFICADO',dbStatuses: ['QUALIFIED'],               isTerminal: false, isLoss: false },
  { key: 'PROPOSTA',   dbStatuses: ['PROPOSAL', 'NEGOTIATION'], isTerminal: false, isLoss: false },
  { key: 'FECHADO',    dbStatuses: ['WON'],                     isTerminal: true,  isLoss: false },
  { key: 'PERDIDO',    dbStatuses: ['LOST'],                    isTerminal: true,  isLoss: true },
];

/** All distinct DB statuses that appear in the funnel */
const ALL_DB_STATUSES = FUNNEL_STAGES.flatMap((s) => s.dbStatuses);

/** Map DB status -> funnel stage key for quick lookup */
const DB_TO_STAGE = {};
for (const stage of FUNNEL_STAGES) {
  for (const db of stage.dbStatuses) {
    DB_TO_STAGE[db] = stage.key;
  }
}

// ==================== HELPERS ====================

/**
 * Resolve the effective operatorId for filtering.
 * ADMINS may pass ?operatorId=X to view another operator's data.
 * Non-admins always see their own data.
 */
function resolveOperatorId(req) {
  if (req.user.role === 'ADMIN' && req.query.operatorId) {
    return parseInt(req.query.operatorId, 10);
  }
  return req.user.operatorId;
}

/**
 * Parse date range from query params.
 * Returns { startDate, endDate } as Date objects (or null if not provided).
 */
function parseDateRange(query) {
  const start = query.startDate ? new Date(query.startDate) : null;
  const end = query.endDate ? new Date(query.endDate) : null;

  // If endDate is provided, extend to end of day
  if (end) {
    end.setHours(23, 59, 59, 999);
  }

  return { startDate: start, endDate: end };
}

/**
 * Build a Prisma `where` clause for leads with optional date range and operatorId.
 */
function buildLeadWhere(operatorId, { startDate, endDate }) {
  const where = { operatorId };

  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) where.createdAt.gte = startDate;
    if (endDate) where.createdAt.lte = endDate;
  }

  return where;
}

// ==================== FUNNEL ====================

/**
 * GET /api/analytics/funnel
 * Query params: ?startDate=2026-01-01&endDate=2026-06-13&operatorId=1
 */
router.get('/funnel', async (req, res) => {
  try {
    const operatorId = resolveOperatorId(req);
    const dateRange = parseDateRange(req.query);
    const where = buildLeadWhere(operatorId, dateRange);

    // ── 1. Total leads ────────────────────────────────────────────
    const totalLeads = await prisma.lead.count({ where });

    // ── 2. Stage counts via groupBy ───────────────────────────────
    const groupResult = await prisma.lead.groupBy({
      by: ['status'],
      where,
      _count: { id: true },
    });

    // Map DB status → count
    const dbCountMap = {};
    for (const row of groupResult) {
      dbCountMap[row.status] = row._count.id;
    }

    // ── 3. Build stage array ──────────────────────────────────────
    const stages = [];
    let previousCount = totalLeads; // NOVO inherits from total

    // First pass: collect counts for all stages
    for (let i = 0; i < FUNNEL_STAGES.length; i++) {
      const stage = FUNNEL_STAGES[i];
      let count = 0;
      for (const db of stage.dbStatuses) {
        count += dbCountMap[db] || 0;
      }

      const pct = totalLeads > 0 ? Math.round((count / totalLeads) * 100 * 10) / 10 : 0;
      const entry = {
        stage: stage.key,
        count,
        pct,
      };

      // Conversion from previous stage (skip NOVO and PERDIDO).
      // Cap at 100% because combined stages (e.g. PROPOSTA = PROPOSAL + NEGOTIATION)
      // may aggregate more leads than the previous single-status stage.
      if (i > 0 && !stage.isLoss) {
        const prevCount = stages[i - 1].count;
        const conv = prevCount > 0
          ? Math.min(Math.round((count / prevCount) * 100 * 10) / 10, 100)
          : 0;
        entry.conversionFromPrev = conv;
      }

      stages.push(entry);
      previousCount = count;
    }

    // ── 4. Average time in stage (from timeline events) ──────────
    const avgTimeInStage = await computeAvgTimeInStage(where, operatorId);

    // ── 5. Conversion rate (total → FECHADO) ─────────────────────
    // Overall funnel conversion: what % of all leads reached FECHADO.
    const fechadoCount = stages.find((s) => s.stage === 'FECHADO')?.count || 0;
    const conversionRate = totalLeads > 0
      ? Math.round((fechadoCount / totalLeads) * 100 * 10) / 10
      : 0;

    // ── 6. Revenue generated (PAID pix from FECHADO leads) ───────
    const revenueResult = await prisma.pixTransaction.aggregate({
      _sum: { amount: true },
      where: {
        operatorId,
        status: 'PAID',
        lead: { status: 'WON' },
        ...(dateRange.startDate || dateRange.endDate ? {
          createdAt: {
            ...(dateRange.startDate && { gte: dateRange.startDate }),
            ...(dateRange.endDate && { lte: dateRange.endDate }),
          },
        } : {}),
      },
    });
    const revenueGenerated = revenueResult._sum.amount
      ? parseFloat(revenueResult._sum.amount)
      : 0;

    res.json({
      success: true,
      data: {
        stages,
        avgTimeInStage,
        totalLeads,
        conversionRate,
        revenueGenerated,
      },
    });
  } catch (error) {
    console.error('Error computing funnel:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to compute funnel analytics',
      message: error.message,
    });
  }
});

/**
 * Compute average time spent in each stage using timeline events.
 * Returns an object keyed by funnel stage key, e.g. { "NOVO": "2.3h", "EM_CONTATO": "18.5h" }
 */
async function computeAvgTimeInStage(baseWhere, operatorId) {
  // Get all leads that match the base filter
  const leads = await prisma.lead.findMany({
    where: baseWhere,
    select: { id: true, status: true, createdAt: true },
  });

  if (leads.length === 0) return {};

  const leadIds = leads.map((l) => l.id);

  // Fetch all STATUS_CHANGE events for these leads
  const events = await prisma.timelineEvent.findMany({
    where: {
      leadId: { in: leadIds },
      type: 'STATUS_CHANGE',
    },
    orderBy: { createdAt: 'asc' },
    select: { leadId: true, createdAt: true, payload: true },
  });

  // Group events by leadId
  const eventsByLead = {};
  for (const ev of events) {
    if (!eventsByLead[ev.leadId]) eventsByLead[ev.leadId] = [];
    eventsByLead[ev.leadId].push(ev);
  }

  // Accumulate total time (ms) and count per stage
  const accum = {}; // { stageKey: { totalMs: number, count: number } }
  const now = new Date();

  for (const lead of leads) {
    const leadEvents = eventsByLead[lead.id] || [];
    let prevTime = new Date(lead.createdAt).getTime();
    let prevStage = DB_TO_STAGE['NEW']; // all leads start as NEW
    // Note: a lead could have been created directly in another status via seed/manual;
    // in that case the first "stage" is whatever DB_TO_STAGE says for the createdAt status.
    // We'll still use NEW as the initial stage since the funnel assumes NEW → ...

    // If the lead was created directly in a non-NEW status, use that status as starting point,
    // but still anchored at createdAt. The first timeline event's oldStatus tells us the real flow.
    for (const ev of leadEvents) {
      const oldStatus = ev.payload?.oldStatus;
      const newStatus = ev.payload?.newStatus;
      const evTime = new Date(ev.createdAt).getTime();

      // Time spent in oldStatus = event time - previous event time
      if (oldStatus && DB_TO_STAGE[oldStatus]) {
        const stageKey = DB_TO_STAGE[oldStatus];
        const duration = evTime - prevTime;

        if (!accum[stageKey]) accum[stageKey] = { totalMs: 0, count: 0 };
        accum[stageKey].totalMs += duration;
        accum[stageKey].count += 1;
      }

      prevTime = evTime;
      prevStage = newStatus && DB_TO_STAGE[newStatus] ? DB_TO_STAGE[newStatus] : prevStage;
    }

    // Time spent in current (final) stage = now - last event time
    // Only count if the lead is NOT in a terminal/perdido stage (those are "done")
    const currentStageKey = DB_TO_STAGE[lead.status];
    if (currentStageKey && currentStageKey !== 'FECHADO' && currentStageKey !== 'PERDIDO') {
      const duration = now.getTime() - prevTime;
      if (!accum[currentStageKey]) accum[currentStageKey] = { totalMs: 0, count: 0 };
      accum[currentStageKey].totalMs += duration;
      accum[currentStageKey].count += 1;
    }
  }

  // Format durations
  const result = {};
  for (const [stageKey, data] of Object.entries(accum)) {
    if (data.count === 0) continue;
    const avgMs = data.totalMs / data.count;
    result[stageKey] = formatDuration(avgMs);
  }

  return result;
}

/**
 * Format milliseconds into a human-readable duration string.
 * e.g. 8280000 → "2.3h", 64800000 → "18.0h", 183600000 → "2.1d", 328320000 → "3.8d"
 */
function formatDuration(ms) {
  const minutes = ms / 60000;
  const hours = minutes / 60;
  const days = hours / 24;

  if (days >= 1) {
    return `${(Math.round(days * 10) / 10).toFixed(1)}d`;
  }
  if (hours >= 1) {
    return `${(Math.round(hours * 10) / 10).toFixed(1)}h`;
  }
  return `${Math.round(minutes)}min`;
}

// ==================== REVENUE ====================

/**
 * GET /api/analytics/revenue
 * Query params: ?startDate=2026-01-01&endDate=2026-06-13&operatorId=1
 */
router.get('/revenue', async (req, res) => {
  try {
    const operatorId = resolveOperatorId(req);
    const { startDate, endDate } = parseDateRange(req.query);

    // Base where clause for pix transactions
    const pixWhere = {
      operatorId,
      status: { in: ['PENDING', 'PAID'] },
      ...(startDate || endDate ? {
        createdAt: {
          ...(startDate && { gte: startDate }),
          ...(endDate && { lte: endDate }),
        },
      } : {}),
    };

    // ── 1. Aggregated totals by status ────────────────────────────
    const [pendingResult, paidResult, totalResult] = await Promise.all([
      prisma.pixTransaction.aggregate({
        _sum: { amount: true },
        where: { ...pixWhere, status: 'PENDING' },
      }),
      prisma.pixTransaction.aggregate({
        _sum: { amount: true },
        where: { ...pixWhere, status: 'PAID' },
      }),
      prisma.pixTransaction.aggregate({
        _sum: { amount: true },
        where: pixWhere,
      }),
    ]);

    const pending = pendingResult._sum.amount ? parseFloat(pendingResult._sum.amount) : 0;
    const paid = paidResult._sum.amount ? parseFloat(paidResult._sum.amount) : 0;
    const confirmed = paid; // confirmed = PAID (money received)
    const total = pendingResult._sum.amount || paidResult._sum.amount
      ? pending + paid
      : 0;

    // ── 2. Revenue by month ───────────────────────────────────────
    const byMonth = await computeRevenueByMonth(operatorId, startDate, endDate);

    // ── 3. Revenue by type (deal-based) ──────────────────────────
    const byType = await computeRevenueByType(operatorId, startDate, endDate);

    // ── 4. Top leads by commission ────────────────────────────────
    const topLeads = await computeTopLeads(operatorId, startDate, endDate);

    res.json({
      success: true,
      data: {
        total: Math.round(total * 100) / 100,
        pending: Math.round(pending * 100) / 100,
        confirmed: Math.round(confirmed * 100) / 100,
        paid: Math.round(paid * 100) / 100,
        byMonth,
        byType,
        topLeads,
      },
    });
  } catch (error) {
    console.error('Error computing revenue:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to compute revenue analytics',
      message: error.message,
    });
  }
});

/**
 * Aggregate revenue grouped by YYYY-MM month.
 */
async function computeRevenueByMonth(operatorId, startDate, endDate) {
  const transactions = await prisma.pixTransaction.findMany({
    where: {
      operatorId,
      status: 'PAID',
      ...(startDate || endDate ? {
        createdAt: {
          ...(startDate && { gte: startDate }),
          ...(endDate && { lte: endDate }),
        },
      } : {}),
    },
    select: { amount: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });

  const monthMap = {};
  for (const tx of transactions) {
    const d = new Date(tx.createdAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!monthMap[key]) monthMap[key] = 0;
    monthMap[key] += parseFloat(tx.amount);
  }

  return Object.entries(monthMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, amount]) => ({ [month]: Math.round(amount * 100) / 100 }));
}

/**
 * Aggregate revenue by deal type.
 * Since we don't have explicit commission types in the schema yet,
 * we derive SIGNUP_BONUS from leads without deals and TRANSACTION_PCT from leads with deals.
 */
async function computeRevenueByType(operatorId, startDate, endDate) {
  // PAID transactions with a deal → TRANSACTION_PCT
  const dealTxWhere = {
    operatorId,
    status: 'PAID',
    dealId: { not: null },
    ...(startDate || endDate ? {
      createdAt: {
        ...(startDate && { gte: startDate }),
        ...(endDate && { lte: endDate }),
      },
    } : {}),
  };

  // PAID transactions without a deal → SIGNUP_BONUS
  const noDealTxWhere = {
    operatorId,
    status: 'PAID',
    dealId: null,
    ...(startDate || endDate ? {
      createdAt: {
        ...(startDate && { gte: startDate }),
        ...(endDate && { lte: endDate }),
      },
    } : {}),
  };

  const [dealResult, noDealResult] = await Promise.all([
    prisma.pixTransaction.aggregate({ _sum: { amount: true }, where: dealTxWhere }),
    prisma.pixTransaction.aggregate({ _sum: { amount: true }, where: noDealTxWhere }),
  ]);

  const result = [];
  const dealAmount = dealResult._sum.amount ? parseFloat(dealResult._sum.amount) : 0;
  const noDealAmount = noDealResult._sum.amount ? parseFloat(noDealResult._sum.amount) : 0;

  if (noDealAmount > 0) {
    result.push({ SIGNUP_BONUS: Math.round(noDealAmount * 100) / 100 });
  }
  if (dealAmount > 0) {
    result.push({ TRANSACTION_PCT: Math.round(dealAmount * 100) / 100 });
  }

  return result;
}

/**
 * Get top leads ordered by total commission (PAID pix amount).
 */
async function computeTopLeads(operatorId, startDate, endDate) {
  const transactions = await prisma.pixTransaction.findMany({
    where: {
      operatorId,
      status: 'PAID',
      leadId: { not: null },
      ...(startDate || endDate ? {
        createdAt: {
          ...(startDate && { gte: startDate }),
          ...(endDate && { lte: endDate }),
        },
      } : {}),
    },
    select: {
      amount: true,
      lead: { select: { id: true, name: true } },
    },
  });

  // Aggregate by lead
  const leadMap = {};
  for (const tx of transactions) {
    if (!tx.lead) continue;
    const key = tx.lead.id;
    if (!leadMap[key]) {
      leadMap[key] = { id: tx.lead.id, name: tx.lead.name, totalCommission: 0 };
    }
    leadMap[key].totalCommission += parseFloat(tx.amount);
  }

  return Object.values(leadMap)
    .sort((a, b) => b.totalCommission - a.totalCommission)
    .slice(0, 10)
    .map((l) => ({
      ...l,
      totalCommission: Math.round(l.totalCommission * 100) / 100,
    }));
}

module.exports = router;
