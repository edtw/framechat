/**
 * WhatsApp Integration - Internal Routes
 *
 * These routes are called BY the whatsapp-service microservice
 * to store WhatsApp data (messages, conversations, sessions) in the backend.
 *
 * Authentication: Service-to-service (requires WHATSAPP_SERVICE_API_KEY)
 */

const express = require('express');
const { authenticateService, requireService } = require('../../../core/middleware/service-auth');
const messagesDb = require('../database/messages');
const conversationsDb = require('../database/conversations');
const contactsDb = require('../database/contacts');
const sessionsDb = require('../database/sessions');
const logger = require('../../../core/utils/logger');
const prisma = require('../../../core/prisma');
// Optional deps - try to load, fallback gracefully
let serializeAgentConfig, conversationSync, whatsAppLeadCapture;
try { serializeAgentConfig = require('../../chatbot/database/agentConfig').serializeAgentConfig; } catch(e) {}
try { conversationSync = require('../../whatsapp/conversation-sync').conversationSync; } catch(e) {}
try { whatsAppLeadCapture = require('../../whatsapp/lead-capture').whatsAppLeadCapture; } catch(e) {}
const {
  storeMessageSchema,
  upsertConversationSchema,
  updateSessionStatusSchema,
  updateSessionQrSchema,
  validateSessionSchema,
  validate,
} = require('../validators/index.js');

const router = express.Router();

// Apply service authentication to all internal routes
router.use(authenticateService);
router.use(requireService('whatsapp-service'));

const mapKnowledgeItem = (item) => {
  // Ensure plain JavaScript object, not Prisma model
  return {
    id: String(item.id),
    title: String(item.title || ''),
    content: String(item.content || '').slice(0, 1200),
    category: item.category ? String(item.category) : null,
    tags: [], // tags not yet implemented on KnowledgeItem
    updatedAt: item.updatedAt ? new Date(item.updatedAt).toISOString() : null,
  };
};

/**
 * @swagger
 * /api/whatsapp/internal/messages:
 *   post:
 *     summary: Store a new WhatsApp message (called by whatsapp-service)
 *     tags: [WhatsApp Integration - Internal]
 *     security:
 *       - serviceAuth: []
 */
router.post('/messages', validate(storeMessageSchema, 'body'), async (req, res) => {
  try {
    const { conversationId, fromMe, body, messageType, mediaUrl, sentiment, intent, operatorId, timestamp } = req.body;
    const resolvedOperatorId = operatorId ? Number(operatorId) : undefined;

    if (!resolvedOperatorId || Number.isNaN(resolvedOperatorId)) {
      return res.status(400).json({
        error: 'Invalid operatorId',
      });
    }

    const storedMessage = await messagesDb.storeMessage({
      conversationId,
      fromMe,
      body,
      messageType,
      mediaUrl,
      sentiment,
      intent,
      timestamp,
    }, resolvedOperatorId);

    try {
      await conversationSync.syncMessageToTimeline(storedMessage, resolvedOperatorId);
    } catch (syncError) {
      logger.warn({
        error: syncError.message,
        conversationId,
        operatorId: resolvedOperatorId,
      }, 'Failed to sync WhatsApp message to CRM timeline');
    }

    logger.info({
      messageId: storedMessage.id,
      conversationId,
      operatorId,
    }, 'Message stored via internal API');

    res.status(201).json({
      success: true,
      message: storedMessage,
    });
  } catch (error) {
    logger.error({
      error: error.message,
      body: req.body,
    }, 'Failed to store message via internal API');

    res.status(500).json({
      error: 'Failed to store message',
      message: error.message,
    });
  }
});

/**
 * @swagger
 * /api/whatsapp/internal/messages/batch:
 *   post:
 *     summary: Batch store WhatsApp messages (called by whatsapp-service)
 *     tags: [WhatsApp Integration - Internal]
 *     security:
 *       - serviceAuth: []
 */
router.post('/messages/batch', async (req, res) => {
  try {
    const { messages, sessionId, operatorId } = req.body;
    const resolvedOperatorId = operatorId ? Number(operatorId) : undefined;

    if (!resolvedOperatorId || Number.isNaN(resolvedOperatorId)) {
      return res.status(400).json({ error: 'Invalid operatorId' });
    }

    await messagesDb.storeMessagesBatch(messages, sessionId, resolvedOperatorId);

    res.status(201).json({ success: true });
  } catch (error) {
    logger.error({
      error: error.message,
      sessionId: req.body.sessionId,
    }, 'Failed to batch store messages');
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/whatsapp/internal/contacts/batch:
 *   post:
 *     summary: Batch store WhatsApp contacts (called by whatsapp-service)
 *     tags: [WhatsApp Integration - Internal]
 *     security:
 *       - serviceAuth: []
 */
router.post('/contacts/batch', async (req, res) => {
  try {
    const { contacts, sessionId, operatorId } = req.body;
    const resolvedOperatorId = operatorId ? Number(operatorId) : undefined;

    if (!resolvedOperatorId || Number.isNaN(resolvedOperatorId)) {
      return res.status(400).json({ error: 'Invalid operatorId' });
    }

    await contactsDb.upsertContactsBatch(contacts, sessionId, resolvedOperatorId);

    res.status(201).json({ success: true });
  } catch (error) {
    logger.error({
      error: error.message,
      sessionId: req.body.sessionId,
    }, 'Failed to batch store contacts');
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/whatsapp/internal/conversations:
 *   post:
 *     summary: Create or update a conversation (called by whatsapp-service)
 *     tags: [WhatsApp Integration - Internal]
 *     security:
 *       - serviceAuth: []
 */
router.post('/conversations', validate(upsertConversationSchema, 'body'), async (req, res) => {
  try {
    const {
      sessionId,
      remoteJid,
      contactName,
      contactNumber,
      lastMessage,
      lastMessageTime,
      unreadCount,
      operatorId,
    } = req.body;

    const resolvedOperatorId = operatorId ? Number(operatorId) : undefined;

    if (!resolvedOperatorId || Number.isNaN(resolvedOperatorId)) {
      return res.status(400).json({
        error: 'Invalid operatorId',
      });
    }

    const conversation = await conversationsDb.upsertConversation({
      sessionId,
      remoteJid,
      contactName,
      contactNumber,
      lastMessage,
      lastMessageTime,
      unreadCount,
    }, resolvedOperatorId);

    if (contactNumber && resolvedOperatorId) {
      try {
        await whatsAppLeadCapture.captureLead({
          conversationId: conversation.id,
          sessionId,
          contactInfo: {
            number: contactNumber,
            name: contactName,
          },
          operatorId: resolvedOperatorId,
        });
      } catch (captureError) {
        logger.info({
          error: captureError.message,
          conversationId: conversation.id,
          sessionId,
          operatorId: resolvedOperatorId,
        }, 'Lead capture skipped or failed during conversation upsert');
      }
    }

    logger.info({
      conversationId: conversation.id,
      sessionId,
      operatorId,
    }, 'Conversation upserted via internal API');

    res.status(200).json({
      success: true,
      conversation,
    });
  } catch (error) {
    logger.error({
      error: error.message,
      body: req.body,
    }, 'Failed to upsert conversation via internal API');

    res.status(500).json({
      error: 'Failed to upsert conversation',
      message: error.message,
    });
  }
});

/**
 * @swagger
 * /api/whatsapp/internal/sessions/status:
 *   put:
 *     summary: Update session status (called by whatsapp-service)
 *     tags: [WhatsApp Integration - Internal]
 *     security:
 *       - serviceAuth: []
 */
router.put('/sessions/status', validate(updateSessionStatusSchema, 'body'), async (req, res) => {
  try {
    const { sessionId, status, operatorId } = req.body;

    const session = await sessionsDb.updateSessionStatus(sessionId, status, operatorId);

    logger.info({
      sessionId,
      status,
      operatorId,
    }, 'Session status updated via internal API');

    res.status(200).json({
      success: true,
      session,
    });
  } catch (error) {
    logger.error({
      error: error.message,
      body: req.body,
    }, 'Failed to update session status via internal API');

    res.status(500).json({
      error: 'Failed to update session status',
      message: error.message,
    });
  }
});

router.put('/sessions/qr', validate(updateSessionQrSchema, 'body'), async (req, res) => {
  try {
    const { sessionId, operatorId, qrCode } = req.body;

    const session = await sessionsDb.updateSessionQRCode(sessionId, qrCode, operatorId);

    logger.info({
      sessionId,
      operatorId,
      hasQr: !!qrCode,
    }, 'Session QR updated via internal API');

    res.status(200).json({
      success: true,
      session,
    });
  } catch (error) {
    logger.error({
      error: error.message,
      body: req.body,
    }, 'Failed to update session QR via internal API');

    res.status(500).json({
      error: 'Failed to update session QR',
      message: error.message,
    });
  }
});

/**
 * @swagger
 * /api/whatsapp/internal/sessions/validate:
 *   get:
 *     summary: Validate session exists and belongs to company
 *     tags: [WhatsApp Integration - Internal]
 *     security:
 *       - serviceAuth: []
 */
router.get('/sessions/validate', async (req, res) => {
  try {
    const { sessionId, operatorId } = req.query;

    if (!sessionId || !operatorId) {
      return res.status(400).json({
        error: 'Missing required parameters',
        required: ['sessionId', 'operatorId'],
      });
    }

    const session = await sessionsDb.getSessionById(sessionId, parseInt(operatorId));

    res.status(200).json({
      valid: true,
      session: {
        id: session.id,
        sessionId: session.sessionId,
        name: session.name,
        status: session.status,
      },
    });
  } catch (error) {
    logger.warn({
      error: error.message,
      sessionId: req.query.sessionId,
      operatorId: req.query.operatorId,
    }, 'Session validation failed via internal API');

    res.status(404).json({
      valid: false,
      error: 'Session not found or unauthorized',
    });
  }
});

router.get('/sessions/:sessionId/ai-config', async (req, res) => {
  try {
    const sessionId = req.params.sessionId;

    const session = await prisma.whatsAppSession.findUnique({
      where: { id: sessionId },
      select: { id: true, operatorId: true },
    });

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const agentConfig = await prisma.whatsAppAgentConfig.findUnique({
      where: { sessionId },
    });

    const knowledgeItems = await prisma.knowledgeItem.findMany({
      where: { operatorId: session.operatorId },
      include: {
        tags: {
          include: {
            tag: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: 25,
    });

    const mappedKnowledge = knowledgeItems.map(mapKnowledgeItem);

    // Force serialization to ensure plain objects
    const response = {
      success: true,
      sessionId,
      operatorId: session.operatorId,
      ai_config: serializeAgentConfig(agentConfig),
      knowledgeBase: JSON.parse(JSON.stringify(mappedKnowledge)),
      knowledgeCount: knowledgeItems.length,
    };

    res.json(response);
  } catch (error) {
    logger.error({
      error: error.message,
      sessionId: req.params.sessionId,
    }, 'Failed to load AI config for session');

    res.status(500).json({
      error: 'Failed to load AI configuration',
      message: error.message,
    });
  }
});

// ==================== CAMPAIGN INTERNAL ENDPOINTS ====================

/**
 * GET /internal/campaigns/:campaignId
 * Fetch campaign details for the engine
 */
router.get('/campaigns/:campaignId', async (req, res) => {
  try {
    const campaign = await prisma.campaign.findUnique({
      where: { id: Number(req.params.campaignId) },
      include: {
        session: { select: { id: true, name: true, status: true, createdAt: true } },
      },
    });

    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    res.json(campaign);
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to fetch campaign');
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /internal/campaigns/:campaignId/pending-recipients
 * Fetch next batch of pending recipients
 */
router.get('/campaigns/:campaignId/pending-recipients', async (req, res) => {
  try {
    const limit = Math.min(50, parseInt(req.query.limit) || 10);

    const recipients = await prisma.campaignRecipient.findMany({
      where: {
        campaignId: Number(req.params.campaignId),
        status: 'PENDING',
      },
      take: limit,
      orderBy: { id: 'asc' },
    });

    res.json({ recipients });
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to fetch pending recipients');
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /internal/campaigns/:campaignId/update-status
 * Update campaign status
 */
router.post('/campaigns/:campaignId/update-status', async (req, res) => {
  try {
    const { status, completedAt } = req.body;
    const data = { status };
    if (completedAt) data.completedAt = new Date(completedAt);

    const campaign = await prisma.campaign.update({
      where: { id: Number(req.params.campaignId) },
      data,
    });

    res.json({ success: true, campaign });
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to update campaign status');
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /internal/campaigns/:campaignId/increment-stat
 * Atomically increment a campaign stat (sentCount, failedCount, etc.)
 */
router.post('/campaigns/:campaignId/increment-stat', async (req, res) => {
  try {
    const { field } = req.body;
    const allowedFields = ['sentCount', 'deliveredCount', 'failedCount', 'repliedCount', 'blockedCount'];

    if (!allowedFields.includes(field)) {
      return res.status(400).json({ error: `Invalid stat field: ${field}` });
    }

    await prisma.campaign.update({
      where: { id: Number(req.params.campaignId) },
      data: { [field]: { increment: 1 } },
    });

    res.json({ success: true });
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to increment campaign stat');
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /internal/campaigns/recipient/:recipientId/update
 * Update a recipient's status, sentAt, aiMessage, etc.
 */
router.post('/campaigns/recipient/:recipientId/update', async (req, res) => {
  try {
    const { status, sentAt, deliveredAt, repliedAt, aiMessage, errorMsg } = req.body;
    const data = {};

    if (status) data.status = status;
    if (sentAt) data.sentAt = new Date(sentAt);
    if (deliveredAt) data.deliveredAt = new Date(deliveredAt);
    if (repliedAt) data.repliedAt = new Date(repliedAt);
    if (aiMessage !== undefined) data.aiMessage = aiMessage;
    if (errorMsg !== undefined) data.errorMsg = errorMsg;

    const recipient = await prisma.campaignRecipient.update({
      where: { id: Number(req.params.recipientId) },
      data,
    });

    res.json({ success: true, recipient });
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to update recipient');
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /internal/campaigns/track-reply
 * Track a reply from a phone number (update recipient + campaign stats)
 */
router.post('/campaigns/track-reply', async (req, res) => {
  try {
    const { sessionId, phone } = req.body;

    // Find the most recent campaign recipient matching this phone
    const recipient = await prisma.campaignRecipient.findFirst({
      where: {
        phone,
        campaign: { sessionId, status: { in: ['RUNNING', 'PAUSED', 'COMPLETED'] } },
        status: { in: ['SENT', 'DELIVERED'] },
      },
      orderBy: { sentAt: 'desc' },
    });

    if (!recipient) {
      return res.json({ tracked: false, reason: 'No matching recipient found' });
    }

    // Update recipient
    await prisma.campaignRecipient.update({
      where: { id: recipient.id },
      data: { status: 'REPLIED', repliedAt: new Date() },
    });

    // Increment replied count
    await prisma.campaign.update({
      where: { id: recipient.campaignId },
      data: { repliedCount: { increment: 1 } },
    });

    res.json({ tracked: true, recipientId: recipient.id, campaignId: recipient.campaignId });
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to track campaign reply');
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
