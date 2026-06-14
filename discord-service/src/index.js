/**
 * Discord Service — self-bot microservice for AFILIATORS.
 *
 * Reactive pipeline: Discord message (in-scope) -> buffer -> AI (DeepSeek)
 * -> reply -> store in backend. Scope = all DMs + server mention/reply only.
 *
 * Engagement (proactive) mode is added in a later phase.
 */

import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import { logger } from './utils/logger.js';
import { calculateHumanDelay, calculateTypingIndicatorDuration } from './utils/delays.js';
import { detectBurst, formatIncomingForAI, splitReplyIntoMessages, calculateInterMessageDelay } from './utils/burst.js';
import { validateEnv, config } from './config/env.js';
import { DiscordManager } from './discord/manager.js';
import { backendClient } from './api/backend-client.js';
import { aiHandlerClient } from './api/ai-handler-client.js';
import { startEngagement } from './engagement/scheduler.js';

try {
  validateEnv();
} catch (err) {
  logger.error({ error: err.message }, 'Environment validation failed');
  process.exit(1);
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));

const manager = new DiscordManager();
let stopEngagement = () => {};

// ==================== AUTH (service-to-service) ====================

const authenticateBackend = (req, res, next) => {
  const apiKey = req.headers['authorization']?.replace('Bearer ', '');
  const valid = process.env.BACKEND_API_KEY;
  if (!valid) return next();
  if (apiKey === valid) return next();
  return res.status(401).json({ error: 'Unauthorized' });
};

// ==================== IN-MEMORY CONTEXT + BUFFER ====================

const MESSAGE_BUFFER_MS = config.messageBufferMs;
// `${accountId}:${channelId}` -> { messages:[], timer, meta }
const messageBuffer = new Map();
// `${accountId}:${channelId}` -> [{ role, content }]  (short rolling context)
const contextStore = new Map();
const CONTEXT_LIMIT = 10;

function pushContext(key, role, content) {
  const arr = contextStore.get(key) || [];
  const truncated = typeof content === 'string' && content.length > 500
    ? content.slice(0, 500) + '…'
    : content;
  arr.push({ role, content: truncated });
  while (arr.length > CONTEXT_LIMIT) arr.shift();
  contextStore.set(key, arr);
}

// ==================== MESSAGE PIPELINE ====================

manager.setMessageHandler(async (accountId, entry, message, decision) => {
  const channelId = message.channel.id;
  const bufferKey = `${accountId}:${channelId}`;

  const meta = {
    operatorId: entry.operatorId,
    channelType: decision.channelType,
    guildId: message.guild?.id || null,
    guildName: message.guild?.name || null,
    contactDiscordId: message.author.id,
    contactName: message.author.globalName || message.author.username,
    channel: message.channel,
    sock: entry.client,
  };

  const text = message.content || '[no text]';

  const existing = messageBuffer.get(bufferKey);
  if (existing) {
    if (existing.timer) clearTimeout(existing.timer);
    existing.messages.push({ content: text, timestamp: Date.now() });
    existing.meta = meta;
  } else {
    messageBuffer.set(bufferKey, { messages: [{ content: text, timestamp: Date.now() }], timer: null, meta });
  }

  const buf = messageBuffer.get(bufferKey);
  buf.timer = setTimeout(() => flushBuffer(accountId, channelId), MESSAGE_BUFFER_MS);
  logger.debug({ accountId, channelId, buffered: buf.messages.length }, 'Discord message buffered');
});

// ==================== WRITING SIGNATURE ====================

function shouldAnalyzeSignature(conversation, writingSignature, signatureUpdatedAt) {
  if (!conversation?.id) return false;

  // No signature cached → needs analysis
  if (!writingSignature) return true;

  // Check signature age (> 6 hours)
  const sixHoursAgo = Date.now() - 6 * 60 * 60 * 1000;
  const lastUpdate = signatureUpdatedAt
    ? new Date(signatureUpdatedAt).getTime()
    : 0;
  if (lastUpdate < sixHoursAgo) return true;

  // Compare message counts using the signature's own messageCount field
  const currentCount = conversation.messageCount ?? 0;
  const lastCount = writingSignature.messageCount ?? 0;
  if (currentCount - lastCount > 50) return true;

  return false;
}

async function analyzeAndCacheSignature(accountId, conversation) {
  try {
    const { messages } = await backendClient.getMessages(conversation.id, 50);
    if (!messages?.length) return;
    const result = await aiHandlerClient.analyzeSignature(messages, {
      session_id: `discord_${accountId}`,
    });
    if (result?.signature) {
      await backendClient.saveSignature(conversation.id, result.signature, conversation.messageCount ?? messages.length);
      logger.info({ conversationId: conversation.id }, 'Writing signature cached');
    }
  } catch (e) {
    logger.warn({ error: e.message, conversationId: conversation.id }, 'Signature analysis skipped');
  }
}

async function flushBuffer(accountId, channelId) {
  const bufferKey = `${accountId}:${channelId}`;
  const entry = messageBuffer.get(bufferKey);
  if (!entry) return;
  if (entry.timer) clearTimeout(entry.timer);

  const account = manager.getAccount(accountId);
  if (!account) { messageBuffer.delete(bufferKey); return; }

  const { meta } = entry;
  const messages = entry.messages; // array of {content, timestamp}
  const burstInfo = detectBurst(messages);
  const combined = formatIncomingForAI(messages, burstInfo);
  entry.burstInfo = burstInfo;

  logger.debug({ accountId, channelId, burst: burstInfo }, 'Message burst detected');

  const config = account.config || {};
  const behavior = config.agentConfig || null;
  const systemPrompt = behavior?.systemPrompt || null;

  // Fetch active persona for this account
  let personaPrompt = null;
  try {
    const personaResult = await backendClient.getActivePersona(accountId);
    if (personaResult?.persona?.systemPrompt) {
      personaPrompt = personaResult.persona.systemPrompt;
      logger.debug({ accountId, personaName: personaResult.persona.name }, 'Active persona loaded');
    }
  } catch (e) {
    logger.debug({ error: e.message, accountId }, 'Could not fetch active persona (ok)');
  }

  // Persona prompt goes FIRST — it defines who the AI IS
  const effectiveSystemPrompt = personaPrompt
    ? personaPrompt + (systemPrompt ? '\n\n' + systemPrompt : '')
    : systemPrompt;

  // Persist inbound conversation + message
  let conversation = null;
  try {
    const convResp = await backendClient.upsertConversation({
      accountId,
      channelId,
      guildId: meta.guildId,
      channelType: meta.channelType,
      contactDiscordId: meta.contactDiscordId,
      contactName: meta.contactName,
      lastMessage: combined,
      lastMessageTime: new Date(),
      source: 'REACTIVE',
    });
    conversation = convResp.conversation;
    if (conversation?.id) {
      await backendClient.storeMessage({
        conversationId: conversation.id,
        fromMe: false,
        body: combined,
        messageType: 'TEXT',
        timestamp: new Date(),
      }).catch((e) => logger.warn({ error: e.message }, 'storeMessage(inbound) failed'));
    }
  } catch (e) {
    logger.error({ error: e.message, accountId }, 'Failed to persist inbound Discord message');
  }

  pushContext(bufferKey, 'user', combined);

  // Fetch cached writing signature for this conversation
  let writingSignature = null;
  let signatureUpdatedAt = null;
  if (conversation?.id) {
    try {
      const sigResp = await backendClient.getSignature(conversation.id);
      writingSignature = sigResp?.conversation?.writingSignature || null;
      signatureUpdatedAt = sigResp?.conversation?.signatureUpdatedAt || null;
    } catch (e) {
      logger.debug({ error: e.message, conversationId: conversation.id }, 'No signature cached (ok)');
    }
  }

  // Fetch self-signature so the AI writes as the USER
  let selfSignature = null;
  try {
    const selfSig = await backendClient.getSelfSignature(accountId);
    if (selfSig?.signature) {
      selfSignature = selfSig.signature;
    }
  } catch (e) {
    logger.debug({ error: e.message, accountId }, 'No self-signature cached (ok)');
  }

  // Check takeover status — skip AI if operator has taken manual control
  if (conversation?.id) {
    try {
      const takeover = await backendClient.getTakeoverStatus(conversation.id);
      if (takeover?.takeoverActive) {
        messageBuffer.delete(bufferKey);
        logger.info({ accountId, channelId }, 'Takeover active — skipping AI reply');
        return;
      }
    } catch (e) {
      logger.debug({ error: e.message, accountId }, 'Could not check takeover status (proceeding with AI)');
    }
  }

  // Generate AI reply
  let aiResult;
  try {
    aiResult = await aiHandlerClient.processMessage(combined, {
      session_id: `discord_${accountId}`,
      chat_jid: channelId,
      contact_name: meta.contactName,
      system_prompt: effectiveSystemPrompt,
      behavior,
      knowledge_base: account.knowledgeBase || [],
      context: (contextStore.get(bufferKey) || []).slice(0, -1).slice(-20),
      temperature: config.temperature ?? 0.7,
      max_tokens: config.maxTokens || 800,
      writing_signature: writingSignature,
      self_signature: selfSignature,
    });
  } catch (e) {
    messageBuffer.delete(bufferKey);
    logger.warn({ error: e.message, accountId, channelId }, 'AI processing failed (Discord)');
    return;
  }

  const reply = aiResult?.response;
  if (aiResult?.orchestrator) {
    logger.info({
      accountId,
      stage: aiResult.orchestrator.pipeline_stage,
      alerts: aiResult.orchestrator.alerts?.length || 0,
    }, 'Orchestrator pipeline updated (Discord)');
  }
  if (!reply) {
    messageBuffer.delete(bufferKey);
    return;
  }

  // Buffer consumed — delete now that AI successfully produced a reply.
  messageBuffer.delete(bufferKey);

  // Send reply with human-like typing delay
  try {
    const timing = calculateHumanDelay(combined, reply);

    // Start typing indicator (shows during read+think+typing)
    if (meta.channel?.sendTyping) {
      meta.channel.sendTyping().catch((e) => logger.warn({ error: e.message }, 'sendTyping failed'));
      // Discord typing lasts ~10s max, refresh if needed
      if (timing.typingDurationMs > 8000) {
        setTimeout(() => meta.channel?.sendTyping().catch(() => {}), 7000);
      }
    }

    // Wait the full human delay (read + think) BEFORE showing typing
    // Actually: show typing during think+type, wait read delay first
    await new Promise(r => setTimeout(r, timing.breakdown.read));
    // Typing indicator already shown above
    await new Promise(r => setTimeout(r, timing.breakdown.think + timing.breakdown.typing));
    await new Promise(r => setTimeout(r, timing.breakdown.send));

    const shouldBurst = burstInfo?.burst;
    const replyChunks = shouldBurst
      ? splitReplyIntoMessages(reply, null) // null partner sig for now
      : [reply];

    for (let i = 0; i < replyChunks.length; i++) {
      if (i > 0) {
        const interDelay = calculateInterMessageDelay(i, replyChunks.length);
        await new Promise(r => setTimeout(r, interDelay));
      }
      await meta.channel.send(replyChunks[i]);
    }

    logger.debug({ accountId, channelId, delay: timing.totalDelayMs, breakdown: timing.breakdown }, 'Human delay applied');

    pushContext(bufferKey, 'assistant', reply);
    logger.info({ accountId, channelId, len: reply.length }, 'Discord AI reply sent');

    const estimatedInput = (combined.length / 4) + (JSON.stringify(account.knowledgeBase).length / 4);
    logger.debug({ accountId, estimatedInputTokens: Math.round(estimatedInput) }, 'Token estimate');

    if (conversation?.id) {
      await backendClient.storeMessage({
        conversationId: conversation.id,
        fromMe: true,
        body: reply,
        messageType: 'TEXT',
        timestamp: new Date(),
        aiProcessed: true,
      }).catch((e) => logger.warn({ error: e.message }, 'storeMessage(outbound) failed'));

      // Refresh writing signature if stale
      if (shouldAnalyzeSignature(conversation, writingSignature, signatureUpdatedAt)) {
        analyzeAndCacheSignature(accountId, conversation).catch(() => {});
      }
    }
  } catch (e) {
    logger.error({ error: e.message, accountId, channelId }, 'Failed to send Discord reply');
  }
}

// ==================== INTERNAL ROUTES (backend -> service) ====================

app.post('/api/internal/connect', authenticateBackend, async (req, res) => {
  try {
    const { accountId, operatorId } = req.body;
    if (!accountId) return res.status(400).json({ error: 'accountId required' });
    await manager.connect(accountId, operatorId);
    res.json({ success: true, status: 'CONNECTING' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/internal/disconnect', authenticateBackend, async (req, res) => {
  try {
    const { accountId } = req.body;
    if (!accountId) return res.status(400).json({ error: 'accountId required' });
    await manager.disconnect(accountId);
    res.json({ success: true, status: 'DISCONNECTED' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/internal/send-message', authenticateBackend, async (req, res) => {
  try {
    const { accountId, channelId, body, conversationId } = req.body;
    if (!accountId || !channelId || !body) {
      return res.status(400).json({ error: 'accountId, channelId, and body are required' });
    }
    const account = manager.getAccount(accountId);
    if (!account) return res.status(404).json({ error: 'Account not found or not connected' });
    if (!account.client?.user) return res.status(503).json({ error: 'Account not connected to Discord' });

    // Resolve the channel from the Discord client cache or fetch
    let channel = account.client.channels?.cache?.get(channelId);
    if (!channel) {
      try {
        channel = await account.client.channels?.fetch(channelId);
      } catch (_e) {
        return res.status(404).json({ error: 'Channel not found or not accessible' });
      }
    }
    if (!channel) {
      return res.status(404).json({ error: 'Channel not found' });
    }
    await channel.send(body);
    logger.info({ accountId, channelId, len: body.length }, 'Manual message sent');

    // Store the outbound message if conversationId is provided
    if (conversationId) {
      try {
        await backendClient.storeMessage({
          conversationId,
          fromMe: true,
          body,
          messageType: 'TEXT',
          timestamp: new Date(),
          aiProcessed: false, // manual message, not AI
        });
      } catch (e) {
        logger.warn({ error: e.message }, 'storeMessage(manual-outbound) failed');
      }
    }

    res.json({ success: true, timestamp: new Date().toISOString() });
  } catch (err) {
    logger.error({ error: err.message }, 'send-message failed');
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/internal/reload-config', authenticateBackend, async (req, res) => {
  try {
    const { accountId } = req.body;
    manager.invalidateConfig(accountId);
    await manager.refreshConfig(accountId, true).catch((e) => logger.warn({ error: e.message, accountId }, 'refreshConfig failed'));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== HEALTH ====================

app.get('/health', async (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    connectedAccounts: [...manager.accounts.keys()].filter((id) => manager.isConnected(id)).length,
    dependencies: {
      backend: (await backendClient.healthCheck()) ? 'healthy' : 'degraded',
      aiHandler: (await aiHandlerClient.healthCheck()) ? 'healthy' : 'degraded',
    },
  });
});

app.get('/', (req, res) => {
  res.json({ name: 'Discord Service (AFILIATORS)', version: '1.0.0', port: config.port });
});

// ==================== STARTUP ====================

async function start() {
  app.listen(config.port, () => {
    logger.info(`Discord Service listening on :${config.port}`);
    // Start proactive engagement loops (discovery/joiner/engagement/sender).
    // Each loop iterates manager.accounts and skips accounts that aren't
    // connected or aren't engagementEnabled. Heavily throttled + approval-gated.
    try {
      stopEngagement = startEngagement(manager);
    } catch (e) {
      logger.error({ error: e.message }, 'Failed to start engagement subsystem (continuing)');
    }
  });

  // Auto-reconnect previously-enabled accounts
  try {
    const { accounts = [] } = await backendClient.listAccounts();
    for (const acc of accounts) {
      if (acc.enabled && acc.status === 'DISCONNECTED') {
        logger.info({ accountId: acc.id }, 'Auto-connecting enabled account on startup');
        manager.connect(acc.id, acc.operatorId).catch((e) =>
          logger.error({ accountId: acc.id, error: e.message }, 'Auto-connect failed'));
      }
    }
  } catch (e) {
    logger.warn({ error: e.message }, 'Could not load accounts on startup (backend not ready?)');
  }
}

process.on('SIGINT', async () => { stopEngagement(); await manager.disconnectAll(); process.exit(0); });
process.on('SIGTERM', async () => { stopEngagement(); await manager.disconnectAll(); process.exit(0); });
process.on('unhandledRejection', (reason) => {
  logger.error({ reason: reason?.message || reason }, 'Unhandled rejection - continuing');
});

start();
