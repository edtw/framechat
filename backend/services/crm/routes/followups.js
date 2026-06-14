/**
 * Follow-Up Sequence Routes
 * AFILIATORS Backend - CRM
 *
 * Automated follow-up sequences with multi-step scheduling.
 * Each sequence has a JSON `steps` array defining delay + template per step.
 * Enrolling a lead creates one FollowUpTask per step with cumulative scheduling.
 */

const express = require('express');
const prisma = require('../../../core/prisma');
const { authenticateToken } = require('../../../core/middleware/auth');

const router = express.Router();
router.use(authenticateToken);

// ==================== SEQUENCES ====================

/**
 * POST /api/followups/sequences
 * Create a new follow-up sequence
 */
router.post('/sequences', async (req, res) => {
  try {
    const { name, description, isActive, steps } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Name is required' });
    }
    if (!steps || !Array.isArray(steps) || steps.length === 0) {
      return res.status(400).json({ success: false, error: 'Steps array is required (non-empty)' });
    }

    // Validate each step has delayHours and template
    for (let i = 0; i < steps.length; i++) {
      if (steps[i].delayHours == null) {
        return res.status(400).json({
          success: false,
          error: `Step ${i} is missing delayHours`,
        });
      }
      if (!steps[i].template) {
        return res.status(400).json({
          success: false,
          error: `Step ${i} is missing template`,
        });
      }
    }

    const sequence = await prisma.followUpSequence.create({
      data: {
        operatorId: req.user.operatorId,
        name: name.trim(),
        description: description || null,
        isActive: isActive !== undefined ? isActive : true,
        steps,
      },
    });

    res.status(201).json({ success: true, data: sequence });
  } catch (error) {
    console.error('Error creating sequence:', error);
    res.status(500).json({ success: false, error: 'Failed to create sequence', message: error.message });
  }
});

/**
 * GET /api/followups/sequences
 * List all follow-up sequences for the current operator
 */
router.get('/sequences', async (req, res) => {
  try {
    const { isActive, page = 1, limit = 50 } = req.query;
    const pageNum = parseInt(page);
    const limitNum = Math.min(parseInt(limit), 200);
    const skip = (pageNum - 1) * limitNum;

    const where = { operatorId: req.user.operatorId };
    if (isActive !== undefined) {
      where.isActive = isActive === 'true';
    }

    const [sequences, total] = await Promise.all([
      prisma.followUpSequence.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { updatedAt: 'desc' },
        include: {
          _count: { select: { tasks: true } },
        },
      }),
      prisma.followUpSequence.count({ where }),
    ]);

    res.json({
      success: true,
      data: sequences,
      pagination: {
        total,
        page: pageNum,
        totalPages: Math.ceil(total / limitNum),
        limit: limitNum,
      },
    });
  } catch (error) {
    console.error('Error listing sequences:', error);
    res.status(500).json({ success: false, error: 'Failed to list sequences', message: error.message });
  }
});

/**
 * GET /api/followups/sequences/:id
 * Get a single sequence by ID
 */
router.get('/sequences/:id', async (req, res) => {
  try {
    const sequence = await prisma.followUpSequence.findFirst({
      where: { id: req.params.id, operatorId: req.user.operatorId },
      include: {
        tasks: {
          include: { lead: { select: { id: true, name: true } } },
          orderBy: { scheduledAt: 'asc' },
        },
        _count: { select: { tasks: true } },
      },
    });

    if (!sequence) {
      return res.status(404).json({ success: false, error: 'Sequence not found' });
    }

    res.json({ success: true, data: sequence });
  } catch (error) {
    console.error('Error fetching sequence:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch sequence', message: error.message });
  }
});

/**
 * PUT /api/followups/sequences/:id
 * Update a follow-up sequence
 */
router.put('/sequences/:id', async (req, res) => {
  try {
    const { name, description, isActive, steps } = req.body;

    const existing = await prisma.followUpSequence.findFirst({
      where: { id: req.params.id, operatorId: req.user.operatorId },
    });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Sequence not found' });
    }

    const sequence = await prisma.followUpSequence.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(description !== undefined && { description }),
        ...(isActive !== undefined && { isActive }),
        ...(steps !== undefined && { steps }),
      },
    });

    res.json({ success: true, data: sequence });
  } catch (error) {
    console.error('Error updating sequence:', error);
    res.status(500).json({ success: false, error: 'Failed to update sequence', message: error.message });
  }
});

/**
 * DELETE /api/followups/sequences/:id
 * Delete a follow-up sequence and all its tasks
 */
router.delete('/sequences/:id', async (req, res) => {
  try {
    const existing = await prisma.followUpSequence.findFirst({
      where: { id: req.params.id, operatorId: req.user.operatorId },
    });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Sequence not found' });
    }

    // Cascade delete handles tasks via onDelete: Cascade
    await prisma.followUpSequence.delete({ where: { id: req.params.id } });

    res.json({ success: true, message: 'Sequence deleted successfully' });
  } catch (error) {
    console.error('Error deleting sequence:', error);
    res.status(500).json({ success: false, error: 'Failed to delete sequence', message: error.message });
  }
});

/**
 * POST /api/followups/sequences/:id/enroll/:leadId
 * Enroll a lead in a follow-up sequence.
 * Creates one FollowUpTask per step with cumulative scheduling from now.
 */
router.post('/sequences/:id/enroll/:leadId', async (req, res) => {
  try {
    const sequenceId = req.params.id;
    const leadId = parseInt(req.params.leadId);

    // Verify sequence exists and belongs to operator
    const sequence = await prisma.followUpSequence.findFirst({
      where: { id: sequenceId, operatorId: req.user.operatorId },
    });
    if (!sequence) {
      return res.status(404).json({ success: false, error: 'Sequence not found' });
    }

    if (!sequence.isActive) {
      return res.status(400).json({ success: false, error: 'Sequence is not active' });
    }

    // Verify lead exists and belongs to operator
    const lead = await prisma.lead.findFirst({
      where: { id: leadId, operatorId: req.user.operatorId },
    });
    if (!lead) {
      return res.status(404).json({ success: false, error: 'Lead not found' });
    }

    const steps = sequence.steps; // JSON array

    if (!Array.isArray(steps) || steps.length === 0) {
      return res.status(400).json({ success: false, error: 'Sequence has no steps' });
    }

    // Check if lead is already enrolled with pending tasks in this sequence
    const existingPending = await prisma.followUpTask.findFirst({
      where: {
        sequenceId,
        leadId,
        status: 'PENDING',
      },
    });
    if (existingPending) {
      return res.status(409).json({
        success: false,
        error: 'Lead is already enrolled in this sequence with pending tasks',
      });
    }

    // Build cumulative schedule
    const now = new Date();
    const tasks = [];
    let cumulativeHours = 0;

    for (let i = 0; i < steps.length; i++) {
      cumulativeHours += steps[i].delayHours || 0;
      const scheduledAt = new Date(now.getTime() + cumulativeHours * 60 * 60 * 1000);

      tasks.push({
        sequenceId,
        leadId,
        stepIndex: i,
        scheduledAt,
        status: 'PENDING',
      });
    }

    // Create all tasks in a single transaction
    const created = await prisma.$transaction(
      tasks.map((t) =>
        prisma.followUpTask.create({ data: t })
      )
    );

    res.status(201).json({
      success: true,
      message: `Lead enrolled in sequence "${sequence.name}". ${created.length} tasks scheduled.`,
      data: created,
    });
  } catch (error) {
    console.error('Error enrolling lead:', error);
    res.status(500).json({ success: false, error: 'Failed to enroll lead', message: error.message });
  }
});

// ==================== TASKS ====================

/**
 * GET /api/followups/tasks
 * List follow-up tasks with filters.
 * Query params: status (PENDING|SENT|SKIPPED|FAILED), leadId, sequenceId
 */
router.get('/tasks', async (req, res) => {
  try {
    const { status, leadId, sequenceId, page = 1, limit = 50 } = req.query;
    const pageNum = parseInt(page);
    const limitNum = Math.min(parseInt(limit), 200);
    const skip = (pageNum - 1) * limitNum;

    // Build where clause — scope to operator via sequence or lead
    const where = {
      OR: [
        { sequence: { operatorId: req.user.operatorId } },
        { lead: { operatorId: req.user.operatorId } },
      ],
    };

    if (status) where.status = status.toUpperCase();
    if (leadId) where.leadId = parseInt(leadId);
    if (sequenceId) where.sequenceId = sequenceId;

    const [tasks, total] = await Promise.all([
      prisma.followUpTask.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { scheduledAt: 'asc' },
        include: {
          sequence: { select: { id: true, name: true } },
          lead: { select: { id: true, name: true, phone: true } },
        },
      }),
      prisma.followUpTask.count({ where }),
    ]);

    res.json({
      success: true,
      data: tasks,
      pagination: {
        total,
        page: pageNum,
        totalPages: Math.ceil(total / limitNum),
        limit: limitNum,
      },
    });
  } catch (error) {
    console.error('Error listing tasks:', error);
    res.status(500).json({ success: false, error: 'Failed to list tasks', message: error.message });
  }
});

/**
 * GET /api/followups/tasks/stats
 * Get task counts by status for the current operator
 */
router.get('/tasks/stats', async (req, res) => {
  try {
    const where = {
      OR: [
        { sequence: { operatorId: req.user.operatorId } },
        { lead: { operatorId: req.user.operatorId } },
      ],
    };

    const [total, byStatus] = await Promise.all([
      prisma.followUpTask.count({ where }),
      prisma.followUpTask.groupBy({
        by: ['status'],
        where,
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
 * GET /api/followups/tasks/:id
 * Get a single task by ID
 */
router.get('/tasks/:id', async (req, res) => {
  try {
    const task = await prisma.followUpTask.findFirst({
      where: {
        id: req.params.id,
        OR: [
          { sequence: { operatorId: req.user.operatorId } },
          { lead: { operatorId: req.user.operatorId } },
        ],
      },
      include: {
        sequence: { select: { id: true, name: true, steps: true } },
        lead: { select: { id: true, name: true, phone: true } },
      },
    });

    if (!task) {
      return res.status(404).json({ success: false, error: 'Task not found' });
    }

    res.json({ success: true, data: task });
  } catch (error) {
    console.error('Error fetching task:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch task', message: error.message });
  }
});

/**
 * POST /api/followups/tasks/:id/skip
 * Skip a pending task
 */
router.post('/tasks/:id/skip', async (req, res) => {
  try {
    const task = await prisma.followUpTask.findFirst({
      where: {
        id: req.params.id,
        OR: [
          { sequence: { operatorId: req.user.operatorId } },
          { lead: { operatorId: req.user.operatorId } },
        ],
      },
    });

    if (!task) {
      return res.status(404).json({ success: false, error: 'Task not found' });
    }

    if (task.status !== 'PENDING') {
      return res.status(400).json({
        success: false,
        error: `Cannot skip task with status "${task.status}". Only PENDING tasks can be skipped.`,
      });
    }

    const updated = await prisma.followUpTask.update({
      where: { id: req.params.id },
      data: { status: 'SKIPPED' },
    });

    res.json({ success: true, data: updated, message: 'Task skipped' });
  } catch (error) {
    console.error('Error skipping task:', error);
    res.status(500).json({ success: false, error: 'Failed to skip task', message: error.message });
  }
});

module.exports = router;
