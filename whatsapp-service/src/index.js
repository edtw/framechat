/**
 * WhatsApp-Service - Baileys Microservice for AFILIATORS
 *
 * Handles:
 * - WhatsApp connections via Baileys
 * - Session management (QR codes, authentication)
 * - Message pipeline: WhatsApp -> AI (DeepSeek) -> Backend storage -> Response -> WebSocket
 * - WebSocket events for real-time updates
 */

// Load environment variables FIRST before any other imports
import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import { logger } from './utils/logger.js';
import { validateEnv } from './config/env.js';
import { WhatsAppManager } from './whatsapp/manager.js';
import { socketManager } from './websocket/socket-manager.js';
import { backendClient } from './api/backend-client.js';
import { aiHandlerClient } from './api/ai-handler-client.js';
import { getContextManager } from './services/context-manager.js';

// Validate environment
try {
  validateEnv();
} catch (err) {
  logger.error({ error: err.message }, 'Environment validation failed');
  process.exit(1);
}

const app = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 3006;

// CORS configuration
app.use(cors({
  origin: [
    'http://localhost:3001',
    'http://localhost:3005',
    'http://localhost:5173',
    'http://backend:3005',
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Service-Name', 'X-Operator-Id'],
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Initialize WhatsApp Manager (singleton)
export const whatsappManager = new WhatsAppManager();

// System message types to skip
const SYSTEM_MESSAGE_TYPES = new Set([
  'protocolMessage',
  'senderKeyDistributionMessage',
  'reactionMessage',
  'notificationMessage',
]);

// ==================== SMART MESSAGE BUFFERING ====================

const MESSAGE_BUFFER_MS = parseInt(process.env.MESSAGE_BUFFER_MS || '3000', 10);
const GROUP_CHAT_SUFFIX = '@g.us';
const BROADCAST_SUFFIX = '@broadcast';

// Buffer: Map<`${sessionId}:${chatJid}`, { messages: [], timer: timeout, operatorId, sock }>
const messageBuffer = new Map();

/**
 * Check if a JID represents a group chat.
 */
function isGroupChat(jid) {
  if (!jid) return false;
  return jid.endsWith(GROUP_CHAT_SUFFIX) || jid.endsWith(BROADCAST_SUFFIX);
}

/**
 * Format a recipient value into a valid WhatsApp JID.
 */
const formatRecipientJid = (value) => {
  if (!value) return null;
  const trimmed = `${value}`.trim();
  if (!trimmed) return null;
  if (trimmed.includes('@')) {
    return whatsappManager.normalizeJid(trimmed);
  }
  const sanitized = trimmed.replace(/[^0-9:]/g, '');
  if (!sanitized) {
    return null;
  }
  if (sanitized.includes(':')) {
    return whatsappManager.normalizeJid(`${sanitized}@lid`);
  }
  return whatsappManager.normalizeJid(`${sanitized}@s.whatsapp.net`);
};

// ==================== AUTH MIDDLEWARE ====================

/**
 * Middleware to authenticate internal backend requests.
 */
const authenticateBackend = (req, res, next) => {
  const apiKey = req.headers['authorization']?.replace('Bearer ', '');
  const validApiKey = process.env.BACKEND_API_KEY;

  if (!validApiKey) {
    logger.warn('BACKEND_API_KEY not configured - allowing unauthenticated access');
    return next();
  }

  if (apiKey === validApiKey) {
    return next();
  }

  logger.warn({ path: req.path }, 'Unauthorized API request');
  return res.status(401).json({
    error: 'Unauthorized',
    message: 'Valid API key required',
  });
};

/**
 * Extract operatorId from request headers.
 */
const getOperatorId = (req) => {
  return req.headers['x-operator-id'] || req.body?.operatorId || null;
};

// ==================== SESSION MANAGEMENT ROUTES ====================

/**
 * POST /api/sessions
 * Create a new WhatsApp session.
 * Headers: X-Operator-Id (required)
 * Body: { sessionName? }
 */
app.post('/api/sessions', async (req, res) => {
  try {
    const operatorId = getOperatorId(req);

    if (!operatorId) {
      return res.status(400).json({
        error: 'Missing operatorId. Provide X-Operator-Id header.',
      });
    }

    const sessionName = req.body?.sessionName || `session-${Date.now()}`;
    const sessionId = `${operatorId}_${sessionName}_${Date.now()}`;

    logger.info({ sessionId, operatorId, sessionName }, 'Creating WhatsApp session');

    await whatsappManager.createSession(sessionId, operatorId);

    res.json({
      success: true,
      sessionId,
      operatorId,
      status: 'CONNECTING',
    });
  } catch (error) {
    logger.error({
      error: error.message,
      stack: error.stack,
    }, 'Failed to create WhatsApp session');

    res.status(500).json({
      error: 'Failed to create session',
      message: error.message,
    });
  }
});

/**
 * GET /api/sessions
 * List all sessions for the given operator.
 * Headers: X-Operator-Id (required)
 */
app.get('/api/sessions', (req, res) => {
  try {
    const operatorId = getOperatorId(req);
    const allSessions = whatsappManager.getAllSessions();

    const sessions = operatorId
      ? allSessions.filter(s => String(s.operatorId) === String(operatorId))
      : allSessions;

    res.json({
      success: true,
      count: sessions.length,
      sessions,
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to get sessions');
    res.status(500).json({
      error: 'Failed to get sessions',
      message: error.message,
    });
  }
});

/**
 * GET /api/sessions/:id/qr
 * Get QR code for a session.
 */
app.get('/api/sessions/:id/qr', (req, res) => {
  try {
    const { id: sessionId } = req.params;
    const sock = whatsappManager.getSession(sessionId);

    if (!sock) {
      return res.status(404).json({
        error: 'Session not found',
        message: `No active session for ID: ${sessionId}`,
      });
    }

    // QR code is emitted in real-time via WebSocket.
    // The frontend should subscribe to 'qr:code' events.
    res.json({
      success: true,
      sessionId,
      message: 'QR code events are available via WebSocket. Subscribe to qr:code event.',
      status: sock.ws?.readyState === 1 ? 'CONNECTED' : 'AWAITING_QR',
    });
  } catch (error) {
    logger.error({ error: error.message, sessionId: req.params.id }, 'Failed to get QR code');
    res.status(500).json({
      error: 'Failed to get QR code',
      message: error.message,
    });
  }
});

/**
 * DELETE /api/sessions/:id
 * Disconnect a WhatsApp session.
 */
app.delete('/api/sessions/:id', async (req, res) => {
  try {
    const { id: sessionId } = req.params;

    logger.info({ sessionId }, 'Disconnecting WhatsApp session');

    await whatsappManager.disconnectSession(sessionId);

    res.json({
      success: true,
      sessionId,
      message: 'Session disconnected',
    });
  } catch (error) {
    logger.error({
      error: error.message,
      sessionId: req.params.id,
    }, 'Failed to disconnect session');

    res.status(500).json({
      error: 'Failed to disconnect session',
      message: error.message,
    });
  }
});

// ==================== MESSAGING ROUTES ====================

/**
 * POST /api/send
 * Send a WhatsApp message manually.
 * Body: { sessionId, to, message, operatorId }
 */
app.post('/api/send', async (req, res) => {
  try {
    const { sessionId, to, message } = req.body;

    if (!sessionId || !to || !message) {
      return res.status(400).json({
        error: 'Missing required fields: sessionId, to, message',
      });
    }

    const sock = whatsappManager.getSession(sessionId);
    if (!sock) {
      return res.status(404).json({
        error: `No active session for sessionId: ${sessionId}`,
      });
    }

    const jid = formatRecipientJid(to);
    if (!jid) {
      return res.status(400).json({
        error: 'Invalid WhatsApp recipient',
      });
    }

    logger.info({
      sessionId,
      to,
      recipientJid: jid,
      addressingMode: jid.endsWith('@lid') ? 'lid' : 'pn',
      messageLength: message.length,
    }, 'Sending WhatsApp message');

    const result = await sock.sendMessage(jid, { text: message });

    logger.info({ sessionId, to }, 'Message sent successfully');

    res.json({
      success: true,
      messageId: result.key.id,
      timestamp: result.messageTimestamp,
    });
  } catch (error) {
    logger.error({
      error: error.message,
      stack: error.stack,
    }, 'Failed to send WhatsApp message');

    res.status(500).json({
      error: 'Failed to send message',
      message: error.message,
    });
  }
});

// ==================== INTERNAL API ROUTES (backend-to-service) ====================

/**
 * POST /api/internal/send-message
 * Send WhatsApp message (internal, no auth required within Docker network).
 */
app.post('/api/internal/send-message', async (req, res) => {
  try {
    const { sessionId, to, message } = req.body;

    if (!sessionId || !to || !message) {
      return res.status(400).json({
        error: 'Missing required fields: sessionId, to, message',
      });
    }

    const sock = whatsappManager.getSession(sessionId);
    if (!sock) {
      return res.status(404).json({
        error: `No active session for sessionId: ${sessionId}`,
      });
    }

    const jid = formatRecipientJid(to);
    if (!jid) {
      return res.status(400).json({
        error: 'Invalid WhatsApp recipient',
      });
    }

    logger.info({
      sessionId,
      to,
      recipientJid: jid,
      messageLength: message.length,
    }, 'Sending WhatsApp message (internal)');

    const result = await sock.sendMessage(jid, { text: message });

    res.json({
      success: true,
      messageId: result.key.id,
      timestamp: result.messageTimestamp,
    });
  } catch (error) {
    logger.error({
      error: error.message,
      stack: error.stack,
    }, 'Failed to send WhatsApp message (internal)');

    res.status(500).json({
      error: 'Failed to send message',
      message: error.message,
    });
  }
});

/**
 * POST /api/internal/create-session
 * Create a new WhatsApp session (internal caller).
 */
app.post('/api/internal/create-session', async (req, res) => {
  try {
    const { sessionId, operatorId } = req.body;

    if (!sessionId || !operatorId) {
      return res.status(400).json({
        error: 'Missing required fields: sessionId, operatorId',
      });
    }

    logger.info({ sessionId, operatorId }, 'Creating WhatsApp session (internal)');

    await whatsappManager.createSession(sessionId, operatorId);

    res.json({
      success: true,
      sessionId,
      operatorId,
      status: 'CONNECTING',
    });
  } catch (error) {
    logger.error({
      error: error.message,
      stack: error.stack,
    }, 'Failed to create WhatsApp session (internal)');

    res.status(500).json({
      error: 'Failed to create session',
      message: error.message,
    });
  }
});

/**
 * POST /api/internal/invalidate-ai-cache
 * Invalidate AI profile cache for a session.
 */
app.post('/api/internal/invalidate-ai-cache', async (req, res) => {
  try {
    const { sessionId, operatorId } = req.body;

    if (!sessionId || !operatorId) {
      return res.status(400).json({
        error: 'Missing required fields: sessionId, operatorId',
      });
    }

    logger.info({ sessionId, operatorId }, 'Invalidating AI profile cache and reloading');

    whatsappManager.invalidateAIProfile(sessionId, operatorId);

    const newProfile = await whatsappManager.getAIProfile(sessionId, operatorId, { force: true });

    logger.info({
      sessionId,
      operatorId,
      reloaded: !!newProfile,
      enabled: newProfile?.config?.enabled,
      knowledgeCount: newProfile?.knowledgeBase?.length || 0,
    }, 'AI profile reloaded');

    res.json({
      success: true,
      sessionId,
      operatorId,
      profile: {
        enabled: newProfile?.config?.enabled || false,
        knowledgeCount: newProfile?.knowledgeBase?.length || 0,
      },
    });
  } catch (error) {
    logger.error({
      error: error.message,
      sessionId: req.body.sessionId,
    }, 'Failed to invalidate AI cache');

    res.status(500).json({
      error: 'Failed to invalidate AI cache',
      message: error.message,
    });
  }
});

// ==================== CONTEXT MANAGEMENT ROUTES ====================

/**
 * GET /api/internal/context/:sessionId/:chatJid
 * Get conversation context for a chat.
 */
app.get('/api/internal/context/:sessionId/:chatJid', async (req, res) => {
  try {
    const { sessionId, chatJid } = req.params;
    const limit = parseInt(req.query.limit) || undefined;

    const contextManager = getContextManager();
    const context = await contextManager.getContext(sessionId, chatJid, limit);
    const stats = await contextManager.getContextStats(sessionId, chatJid);

    res.json({
      success: true,
      sessionId,
      chatJid,
      context,
      stats,
    });
  } catch (error) {
    logger.error({
      error: error.message,
      sessionId: req.params.sessionId,
      chatJid: req.params.chatJid,
    }, 'Failed to get context');

    res.status(500).json({
      error: 'Failed to get context',
      message: error.message,
    });
  }
});

/**
 * DELETE /api/internal/context/:sessionId/:chatJid
 * Clear conversation context for a chat.
 */
app.delete('/api/internal/context/:sessionId/:chatJid', async (req, res) => {
  try {
    const { sessionId, chatJid } = req.params;

    const contextManager = getContextManager();
    await contextManager.clearContext(sessionId, chatJid);

    logger.info({ sessionId, chatJid }, 'Context cleared');

    res.json({
      success: true,
      sessionId,
      chatJid,
      message: 'Context cleared successfully',
    });
  } catch (error) {
    logger.error({
      error: error.message,
      sessionId: req.params.sessionId,
      chatJid: req.params.chatJid,
    }, 'Failed to clear context');

    res.status(500).json({
      error: 'Failed to clear context',
      message: error.message,
    });
  }
});

/**
 * GET /api/internal/context/:sessionId/summary
 * Get all conversations with context for a session.
 */
app.get('/api/internal/context/:sessionId/summary', async (req, res) => {
  try {
    const { sessionId } = req.params;

    const contextManager = getContextManager();
    const summary = await contextManager.getSessionSummary(sessionId);

    res.json({
      success: true,
      sessionId,
      conversations: summary,
    });
  } catch (error) {
    logger.error({
      error: error.message,
      sessionId: req.params.sessionId,
    }, 'Failed to get session summary');

    res.status(500).json({
      error: 'Failed to get session summary',
      message: error.message,
    });
  }
});

// ==================== HEALTH CHECK ====================

app.get('/health', async (req, res) => {
  try {
    const backendHealthy = await backendClient.healthCheck();
    const aiHealthy = await aiHandlerClient.healthCheck();

    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      activeSessions: whatsappManager.getActiveSessionsCount(),
      dependencies: {
        backend: backendHealthy ? 'healthy' : 'degraded',
        aiHandler: aiHealthy ? 'healthy' : 'degraded',
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      error: error.message,
    });
  }
});

app.get('/', (req, res) => {
  res.json({
    name: 'WhatsApp Service (AFILIATORS)',
    version: '1.0.0',
    description: 'WhatsApp Baileys microservice for AFILIATORS',
    status: 'running',
    port: PORT,
    activeSessions: whatsappManager.getActiveSessionsCount(),
    endpoints: {
      health: 'GET /health',
      sessions: {
        create: 'POST /api/sessions',
        list: 'GET /api/sessions',
        qr: 'GET /api/sessions/:id/qr',
        disconnect: 'DELETE /api/sessions/:id',
      },
      messaging: {
        send: 'POST /api/send',
      },
      internal: {
        sendMessage: 'POST /api/internal/send-message',
        createSession: 'POST /api/internal/create-session',
        invalidateAiCache: 'POST /api/internal/invalidate-ai-cache',
        context: 'GET /api/internal/context/:sessionId/:chatJid',
      },
    },
    ai: {
      provider: 'deepseek',
      url: process.env.AI_HANDLER_URL || 'http://localhost:8000',
    },
    dependencies: {
      backend: process.env.BACKEND_URL || 'http://localhost:3005',
      aiHandler: process.env.AI_HANDLER_URL || 'http://localhost:8000',
    },
  });
});

// ==================== SMART MESSAGE BUFFER FLUSH ====================

/**
 * Flush buffered messages for a conversation — combine them and run the AI pipeline once.
 */
async function flushMessageBuffer(sessionId, chatJid, sock, operatorId, aiProfile, aiConfig, knowledgePayload) {
  const bufferKey = `${sessionId}:${chatJid}`;
  const entry = messageBuffer.get(bufferKey);
  if (!entry) return;

  // Clear the buffer immediately so new messages start a fresh buffer
  messageBuffer.delete(bufferKey);
  if (entry.timer) clearTimeout(entry.timer);

  const messages = entry.messages;
  if (messages.length === 0) return;

  // Combine all buffered messages into one
  const combinedText = messages.map(m => m.text).join('\n');
  const firstMessage = messages[0];
  const lastMessage = messages[messages.length - 1];

  logger.info({
    sessionId,
    chatJid: chatJid.substring(0, 15) + '...',
    bufferSize: messages.length,
    combinedLength: combinedText.length,
    elapsedMs: lastMessage.timestamp - firstMessage.timestamp,
  }, 'Flushing message buffer to AI pipeline');

  // ===== AI PIPELINE (same as before but with combined text) =====
  const aiDetectIntent = aiConfig?.detectIntent !== false;
  let aiResponse = null;

  try {
    const behaviorPayload = aiConfig?.agentConfig || null;
    const systemPrompt = behaviorPayload?.systemPrompt || null;
    const contextManager = getContextManager();
    const conversationContext = await contextManager.getContextForAI(sessionId, chatJid);

    const contactRecord = firstMessage.conversationRecord || {};

    const aiResult = await aiHandlerClient.processMessage(combinedText, {
      detect_intent: aiDetectIntent,
      temperature: aiConfig?.temperature ?? 0.7,
      max_tokens: aiConfig?.maxTokens || 800,
      system_prompt: systemPrompt,
      behavior: behaviorPayload,
      knowledge_base: knowledgePayload,
      context: conversationContext,
      session_id: sessionId,
      chat_jid: chatJid,
      contact_name: contactRecord.contactName || contactRecord.name || null,
      contact_phone: contactRecord.contactNumber || contactRecord.number || null,
    });

    aiResponse = aiResult.response;

    const orch = aiResult.orchestrator;
    if (orch) {
      logger.info({
        sessionId,
        chatJid: chatJid.substring(0, 15) + '...',
        pipelineStage: orch.pipeline_stage,
        stageChanged: orch.stage_changed,
        alertCount: orch.alerts?.length || 0,
      }, 'Orchestrator pipeline updated');

      // Surface orchestrator alerts to operators in real time
      if (orch.alerts?.length && whatsappManager.socketManager) {
        for (const alert of orch.alerts) {
          whatsappManager.socketManager.emitNewMessage(operatorId, {
            sessionId,
            type: 'orchestrator_alert',
            direction: 'system',
            severity: alert.severity,
            title: alert.title,
            chatJid,
            timestamp: new Date().toISOString(),
          });
        }
      }
    }

    logger.info({
      intent: aiResult.intent?.type,
      confidence: aiResult.intent?.confidence,
      responseLength: aiResponse?.length || 0,
    }, 'AI processing complete (buffered)');
  } catch (aiError) {
    logger.warn({ error: aiError.message, sessionId }, 'AI processing failed for buffered messages');
    return;
  }

  if (!aiResponse) return;

  // ===== SEND AI RESPONSE =====
  const destinationJid = firstMessage.destinationJid || chatJid;
  try {
    if (destinationJid) {
      await sock.sendPresenceUpdate('composing', destinationJid);
    }
    const typingDelay = Math.min(Math.max(aiResponse.length * 50, 1000), 3000);
    await new Promise(resolve => setTimeout(resolve, typingDelay));

    if (destinationJid) {
      await sock.sendMessage(destinationJid, { text: aiResponse });
    }
    if (destinationJid) {
      await sock.sendPresenceUpdate('paused', destinationJid);
    }

    logger.info({ to: destinationJid, responseLength: aiResponse.length }, 'AI response sent (buffered)');

    // Store outgoing AI message in backend
    for (const msg of messages) {
      if (msg.conversationRecord?.id) {
        try {
          await backendClient.storeMessage({
            conversationId: msg.conversationRecord.id,
            fromMe: true,
            body: aiResponse,
            messageType: 'TEXT',
            mediaUrl: null,
            sentiment: null,
            intent: null,
            operatorId,
            timestamp: new Date(),
          });
          break; // Only store once per conversation
        } catch (e) {
          logger.error({ error: e.message }, 'Failed to store AI response');
        }
      }
    }

    // Save AI response to context
    const contextManager = getContextManager();
    await contextManager.addMessage(sessionId, chatJid, 'assistant', aiResponse, {
      timestamp: new Date().toISOString(),
      messageId: null,
    });

    // WebSocket event
    if (whatsappManager.socketManager) {
      whatsappManager.socketManager.emitNewMessage(operatorId, {
        sessionId,
        from: sessionId,
        to: destinationJid,
        message: aiResponse,
        type: 'text',
        direction: 'outgoing',
        timestamp: new Date().toISOString(),
        aiResponse: aiResponse,
      });
    }
  } catch (sendError) {
    logger.error({ error: sendError.message }, 'Failed to send AI response for buffered messages');
  }
}

// ==================== INCOMING MESSAGE HANDLER ====================

// Override handleIncomingMessage with the full message pipeline:
// WhatsApp -> AI (DeepSeek) -> Backend storage -> Response -> WebSocket
WhatsAppManager.prototype.handleIncomingMessage = async function(sock, sessionId, operatorId, message) {
  try {
    // Ignore messages from self
    if (message.key.fromMe) return;

    // Load AI profile for this session
    const aiProfile = operatorId ? await this.getAIProfile(sessionId, operatorId) : null;
    const aiConfig = aiProfile?.config || null;
    const knowledgePayload = this.prepareKnowledgePayload(aiProfile?.knowledgeBase || []);
    const aiDetectIntent = aiConfig?.detectIntent !== false;
    const aiEnabled = aiProfile ? (aiConfig?.enabled !== false) : true;

    const chatJid = this.normalizeJid(message.key?.remoteJid);
    const remoteIdentity = await this.resolveRemoteIdentity(
      sock,
      message.key?.participant || message.key?.remoteJid,
      message.key?.participantAlt || message.key?.remoteJidAlt
    );
    const contactHandle = remoteIdentity.identifier;
    const destinationJid =
      remoteIdentity.pnJid ||
      remoteIdentity.primaryJid ||
      chatJid;

    // ==================== GROUP CHAT DETECTION ====================
    const groupChat = isGroupChat(chatJid);
    if (groupChat) {
      logger.info({
        sessionId,
        operatorId,
        chatJid,
        participant: contactHandle,
      }, 'Group chat message detected — skipping AI auto-response');
    }

    // Detect message type
    const messageType = Object.keys(message.message || {})[0];
    if (!messageType || SYSTEM_MESSAGE_TYPES.has(messageType)) {
      logger.debug({
        sessionId,
        operatorId,
        messageId: message.key?.id,
        messageType,
      }, 'Skipping system WhatsApp message');
      return;
    }

    // Extract text content
    let messageText =
      message.message?.conversation ||
      message.message?.extendedTextMessage?.text ||
      '';

    // Handle media messages with captions
    if (!messageText?.trim()) {
      messageText =
        message.message?.imageMessage?.caption ||
        message.message?.videoMessage?.caption ||
        message.message?.documentMessage?.caption ||
        '';
    }

    // Handle non-text media messages (no caption)
    if (!messageText?.trim() && messageType) {
      const mediaLabelMap = {
        'imageMessage': '[Image]',
        'videoMessage': '[Video]',
        'audioMessage': '[Audio]',
        'documentMessage': '[Document]',
        'stickerMessage': '[Sticker]',
        'locationMessage': '[Location]',
        'contactMessage': '[Contact]',
      };
      messageText = mediaLabelMap[messageType] || '[Media]';
    }

    if (!messageText?.trim()) {
      logger.debug({
        sessionId,
        messageId: message.key?.id,
        messageType,
      }, 'Skipping incoming message with empty text payload');
      return;
    }

    logger.info({
      sessionId,
      operatorId,
      chatJid,
      from: contactHandle,
      remotePhone: remoteIdentity.phoneNumber,
      remoteLid: remoteIdentity.lid,
      addressingMode: remoteIdentity.addressingMode,
      messageLength: messageText.length,
      type: messageType,
      groupChat,
    }, 'Incoming WhatsApp message');

    // ==================== PIPELINE STAGE 1: CONVERSATION UPSERT ====================
    let conversationRecord = null;
    try {
      const conversationResponse = await backendClient.upsertConversation({
        sessionId,
        remoteJid: chatJid || remoteIdentity.primaryJid || remoteIdentity.lid,
        contactName: message.pushName || contactHandle,
        contactNumber: remoteIdentity.phoneNumber || contactHandle,
        lastMessage: messageText,
        lastMessageTime: new Date(message.messageTimestamp * 1000),
        unreadCount: 1,
        operatorId,
      });

      conversationRecord = conversationResponse?.conversation || conversationResponse || null;
      logger.info('Conversation updated in backend');

      // Save user message to context
      const contextManager = getContextManager();
      await contextManager.addMessage(
        sessionId,
        chatJid,
        'user',
        messageText,
        {
          timestamp: new Date(message.messageTimestamp * 1000).toISOString(),
          messageId: message.key?.id,
        }
      );
    } catch (conversationError) {
      logger.error({
        error: conversationError.message,
      }, 'Failed to update conversation in backend');
    }

    // ==================== PIPELINE STAGE 2: AI WITH SMART BUFFERING ====================

    // Skip AI for group chats — only store messages, don't auto-respond
    if (!groupChat && aiEnabled) {
      const bufferKey = `${sessionId}:${chatJid}`;

      // Upsert conversation before buffering
      const existingEntry = messageBuffer.get(bufferKey);
      if (existingEntry) {
        // Clear existing timer
        if (existingEntry.timer) clearTimeout(existingEntry.timer);

        // Add to existing buffer
        existingEntry.messages.push({
          text: messageText,
          timestamp: Date.now(),
          destinationJid,
          conversationRecord,
        });
      } else {
        // Start new buffer
        messageBuffer.set(bufferKey, {
          messages: [{
            text: messageText,
            timestamp: Date.now(),
            destinationJid,
            conversationRecord,
          }],
          timer: null,
          sock,
          operatorId,
          aiProfile,
          aiConfig,
          knowledgePayload,
        });
      }

      // Reset the timer — AI will respond after MESSAGE_BUFFER_MS of silence
      const entry = messageBuffer.get(bufferKey);
      entry.sock = sock;
      entry.operatorId = operatorId;
      entry.aiProfile = aiProfile;
      entry.aiConfig = aiConfig;
      entry.knowledgePayload = knowledgePayload;

      entry.timer = setTimeout(() => {
        flushMessageBuffer(sessionId, chatJid, sock, operatorId, aiProfile, aiConfig, knowledgePayload);
      }, MESSAGE_BUFFER_MS);

      logger.debug({
        sessionId,
        chatJid: chatJid.substring(0, 15) + '...',
        bufferedCount: entry.messages.length,
        bufferMs: MESSAGE_BUFFER_MS,
      }, 'Message buffered — waiting for pause before AI response');
    } else if (groupChat && aiEnabled) {
      logger.info({
        sessionId,
        chatJid,
      }, 'Skipping AI response for group chat');
    } else {
      logger.debug({
        sessionId,
        operatorId,
        reason: !aiProfile ? 'no_profile' : 'disabled_in_config',
      }, 'AI chatbot disabled for this session');
    }

    // ==================== PIPELINE STAGE 3: STORE MESSAGE ====================
    try {
      const conversationId = conversationRecord?.id;

      if (!conversationId) {
        logger.warn({
          sessionId,
          chatJid,
        }, 'Skipping backend message storage - missing conversationId');
      } else {
        const messageTypeMap = {
          'conversation': 'TEXT',
          'extendedTextMessage': 'TEXT',
          'imageMessage': 'IMAGE',
          'videoMessage': 'VIDEO',
          'audioMessage': 'AUDIO',
          'documentMessage': 'DOCUMENT',
          'stickerMessage': 'STICKER',
          'locationMessage': 'LOCATION',
          'contactMessage': 'CONTACT',
        };

        await backendClient.storeMessage({
          conversationId,
          fromMe: false,
          body: messageText,
          messageType: messageTypeMap[messageType] || 'TEXT',
          mediaUrl: null,
          sentiment: null,
          intent: null,
          operatorId,
          timestamp: new Date(message.messageTimestamp * 1000),
        });

        logger.info('Message stored in backend');
      }
    } catch (backendError) {
      logger.error({
        error: backendError.message,
      }, 'Failed to store message in backend');
    }

    // ==================== PIPELINE STAGE 4: WEBSOCKET EVENT ====================
    // AI responses are now sent asynchronously via flushMessageBuffer (buffered pipeline)
    if (this.socketManager) {
      this.socketManager.emitNewMessage(operatorId, {
        sessionId,
        from: contactHandle,
        fromLid: remoteIdentity.lid,
        remoteJid: chatJid || remoteIdentity.primaryJid,
        addressingMode: remoteIdentity.addressingMode,
        to: sessionId,
        message: messageText,
        type: messageType || 'text',
        direction: 'incoming',
        timestamp: new Date(message.messageTimestamp * 1000).toISOString(),
        groupChat,
        buffered: !groupChat && aiEnabled, // will be answered after buffer timeout
      });
    }

  } catch (error) {
    logger.error({
      error: error.message,
      stack: error.stack,
      sessionId,
      operatorId,
    }, 'Error handling incoming message');
  }
};

// ==================== ENHANCED CREATE SESSION ====================

// Override createSession to validate with backend before creating
const originalCreateSession = WhatsAppManager.prototype.createSession;

WhatsAppManager.prototype.createSession = async function(sessionId, operatorId) {
  try {
    logger.info({ sessionId, operatorId }, 'Creating WhatsApp session (with backend validation)');

    // Validate session with backend
    try {
      await backendClient.validateSession(sessionId, operatorId);
    } catch (validationError) {
      logger.error({
        error: validationError.message,
      }, 'Session validation failed with backend');
      throw new Error('Invalid session or unauthorized');
    }

    // Check if session already exists
    if (this.sessions.has(sessionId)) {
      logger.warn(`Session ${sessionId} already exists`);
      return this.sessions.get(sessionId);
    }

    // Create Baileys session
    const sock = await originalCreateSession.call(this, sessionId, operatorId);

    // Store operatorId for this session
    sock._operatorId = operatorId;
    sock._sessionId = sessionId;

    // Update backend session status
    await backendClient.updateSessionStatus(sessionId, 'CONNECTING', operatorId);

    logger.info({ sessionId, operatorId }, 'WhatsApp session created successfully');

    return sock;
  } catch (error) {
    logger.error({
      error: error.message,
      stack: error.stack,
      sessionId,
      operatorId,
    }, 'Failed to create WhatsApp session');

    // Update backend with error status
    try {
      await backendClient.updateSessionStatus(sessionId, 'ERROR', operatorId);
    } catch (updateError) {
      logger.error('Failed to update error status in backend');
    }

    throw error;
  }
};

// ==================== ERROR HANDLING ====================

app.use((err, req, res, _next) => {
  logger.error({
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  }, 'Unhandled error');

  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

// ==================== SERVER START ====================

async function start() {
  try {
    // Check backend connectivity
    const backendHealthy = await backendClient.healthCheck();
    if (!backendHealthy) {
      logger.warn('Backend is not reachable - starting anyway (will retry)');
    } else {
      logger.info('Backend is healthy');
    }

    // Check AI Handler connectivity
    const aiHealthy = await aiHandlerClient.healthCheck();
    if (!aiHealthy) {
      logger.warn('AI Handler is not reachable - starting anyway (will retry)');
    } else {
      logger.info('AI Handler is healthy');
    }

    // Initialize WebSocket server
    socketManager.initialize(httpServer);
    logger.info('WebSocket server initialized');

    // Pass socketManager to WhatsAppManager for real-time events
    whatsappManager.setSocketManager(socketManager);

    // Load existing sessions from disk
    await whatsappManager.loadExistingSessions();
    logger.info('Loaded existing sessions from disk');

    // Start server (HTTP + WebSocket)
    httpServer.listen(PORT, () => {
      logger.info(`
╔═══════════════════════════════════════════════════════╗
║                                                       ║
║   WhatsApp Service (AFILIATORS) v1.0.0               ║
║                                                       ║
║   🌐 Server: http://localhost:${PORT}                 ║
║   📡 WebSocket: ws://localhost:${PORT}/socket.io      ║
║   🏥 Health: http://localhost:${PORT}/health          ║
║   🤖 AI: DeepSeek (${process.env.AI_HANDLER_URL || 'http://localhost:8000'})     ║
║                                                       ║
║   API Routes:                                         ║
║   🔌 POST /api/sessions                              ║
║   📋 GET  /api/sessions                              ║
║   📱 GET  /api/sessions/:id/qr                       ║
║   ❌ DELETE /api/sessions/:id                        ║
║   📨 POST /api/send                                  ║
║                                                       ║
╚═══════════════════════════════════════════════════════╝
      `);
    });
  } catch (error) {
    logger.error({
      error: error.message,
      stack: error.stack,
    }, 'Failed to start server');
    process.exit(1);
  }
}

// ==================== GRACEFUL SHUTDOWN ====================

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully...');
  await socketManager.disconnectAll();
  await whatsappManager.disconnectAll();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  await socketManager.disconnectAll();
  await whatsappManager.disconnectAll();
  process.exit(0);
});

process.on('uncaughtException', (err) => {
  logger.error({
    error: err.message,
    stack: err.stack,
  }, 'Uncaught Exception');
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error({
    reason: reason instanceof Error ? { message: reason.message, stack: reason.stack } : reason,
    promise,
  }, 'Unhandled Rejection - continuing process');
});

start();
