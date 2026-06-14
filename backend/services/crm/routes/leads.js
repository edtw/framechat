/**
 * Leads Routes
 * AFILIATORS Backend - CRM
 */

const express = require('express');
const prisma = require('../../../core/prisma');
const { authenticateToken } = require('../../../core/middleware/auth');

const router = express.Router();
router.use(authenticateToken);

// ==================== CRUD ====================

/**
 * POST /api/crm/leads
 * Create a new lead
 */
router.post('/', async (req, res) => {
  try {
    const { name, email, phone, company, cpf, value, description, status, priority, score, source } = req.body;

    if (!name || !email || !phone) {
      return res.status(400).json({
        success: false,
        error: 'Name, email, and phone are required',
      });
    }

    const lead = await prisma.lead.create({
      data: {
        operatorId: req.user.operatorId,
        name,
        email,
        phone,
        company: company || null,
        cpf: cpf || null,
        value: value ? parseFloat(value) : null,
        description: description || null,
        status: status || 'NEW',
        priority: priority || 'MEDIUM',
        score: score || null,
        source: source || null,
      },
      include: {
        tags: { include: { tag: true } },
      },
    });

    res.status(201).json({ success: true, data: lead });
  } catch (error) {
    console.error('Error creating lead:', error);
    res.status(500).json({ success: false, error: 'Failed to create lead', message: error.message });
  }
});

/**
 * GET /api/crm/leads
 * List leads (paginated, filterable)
 */
router.get('/', async (req, res) => {
  try {
    const { status, priority, search, tag, page = 1, limit = 50, sortBy, order = 'desc' } = req.query;
    const pageNum = parseInt(page);
    const limitNum = Math.min(parseInt(limit), 200);
    const skip = (pageNum - 1) * limitNum;

    const where = { operatorId: req.user.operatorId };

    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
        { company: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (tag) {
      where.tags = { some: { tag: { name: tag } } };
    }

    // Dynamic sorting — only allow known fields to prevent injection
    const ALLOWED_SORT_FIELDS = ['aiScore', 'score', 'createdAt', 'updatedAt', 'value', 'name', 'status', 'priority', 'lastContact'];
    const sortField = ALLOWED_SORT_FIELDS.includes(sortBy) ? sortBy : 'updatedAt';
    const sortDir = order === 'asc' ? 'asc' : 'desc';
    const orderBy = { [sortField]: sortDir };

    const [leads, total] = await Promise.all([
      prisma.lead.findMany({
        where,
        skip,
        take: limitNum,
        orderBy,
        include: {
          tags: { include: { tag: true } },
          deal: true,
        },
      }),
      prisma.lead.count({ where }),
    ]);

    res.json({
      success: true,
      data: leads,
      pagination: {
        total,
        page: pageNum,
        totalPages: Math.ceil(total / limitNum),
        limit: limitNum,
      },
    });
  } catch (error) {
    console.error('Error listing leads:', error);
    res.status(500).json({ success: false, error: 'Failed to list leads', message: error.message });
  }
});

/**
 * GET /api/crm/leads/stats
 * Get lead statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const operatorId = req.user.operatorId;

    const [total, byStatus] = await Promise.all([
      prisma.lead.count({ where: { operatorId } }),
      prisma.lead.groupBy({
        by: ['status'],
        where: { operatorId },
        _count: { id: true },
      }),
    ]);

    const stats = {
      total,
      byStatus: byStatus.reduce((acc, item) => {
        acc[item.status] = item._count.id;
        return acc;
      }, {}),
    };

    res.json({ success: true, data: stats });
  } catch (error) {
    console.error('Error getting stats:', error);
    res.status(500).json({ success: false, error: 'Failed to get stats', message: error.message });
  }
});

/**
 * POST /api/crm/leads/batch-score
 * Score all leads that haven't been scored in 24h.
 * Returns { scored: N, failed: N }
 */
router.post('/batch-score', async (req, res) => {
  try {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const leadsToScore = await prisma.lead.findMany({
      where: {
        operatorId: req.user.operatorId,
        OR: [
          { aiScoreUpdatedAt: null },
          { aiScoreUpdatedAt: { lt: cutoff } },
        ],
      },
      select: {
        id: true,
        name: true,
        status: true,
        value: true,
        cpf: true,
        email: true,
        phone: true,
      },
    });

    let scored = 0;
    let failed = 0;

    const axios = require('axios');

    for (const lead of leadsToScore) {
      try {
        const { data } = await axios.post(
          'http://ai-handler:8000/api/chat/score-lead',
          {
            conversation_messages: [], // batch mode — no live conversation
            lead_data: {
              id: lead.id,
              name: lead.name,
              status: lead.status,
              value: lead.value,
              cpf: lead.cpf,
              email: lead.email,
              phone: lead.phone,
            },
            pipeline_stage: lead.status,
          },
          { timeout: 15000 },
        );

        await prisma.lead.update({
          where: { id: lead.id },
          data: {
            aiScore: data.score ?? data.aiScore ?? null,
            scoreFactors: data.factors ?? data.scoreFactors ?? null,
            aiScoreUpdatedAt: new Date(),
          },
        });

        scored++;
      } catch (err) {
        console.error(`Batch score failed for lead ${lead.id}:`, err.message);
        failed++;
      }
    }

    res.json({ success: true, data: { scored, failed } });
  } catch (error) {
    console.error('Error batch scoring leads:', error);
    res.status(500).json({ success: false, error: 'Failed to batch score leads', message: error.message });
  }
});

/**
 * GET /api/crm/leads/:id
 * Get lead by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const lead = await prisma.lead.findFirst({
      where: { id: parseInt(req.params.id), operatorId: req.user.operatorId },
      include: {
        tags: { include: { tag: true } },
        notes: true,
        deal: true,
        followUps: { orderBy: { createdAt: 'desc' }, take: 10 },
        timeline: { orderBy: { createdAt: 'desc' }, take: 20 },
        consent: true,
      },
    });

    if (!lead) {
      return res.status(404).json({ success: false, error: 'Lead not found' });
    }

    res.json({ success: true, data: lead });
  } catch (error) {
    console.error('Error fetching lead:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch lead', message: error.message });
  }
});

/**
 * PUT /api/crm/leads/:id
 * Update lead
 */
router.put('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, email, phone, company, cpf, value, description, status, priority, score, source } = req.body;

    // Verify ownership
    const existing = await prisma.lead.findFirst({
      where: { id, operatorId: req.user.operatorId },
    });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Lead not found' });
    }

    const lead = await prisma.lead.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(email !== undefined && { email }),
        ...(phone !== undefined && { phone }),
        ...(company !== undefined && { company }),
        ...(cpf !== undefined && { cpf }),
        ...(value !== undefined && { value: parseFloat(value) }),
        ...(description !== undefined && { description }),
        ...(status !== undefined && { status }),
        ...(priority !== undefined && { priority }),
        ...(score !== undefined && { score: parseInt(score) }),
        ...(source !== undefined && { source }),
      },
      include: {
        tags: { include: { tag: true } },
        deal: true,
      },
    });

    res.json({ success: true, data: lead });
  } catch (error) {
    console.error('Error updating lead:', error);
    res.status(500).json({ success: false, error: 'Failed to update lead', message: error.message });
  }
});

/**
 * DELETE /api/crm/leads/:id
 * Delete lead
 */
router.delete('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    const existing = await prisma.lead.findFirst({
      where: { id, operatorId: req.user.operatorId },
    });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Lead not found' });
    }

    await prisma.lead.delete({ where: { id } });

    res.json({ success: true, message: 'Lead deleted successfully' });
  } catch (error) {
    console.error('Error deleting lead:', error);
    res.status(500).json({ success: false, error: 'Failed to delete lead', message: error.message });
  }
});

// ==================== STATUS ====================

/**
 * PATCH /api/crm/leads/:id/status
 * Update lead status
 */
router.patch('/:id/status', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ success: false, error: 'Status is required' });
    }

    const existing = await prisma.lead.findFirst({
      where: { id, operatorId: req.user.operatorId },
    });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Lead not found' });
    }

    const lead = await prisma.lead.update({
      where: { id },
      data: { status, lastContact: new Date() },
    });

    // Create timeline event
    await prisma.timelineEvent.create({
      data: {
        operatorId: req.user.operatorId,
        leadId: id,
        type: 'STATUS_CHANGE',
        payload: { oldStatus: existing.status, newStatus: status },
      },
    });

    res.json({ success: true, data: lead });
  } catch (error) {
    console.error('Error updating lead status:', error);
    res.status(500).json({ success: false, error: 'Failed to update lead status', message: error.message });
  }
});

// ==================== TAGS ====================

/**
 * POST /api/crm/leads/:id/tags
 * Add tags to a lead
 */
router.post('/:id/tags', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { tags: tagNames } = req.body;

    if (!tagNames || !Array.isArray(tagNames)) {
      return res.status(400).json({ success: false, error: 'Tags array is required' });
    }

    const existing = await prisma.lead.findFirst({
      where: { id, operatorId: req.user.operatorId },
    });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Lead not found' });
    }

    // Upsert tags and create associations
    for (const tagName of tagNames) {
      const tag = await prisma.tag.upsert({
        where: { name: tagName },
        update: {},
        create: { name: tagName },
      });

      await prisma.leadTag.upsert({
        where: { leadId_tagId: { leadId: id, tagId: tag.id } },
        update: {},
        create: { leadId: id, tagId: tag.id },
      });
    }

    const lead = await prisma.lead.findUnique({
      where: { id },
      include: { tags: { include: { tag: true } } },
    });

    res.json({ success: true, data: lead });
  } catch (error) {
    console.error('Error adding tags:', error);
    res.status(500).json({ success: false, error: 'Failed to add tags', message: error.message });
  }
});

/**
 * DELETE /api/crm/leads/:id/tags/:tagId
 * Remove tag from lead
 */
router.delete('/:id/tags/:tagId', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const tagId = parseInt(req.params.tagId);

    const existing = await prisma.lead.findFirst({
      where: { id, operatorId: req.user.operatorId },
    });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Lead not found' });
    }

    await prisma.leadTag.deleteMany({
      where: { leadId: id, tagId },
    });

    const lead = await prisma.lead.findUnique({
      where: { id },
      include: { tags: { include: { tag: true } } },
    });

    res.json({ success: true, data: lead });
  } catch (error) {
    console.error('Error removing tag:', error);
    res.status(500).json({ success: false, error: 'Failed to remove tag', message: error.message });
  }
});

// ==================== NOTES ====================

/**
 * GET /api/crm/leads/:id/notes
 */
router.get('/:id/notes', async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    const existing = await prisma.lead.findFirst({
      where: { id, operatorId: req.user.operatorId },
    });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Lead not found' });
    }

    const notes = await prisma.note.findMany({
      where: { leadId: id },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ success: true, data: notes });
  } catch (error) {
    console.error('Error fetching notes:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch notes', message: error.message });
  }
});

/**
 * POST /api/crm/leads/:id/notes
 */
router.post('/:id/notes', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { content } = req.body;

    if (!content) {
      return res.status(400).json({ success: false, error: 'Content is required' });
    }

    const existing = await prisma.lead.findFirst({
      where: { id, operatorId: req.user.operatorId },
    });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Lead not found' });
    }

    const note = await prisma.note.create({
      data: { leadId: id, content },
    });

    // Create timeline event
    await prisma.timelineEvent.create({
      data: {
        operatorId: req.user.operatorId,
        leadId: id,
        type: 'NOTE',
        payload: { noteId: note.id, content },
      },
    });

    res.status(201).json({ success: true, data: note });
  } catch (error) {
    console.error('Error creating note:', error);
    res.status(500).json({ success: false, error: 'Failed to create note', message: error.message });
  }
});

// ==================== AI SCORING ====================

/**
 * POST /api/crm/leads/:id/score
 * Trigger AI scoring for a single lead.
 * Calls AI handler: POST http://ai-handler:8000/api/chat/score-lead
 * Body: { conversation_messages: [...], lead_data: {...}, pipeline_stage: "..." }
 * Stores result in aiScore + scoreFactors + aiScoreUpdatedAt.
 * Returns { score, factors, explanation }
 */
router.post('/:id/score', async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    const lead = await prisma.lead.findFirst({
      where: { id, operatorId: req.user.operatorId },
      include: {
        notes: { orderBy: { createdAt: 'desc' }, take: 5 },
        deal: true,
        followUps: { orderBy: { createdAt: 'desc' }, take: 5 },
      },
    });

    if (!lead) {
      return res.status(404).json({ success: false, error: 'Lead not found' });
    }

    // Gather conversation-like context from notes and follow-ups
    const conversation_messages = [
      ...lead.notes.map((n) => ({ role: 'note', content: n.content, timestamp: n.createdAt })),
      ...lead.followUps.map((f) => ({ role: 'followup', content: f.content, timestamp: f.createdAt })),
    ].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    const lead_data = {
      id: lead.id,
      name: lead.name,
      email: lead.email,
      phone: lead.phone,
      cpf: lead.cpf,
      company: lead.company,
      value: lead.value,
      status: lead.status,
      priority: lead.priority,
      description: lead.description,
      source: lead.source,
      hasDeal: !!lead.deal,
      dealStage: lead.deal?.stage ?? null,
      dealValue: lead.deal?.value ?? null,
      dealProbability: lead.deal?.probability ?? null,
    };

    const axios = require('axios');
    const { data } = await axios.post(
      'http://ai-handler:8000/api/chat/score-lead',
      {
        conversation_messages,
        lead_data,
        pipeline_stage: lead.status,
      },
      { timeout: 15000 },
    );

    const score = data.score ?? data.aiScore ?? null;
    const factors = data.factors ?? data.scoreFactors ?? null;
    const explanation = data.explanation ?? null;

    await prisma.lead.update({
      where: { id },
      data: {
        aiScore: score,
        scoreFactors: factors,
        aiScoreUpdatedAt: new Date(),
      },
    });

    // Create timeline event
    await prisma.timelineEvent.create({
      data: {
        operatorId: req.user.operatorId,
        leadId: id,
        type: 'AI_SUMMARY',
        payload: {
          action: 'lead_scored',
          score,
          factors,
          explanation,
        },
      },
    });

    res.json({
      success: true,
      data: {
        score,
        factors,
        explanation,
      },
    });
  } catch (error) {
    console.error('Error scoring lead:', error);
    res.status(500).json({ success: false, error: 'Failed to score lead', message: error.message });
  }
});

module.exports = router;
