/**
 * Contacts Routes
 * AFILIATORS Backend - CRM
 */

const express = require('express');
const prisma = require('../../../core/prisma');
const logger = require('../../../core/utils/logger');
const { authenticateToken } = require('../../../core/middleware/auth');

const router = express.Router();
router.use(authenticateToken);

/**
 * GET /api/crm/contacts/search
 * Search contacts by query
 */
router.get('/search', async (req, res) => {
  try {
    const { q, page = 1, limit = 50 } = req.query;
    const pageNum = parseInt(page);
    const limitNum = Math.min(parseInt(limit), 200);
    const skip = (pageNum - 1) * limitNum;

    const where = { operatorId: req.user.operatorId };

    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { company: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [contacts, total] = await Promise.all([
      prisma.contact.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { updatedAt: 'desc' },
      }),
      prisma.contact.count({ where }),
    ]);

    res.json({
      success: true,
      data: contacts,
      pagination: {
        total,
        page: pageNum,
        totalPages: Math.ceil(total / limitNum),
        limit: limitNum,
      },
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to search contacts');
    res.status(500).json({ error: 'Failed to search contacts', message: error.message });
  }
});

/**
 * GET /api/crm/contacts
 * List all contacts
 */
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const pageNum = parseInt(page);
    const limitNum = Math.min(parseInt(limit), 200);
    const skip = (pageNum - 1) * limitNum;

    const where = { operatorId: req.user.operatorId };

    const [contacts, total] = await Promise.all([
      prisma.contact.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { updatedAt: 'desc' },
      }),
      prisma.contact.count({ where }),
    ]);

    res.json({
      success: true,
      data: contacts,
      pagination: { total, page: pageNum, totalPages: Math.ceil(total / limitNum), limit: limitNum },
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to list contacts');
    res.status(500).json({ error: 'Failed to list contacts', message: error.message });
  }
});

/**
 * GET /api/crm/contacts/:phoneNumber
 * Get contact by phone number
 */
router.get('/:phoneNumber', async (req, res) => {
  try {
    const { phoneNumber } = req.params;
    const operatorId = req.user?.operatorId;

    if (!operatorId) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Operator ID not found in request' });
    }

    const contact = await prisma.contact.findFirst({
      where: { phone: phoneNumber, operatorId },
    });

    if (!contact) {
      return res.status(404).json({ error: 'Not found', message: 'Contact not found' });
    }

    res.json({ success: true, contact });
  } catch (error) {
    logger.error({ error: error.message, phoneNumber: req.params.phoneNumber }, 'Failed to get contact by phone');
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

/**
 * POST /api/crm/contacts/from-whatsapp
 * Create or update contact from WhatsApp conversation
 */
router.post('/from-whatsapp', async (req, res) => {
  try {
    const { name, phone, email, company, notes } = req.body || {};
    const operatorId = req.user?.operatorId;

    if (!operatorId) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Operator ID not found in request' });
    }

    if (!phone) {
      return res.status(400).json({ error: 'Bad request', message: 'Phone number is required' });
    }

    // Upsert: find existing or create new
    let contact = await prisma.contact.findFirst({
      where: { phone, operatorId },
    });

    if (contact) {
      contact = await prisma.contact.update({
        where: { id: contact.id },
        data: {
          name: name || contact.name,
          email: email !== undefined ? email : contact.email,
          company: company !== undefined ? company : contact.company,
          notes: notes !== undefined ? notes : contact.notes,
        },
      });
    } else {
      contact = await prisma.contact.create({
        data: {
          operatorId,
          name: name || phone,
          phone,
          email: email || null,
          company: company || null,
          notes: notes || null,
        },
      });
    }

    res.json({ success: true, contact });
  } catch (error) {
    logger.error({ error: error.message, body: req.body }, 'Failed to upsert contact from WhatsApp');
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

/**
 * PUT /api/crm/contacts/:id
 * Update contact
 */
router.put('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, email, phone, company, notes } = req.body;

    const existing = await prisma.contact.findFirst({
      where: { id, operatorId: req.user.operatorId },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    const contact = await prisma.contact.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(email !== undefined && { email }),
        ...(phone !== undefined && { phone }),
        ...(company !== undefined && { company }),
        ...(notes !== undefined && { notes }),
      },
    });

    res.json({ success: true, contact });
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to update contact');
    res.status(500).json({ error: 'Failed to update contact', message: error.message });
  }
});

module.exports = router;
