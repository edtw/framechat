/**
 * Discord Integration - Internal Routes
 *
 * Called BY the discord-service microservice to fetch credentials/config and
 * store Discord data (accounts status, conversations, messages, engagement).
 *
 * Authentication: service-to-service (X-Service-Name: discord-service + shared key).
 */

const express = require('express');
const { authenticateService, requireService } = require('../../../core/middleware/service-auth');
const accountsDb = require('../database/accounts');
const conversationsDb = require('../database/conversations');
const messagesDb = require('../database/messages');
const engagementDb = require('../database/engagement');
const personasDb = require('../database/personas');
const logger = require('../../../core/utils/logger');
const prisma = require('../../../core/prisma');

const router = express.Router();

router.use(authenticateService);
router.use(requireService('discord-service'));

const mapKnowledgeItem = (item) => ({
  id: String(item.id),
  title: String(item.title || ''),
  content: String(item.content || '').slice(0, 1200),
  category: item.category ? String(item.category) : null,
  tags: [], // tags not yet implemented on KnowledgeItem
  updatedAt: item.updatedAt ? new Date(item.updatedAt).toISOString() : null,
});

/**
 * GET /accounts
 * List all Discord accounts (no token) so the service knows what to connect.
 */
router.get('/accounts', async (req, res) => {
  try {
    const accounts = await prisma.discordAccount.findMany({
      include: { agentConfig: true },
    });
    res.json({
      accounts: accounts.map((a) => ({
        id: a.id,
        operatorId: a.operatorId,
        name: a.name,
        status: a.status,
        enabled: a.agentConfig?.enabled ?? false,
        engagementEnabled: a.agentConfig?.engagementEnabled ?? false,
      })),
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to list Discord accounts (internal)');
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /accounts/:id/credentials
 * Return the decrypted token + config for the service to connect this account.
 */
router.get('/accounts/:id/credentials', async (req, res) => {
  try {
    const token = await accountsDb.getDecryptedToken(req.params.id);
    const config = await accountsDb.getAgentConfig(req.params.id);
    res.json({ accountId: req.params.id, token, config });
  } catch (error) {
    const status = error.status || 500;
    logger.error({ error: error.message, accountId: req.params.id }, 'Failed to load Discord credentials');
    res.status(status).json({ error: error.message });
  }
});

/**
 * GET /accounts/:id/ai-config
 * AI config + operator knowledge base for generating replies.
 */
router.get('/accounts/:id/ai-config', async (req, res) => {
  try {
    const account = await prisma.discordAccount.findUnique({
      where: { id: req.params.id },
      select: { id: true, operatorId: true },
    });
    if (!account) return res.status(404).json({ error: 'Account not found' });

    const config = await accountsDb.getAgentConfig(req.params.id);
    const knowledgeItems = await prisma.knowledgeItem.findMany({
      where: { operatorId: account.operatorId },
      orderBy: { updatedAt: 'desc' },
      take: 25,
    });

    res.json({
      success: true,
      accountId: req.params.id,
      operatorId: account.operatorId,
      ai_config: config || { enabled: false },
      knowledgeBase: knowledgeItems.map(mapKnowledgeItem),
      knowledgeCount: knowledgeItems.length,
    });
  } catch (error) {
    logger.error({ error: error.message, accountId: req.params.id }, 'Failed to load Discord AI config');
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /accounts/:id/status
 * Update connection status + resolved identity (discordUserId, username, avatar).
 */
router.post('/accounts/:id/status', async (req, res) => {
  try {
    const { status, discordUserId, username, avatarUrl, lastError } = req.body;
    const account = await accountsDb.updateAccountStatus(req.params.id, status, {
      discordUserId, username, avatarUrl, lastError,
    });
    res.json({ success: true, account });
  } catch (error) {
    logger.error({ error: error.message, accountId: req.params.id }, 'Failed to update Discord status');
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /conversations
 * Upsert a Discord conversation (DM or guild channel).
 */
router.post('/conversations', async (req, res) => {
  try {
    const conversation = await conversationsDb.upsertConversation(req.body);
    res.json({ success: true, conversation });
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to upsert Discord conversation');
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /messages
 * Store an inbound/outbound Discord message.
 */
router.post('/messages', async (req, res) => {
  try {
    const message = await messagesDb.storeMessage(req.body);
    res.status(201).json({ success: true, message });
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to store Discord message');
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /conversations/:id/messages
 * Return messages for a conversation, ordered by timestamp desc.
 * Query params: ?limit=50 (default 50, max 100)
 */
router.get('/conversations/:id/messages', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);

    const messages = await prisma.discordMessage.findMany({
      where: { conversationId: req.params.id },
      orderBy: { timestamp: 'desc' },
      take: limit,
      select: {
        id: true,
        fromMe: true,
        body: true,
        messageType: true,
        timestamp: true,
        aiProcessed: true,
      },
    });

    res.json({ success: true, messages });
  } catch (error) {
    logger.error({ error: error.message, conversationId: req.params.id }, 'Failed to fetch Discord messages (internal)');
    res.status(500).json({ error: error.message });
  }
});

// ==================== ENGAGEMENT ====================

router.get('/accounts/:id/engagement-plan', async (req, res) => {
  try {
    const config = await accountsDb.getAgentConfig(req.params.id);
    const account = await prisma.discordAccount.findUnique({
      where: { id: req.params.id },
      select: { operatorId: true },
    });
    if (!account) return res.status(404).json({ error: 'Account not found' });

    const targets = await engagementDb.getTargets(account.operatorId, { accountId: req.params.id });
    res.json({
      accountId: req.params.id,
      operatorId: account.operatorId,
      enabled: config?.engagementEnabled ?? false,
      plan: config?.engagementPlan || null,
      targets,
    });
  } catch (error) {
    logger.error({ error: error.message, accountId: req.params.id }, 'Failed to load engagement plan');
    res.status(500).json({ error: error.message });
  }
});

router.post('/targets', async (req, res) => {
  try {
    const target = await engagementDb.upsertTarget(req.body);
    res.json({ success: true, target });
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to upsert engagement target');
    res.status(500).json({ error: error.message });
  }
});

router.post('/targets/:id/status', async (req, res) => {
  try {
    const { status, joinedAt, lastEngagedAt, operatorId } = req.body;
    const target = await engagementDb.updateTargetStatus(req.params.id, operatorId, status, { joinedAt, lastEngagedAt });
    res.json({ success: true, target });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

/** Proposed engagement message -> approval queue. */
router.post('/queue', async (req, res) => {
  try {
    const item = await engagementDb.createQueueItem(req.body);
    res.status(201).json({ success: true, item });
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to create engagement queue item');
    res.status(500).json({ error: error.message });
  }
});

/** Approved items the service should now post. */
router.get('/accounts/:id/queue/approved', async (req, res) => {
  try {
    const items = await engagementDb.getApprovedItems(req.params.id, parseInt(req.query.limit) || 10);
    res.json({ items });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/** Mark an approved item as sent or failed after posting. */
router.post('/queue/:id/result', async (req, res) => {
  try {
    const { status, sentAt } = req.body;
    const item = await engagementDb.markQueueItemResult(req.params.id, { status, sentAt });
    res.json({ success: true, item });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== WRITING SIGNATURE ====================

/**
 * PUT /conversations/:id/signature
 * Store a cached writing-style analysis for this conversation.
 * Called by discord-service after analyzing message history.
 */
router.put('/conversations/:id/signature', async (req, res) => {
  try {
    const { signature, messageCount } = req.body;
    if (!signature) {
      return res.status(400).json({ error: 'signature is required' });
    }

    const conversation = await prisma.discordConversation.update({
      where: { id: req.params.id },
      data: {
        writingSignature: signature,
        signatureUpdatedAt: new Date(),
      },
    });

    res.json({
      success: true,
      conversation: {
        id: conversation.id,
        writingSignature: conversation.writingSignature,
        signatureUpdatedAt: conversation.signatureUpdatedAt,
      },
      messageCount: messageCount ?? null,
    });
  } catch (error) {
    // P2025 = Record not found
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    logger.error({ error: error.message, conversationId: req.params.id }, 'Failed to store writing signature');
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /conversations/:id/signature
 * Return the cached writing-style analysis + metadata for this conversation.
 */
router.get('/conversations/:id/signature', async (req, res) => {
  try {
    const conversation = await prisma.discordConversation.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        writingSignature: true,
        signatureUpdatedAt: true,
        contactName: true,
      },
    });

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    res.json({
      success: true,
      conversation: {
        id: conversation.id,
        contactName: conversation.contactName,
        writingSignature: conversation.writingSignature,
        signatureUpdatedAt: conversation.signatureUpdatedAt,
        hasSignature: conversation.writingSignature != null,
      },
    });
  } catch (error) {
    logger.error({ error: error.message, conversationId: req.params.id }, 'Failed to fetch writing signature');
    res.status(500).json({ error: error.message });
  }
});

// ==================== SELF SIGNATURE ====================

/**
 * PUT /accounts/:id/self-signature
 * Store cached writing-style analysis of the user's OWN messages.
 * Called by discord-service after analyzing the account owner's message history.
 */
router.put('/accounts/:id/self-signature', async (req, res) => {
  try {
    const { signature } = req.body;
    if (!signature) {
      return res.status(400).json({ error: 'signature is required' });
    }

    const result = await accountsDb.saveSelfSignature(req.params.id, signature);
    res.json({ success: true, ...result });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Account not found' });
    }
    logger.error({ error: error.message, accountId: req.params.id }, 'Failed to store self-signature');
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /accounts/:id/self-signature
 * Return the cached self-signature for the discord-service to use when generating replies.
 */
router.get('/accounts/:id/self-signature', async (req, res) => {
  try {
    const result = await accountsDb.getSelfSignature(req.params.id);
    if (!result) {
      return res.status(404).json({ error: 'Account not found' });
    }
    res.json({ success: true, ...result });
  } catch (error) {
    logger.error({ error: error.message, accountId: req.params.id }, 'Failed to fetch self-signature');
    res.status(500).json({ error: error.message });
  }
});

// ==================== TAKEOVER ====================

/**
 * GET /conversations/:id/takeover-status
 * Return the takeover status for a conversation.
 * Called by discord-service to decide whether to skip AI auto-reply.
 *
 * Returns: { takeoverActive: boolean }
 */
router.get('/conversations/:id/takeover-status', async (req, res) => {
  try {
    const status = await conversationsDb.getTakeoverStatus(req.params.id);
    res.json({ success: true, ...status });
  } catch (error) {
    if (error.status === 404) {
      return res.status(404).json({ error: error.message });
    }
    logger.error({ error: error.message, conversationId: req.params.id }, 'Failed to get takeover status');
    res.status(500).json({ error: error.message });
  }
});

// ==================== ACTIVE PERSONA ====================

/**
 * GET /accounts/:id/active-persona
 * Return the active persona's system prompt + name for the discord-service
 * to use when generating AI replies. No operatorId gate — trusted internal
 * service route.
 *
 * Returns null if no persona is assigned to this account.
 */
router.get('/accounts/:id/active-persona', async (req, res) => {
  try {
    const persona = await personasDb.getActivePersonaInternal(req.params.id);
    if (!persona) {
      return res.json({ persona: null });
    }
    res.json({ persona });
  } catch (error) {
    logger.error({ error: error.message, accountId: req.params.id }, 'Failed to fetch active persona');
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
