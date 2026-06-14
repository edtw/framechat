/**
 * Operators Routes
 * AFILIATORS Backend
 */

const express = require('express');
const prisma = require('../../../core/prisma');
const { authenticateToken, requireRole } = require('../../../core/middleware/auth');

const router = express.Router();
router.use(authenticateToken);

/**
 * GET /api/operators
 * List operators (admin only, or scoped to current operator)
 */
router.get('/', requireRole('ADMIN'), async (req, res) => {
  try {
    const { page = 1, limit = 50, search } = req.query;
    const pageNum = parseInt(page);
    const limitNum = Math.min(parseInt(limit), 200);
    const skip = (pageNum - 1) * limitNum;

    const where = {};
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [operators, total] = await Promise.all([
      prisma.operator.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          active: true,
          createdAt: true,
          _count: {
            select: {
              users: true,
              leads: true,
              whatsappSessions: true,
            },
          },
        },
      }),
      prisma.operator.count({ where }),
    ]);

    res.json({
      success: true,
      data: operators,
      pagination: { total, page: pageNum, totalPages: Math.ceil(total / limitNum), limit: limitNum },
    });
  } catch (error) {
    console.error('Error listing operators:', error);
    res.status(500).json({ success: false, error: 'Failed to list operators', message: error.message });
  }
});

/**
 * GET /api/operators/me
 * Get current operator
 */
router.get('/me', async (req, res) => {
  try {
    const operator = await prisma.operator.findUnique({
      where: { id: req.user.operatorId },
      include: {
        _count: {
          select: {
            users: true,
            leads: true,
            whatsappSessions: true,
            contacts: true,
            tasks: true,
          },
        },
      },
    });

    if (!operator) {
      return res.status(404).json({ success: false, error: 'Operator not found' });
    }

    res.json({ success: true, data: operator });
  } catch (error) {
    console.error('Error fetching operator:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch operator', message: error.message });
  }
});

/**
 * GET /api/operators/:id
 * Get operator by ID (admin or self)
 */
router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    // Only admin or own operator can view
    if (req.user.role !== 'ADMIN' && req.user.operatorId !== id) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    const operator = await prisma.operator.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            users: true,
            leads: true,
            whatsappSessions: true,
            contacts: true,
            tasks: true,
            knowledgeItems: true,
            pixTransactions: true,
            virtualCards: true,
          },
        },
      },
    });

    if (!operator) {
      return res.status(404).json({ success: false, error: 'Operator not found' });
    }

    res.json({ success: true, data: operator });
  } catch (error) {
    console.error('Error fetching operator:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch operator', message: error.message });
  }
});

/**
 * PUT /api/operators/:id
 * Update operator (admin or self)
 */
router.put('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, email, phone, cpf, active } = req.body;

    // Only admin or own operator can update
    if (req.user.role !== 'ADMIN' && req.user.operatorId !== id) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    const existing = await prisma.operator.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Operator not found' });
    }

    // Only admin can change active status
    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (email !== undefined) updateData.email = email;
    if (phone !== undefined) updateData.phone = phone;
    if (cpf !== undefined) updateData.cpf = cpf;
    if (active !== undefined && req.user.role === 'ADMIN') updateData.active = active;

    const operator = await prisma.operator.update({
      where: { id },
      data: updateData,
    });

    res.json({ success: true, data: operator });
  } catch (error) {
    console.error('Error updating operator:', error);
    res.status(500).json({ success: false, error: 'Failed to update operator', message: error.message });
  }
});

/**
 * GET /api/operators/:id/users
 * List users for an operator (admin or self)
 */
router.get('/:id/users', async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    if (req.user.role !== 'ADMIN' && req.user.operatorId !== id) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    const users = await prisma.user.findMany({
      where: { operatorId: id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        active: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ success: true, data: users });
  } catch (error) {
    console.error('Error listing users:', error);
    res.status(500).json({ success: false, error: 'Failed to list users', message: error.message });
  }
});

module.exports = router;
