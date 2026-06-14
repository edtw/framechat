/**
 * WhatsApp Integration - Public Routes
 *
 * These routes are called BY the frontend
 * to manage WhatsApp sessions, view conversations and messages.
 *
 * Authentication: User JWT (from frontend)
 */

const express = require('express');
const axios = require('axios');
const { authenticateToken } = require('../../../core/middleware/auth');
const messagesDb = require('../database/messages');
const conversationsDb = require('../database/conversations');
const sessionsDb = require('../database/sessions');
const logger = require('../../../core/utils/logger');
const prisma = require('../../../core/prisma');

const router = express.Router();

const WHATSAPP_SERVICE_URL = process.env.WHATSAPP_SERVICE_URL || 'http://localhost:3000';
const WHATSAPP_SERVICE_HEADERS = {
  Authorization: `Bearer ${process.env.WHATSAPP_SERVICE_API_KEY || ''}`,
  'X-Service-Name': 'backend',
};
const QR_WAIT_MS = Number(process.env.WHATSAPP_QR_WAIT_MS || 2000);

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const shouldTriggerSessionStart = (status) => {
  const normalized = (status || '').toLowerCase();
  if (!normalized) return true;
  return normalized === 'disconnected' || normalized === 'error' || normalized === 'qr_ready';
};

async function triggerSessionStart(sessionId, operatorId) {
  return axios.post(
    `${WHATSAPP_SERVICE_URL}/api/internal/create-session`,
    { sessionId, operatorId },
    { headers: WHATSAPP_SERVICE_HEADERS },
  );
}

async function triggerSessionDisconnect(sessionId) {
  return axios.delete(
    `${WHATSAPP_SERVICE_URL}/api/sessions/${encodeURIComponent(sessionId)}`,
    { headers: WHATSAPP_SERVICE_HEADERS },
  );
}

// Apply user authentication to all public routes
router.use(authenticateToken);

// ==================== SESSIONS ====================

/**
 * @swagger
 * /api/whatsapp/sessions:
 *   get:
 *     summary: Get all WhatsApp sessions for company
 *     tags: [WhatsApp]
 *     security:
 *       - bearerAuth: []
 */
router.get('/sessions', async (req, res) => {
  try {
    const operatorId = req.user.operatorId;
    const sessions = await sessionsDb.getSessions(operatorId);

    res.json({
      success: true,
      sessions,
    });
  } catch (error) {
    logger.error({
      error: error.message,
      userId: req.user.id,
    }, 'Failed to get sessions');

    res.status(500).json({
      error: 'Failed to get sessions',
      message: error.message,
    });
  }
});

/**
 * @swagger
 * /api/whatsapp/sessions/{sessionId}:
 *   get:
 *     summary: Get session by ID
 *     tags: [WhatsApp]
 *     security:
 *       - bearerAuth: []
 */
router.get('/sessions/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const operatorId = req.user.operatorId;

    const session = await sessionsDb.getSessionById(sessionId, operatorId);

    res.json({
      success: true,
      session,
    });
  } catch (error) {
    logger.error({
      error: error.message,
      sessionId: req.params.sessionId,
      userId: req.user.id,
    }, 'Failed to get session');

    res.status(404).json({
      error: 'Session not found',
      message: error.message,
    });
  }
});

/**
 * @swagger
 * /api/whatsapp/sessions:
 *   post:
 *     summary: Create a new WhatsApp session
 *     tags: [WhatsApp]
 *     security:
 *       - bearerAuth: []
 */
router.post('/sessions', async (req, res) => {
  try {
    const { sessionId: bodySessionId, name, sessionName, operatorId: bodyOperatorId } = req.body;
    const operatorId = req.user.operatorId || bodyOperatorId;

    if (!operatorId) {
      return res.status(400).json({
        error: 'Missing company context',
        message: 'Provide operatorId (header/query/body) or configure DEFAULT_COMPANY_ID',
      });
    }

    // Auto-generate sessionId if not provided by frontend
    const sessionId = bodySessionId || `wa_${operatorId}_${Date.now()}`;

    const resolvedName = name || sessionName || sessionId;

    const session = await sessionsDb.createSession({
      sessionId,
      name: resolvedName,
      operatorId,
      status: 'DISCONNECTED',
    });

    if (!shouldTriggerSessionStart(session.status)) {
      logger.info({
        sessionId: session.sessionId,
        operatorId,
        status: session.status,
      }, 'Session already active/connecting - skipping create trigger');

      return res.status(200).json({
        success: true,
        session,
        sessionId: session.sessionId,
        sessionName: session.sessionName || session.sessionId,
        alreadyRunning: true,
      });
    }

    try {
      await triggerSessionStart(session.sessionId, operatorId);
    } catch (serviceError) {
      // Session exists in DB even if WhatsApp service had issues — don't delete
      logger.warn({ error: serviceError.message, sessionId: session.sessionId }, 'WhatsApp service trigger had issues, session kept in DB');
    }

    res.status(201).json({
      success: true,
      session,
      sessionId: session.sessionId,
      sessionName: session.name,
    });
  } catch (error) {
    logger.error({
      error: error.message,
      body: req.body,
      userId: req.user.id,
    }, 'Failed to create session');

    res.status(error.status || 500).json({
      error: 'Failed to create session',
      message: error.message,
    });
  }
});

/**
 * @swagger
 * /api/whatsapp/sessions/{sessionId}:
 *   delete:
 *     summary: Delete a WhatsApp session
 *     tags: [WhatsApp]
 *     security:
 *       - bearerAuth: []
 */
router.delete('/sessions/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const operatorId = req.user.operatorId;

    try {
      await triggerSessionDisconnect(sessionId);
    } catch (serviceError) {
      logger.warn({ error: serviceError.message }, 'Failed to notify whatsapp-service about disconnect');
    }

    const deleted = await sessionsDb.deleteSession(sessionId, operatorId);

    res.json({
      success: true,
      message: 'Session deleted successfully',
      session: deleted,
    });
  } catch (error) {
    logger.error({
      error: error.message,
      sessionId: req.params.sessionId,
      userId: req.user.id,
    }, 'Failed to delete session');

    res.status(500).json({
      error: 'Failed to delete session',
      message: error.message,
    });
  }
});

/**
 * @swagger
 * /api/whatsapp/sessions/{sessionId}/start:
 *   post:
 *     summary: Trigger WhatsApp session creation (generate QR)
 *     tags: [WhatsApp]
 *     security:
 *       - bearerAuth: []
 */
router.post('/sessions/:sessionId/start', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const operatorId = req.user.operatorId;

    const session = await sessionsDb.getSessionById(sessionId, operatorId);
    if (!session) {
      return res.status(404).json({
        error: 'Session not found',
      });
    }

    if (!shouldTriggerSessionStart(session.status)) {
      return res.json({
        success: true,
        message: 'Session already active',
        session,
        alreadyRunning: true,
      });
    }

    try {
      await triggerSessionStart(session.sessionId, operatorId);
    } catch (serviceError) {
      logger.error({
        error: serviceError.message,
        sessionId,
        operatorId,
      }, 'Failed to trigger WhatsApp session start');

      return res.status(502).json({
        error: 'Failed to start WhatsApp session',
        message: 'Unable to reach whatsapp-service to create the session',
      });
    }

    await wait(QR_WAIT_MS);
    const updated = await sessionsDb.getSessionById(sessionId, operatorId);

    res.json({
      success: true,
      message: 'Session start requested. Scan the QR code when available.',
      session: updated || session,
    });
  } catch (error) {
    logger.error({
      error: error.message,
      sessionId: req.params.sessionId,
      userId: req.user.id,
    }, 'Failed to start session');

    res.status(500).json({
      error: 'Failed to start session',
      message: error.message,
    });
  }
});

/**
 * @swagger
 * /api/whatsapp/sessions/{sessionId}/disconnect:
 *   post:
 *     summary: Disconnect WhatsApp session without deleting it
 *     tags: [WhatsApp]
 *     security:
 *       - bearerAuth: []
 */
router.post('/sessions/:sessionId/disconnect', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const operatorId = req.user.operatorId;

    const session = await sessionsDb.getSessionById(sessionId, operatorId);
    if (!session) {
      return res.status(404).json({
        error: 'Session not found',
      });
    }

    try {
      await triggerSessionDisconnect(sessionId);
    } catch (serviceError) {
      logger.error({
        error: serviceError.message,
        sessionId,
        operatorId,
      }, 'Failed to disconnect WhatsApp session');

      return res.status(502).json({
        error: 'Failed to disconnect session',
        message: 'Unable to reach whatsapp-service to disconnect the session',
      });
    }

    res.json({
      success: true,
      message: 'Session disconnected successfully',
      sessionId,
    });
  } catch (error) {
    logger.error({
      error: error.message,
      sessionId: req.params.sessionId,
      userId: req.user.id,
    }, 'Failed to disconnect session');

    res.status(500).json({
      error: 'Failed to disconnect session',
      message: error.message,
    });
  }
});

// ==================== CONVERSATIONS ====================

/**
 * @swagger
 * /api/whatsapp/conversations:
 *   get:
 *     summary: Get all conversations for company
 *     tags: [WhatsApp]
 *     security:
 *       - bearerAuth: []
 */
router.get('/conversations', async (req, res) => {
  try {
    const operatorId = req.user.operatorId;
    const { limit, offset } = req.query;

    const conversations = await conversationsDb.getConversations(operatorId, {
      limit: limit ? parseInt(limit) : 50,
      offset: offset ? parseInt(offset) : 0,
    });

    res.json({
      success: true,
      conversations,
      total: conversations.length,
    });
  } catch (error) {
    logger.error({
      error: error.message,
      userId: req.user.id,
    }, 'Failed to get conversations');

    res.status(500).json({
      error: 'Failed to get conversations',
      message: error.message,
    });
  }
});

/**
 * @swagger
 * /api/whatsapp/conversations/{id}:
 *   get:
 *     summary: Get conversation by ID with messages
 *     tags: [WhatsApp]
 *     security:
 *       - bearerAuth: []
 */
router.get('/conversations/:id', async (req, res) => {
  try {
    const conversationId = req.params.id;
    const operatorId = req.user.operatorId;

    const conversation = await conversationsDb.getConversationById(conversationId, operatorId);

    res.json({
      success: true,
      conversation,
    });
  } catch (error) {
    logger.error({
      error: error.message,
      conversationId: req.params.id,
      userId: req.user.id,
    }, 'Failed to get conversation');

    res.status(404).json({
      error: 'Conversation not found',
      message: error.message,
    });
  }
});

/**
 * @swagger
 * /api/whatsapp/conversations/{id}/read:
 *   patch:
 *     summary: Mark conversation as read
 *     tags: [WhatsApp]
 *     security:
 *       - bearerAuth: []
 */
router.patch('/conversations/:id/read', async (req, res) => {
  try {
    const conversationId = req.params.id;
    const operatorId = req.user.operatorId;

    const conversation = await conversationsDb.markConversationAsRead(conversationId, operatorId);

    res.json({
      success: true,
      conversation,
    });
  } catch (error) {
    logger.error({
      error: error.message,
      conversationId: req.params.id,
      userId: req.user.id,
    }, 'Failed to mark conversation as read');

    res.status(500).json({
      error: 'Failed to mark conversation as read',
      message: error.message,
    });
  }
});

// ==================== MESSAGES ====================

/**
 * @swagger
 * /api/whatsapp/messages:
 *   get:
 *     summary: Get messages for a conversation
 *     tags: [WhatsApp]
 *     security:
 *       - bearerAuth: []
 */
router.get('/messages', async (req, res) => {
  try {
    const { conversationId, limit, offset } = req.query;
    const operatorId = req.user.operatorId;

    if (!conversationId) {
      return res.status(400).json({
        error: 'conversationId is required',
      });
    }

    const messages = await messagesDb.getMessages(parseInt(conversationId), operatorId, {
      limit: limit ? parseInt(limit) : 50,
      offset: offset ? parseInt(offset) : 0,
    });

    res.json({
      success: true,
      messages,
      total: messages.length,
    });
  } catch (error) {
    logger.error({
      error: error.message,
      query: req.query,
      userId: req.user.id,
    }, 'Failed to get messages');

    res.status(500).json({
      error: 'Failed to get messages',
      message: error.message,
    });
  }
});

/**
 * @swagger
 * /api/whatsapp/messages/search:
 *   get:
 *     summary: Search messages
 *     tags: [WhatsApp]
 *     security:
 *       - bearerAuth: []
 */
router.get('/messages/search', async (req, res) => {
  try {
    const { q, limit, offset } = req.query;
    const operatorId = req.user.operatorId;

    if (!q) {
      return res.status(400).json({
        error: 'Search query (q) is required',
      });
    }

    const messages = await messagesDb.searchMessages(q, operatorId, {
      limit: limit ? parseInt(limit) : 50,
      offset: offset ? parseInt(offset) : 0,
    });

    res.json({
      success: true,
      messages,
      total: messages.length,
      query: q,
    });
  } catch (error) {
    logger.error({
      error: error.message,
      query: req.query,
      userId: req.user.id,
    }, 'Failed to search messages');

    res.status(500).json({
      error: 'Failed to search messages',
      message: error.message,
    });
  }
});

// ==================== ADDITIONAL ROUTES FOR FRONTEND COMPATIBILITY ====================

/**
 * @swagger
 * /api/whatsapp/sessions/{sessionId}/qr:
 *   get:
 *     summary: Get QR Code for session
 *     tags: [WhatsApp]
 *     security:
 *       - bearerAuth: []
 */
router.get('/sessions/:sessionId/qr', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const operatorId = req.user.operatorId;

    let session = await sessionsDb.getSessionById(sessionId, operatorId);

    if (!session) {
      return res.status(404).json({
        error: 'Session not found',
      });
    }

    const normalizedStatus = (session.status || '').toLowerCase();
    const qrMissing = !session.qrCode;
    const shouldRequestStart =
      shouldTriggerSessionStart(session.status) &&
      (qrMissing || normalizedStatus !== 'connected');

    if (shouldRequestStart) {
      try {
        await triggerSessionStart(session.sessionId, operatorId);
      } catch (serviceError) {
        logger.error({
          error: serviceError.message,
          sessionId,
          operatorId,
        }, 'Failed to refresh QR code for session');

        return res.status(502).json({
          error: 'Failed to request QR code',
          message: 'Unable to reach whatsapp-service to create the session',
        });
      }

      await wait(QR_WAIT_MS);
      session = await sessionsDb.getSessionById(sessionId, operatorId) || session;
    }

    res.json({
      success: true,
      qrCode: session.qrCode || session.metadata?.qrCode || null,
      status: session.status,
      sessionId: session.sessionId,
    });
  } catch (error) {
    logger.error({
      error: error.message,
      sessionId: req.params.sessionId,
      userId: req.user.id,
    }, 'Failed to get QR code');

    res.status(500).json({
      error: 'Failed to get QR code',
      message: error.message,
    });
  }
});

/**
 * @swagger
 * /api/whatsapp/messages/{sessionId}/history:
 *   get:
 *     summary: Get message history for session (legacy endpoint)
 *     tags: [WhatsApp]
 *     security:
 *       - bearerAuth: []
 */
router.get('/messages/:sessionId/history', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { limit = 100, conversationId } = req.query;
    const operatorId = req.user.operatorId;

    if (conversationId) {
      // Retorna mensagens de uma conversa específica (segura por operatorId)
      const conversation = await conversationsDb.getConversationById(String(conversationId), operatorId);
      const contactNumber = conversation.contactNumber || conversation.remoteJid || conversation.chatId || '';

      const messages = await messagesDb.getMessages(String(conversationId), operatorId, {
        limit: parseInt(limit),
        offset: 0,
      });

      const transformedMessages = messages.map((msg) => ({
        id: msg.id,
        from_number: msg.fromMe ? sessionId : contactNumber,
        to_number: msg.fromMe ? contactNumber : sessionId,
        message_text: msg.body || '',
        direction: msg.fromMe ? 'outgoing' : 'incoming',
        timestamp: msg.timestamp,
        status: msg.status,
      }));

      transformedMessages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

      return res.json({
        success: true,
        messages: transformedMessages,
        total: transformedMessages.length,
      });
    }

    // Get all conversations for this session
    const conversations = await conversationsDb.getConversationsBySession(sessionId, operatorId);

    // Get messages for all conversations
    const allMessages = [];
    for (const conv of conversations) {
      const messages = await messagesDb.getMessages(conv.id, operatorId, {
        limit: parseInt(limit),
        offset: 0,
      });

      // Transform messages to frontend-expected format
      const transformedMessages = messages.map(msg => ({
        id: msg.id,
        from_number: msg.fromMe ? sessionId : conv.contactNumber,
        to_number: msg.fromMe ? conv.contactNumber : sessionId,
        message_text: msg.body || '',
        direction: msg.fromMe ? 'outgoing' : 'incoming',
        timestamp: msg.timestamp,
        status: msg.status,
      }));

      allMessages.push(...transformedMessages);
    }

    // Sort by timestamp (descending - newest first)
    allMessages.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    res.json({
      success: true,
      messages: allMessages.slice(0, parseInt(limit)),
      total: allMessages.length,
    });
  } catch (error) {
    logger.error({
      error: error.message,
      sessionId: req.params.sessionId,
      userId: req.user.id,
    }, 'Failed to get message history');

    res.status(500).json({
      error: 'Failed to get message history',
      message: error.message,
    });
  }
});

/**
 * @swagger
 * /api/whatsapp/conversations/takeover-status/{sessionId}/{userPhone}:
 *   get:
 *     summary: Get takeover status for conversation
 *     tags: [WhatsApp]
 *     security:
 *       - bearerAuth: []
 */
router.get('/conversations/takeover-status/:sessionId/:userPhone', async (req, res) => {
  try {
    const { sessionId, userPhone } = req.params;
    const operatorId = req.user.operatorId;

    logger.info({
      sessionId,
      userPhone,
      operatorId,
    }, 'Getting takeover status');

    const conversation = await conversationsDb.getConversationByPhone(sessionId, userPhone, operatorId);

    if (!conversation) {
      logger.warn({
        sessionId,
        userPhone,
        operatorId,
      }, 'Conversation not found for takeover status - returning default');

      // Return default status instead of 404
      return res.json({
        success: true,
        is_taken_over: false,
        taken_over_by: null,
        taken_over_at: null,
      });
    }

    res.json({
      success: true,
      is_taken_over: conversation.taken_over_by !== null,
      taken_over_by: conversation.taken_over_by,
      taken_over_at: conversation.taken_over_at,
    });
  } catch (error) {
    logger.error({
      error: error.message,
      sessionId: req.params.sessionId,
      userPhone: req.params.userPhone,
      userId: req.user.id,
    }, 'Failed to get takeover status');

    res.status(500).json({
      error: 'Failed to get takeover status',
      message: error.message,
    });
  }
});

/**
 * @swagger
 * /api/whatsapp/conversations/takeover:
 *   post:
 *     summary: Take over a conversation from AI
 *     tags: [WhatsApp]
 *     security:
 *       - bearerAuth: []
 */
router.post('/conversations/takeover', async (req, res) => {
  try {
    const { sessionId, userPhone } = req.body;
    const operatorId = req.user.operatorId;
    const operatorName = req.user.name || req.user.email || req.user.username || `User${req.user.id}`;

    logger.info({
      sessionId,
      userPhone,
      operatorId,
      operatorName,
    }, 'Attempting to takeover conversation');

    if (!sessionId || !userPhone) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['sessionId', 'userPhone'],
      });
    }

    const conversation = await conversationsDb.takeover(sessionId, userPhone, operatorName, operatorId);

    logger.info({
      conversationId: conversation.id,
      taken_over_by: conversation.taken_over_by,
    }, 'Conversation taken over successfully');

    res.json({
      success: true,
      message: 'Conversation taken over successfully',
      conversation,
    });
  } catch (error) {
    logger.error({
      error: error.message,
      body: req.body,
      userId: req.user.id,
    }, 'Failed to takeover conversation');

    res.status(500).json({
      error: 'Failed to takeover conversation',
      message: error.message,
    });
  }
});

/**
 * @swagger
 * /api/whatsapp/conversations/return-to-ai:
 *   post:
 *     summary: Return conversation to AI
 *     tags: [WhatsApp]
 *     security:
 *       - bearerAuth: []
 */
router.post('/conversations/return-to-ai', async (req, res) => {
  try {
    const { sessionId, userPhone } = req.body;
    const operatorId = req.user.operatorId;

    if (!sessionId || !userPhone) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['sessionId', 'userPhone'],
      });
    }

    const conversation = await conversationsDb.returnToAI(sessionId, userPhone, operatorId);

    res.json({
      success: true,
      message: 'Conversation returned to AI successfully',
      conversation,
    });
  } catch (error) {
    logger.error({
      error: error.message,
      body: req.body,
      userId: req.user.id,
    }, 'Failed to return conversation to AI');

    res.status(500).json({
      error: 'Failed to return conversation to AI',
      message: error.message,
    });
  }
});

/**
 * @swagger
 * /api/whatsapp/conversations/send-message:
 *   post:
 *     summary: Send a message to a user
 *     tags: [WhatsApp]
 *     security:
 *       - bearerAuth: []
 */
router.post('/conversations/send-message', async (req, res) => {
  try {
    const { sessionId, userPhone, message, type = 'text' } = req.body;
    const operatorId = req.user.operatorId;
    const operatorName = req.user.name || req.user.email;

    if (!sessionId || !userPhone || !message) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['sessionId', 'userPhone', 'message'],
      });
    }

    // Call WhatsApp service to send the message
    const whatsappServiceUrl = process.env.WHATSAPP_SERVICE_URL || 'http://localhost:3000';
    const whatsappApiKey = process.env.WHATSAPP_SERVICE_API_KEY;

    try {
      const response = await axios.post(`${whatsappServiceUrl}/api/send`, {
        sessionId,
        to: userPhone,
        message,
        type,
      }, {
        headers: {
          'X-Service-Name': 'backend',
          'X-API-Key': whatsappApiKey || '',
        },
      });

      // Store the message in database
      const conversation = await conversationsDb.getConversationByPhone(sessionId, userPhone, operatorId);
      if (conversation) {
        await messagesDb.storeMessage({
          conversationId: conversation.id,
          fromMe: true,
          body: message,
          messageType: type === 'text' ? 'TEXT' : type.toUpperCase(),
          timestamp: new Date(),
        }, operatorId);
      }

      res.json({
        success: true,
        message: 'Message sent successfully',
        data: response.data,
      });
    } catch (whatsappError) {
      logger.error({
        error: whatsappError.message,
        sessionId,
        userPhone,
      }, 'Failed to send message to WhatsApp service');

      res.status(500).json({
        error: 'Failed to send message to WhatsApp',
        message: whatsappError.message,
      });
    }
  } catch (error) {
    logger.error({
      error: error.message,
      body: req.body,
      userId: req.user.id,
    }, 'Failed to send message');

    res.status(500).json({
      error: 'Failed to send message',
      message: error.message,
    });
  }
});

/**
 * @swagger
 * /api/whatsapp/sessions/:sessionId/ai:
 *   put:
 *     summary: Toggle AI for a session
 *     tags: [WhatsApp]
 *     security:
 *       - bearerAuth: []
 */
router.put('/sessions/:sessionId/ai', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { enabled } = req.body;
    const operatorId = req.user.operatorId;

    if (typeof enabled !== 'boolean') {
      return res.status(400).json({
        error: 'enabled must be a boolean',
      });
    }

    // Upsert AI config for the session
    const aiConfig = await prisma.whatsAppAgentConfig.upsert({
      where: {
        sessionId,
      },
      create: {
        sessionId,
        operatorId,
        enabled,
      },
      update: {
        enabled,
      },
    });

    logger.info({
      sessionId,
      enabled,
      userId: req.user.id,
    }, 'AI config updated for session');

    // Invalidate AI cache in WhatsApp service
    try {
      await axios.post(`${WHATSAPP_SERVICE_URL}/api/internal/invalidate-ai-cache`, {
        sessionId,
        operatorId,
      });
      logger.info({ sessionId, operatorId }, 'AI cache invalidated in WhatsApp service');
    } catch (cacheError) {
      logger.warn({
        error: cacheError.message,
        sessionId,
      }, 'Failed to invalidate AI cache - will expire naturally');
    }

    res.json({
      success: true,
      aiConfig: {
        sessionId: aiConfig.sessionId,
        enabled: aiConfig.enabled,
      },
    });
  } catch (error) {
    logger.error({
      error: error.message,
      sessionId: req.params.sessionId,
      userId: req.user.id,
    }, 'Failed to update AI config');

    res.status(500).json({
      error: 'Failed to update AI config',
      message: error.message,
    });
  }
});

module.exports = router;
