/**
 * Comissoes Routes
 * AFILIATORS Backend - CRM
 *
 * Gerencia comissoes do programa de afiliados Revolut.
 * Rastreia bonus de cadastro, percentual de transacoes,
 * upgrades premium e bonus de indicacao.
 */

const express = require('express');
const prisma = require('../../../core/prisma');
const { authenticateToken } = require('../../../core/middleware/auth');

const router = express.Router();
router.use(authenticateToken);

// ==================== CRUD ====================

/**
 * POST /api/crm/commissions
 * Criar uma nova comissao
 */
router.post('/', async (req, res) => {
  try {
    const {
      operatorId, leadId, amount, currency, type,
      description, status, sourceRef, confirmedAt, paidAt,
    } = req.body;

    if (!amount || !type) {
      return res.status(400).json({
        success: false,
        error: 'Valor (amount) e tipo (type) sao obrigatorios',
      });
    }

    const validTypes = ['SIGNUP_BONUS', 'TRANSACTION_PCT', 'PREMIUM_UPGRADE', 'REFERRAL_BONUS', 'OTHER'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        error: `Tipo invalido. Valores aceitos: ${validTypes.join(', ')}`,
      });
    }

    // Se leadId informado, verifica se o lead existe e pertence ao operador
    if (leadId) {
      const lead = await prisma.lead.findFirst({
        where: { id: parseInt(leadId), operatorId: req.user.operatorId },
      });
      if (!lead) {
        return res.status(404).json({
          success: false,
          error: 'Lead nao encontrado ou nao pertence ao seu operador',
        });
      }
    }

    const commission = await prisma.commission.create({
      data: {
        operatorId: operatorId || req.user.operatorId,
        leadId: leadId ? parseInt(leadId) : null,
        amount: parseFloat(amount),
        currency: currency || 'BRL',
        type,
        description: description || null,
        status: status || 'PENDING',
        sourceRef: sourceRef || null,
        confirmedAt: confirmedAt ? new Date(confirmedAt) : null,
        paidAt: paidAt ? new Date(paidAt) : null,
      },
      include: {
        operator: { select: { id: true, name: true, email: true } },
        lead: { select: { id: true, name: true, email: true, status: true } },
      },
    });

    res.status(201).json({ success: true, data: commission });
  } catch (error) {
    console.error('Erro ao criar comissao:', error);
    res.status(500).json({ success: false, error: 'Falha ao criar comissao', message: error.message });
  }
});

/**
 * GET /api/crm/commissions
 * Listar comissoes (paginado, com filtros)
 */
router.get('/', async (req, res) => {
  try {
    const {
      status, type, operatorId, leadId,
      startDate, endDate, search,
      page = 1, limit = 50,
    } = req.query;
    const pageNum = parseInt(page);
    const limitNum = Math.min(parseInt(limit), 200);
    const skip = (pageNum - 1) * limitNum;

    const where = { operatorId: req.user.operatorId };

    if (status) where.status = status;
    if (type) where.type = type;
    if (leadId) where.leadId = parseInt(leadId);

    // Filtro por periodo (createdAt)
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    // Busca textual
    if (search) {
      where.OR = [
        { description: { contains: search, mode: 'insensitive' } },
        { sourceRef: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [commissions, total] = await Promise.all([
      prisma.commission.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { createdAt: 'desc' },
        include: {
          operator: { select: { id: true, name: true, email: true } },
          lead: { select: { id: true, name: true, email: true, status: true } },
        },
      }),
      prisma.commission.count({ where }),
    ]);

    res.json({
      success: true,
      data: commissions,
      pagination: {
        total,
        page: pageNum,
        totalPages: Math.ceil(total / limitNum),
        limit: limitNum,
      },
    });
  } catch (error) {
    console.error('Erro ao listar comissoes:', error);
    res.status(500).json({ success: false, error: 'Falha ao listar comissoes', message: error.message });
  }
});

/**
 * GET /api/crm/commissions/stats
 * Estatisticas de comissoes
 */
router.get('/stats', async (req, res) => {
  try {
    const operatorId = req.user.operatorId;
    const { startDate, endDate } = req.query;

    const dateFilter = {};
    if (startDate || endDate) {
      dateFilter.createdAt = {};
      if (startDate) dateFilter.createdAt.gte = new Date(startDate);
      if (endDate) dateFilter.createdAt.lte = new Date(endDate);
    }

    const where = { operatorId, ...dateFilter };

    // Totais e contagens
    const [total, byStatus, byType] = await Promise.all([
      prisma.commission.count({ where }),
      prisma.commission.groupBy({
        by: ['status'],
        where,
        _count: { id: true },
        _sum: { amount: true },
      }),
      prisma.commission.groupBy({
        by: ['type'],
        where,
        _count: { id: true },
        _sum: { amount: true },
      }),
    ]);

    // Soma total de todos os valores
    const allCommissions = await prisma.commission.findMany({
      where,
      select: { amount: true, status: true },
    });

    const totalAmount = allCommissions.reduce((sum, c) => sum + parseFloat(c.amount || 0), 0);
    const pendingAmount = allCommissions
      .filter((c) => c.status === 'PENDING')
      .reduce((sum, c) => sum + parseFloat(c.amount || 0), 0);
    const confirmedAmount = allCommissions
      .filter((c) => c.status === 'CONFIRMED')
      .reduce((sum, c) => sum + parseFloat(c.amount || 0), 0);
    const paidAmount = allCommissions
      .filter((c) => c.status === 'PAID')
      .reduce((sum, c) => sum + parseFloat(c.amount || 0), 0);

    const stats = {
      total,
      totalAmount: Math.round(totalAmount * 100) / 100,
      byStatusSummary: {
        pending: pendingAmount,
        confirmed: confirmedAmount,
        paid: paidAmount,
      },
      byStatus: byStatus.map((item) => ({
        status: item.status,
        count: item._count.id,
        total: item._sum.amount ? Math.round(parseFloat(item._sum.amount) * 100) / 100 : 0,
      })),
      byType: byType.map((item) => ({
        type: item.type,
        count: item._count.id,
        total: item._sum.amount ? Math.round(parseFloat(item._sum.amount) * 100) / 100 : 0,
      })),
    };

    res.json({ success: true, data: stats });
  } catch (error) {
    console.error('Erro ao buscar estatisticas:', error);
    res.status(500).json({ success: false, error: 'Falha ao buscar estatisticas', message: error.message });
  }
});

/**
 * GET /api/crm/commissions/monthly-trends
 * Tendencias mensais de comissoes (ultimos 12 meses)
 */
router.get('/monthly-trends', async (req, res) => {
  try {
    const operatorId = req.user.operatorId;

    // Busca comissoes dos ultimos 12 meses
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

    const commissions = await prisma.commission.findMany({
      where: {
        operatorId,
        createdAt: { gte: twelveMonthsAgo },
      },
      select: { amount: true, status: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    // Agrupa por mes (YYYY-MM)
    const monthlyMap = {};
    for (const c of commissions) {
      const month = c.createdAt.toISOString().slice(0, 7); // "2026-06"
      if (!monthlyMap[month]) {
        monthlyMap[month] = { month, total: 0, count: 0, pending: 0, confirmed: 0, paid: 0 };
      }
      const amount = parseFloat(c.amount || 0);
      monthlyMap[month].total += amount;
      monthlyMap[month].count += 1;
      if (c.status === 'PENDING') monthlyMap[month].pending += amount;
      if (c.status === 'CONFIRMED') monthlyMap[month].confirmed += amount;
      if (c.status === 'PAID') monthlyMap[month].paid += amount;
    }

    // Arredonda valores e converte para array ordenado
    const trends = Object.values(monthlyMap)
      .map((m) => ({
        ...m,
        total: Math.round(m.total * 100) / 100,
        pending: Math.round(m.pending * 100) / 100,
        confirmed: Math.round(m.confirmed * 100) / 100,
        paid: Math.round(m.paid * 100) / 100,
      }))
      .sort((a, b) => a.month.localeCompare(b.month));

    res.json({ success: true, data: trends });
  } catch (error) {
    console.error('Erro ao buscar tendencias mensais:', error);
    res.status(500).json({ success: false, error: 'Falha ao buscar tendencias mensais', message: error.message });
  }
});

/**
 * GET /api/crm/commissions/:id
 * Buscar comissao por ID
 */
router.get('/:id', async (req, res) => {
  try {
    const commission = await prisma.commission.findFirst({
      where: {
        id: req.params.id,
        operatorId: req.user.operatorId,
      },
      include: {
        operator: { select: { id: true, name: true, email: true } },
        lead: { select: { id: true, name: true, email: true, status: true, phone: true } },
      },
    });

    if (!commission) {
      return res.status(404).json({ success: false, error: 'Comissao nao encontrada' });
    }

    res.json({ success: true, data: commission });
  } catch (error) {
    console.error('Erro ao buscar comissao:', error);
    res.status(500).json({ success: false, error: 'Falha ao buscar comissao', message: error.message });
  }
});

/**
 * PUT /api/crm/commissions/:id
 * Atualizar comissao
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      leadId, amount, currency, type, description,
      status, sourceRef, confirmedAt, paidAt,
    } = req.body;

    // Verifica se a comissao existe e pertence ao operador
    const existing = await prisma.commission.findFirst({
      where: { id, operatorId: req.user.operatorId },
    });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Comissao nao encontrada' });
    }

    // Valida tipo se informado
    if (type) {
      const validTypes = ['SIGNUP_BONUS', 'TRANSACTION_PCT', 'PREMIUM_UPGRADE', 'REFERRAL_BONUS', 'OTHER'];
      if (!validTypes.includes(type)) {
        return res.status(400).json({
          success: false,
          error: `Tipo invalido. Valores aceitos: ${validTypes.join(', ')}`,
        });
      }
    }

    // Se leadId informado, verifica se existe
    if (leadId !== undefined) {
      if (leadId !== null) {
        const lead = await prisma.lead.findFirst({
          where: { id: parseInt(leadId), operatorId: req.user.operatorId },
        });
        if (!lead) {
          return res.status(404).json({
            success: false,
            error: 'Lead nao encontrado ou nao pertence ao seu operador',
          });
        }
      }
    }

    const commission = await prisma.commission.update({
      where: { id },
      data: {
        ...(leadId !== undefined && { leadId: leadId ? parseInt(leadId) : null }),
        ...(amount !== undefined && { amount: parseFloat(amount) }),
        ...(currency !== undefined && { currency }),
        ...(type !== undefined && { type }),
        ...(description !== undefined && { description }),
        ...(status !== undefined && { status }),
        ...(sourceRef !== undefined && { sourceRef }),
        ...(confirmedAt !== undefined && { confirmedAt: confirmedAt ? new Date(confirmedAt) : null }),
        ...(paidAt !== undefined && { paidAt: paidAt ? new Date(paidAt) : null }),
      },
      include: {
        operator: { select: { id: true, name: true, email: true } },
        lead: { select: { id: true, name: true, email: true, status: true } },
      },
    });

    res.json({ success: true, data: commission });
  } catch (error) {
    console.error('Erro ao atualizar comissao:', error);
    res.status(500).json({ success: false, error: 'Falha ao atualizar comissao', message: error.message });
  }
});

/**
 * DELETE /api/crm/commissions/:id
 * Excluir comissao
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await prisma.commission.findFirst({
      where: { id, operatorId: req.user.operatorId },
    });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Comissao nao encontrada' });
    }

    await prisma.commission.delete({ where: { id } });

    res.json({ success: true, message: 'Comissao excluida com sucesso' });
  } catch (error) {
    console.error('Erro ao excluir comissao:', error);
    res.status(500).json({ success: false, error: 'Falha ao excluir comissao', message: error.message });
  }
});

module.exports = router;
