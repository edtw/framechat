/**
 * Tasks Routes
 * AFILIATORS Backend - CRM
 */

const express = require('express');
const prisma = require('../../../core/prisma');
const { authenticateToken } = require('../../../core/middleware/auth');

const router = express.Router();
router.use(authenticateToken);

/**
 * POST /api/crm/tasks
 * Create a new task
 */
router.post('/', async (req, res) => {
  try {
    const { title, description, status, priority, dueDate, leadId } = req.body;

    if (!title) {
      return res.status(400).json({ success: false, error: 'Title is required' });
    }

    const task = await prisma.task.create({
      data: {
        operatorId: req.user.operatorId,
        title,
        description: description || null,
        status: status || 'NEW',
        priority: priority || 'MEDIUM',
        dueDate: dueDate ? new Date(dueDate) : null,
        leadId: leadId ? parseInt(leadId) : null,
      },
    });

    res.status(201).json({ success: true, data: task });
  } catch (error) {
    console.error('Error creating task:', error);
    res.status(500).json({ success: false, error: 'Failed to create task', message: error.message });
  }
});

/**
 * GET /api/crm/tasks
 * List tasks (paginated, filterable)
 */
router.get('/', async (req, res) => {
  try {
    const { status, priority, search, leadId, page = 1, limit = 50 } = req.query;
    const pageNum = parseInt(page);
    const limitNum = Math.min(parseInt(limit), 200);
    const skip = (pageNum - 1) * limitNum;

    const where = { operatorId: req.user.operatorId };

    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (leadId) where.leadId = parseInt(leadId);
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [tasks, total] = await Promise.all([
      prisma.task.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { updatedAt: 'desc' },
        include: { lead: { select: { id: true, name: true } } },
      }),
      prisma.task.count({ where }),
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
 * GET /api/crm/tasks/stats
 * Get task statistics per operator
 */
router.get('/stats', async (req, res) => {
  try {
    const operatorId = req.user.operatorId;

    const [total, byStatus] = await Promise.all([
      prisma.task.count({ where: { operatorId } }),
      prisma.task.groupBy({
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
 * GET /api/crm/tasks/:id
 * Get task by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const task = await prisma.task.findFirst({
      where: { id: parseInt(req.params.id), operatorId: req.user.operatorId },
      include: { lead: { select: { id: true, name: true } } },
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
 * PUT /api/crm/tasks/:id
 * Update task
 */
router.put('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { title, description, status, priority, dueDate, leadId } = req.body;

    const existing = await prisma.task.findFirst({
      where: { id, operatorId: req.user.operatorId },
    });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Task not found' });
    }

    const task = await prisma.task.update({
      where: { id },
      data: {
        ...(title !== undefined && { title }),
        ...(description !== undefined && { description }),
        ...(status !== undefined && { status }),
        ...(priority !== undefined && { priority }),
        ...(dueDate !== undefined && { dueDate: dueDate ? new Date(dueDate) : null }),
        ...(leadId !== undefined && { leadId: leadId ? parseInt(leadId) : null }),
      },
      include: { lead: { select: { id: true, name: true } } },
    });

    res.json({ success: true, data: task });
  } catch (error) {
    console.error('Error updating task:', error);
    res.status(500).json({ success: false, error: 'Failed to update task', message: error.message });
  }
});

/**
 * PATCH /api/crm/tasks/:id/status
 * Update task status (kanban)
 */
router.patch('/:id/status', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ success: false, error: 'Status is required' });
    }

    const existing = await prisma.task.findFirst({
      where: { id, operatorId: req.user.operatorId },
    });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Task not found' });
    }

    const task = await prisma.task.update({
      where: { id },
      data: { status },
    });

    res.json({ success: true, data: task });
  } catch (error) {
    console.error('Error updating task status:', error);
    res.status(500).json({ success: false, error: 'Failed to update task status', message: error.message });
  }
});

/**
 * DELETE /api/crm/tasks/:id
 * Delete task
 */
router.delete('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    const existing = await prisma.task.findFirst({
      where: { id, operatorId: req.user.operatorId },
    });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Task not found' });
    }

    await prisma.task.delete({ where: { id } });

    res.json({ success: true, message: 'Task deleted successfully' });
  } catch (error) {
    console.error('Error deleting task:', error);
    res.status(500).json({ success: false, error: 'Failed to delete task', message: error.message });
  }
});

module.exports = router;
