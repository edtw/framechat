/**
 * Knowledge Base Routes
 * AFILIATORS Backend
 */

const express = require('express');
const prisma = require('../../../core/prisma');
const { authenticateToken } = require('../../../core/middleware/auth');

const router = express.Router();
router.use(authenticateToken);

/**
 * GET /api/knowledge
 * List knowledge items for the operator (paginated)
 */
router.get('/', async (req, res) => {
  try {
    const { category, search, page = 1, limit = 50 } = req.query;
    const pageNum = parseInt(page);
    const limitNum = Math.min(parseInt(limit), 200);
    const skip = (pageNum - 1) * limitNum;

    const where = { operatorId: req.user.operatorId };

    if (category) where.category = category;
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { content: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      prisma.knowledgeItem.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          title: true,
          category: true,
          usage: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.knowledgeItem.count({ where }),
    ]);

    res.json({
      success: true,
      data: items,
      pagination: { total, page: pageNum, totalPages: Math.ceil(total / limitNum), limit: limitNum },
    });
  } catch (error) {
    console.error('Error listing knowledge items:', error);
    res.status(500).json({ success: false, error: 'Failed to list knowledge items', message: error.message });
  }
});

/**
 * GET /api/knowledge/categories
 * List distinct categories
 */
router.get('/categories', async (req, res) => {
  try {
    const categories = await prisma.knowledgeItem.findMany({
      where: { operatorId: req.user.operatorId, category: { not: null } },
      distinct: ['category'],
      select: { category: true },
    });

    res.json({ success: true, data: categories.map((c) => c.category).filter(Boolean) });
  } catch (error) {
    console.error('Error listing categories:', error);
    res.status(500).json({ success: false, error: 'Failed to list categories', message: error.message });
  }
});

/**
 * POST /api/knowledge
 * Create a knowledge item
 */
router.post('/', async (req, res) => {
  try {
    const { title, content, category } = req.body;

    if (!title || !content) {
      return res.status(400).json({ success: false, error: 'Title and content are required' });
    }

    const item = await prisma.knowledgeItem.create({
      data: {
        operatorId: req.user.operatorId,
        title,
        content,
        category: category || null,
      },
    });

    res.status(201).json({ success: true, data: item });
  } catch (error) {
    console.error('Error creating knowledge item:', error);
    res.status(500).json({ success: false, error: 'Failed to create knowledge item', message: error.message });
  }
});

/**
 * GET /api/knowledge/:id
 * Get knowledge item by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const item = await prisma.knowledgeItem.findFirst({
      where: { id: parseInt(req.params.id), operatorId: req.user.operatorId },
    });

    if (!item) {
      return res.status(404).json({ success: false, error: 'Knowledge item not found' });
    }

    res.json({ success: true, data: item });
  } catch (error) {
    console.error('Error fetching knowledge item:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch knowledge item', message: error.message });
  }
});

/**
 * PUT /api/knowledge/:id
 * Update knowledge item
 */
router.put('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { title, content, category } = req.body;

    const existing = await prisma.knowledgeItem.findFirst({
      where: { id, operatorId: req.user.operatorId },
    });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Knowledge item not found' });
    }

    const item = await prisma.knowledgeItem.update({
      where: { id },
      data: {
        ...(title !== undefined && { title }),
        ...(content !== undefined && { content }),
        ...(category !== undefined && { category }),
      },
    });

    res.json({ success: true, data: item });
  } catch (error) {
    console.error('Error updating knowledge item:', error);
    res.status(500).json({ success: false, error: 'Failed to update knowledge item', message: error.message });
  }
});

/**
 * DELETE /api/knowledge/:id
 * Delete knowledge item
 */
router.delete('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    const existing = await prisma.knowledgeItem.findFirst({
      where: { id, operatorId: req.user.operatorId },
    });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Knowledge item not found' });
    }

    await prisma.knowledgeItem.delete({ where: { id } });

    res.json({ success: true, message: 'Knowledge item deleted successfully' });
  } catch (error) {
    console.error('Error deleting knowledge item:', error);
    res.status(500).json({ success: false, error: 'Failed to delete knowledge item', message: error.message });
  }
});

/**
 * POST /api/knowledge/:id/used
 * Increment usage count (called when AI uses this item)
 */
router.post('/:id/used', async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    const item = await prisma.knowledgeItem.findFirst({
      where: { id, operatorId: req.user.operatorId },
    });
    if (!item) {
      return res.status(404).json({ success: false, error: 'Knowledge item not found' });
    }

    const updated = await prisma.knowledgeItem.update({
      where: { id },
      data: { usage: { increment: 1 } },
    });

    res.json({ success: true, data: { id: updated.id, usage: updated.usage } });
  } catch (error) {
    console.error('Error incrementing usage:', error);
    res.status(500).json({ success: false, error: 'Failed to increment usage', message: error.message });
  }
});

module.exports = router;
