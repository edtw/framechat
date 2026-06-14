/**
 * Deals (Negocios) Routes
 * AFILIATORS Backend - CRM
 */

const express = require('express');
const prisma = require('../../../core/prisma');
const { authenticateToken } = require('../../../core/middleware/auth');

const router = express.Router();
router.use(authenticateToken);

const STAGE_LABELS = {
  PROPOSAL: 'Em Aberto',
  NEGOTIATION: 'Em Aberto',
  CONTRACT: 'Em Aberto',
  WON: 'Ganho',
  LOST: 'Perdido',
};

/**
 * GET /api/crm/deals
 */
router.get('/', async (req, res) => {
  try {
    const operatorId = req.user.operatorId;
    const { search, status } = req.query;

    const where = { operatorId };

    if (status && status !== 'ALL') {
      if (status === 'OPEN') {
        where.stage = { in: ['PROPOSAL', 'NEGOTIATION', 'CONTRACT'] };
      } else {
        where.stage = status;
      }
    }

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { lead: { name: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const deals = await prisma.deal.findMany({
      where,
      include: {
        lead: { select: { id: true, name: true, company: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const mapped = deals.map((d) => ({
      id: d.id,
      title: d.title,
      value: d.value ? Number(d.value) : null,
      status: d.stage === 'WON' ? 'WON' : d.stage === 'LOST' ? 'LOST' : 'OPEN',
      stage: d.stage,
      leadName: d.lead?.name || null,
      company: d.lead?.company || null,
      probability: d.probability,
      expectedCloseDate: d.expectedCloseDate,
      createdAt: d.createdAt,
      notes: null,
    }));

    res.json({ success: true, deals: mapped });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load deals', message: error.message });
  }
});

/**
 * POST /api/crm/deals
 */
router.post('/', async (req, res) => {
  try {
    const operatorId = req.user.operatorId;
    const { title, value, leadId, expectedCloseDate, probability } = req.body;

    if (!title || !leadId) {
      return res.status(400).json({ error: 'Title and leadId are required' });
    }

    const deal = await prisma.deal.create({
      data: {
        title,
        value: value || null,
        leadId: parseInt(leadId),
        operatorId,
        expectedCloseDate: expectedCloseDate ? new Date(expectedCloseDate) : null,
        probability: probability || 50,
        stage: 'PROPOSAL',
      },
      include: {
        lead: { select: { id: true, name: true, company: true } },
      },
    });

    res.status(201).json({
      success: true,
      deal: {
        id: deal.id,
        title: deal.title,
        value: deal.value ? Number(deal.value) : null,
        status: 'OPEN',
        stage: deal.stage,
        leadName: deal.lead?.name || null,
        company: deal.lead?.company || null,
        probability: deal.probability,
        expectedCloseDate: deal.expectedCloseDate,
        createdAt: deal.createdAt,
      },
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create deal', message: error.message });
  }
});

/**
 * PATCH /api/crm/deals/:id
 */
router.patch('/:id', async (req, res) => {
  try {
    const operatorId = req.user.operatorId;
    const { id } = req.params;
    const { title, value, stage, probability, expectedCloseDate } = req.body;

    const existing = await prisma.deal.findFirst({
      where: { id: parseInt(id), operatorId },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Deal not found' });
    }

    const data = {};
    if (title !== undefined) data.title = title;
    if (value !== undefined) data.value = value;
    if (stage !== undefined) data.stage = stage;
    if (probability !== undefined) data.probability = probability;
    if (expectedCloseDate !== undefined) data.expectedCloseDate = new Date(expectedCloseDate);

    const updated = await prisma.deal.update({
      where: { id: parseInt(id) },
      data,
      include: { lead: { select: { id: true, name: true, company: true } } },
    });

    res.json({
      success: true,
      deal: {
        id: updated.id,
        title: updated.title,
        value: updated.value ? Number(updated.value) : null,
        status: updated.stage === 'WON' ? 'WON' : updated.stage === 'LOST' ? 'LOST' : 'OPEN',
        stage: updated.stage,
        leadName: updated.lead?.name || null,
        company: updated.lead?.company || null,
        probability: updated.probability,
        expectedCloseDate: updated.expectedCloseDate,
        createdAt: updated.createdAt,
      },
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update deal', message: error.message });
  }
});

module.exports = router;
