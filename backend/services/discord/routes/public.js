/**
 * Discord Integration - Public Routes
 *
 * Called BY the frontend to manage Discord accounts, scope/AI config,
 * conversations, and the engagement approval queue.
 *
 * Authentication: User JWT.
 */

const express = require('express');
const axios = require('axios');
const { authenticateToken } = require('../../../core/middleware/auth');
const prisma = require('../../../core/prisma');
const accountsDb = require('../database/accounts');
const conversationsDb = require('../database/conversations');
const engagementDb = require('../database/engagement');
const personasDb = require('../database/personas');
const logger = require('../../../core/utils/logger');

const router = express.Router();

const DISCORD_SERVICE_URL = process.env.DISCORD_SERVICE_URL || 'http://localhost:3007';
const AI_HANDLER_URL = process.env.AI_HANDLER_URL || 'http://ai-handler:8000';
const DISCORD_SERVICE_HEADERS = {
  Authorization: `Bearer ${process.env.DISCORD_SERVICE_API_KEY || process.env.WHATSAPP_SERVICE_API_KEY || ''}`,
  'X-Service-Name': 'backend',
};

router.use(authenticateToken);

const handleError = (res, error, context) => {
  const status = error.status || 500;
  logger.error({ error: error.message, context }, 'Discord public route error');
  res.status(status).json({ error: error.message });
};

// ==================== ACCOUNTS ====================

router.get('/accounts', async (req, res) => {
  try {
    const accounts = await accountsDb.getAccounts(req.user.operatorId);
    res.json({ success: true, accounts });
  } catch (error) {
    handleError(res, error, 'list accounts');
  }
});

router.post('/accounts', async (req, res) => {
  try {
    const { name, token } = req.body;
    if (!name || !token) {
      return res.status(400).json({ error: 'name and token are required' });
    }
    const account = await accountsDb.createAccount({
      operatorId: req.user.operatorId,
      name,
      token,
    });
    res.status(201).json({ success: true, account });
  } catch (error) {
    handleError(res, error, 'create account');
  }
});

router.get('/accounts/:id', async (req, res) => {
  try {
    const account = await accountsDb.getAccountById(req.params.id, req.user.operatorId);
    res.json({ success: true, account });
  } catch (error) {
    handleError(res, error, 'get account');
  }
});

router.put('/accounts/:id/token', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'token is required' });
    const account = await accountsDb.updateToken(req.params.id, req.user.operatorId, token);
    res.json({ success: true, account });
  } catch (error) {
    handleError(res, error, 'update token');
  }
});

router.delete('/accounts/:id', async (req, res) => {
  try {
    // Best-effort disconnect first
    try {
      await axios.post(
        `${DISCORD_SERVICE_URL}/api/internal/disconnect`,
        { accountId: req.params.id },
        { headers: DISCORD_SERVICE_HEADERS, timeout: 5000 },
      );
    } catch (e) {
      logger.warn({ accountId: req.params.id, error: e.message }, 'Disconnect before delete failed (continuing)');
    }
    const result = await accountsDb.deleteAccount(req.params.id, req.user.operatorId);
    res.json({ success: true, ...result });
  } catch (error) {
    handleError(res, error, 'delete account');
  }
});

router.post('/accounts/:id/connect', async (req, res) => {
  try {
    // Authorize ownership before asking the service to connect
    await accountsDb.getAccountById(req.params.id, req.user.operatorId);
    await axios.post(
      `${DISCORD_SERVICE_URL}/api/internal/connect`,
      { accountId: req.params.id, operatorId: req.user.operatorId },
      { headers: DISCORD_SERVICE_HEADERS, timeout: 10000 },
    );
    res.json({ success: true, status: 'CONNECTING' });
  } catch (error) {
    handleError(res, error, 'connect account');
  }
});

router.post('/accounts/:id/disconnect', async (req, res) => {
  try {
    await accountsDb.getAccountById(req.params.id, req.user.operatorId);
    await axios.post(
      `${DISCORD_SERVICE_URL}/api/internal/disconnect`,
      { accountId: req.params.id },
      { headers: DISCORD_SERVICE_HEADERS, timeout: 10000 },
    );
    res.json({ success: true, status: 'DISCONNECTED' });
  } catch (error) {
    handleError(res, error, 'disconnect account');
  }
});

// ==================== CONFIG ====================

router.get('/accounts/:id/config', async (req, res) => {
  try {
    await accountsDb.getAccountById(req.params.id, req.user.operatorId);
    const config = await accountsDb.getAgentConfig(req.params.id);
    res.json({ success: true, config: config || null });
  } catch (error) {
    handleError(res, error, 'get config');
  }
});

router.put('/accounts/:id/config', async (req, res) => {
  try {
    await accountsDb.getAccountById(req.params.id, req.user.operatorId);
    const config = await accountsDb.upsertAgentConfig(req.params.id, req.user.operatorId, req.body);

    // Tell the service to reload the (possibly changed) config
    try {
      await axios.post(
        `${DISCORD_SERVICE_URL}/api/internal/reload-config`,
        { accountId: req.params.id },
        { headers: DISCORD_SERVICE_HEADERS, timeout: 5000 },
      );
    } catch (e) {
      logger.warn({ accountId: req.params.id, error: e.message }, 'Config reload notify failed (continuing)');
    }

    res.json({ success: true, config });
  } catch (error) {
    handleError(res, error, 'update config');
  }
});

// ==================== CONVERSATIONS ====================

router.get('/accounts/:id/conversations', async (req, res) => {
  try {
    const conversations = await conversationsDb.getConversations(req.params.id, req.user.operatorId);
    res.json({ success: true, conversations });
  } catch (error) {
    handleError(res, error, 'list conversations');
  }
});

/**
 * GET /conversations?accountId=xxx
 * List conversations for an account with pagination, channelType filter,
 * message count, and writing-signature availability.
 *
 * Query params:
 *   accountId  (required) — which Discord account
 *   limit      (default 50, max 200)
 *   offset     (default 0)
 *   channelType (optional) — "DM" or "GUILD_TEXT"
 */
router.get('/conversations', async (req, res) => {
  try {
    const { accountId, limit, offset, channelType } = req.query;
    if (!accountId) {
      return res.status(400).json({ error: 'accountId query parameter is required' });
    }
    if (channelType && !['DM', 'GUILD_TEXT'].includes(channelType)) {
      return res.status(400).json({ error: 'channelType must be DM or GUILD_TEXT' });
    }

    const conversations = await conversationsDb.getConversationsForAccount(
      accountId,
      req.user.operatorId,
      {
        limit: parseInt(limit) || 50,
        offset: parseInt(offset) || 0,
        channelType: channelType || undefined,
      },
    );
    res.json({ success: true, conversations });
  } catch (error) {
    handleError(res, error, 'list conversations');
  }
});

/**
 * GET /conversations/:id
 * Single conversation with full details: messages, total message count,
 * and the cached writing signature.
 */
router.get('/conversations/:id', async (req, res) => {
  try {
    const conversation = await conversationsDb.getConversationByIdFull(req.params.id, req.user.operatorId);
    res.json({ success: true, conversation });
  } catch (error) {
    handleError(res, error, 'get conversation');
  }
});

router.put('/conversations/:id/bot-active', async (req, res) => {
  try {
    const conversation = await conversationsDb.setBotActive(
      req.params.id, req.user.operatorId, !!req.body.isBotActive,
    );
    res.json({ success: true, conversation });
  } catch (error) {
    handleError(res, error, 'toggle bot active');
  }
});

/**
 * POST /conversations/:id/takeover
 * Activate or deactivate takeover mode on a conversation.
 * When takeover is active, AI auto-replies are paused and the operator
 * can send messages manually.
 *
 * Body: { active: boolean }
 * Returns: { success: true, conversation: { id, takeoverActive } }
 */
router.post('/conversations/:id/takeover', async (req, res) => {
  try {
    const { active } = req.body;
    if (typeof active !== 'boolean') {
      return res.status(400).json({ error: 'active (boolean) is required' });
    }
    const conversation = await conversationsDb.setTakeover(
      req.params.id, req.user.operatorId, active,
    );
    res.json({ success: true, conversation });
  } catch (error) {
    handleError(res, error, 'toggle takeover');
  }
});

/**
 * POST /conversations/:id/send-message
 * Send a manual message during takeover mode.
 *
 * Body: { body: string }
 * Returns: { success: true, message: { id, timestamp } }
 */
router.post('/conversations/:id/send-message', async (req, res) => {
  try {
    const { body } = req.body;
    if (!body || !body.trim()) {
      return res.status(400).json({ error: 'body is required' });
    }

    // Verify the conversation belongs to this operator and load account info
    const conversation = await conversationsDb.getConversationById(
      req.params.id, req.user.operatorId,
    );

    // Proxy to discord-service to actually send the message
    const discordResp = await axios.post(
      `${DISCORD_SERVICE_URL}/api/internal/send-message`,
      {
        accountId: conversation.accountId,
        channelId: conversation.channelId,
        body: body.trim(),
        conversationId: conversation.id,
      },
      { headers: DISCORD_SERVICE_HEADERS, timeout: 30000 },
    );

    res.json({ success: true, ...discordResp.data });
  } catch (error) {
    handleError(res, error, 'send message');
  }
});

router.get('/conversations/:id/messages', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const { before } = req.query;
    const result = await conversationsDb.getMessages(req.params.id, req.user.operatorId, {
      limit,
      before,
    });
    res.json({ success: true, ...result });
  } catch (error) {
    handleError(res, error, 'get messages');
  }
});

/**
 * GET /conversations/:id/signature
 * Return the cached writing-style analysis for a Discord conversation.
 * Frontend can use this to show the AI's understanding of the contact's tone.
 */
router.get('/conversations/:id/signature', async (req, res) => {
  try {
    // Verify ownership through the account relation
    const conversation = await conversationsDb.getConversationById(req.params.id, req.user.operatorId);
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
    handleError(res, error, 'get signature');
  }
});

/**
 * POST /conversations/:id/analyze
 * Analyze the writing signature of the contact in a Discord conversation.
 *
 * Fetches recent messages from the discordMessage table, extracts message bodies,
 * calls the AI handler's /api/chat/analyze-signature endpoint for heuristic
 * style analysis, then caches the result on the conversation record.
 *
 * Body: none required (uses all available messages from the conversation).
 * Returns: { success: true, signature: {...}, messageCount: N }
 */
router.post('/conversations/:id/analyze', async (req, res) => {
  try {
    // 1. Verify ownership — getConversationById throws 404 if not authorized
    const conversation = await conversationsDb.getConversationById(
      req.params.id, req.user.operatorId,
    );

    // 2. Fetch messages from the OTHER person (fromMe: false)
    const messages = await prisma.discordMessage.findMany({
      where: { conversationId: conversation.id, fromMe: false },
      orderBy: { timestamp: 'asc' },
      take: 200,
      select: { body: true },
    });

    // 3. Extract non-null, non-empty message bodies
    const messageBodies = messages
      .map((m) => m.body)
      .filter((b) => b && b.trim());

    if (!messageBodies.length) {
      return res.status(400).json({
        success: false,
        error: 'No messages available for analysis in this conversation',
      });
    }

    // 4. Call AI handler for heuristic analysis (no LLM cost)
    let data;
    try {
      const response = await axios.post(
        `${AI_HANDLER_URL}/api/chat/analyze-signature`,
        { messages: messageBodies },
        { timeout: 15000 },
      );
      data = response.data;
    } catch (axiosError) {
      // Distinguish connection failure from upstream HTTP error
      if (!axiosError.response) {
        const err = new Error('AI handler unavailable');
        err.status = 502;
        throw err;
      }
      const err = new Error(
        axiosError.response.data?.detail || 'AI handler returned an error',
      );
      err.status = 502;
      throw err;
    }

    const signature = data.signature;
    const messageCount = data.message_count ?? messageBodies.length;

    // 5. Cache the signature on the conversation
    await prisma.discordConversation.update({
      where: { id: conversation.id },
      data: {
        writingSignature: signature,
        signatureUpdatedAt: new Date(),
      },
    });

    logger.info(
      { conversationId: req.params.id, messageCount },
      'Conversation writing signature analyzed',
    );

    // 6. Return
    res.json({
      success: true,
      signature,
      messageCount,
    });
  } catch (error) {
    handleError(res, error, 'analyze conversation signature');
  }
});

/**
 * POST /accounts/:id/self-analysis
 * Analyze the account owner's OWN writing style from all messages they sent
 * across every conversation. Calls the AI handler's /api/chat/analyze-signature
 * on fromMe:true messages, then caches the result on the DiscordAccount.
 *
 * This self-signature is used to make AI-generated replies sound like the
 * account owner, not like the person who DMed them.
 *
 * Body: none.
 * Returns: { success: true, signature: {...}, messageCount: N }
 */
router.post('/accounts/:id/self-analysis', async (req, res) => {
  try {
    // 1. Verify account exists and belongs to this operator
    await accountsDb.getAccountById(req.params.id, req.user.operatorId);

    // 2. Fetch all messages written BY the user (fromMe: true) across all conversations
    const messages = await prisma.discordMessage.findMany({
      where: {
        fromMe: true,
        conversation: { accountId: req.params.id },
      },
      orderBy: { timestamp: 'asc' },
      take: 500,
      select: { body: true },
    });

    // 3. Extract non-null, non-empty message bodies
    const messageBodies = messages
      .map((m) => m.body)
      .filter((b) => b && b.trim());

    // 4. Call AI handler for heuristic analysis (no LLM cost)
    const { data } = await axios.post(
      `${AI_HANDLER_URL}/api/chat/analyze-signature`,
      { messages: messageBodies },
      { timeout: 15000 },
    );

    const signature = data.signature;

    // 5. Cache the self-signature on the DiscordAccount
    await prisma.discordAccount.update({
      where: { id: req.params.id },
      data: {
        selfSignature: signature,
        selfSignatureUpdatedAt: new Date(),
      },
    });

    logger.info(
      { accountId: req.params.id, messageCount: data.message_count },
      'Account self-signature analyzed',
    );

    // 6. Return
    res.json({
      success: true,
      signature,
      messageCount: data.message_count,
    });
  } catch (error) {
    handleError(res, error, 'self-analysis');
  }
});

/**
 * GET /accounts/:id/self-signature
 * Return the cached self-signature analysis for a Discord account.
 * This is the account OWNER's writing style, used to make AI replies
 * sound like the operator (not the contact).
 *
 * Returns: { success: true, hasSignature: bool, signature: {...}|null, updatedAt: string|null }
 */
router.get('/accounts/:id/self-signature', async (req, res) => {
  try {
    // Verify account exists and belongs to this operator (throws 404 otherwise)
    await accountsDb.getAccountById(req.params.id, req.user.operatorId);

    const result = await accountsDb.getSelfSignature(req.params.id);

    res.json({
      success: true,
      hasSignature: result?.signature != null,
      signature: result?.signature ?? null,
      updatedAt: result?.updatedAt?.toISOString?.() ?? null,
    });
  } catch (error) {
    handleError(res, error, 'get self-signature');
  }
});

// ==================== PERSONAS ====================

/**
 * GET /personas
 * List all personas for the operator. Includes a count of how many
 * Discord accounts are currently using each persona.
 */
router.get('/personas', async (req, res) => {
  try {
    const personas = await personasDb.getPersonas(req.user.operatorId);
    res.json({ success: true, personas });
  } catch (error) {
    handleError(res, error, 'list personas');
  }
});

/**
 * POST /personas
 * Create a new persona (roleplay character). The systemPrompt is the
 * full character definition — no content restrictions.
 *
 * Body: { name, description?, systemPrompt, avatarUrl? }
 */
router.post('/personas', async (req, res) => {
  try {
    const persona = await personasDb.createPersona(req.user.operatorId, req.body);
    res.status(201).json({ success: true, persona });
  } catch (error) {
    handleError(res, error, 'create persona');
  }
});

/**
 * PUT /personas/:id
 * Update an existing persona. All fields optional — only provided
 * fields are changed.
 *
 * Body: { name?, description?, systemPrompt?, avatarUrl?, isActive? }
 */
router.put('/personas/:id', async (req, res) => {
  try {
    const persona = await personasDb.updatePersona(
      req.params.id, req.user.operatorId, req.body,
    );
    res.json({ success: true, persona });
  } catch (error) {
    handleError(res, error, 'update persona');
  }
});

/**
 * DELETE /personas/:id
 * Delete a persona. Automatically unlinks it from any Discord account
 * currently assigned to it.
 */
router.delete('/personas/:id', async (req, res) => {
  try {
    const result = await personasDb.deletePersona(req.params.id, req.user.operatorId);
    res.json({ success: true, ...result });
  } catch (error) {
    handleError(res, error, 'delete persona');
  }
});

/**
 * PUT /accounts/:id/persona
 * Assign a persona to a Discord account. The AI will reply as this
 * character in all conversations for this account.
 *
 * Body: { personaId: string | null } — pass null to unlink.
 */
router.put('/accounts/:id/persona', async (req, res) => {
  try {
    const result = await personasDb.setActivePersona(
      req.params.id, req.body.personaId, req.user.operatorId,
    );

    // Notify the discord-service to reload config (persona changed)
    try {
      await axios.post(
        `${DISCORD_SERVICE_URL}/api/internal/reload-config`,
        { accountId: req.params.id },
        { headers: DISCORD_SERVICE_HEADERS, timeout: 5000 },
      );
    } catch (e) {
      logger.warn({ accountId: req.params.id, error: e.message }, 'Config reload notify failed (continuing)');
    }

    res.json({ success: true, ...result });
  } catch (error) {
    handleError(res, error, 'set account persona');
  }
});

/**
 * GET /accounts/:id/persona
 * Get the active persona (if any) for a Discord account.
 * Returns the full persona including systemPrompt so the operator
 * can review what character the AI is configured as.
 */
router.get('/accounts/:id/persona', async (req, res) => {
  try {
    const result = await personasDb.getActivePersona(
      req.params.id, req.user.operatorId,
    );
    res.json({ success: true, ...result });
  } catch (error) {
    handleError(res, error, 'get account persona');
  }
});

// ==================== ENGAGEMENT ====================

router.get('/accounts/:id/targets', async (req, res) => {
  try {
    const targets = await engagementDb.getTargets(req.user.operatorId, {
      accountId: req.params.id,
      status: req.query.status,
    });
    res.json({ success: true, targets });
  } catch (error) {
    handleError(res, error, 'list targets');
  }
});

router.get('/queue', async (req, res) => {
  try {
    const items = await engagementDb.getQueueItems(req.user.operatorId, {
      status: req.query.status || 'PENDING',
      accountId: req.query.accountId,
      limit: parseInt(req.query.limit) || 50,
    });
    res.json({ success: true, items });
  } catch (error) {
    handleError(res, error, 'list queue');
  }
});

/** Approve / edit / reject a proposed engagement message. */
router.post('/queue/:id/review', async (req, res) => {
  try {
    const { action, proposedMessage, rejectionReason } = req.body;
    const statusMap = { approve: 'APPROVED', reject: 'REJECTED' };
    const status = statusMap[action];
    if (!status) return res.status(400).json({ error: "action must be 'approve' or 'reject'" });

    const item = await engagementDb.reviewQueueItem(req.params.id, req.user.operatorId, {
      status,
      reviewedBy: req.user.id ? Number(req.user.id) : null,
      proposedMessage,
      rejectionReason,
    });
    res.json({ success: true, item });
  } catch (error) {
    handleError(res, error, 'review queue item');
  }
});

module.exports = router;
