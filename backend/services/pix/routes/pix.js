/**
 * PIX Payment Routes
 * AFILIATORS Backend
 *
 * Generate PIX BR Codes, manage transactions
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const prisma = require('../../../core/prisma');
const logger = require('../../../core/utils/logger');
const { authenticateToken } = require('../../../core/middleware/auth');

const router = express.Router();
router.use(authenticateToken);

/**
 * Generate a simple PIX BR Code emulator string
 * In production, this would integrate with a real payment provider (e.g., Stark Bank, Zoop)
 */
function generateBrCode({ amount, pixKey, merchantName, merchantCity, txId }) {
  // Simplified PIX BR Code structure (purely for development/emulation)
  // Real implementation would follow the official PIX BR Code specification
  return `00020126580014br.gov.bcb.pix0114${pixKey}52040000530398654${amount.toFixed(2).replace('.', '')}5802BR59${merchantName.substring(0, 25)}60${merchantCity.substring(0, 15)}62070503***6304${txId?.substring(0, 4) || '0000'}`;
}

/**
 * POST /api/pix/generate
 * Generate a PIX BR Code and create a transaction
 */
router.post('/generate', async (req, res) => {
  try {
    const { amount, key, merchantName, merchantCity, leadId, dealId } = req.body;

    if (!amount || !key) {
      return res.status(400).json({
        success: false,
        error: 'Amount and key are required',
      });
    }

    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Amount must be a positive number',
      });
    }

    const txId = uuidv4().replace(/-/g, '').substring(0, 32);
    const merchant = merchantName || 'AFILIATORS';
    const city = merchantCity || 'SAO PAULO';
    const pixKey = key.replace(/\D/g, '');

    // Generate BR Code
    const brCode = generateBrCode({
      amount: numericAmount,
      pixKey,
      merchantName: merchant,
      merchantCity: city,
      txId,
    });

    // Create transaction record
    const transaction = await prisma.pixTransaction.create({
      data: {
        operatorId: req.user.operatorId,
        leadId: leadId ? parseInt(leadId) : null,
        dealId: dealId ? parseInt(dealId) : null,
        amount: numericAmount,
        pixKey,
        merchantName: merchant,
        merchantCity: city,
        txId,
        brCode,
        status: 'PENDING',
      },
    });

    res.status(201).json({
      success: true,
      data: {
        id: transaction.id,
        amount: transaction.amount,
        pixKey: transaction.pixKey,
        merchantName: transaction.merchantName,
        merchantCity: transaction.merchantCity,
        txId: transaction.txId,
        brCode: transaction.brCode,
        status: transaction.status,
        createdAt: transaction.createdAt,
      },
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to generate PIX');
    res.status(500).json({ success: false, error: 'Failed to generate PIX', message: error.message });
  }
});

/**
 * GET /api/pix/transactions
 * List operator's PIX transactions (paginated)
 */
router.get('/transactions', async (req, res) => {
  try {
    const { status, leadId, page = 1, limit = 50 } = req.query;
    const pageNum = parseInt(page);
    const limitNum = Math.min(parseInt(limit), 200);
    const skip = (pageNum - 1) * limitNum;

    const where = { operatorId: req.user.operatorId };

    if (status) where.status = status;
    if (leadId) where.leadId = parseInt(leadId);

    const [transactions, total] = await Promise.all([
      prisma.pixTransaction.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { createdAt: 'desc' },
        include: {
          lead: { select: { id: true, name: true, phone: true } },
          deal: { select: { id: true, title: true } },
        },
      }),
      prisma.pixTransaction.count({ where }),
    ]);

    res.json({
      success: true,
      data: transactions,
      pagination: { total, page: pageNum, totalPages: Math.ceil(total / limitNum), limit: limitNum },
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to list PIX transactions');
    res.status(500).json({ success: false, error: 'Failed to list transactions', message: error.message });
  }
});

/**
 * GET /api/pix/transactions/:id
 * Get a single PIX transaction
 */
router.get('/transactions/:id', async (req, res) => {
  try {
    const transaction = await prisma.pixTransaction.findFirst({
      where: { id: parseInt(req.params.id), operatorId: req.user.operatorId },
      include: {
        lead: { select: { id: true, name: true, phone: true } },
        deal: { select: { id: true, title: true } },
      },
    });

    if (!transaction) {
      return res.status(404).json({ success: false, error: 'Transaction not found' });
    }

    res.json({ success: true, data: transaction });
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to get PIX transaction');
    res.status(500).json({ success: false, error: 'Failed to get transaction', message: error.message });
  }
});

/**
 * PATCH /api/pix/transactions/:id/status
 * Update transaction status (e.g., mark as paid)
 */
router.patch('/transactions/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['PENDING', 'PAID', 'EXPIRED', 'CANCELLED'];

    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Status must be one of: ${validStatuses.join(', ')}`,
      });
    }

    const existing = await prisma.pixTransaction.findFirst({
      where: { id: parseInt(req.params.id), operatorId: req.user.operatorId },
    });

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Transaction not found' });
    }

    const updateData = { status };
    if (status === 'PAID') {
      updateData.paidAt = new Date();
    }

    const transaction = await prisma.pixTransaction.update({
      where: { id: existing.id },
      data: updateData,
    });

    // Create timeline event if linked to a lead
    if (transaction.leadId) {
      await prisma.timelineEvent.create({
        data: {
          operatorId: req.user.operatorId,
          leadId: transaction.leadId,
          type: 'PIX_PAYMENT',
          payload: {
            transactionId: transaction.id,
            amount: transaction.amount,
            status: transaction.status,
          },
        },
      });
    }

    res.json({ success: true, data: transaction });
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to update PIX status');
    res.status(500).json({ success: false, error: 'Failed to update transaction', message: error.message });
  }
});

module.exports = router;
