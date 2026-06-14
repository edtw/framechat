/**
 * Virtual Card Routes
 * AFILIATORS Backend
 *
 * Issue virtual cards, link NFC tags, manage card lifecycle
 */

const express = require('express');
const prisma = require('../../../core/prisma');
const logger = require('../../../core/utils/logger');
const { encrypt, decrypt } = require('../../../core/utils/encryption');
const { authenticateToken } = require('../../../core/middleware/auth');

const router = express.Router();
router.use(authenticateToken);

/**
 * Generate a fake PAN (16-digit card number)
 */
function generatePan() {
  // Use a known BIN prefix for testing (no real cards issued)
  const bin = '5390'; // Mastercard test BIN
  let pan = bin;
  for (let i = 0; i < 12; i++) {
    pan += Math.floor(Math.random() * 10).toString();
  }
  return pan;
}

/**
 * Mask a PAN for display (show last 4 digits)
 */
function maskPan(pan) {
  const decrypted = typeof pan === 'string' && pan.includes(':') ? decrypt(pan) : pan;
  return `****${decrypted.slice(-4)}`;
}

/**
 * POST /api/virtual-cards
 * Issue a new virtual card
 */
router.post('/', async (req, res) => {
  try {
    const {
      cardHolderName, leadId, dealId,
      spendingLimit, expiryMonths = 12,
    } = req.body;

    if (!cardHolderName) {
      return res.status(400).json({ success: false, error: 'cardHolderName is required' });
    }

    // Verify encryption key is set
    if (!process.env.ENCRYPTION_KEY) {
      return res.status(500).json({
        success: false,
        error: 'ENCRYPTION_KEY not configured. Cards cannot be issued securely.',
      });
    }

    const pan = generatePan();
    const expiryMonth = Math.floor(Math.random() * 12) + 1;
    const expiryYear = new Date().getFullYear() % 100 + Math.floor(expiryMonths / 12) + 1;
    const cvvPlain = Math.floor(Math.random() * 900 + 100).toString(); // 3-digit CVV

    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + Math.ceil(expiryMonths / 12));

    const card = await prisma.virtualCard.create({
      data: {
        operatorId: req.user.operatorId,
        leadId: leadId ? parseInt(leadId) : null,
        dealId: dealId ? parseInt(dealId) : null,
        cardNumber: maskPan(pan),
        cardHolderName,
        encryptedPan: encrypt(pan),
        expiryMonth,
        expiryYear: 2000 + expiryYear,
        cvv: encrypt(cvvPlain),
        spendingLimit: spendingLimit ? parseFloat(spendingLimit) : null,
        spentAmount: 0,
        expiresAt,
        status: 'ACTIVE',
      },
    });

    // Create timeline event if linked to a lead
    if (card.leadId) {
      await prisma.timelineEvent.create({
        data: {
          operatorId: req.user.operatorId,
          leadId: card.leadId,
          type: 'CARD_TRANSACTION',
          payload: {
            cardId: card.id,
            action: 'ISSUED',
            cardNumber: card.cardNumber,
            spendingLimit: card.spendingLimit,
          },
        },
      });
    }

    res.status(201).json({
      success: true,
      data: {
        id: card.id,
        cardNumber: card.cardNumber,
        cardHolderName: card.cardHolderName,
        expiryMonth: card.expiryMonth,
        expiryYear: card.expiryYear,
        cvv: cvvPlain, // Return plain CVV only at creation time
        status: card.status,
        spendingLimit: card.spendingLimit,
        spentAmount: card.spentAmount,
        expiresAt: card.expiresAt,
        createdAt: card.createdAt,
      },
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to issue virtual card');
    res.status(500).json({ success: false, error: 'Failed to issue card', message: error.message });
  }
});

/**
 * GET /api/virtual-cards
 * List operator's virtual cards (masked)
 */
router.get('/', async (req, res) => {
  try {
    const { status, leadId, page = 1, limit = 50 } = req.query;
    const pageNum = parseInt(page);
    const limitNum = Math.min(parseInt(limit), 200);
    const skip = (pageNum - 1) * limitNum;

    const where = { operatorId: req.user.operatorId };

    if (status) where.status = status;
    if (leadId) where.leadId = parseInt(leadId);

    const [cards, total] = await Promise.all([
      prisma.virtualCard.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { createdAt: 'desc' },
        include: {
          lead: { select: { id: true, name: true } },
          deal: { select: { id: true, title: true } },
          _count: { select: { transactions: true } },
        },
      }),
      prisma.virtualCard.count({ where }),
    ]);

    res.json({
      success: true,
      data: cards,
      pagination: { total, page: pageNum, totalPages: Math.ceil(total / limitNum), limit: limitNum },
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to list virtual cards');
    res.status(500).json({ success: false, error: 'Failed to list cards', message: error.message });
  }
});

/**
 * GET /api/virtual-cards/:id
 * Get single card details
 */
router.get('/:id', async (req, res) => {
  try {
    const card = await prisma.virtualCard.findFirst({
      where: { id: parseInt(req.params.id), operatorId: req.user.operatorId },
      include: {
        lead: { select: { id: true, name: true } },
        deal: { select: { id: true, title: true } },
        transactions: { orderBy: { timestamp: 'desc' }, take: 50 },
      },
    });

    if (!card) {
      return res.status(404).json({ success: false, error: 'Card not found' });
    }

    // NEVER return the full PAN or CVV after creation
    res.json({
      success: true,
      data: {
        id: card.id,
        cardNumber: card.cardNumber, // Already masked
        cardHolderName: card.cardHolderName,
        expiryMonth: card.expiryMonth,
        expiryYear: card.expiryYear,
        status: card.status,
        spendingLimit: card.spendingLimit,
        spentAmount: card.spentAmount,
        nfcTagId: card.nfcTagId,
        paymentMachineId: card.paymentMachineId,
        expiresAt: card.expiresAt,
        deactivatedAt: card.deactivatedAt,
        createdAt: card.createdAt,
        lead: card.lead,
        deal: card.deal,
        transactions: card.transactions.map((t) => ({
          id: t.id,
          amount: t.amount,
          merchantName: t.merchantName,
          type: t.type,
          status: t.status,
          nfcUsed: t.nfcUsed,
          machineId: t.machineId,
          timestamp: t.timestamp,
        })),
      },
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to get virtual card');
    res.status(500).json({ success: false, error: 'Failed to get card', message: error.message });
  }
});

/**
 * POST /api/virtual-cards/:id/link-nfc
 * Link an NFC tag to a virtual card
 */
router.post('/:id/link-nfc', async (req, res) => {
  try {
    const { nfcTagId } = req.body;

    if (!nfcTagId) {
      return res.status(400).json({ success: false, error: 'nfcTagId is required' });
    }

    const existing = await prisma.virtualCard.findFirst({
      where: { id: parseInt(req.params.id), operatorId: req.user.operatorId },
    });

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Card not found' });
    }

    // Check if another card already has this NFC tag
    const conflict = await prisma.virtualCard.findFirst({
      where: { nfcTagId, id: { not: existing.id } },
    });

    if (conflict) {
      return res.status(409).json({
        success: false,
        error: 'NFC tag already linked to another card',
        conflictingCardId: conflict.id,
      });
    }

    const card = await prisma.virtualCard.update({
      where: { id: existing.id },
      data: { nfcTagId },
    });

    res.json({ success: true, data: { id: card.id, nfcTagId: card.nfcTagId } });
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to link NFC');
    res.status(500).json({ success: false, error: 'Failed to link NFC', message: error.message });
  }
});

/**
 * POST /api/virtual-cards/:id/link-machine
 * Link a payment machine to a virtual card
 */
router.post('/:id/link-machine', async (req, res) => {
  try {
    const { machineId } = req.body;

    if (!machineId) {
      return res.status(400).json({ success: false, error: 'machineId is required' });
    }

    const existing = await prisma.virtualCard.findFirst({
      where: { id: parseInt(req.params.id), operatorId: req.user.operatorId },
    });

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Card not found' });
    }

    const card = await prisma.virtualCard.update({
      where: { id: existing.id },
      data: { paymentMachineId: machineId },
    });

    res.json({ success: true, data: { id: card.id, paymentMachineId: card.paymentMachineId } });
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to link machine');
    res.status(500).json({ success: false, error: 'Failed to link machine', message: error.message });
  }
});

/**
 * PATCH /api/virtual-cards/:id/status
 * Freeze, unfreeze, or cancel a card
 */
router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['ACTIVE', 'FROZEN', 'CANCELLED'];

    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Status must be one of: ${validStatuses.join(', ')}`,
      });
    }

    const existing = await prisma.virtualCard.findFirst({
      where: { id: parseInt(req.params.id), operatorId: req.user.operatorId },
    });

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Card not found' });
    }

    if (existing.status === 'CANCELLED') {
      return res.status(400).json({ success: false, error: 'Cannot change status of a cancelled card' });
    }

    const updateData = { status };
    if (status === 'CANCELLED') {
      updateData.deactivatedAt = new Date();
    }

    const card = await prisma.virtualCard.update({
      where: { id: existing.id },
      data: updateData,
    });

    res.json({
      success: true,
      data: {
        id: card.id,
        cardNumber: card.cardNumber,
        status: card.status,
        deactivatedAt: card.deactivatedAt,
      },
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to update card status');
    res.status(500).json({ success: false, error: 'Failed to update card status', message: error.message });
  }
});

module.exports = router;
