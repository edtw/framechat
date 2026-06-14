/**
 * DiscordManager — manages self-bot (user token) connections per account.
 *
 * One discord.js-selfbot-v13 Client per DiscordAccount. Handles connect/
 * disconnect, status reporting, config caching, and the scope filter that
 * decides whether an incoming message should be handled by the AI.
 *
 * Business logic (AI pipeline) lives in index.js via setMessageHandler().
 */

import { Client } from 'discord.js-selfbot-v13';
import { logger } from '../utils/logger.js';
import { backendClient } from '../api/backend-client.js';
import { aiHandlerClient } from '../api/ai-handler-client.js';

export class DiscordManager {
  constructor() {
    // accountId -> { client, operatorId, config, knowledgeBase, identity }
    this.accounts = new Map();
    this.messageHandler = null;
    this.configTTL = parseInt(process.env.AI_PROFILE_TTL_MIN || '5', 10) * 60 * 1000;
  }

  setMessageHandler(fn) {
    this.messageHandler = fn;
  }

  isConnected(accountId) {
    const a = this.accounts.get(accountId);
    return !!(a && a.client && a.client.user);
  }

  getAccount(accountId) {
    return this.accounts.get(accountId);
  }

  /**
   * Connect (or reconnect) an account using its stored token.
   */
  async connect(accountId, operatorId = null) {
    if (this.accounts.has(accountId)) {
      logger.warn({ accountId }, 'Account already connected — skipping');
      return this.accounts.get(accountId);
    }

    logger.info({ accountId }, 'Connecting Discord account');
    await backendClient.updateStatus(accountId, 'CONNECTING').catch((e) => logger.warn({ accountId, error: e.message }, 'Failed to update status'));

    let token;
    try {
      const creds = await backendClient.getCredentials(accountId);
      token = creds.token;
      if (!token) throw new Error('No token returned for account');
    } catch (err) {
      logger.error({ accountId, error: err.message }, 'Failed to load credentials');
      await backendClient.updateStatus(accountId, 'ERROR', { lastError: err.message }).catch((e) => logger.warn({ accountId, error: e.message }, 'Failed to update status'));
      throw err;
    }

    const client = new Client({ checkUpdate: false });
    const entry = { client, operatorId, config: null, knowledgeBase: [], identity: null, configFetchedAt: 0 };
    this.accounts.set(accountId, entry);

    client.on('ready', async () => {
      entry.identity = {
        id: client.user.id,
        username: client.user.username,
        tag: client.user.tag,
        avatarUrl: client.user.displayAvatarURL?.() || null,
      };
      logger.info({ accountId, tag: entry.identity.tag }, 'Discord account connected');
      await backendClient.updateStatus(accountId, 'CONNECTED', {
        discordUserId: entry.identity.id,
        username: entry.identity.tag,
        avatarUrl: entry.identity.avatarUrl,
        lastError: null,
      }).catch((e) => logger.warn({ accountId, error: e.message }, 'Failed to update status'));
      await this.refreshConfig(accountId, true).catch((e) => logger.warn({ accountId, error: e.message }, 'Failed initial config refresh'));

      // Trigger initial self-signature analysis so the AI writes as the USER
      this._analyzeSelfSignature(accountId, client).catch((e) =>
        logger.warn({ accountId, error: e.message }, 'Self-signature analysis skipped'));
    });

    client.on('messageCreate', async (message) => {
      try {
        if (!this.messageHandler) return;
        if (message.author?.id === client.user?.id) return; // ignore own messages
        if (message.author?.bot) return; // ignore bots

        const decision = await this.shouldHandle(accountId, message);
        if (!decision.handle) return;

        await this.messageHandler(accountId, entry, message, decision);
      } catch (err) {
        logger.error({ accountId, error: err.message }, 'Error in messageCreate handler');
      }
    });

    client.on('error', (err) => {
      logger.error({ accountId, error: err.message }, 'Discord client error');
    });

    // Login asynchronously so the caller gets CONNECTING immediately; the
    // 'ready' handler reports CONNECTED, and login failures set ERROR status.
    client.login(token).catch(async (err) => {
      logger.error({ accountId, error: err.message }, 'Discord login failed');
      this.accounts.delete(accountId);
      await backendClient.updateStatus(accountId, 'ERROR', { lastError: err.message }).catch((e) => logger.warn({ accountId, error: e.message }, 'Failed to update status'));
    });

    return entry;
  }

  async disconnect(accountId) {
    const entry = this.accounts.get(accountId);
    if (!entry) return false;
    try {
      await entry.client.destroy();
    } catch (err) {
      logger.warn({ accountId, error: err.message }, 'Error destroying client');
    }
    this.accounts.delete(accountId);
    await backendClient.updateStatus(accountId, 'DISCONNECTED').catch((e) => logger.warn({ accountId, error: e.message }, 'Failed to update status'));
    logger.info({ accountId }, 'Discord account disconnected');
    return true;
  }

  async disconnectAll() {
    const ids = [...this.accounts.keys()];
    await Promise.allSettled(ids.map((id) => this.disconnect(id)));
  }

  /**
   * Load + cache the account's AI config + knowledge base.
   */
  async refreshConfig(accountId, force = false) {
    const entry = this.accounts.get(accountId);
    if (!entry) return null;
    if (!force && entry.config && Date.now() - entry.configFetchedAt < this.configTTL) {
      return entry.config;
    }
    const payload = await backendClient.getAiConfig(accountId);
    entry.config = payload.ai_config || { enabled: false };
    entry.knowledgeBase = payload.knowledgeBase || [];
    entry.configFetchedAt = Date.now();
    return entry.config;
  }

  invalidateConfig(accountId) {
    const entry = this.accounts.get(accountId);
    if (entry) entry.configFetchedAt = 0;
  }

  /**
   * Analyze the account owner's own writing style from recent Discord messages
   * and cache it as a self-signature so the AI can write as the USER.
   * Runs on initial connection and is re-triggered when the signature is >24h old.
   */
  async _analyzeSelfSignature(accountId, client) {
    // Check if analysis is needed (>24h old or missing)
    try {
      const existing = await backendClient.getSelfSignature(accountId);
      if (existing?.signature && existing?.updatedAt) {
        const ageHours = (Date.now() - new Date(existing.updatedAt).getTime()) / (60 * 60 * 1000);
        if (ageHours < 24) {
          logger.debug({ accountId, ageHours: Math.round(ageHours) }, 'Self-signature still fresh');
          return;
        }
      }
    } catch (e) {
      logger.debug({ accountId, error: e.message }, 'No existing self-signature, will analyze');
    }

    // Collect the user's own recent messages from DM channels
    const ownMessages = [];
    const dmChannels = client.channels.cache
      .filter((c) => c.type === 'DM')
      .first(10);

    if (!dmChannels?.length) {
      logger.debug({ accountId }, 'No DM channels cached yet, deferring self-analysis');
      return;
    }

    for (const channel of dmChannels) {
      try {
        const fetched = await channel.messages.fetch({ limit: 20 });
        for (const msg of fetched.values()) {
          if (msg.author?.id === client.user?.id && msg.content?.trim()) {
            ownMessages.push(msg.content);
          }
        }
      } catch (e) {
        // Some channels may not be fetchable — skip
      }
      if (ownMessages.length >= 50) break;
    }

    if (ownMessages.length < 5) {
      logger.debug({ accountId, count: ownMessages.length }, 'Not enough own messages for self-analysis');
      return;
    }

    // Analyze and cache
    const result = await aiHandlerClient.analyzeSignature(ownMessages, {
      session_id: `discord_self_${accountId}`,
    });

    if (result?.signature) {
      await backendClient.saveSelfSignature(accountId, result.signature);
      logger.info({ accountId, messageCount: ownMessages.length }, 'Self-signature analyzed and cached');
    }
  }

  /**
   * Scope filter — locked decisions: all DMs + server mention/reply only.
   * Returns { handle, channelType, isMention }.
   */
  async shouldHandle(accountId, message) {
    const entry = this.accounts.get(accountId);
    if (!entry) return { handle: false };

    const config = await this.refreshConfig(accountId).catch((e) => { logger.warn({ accountId, error: e.message }, 'Failed to refresh config'); return entry.config; });
    if (!config || config.enabled === false) return { handle: false };

    const isDM = message.channel?.type === 'DM';
    if (isDM) {
      return { handle: config.replyToDms !== false, channelType: 'DM', isMention: false };
    }

    // Guild text channel: only when mentioned or replied to
    if (config.replyToMentions === false) return { handle: false };

    const client = entry.client;
    const mentionedMe = message.mentions?.users?.has?.(client.user.id)
      || message.mentions?.has?.(client.user);
    const repliedToMe = message.mentions?.repliedUser?.id === client.user.id;

    // Optional guild allow-list from scope config
    const scope = config.scope || {};
    if (Array.isArray(scope.guilds) && scope.guilds.length > 0) {
      if (!scope.guilds.includes(message.guild?.id)) return { handle: false };
    }

    return {
      handle: !!(mentionedMe || repliedToMe),
      channelType: 'GUILD_TEXT',
      isMention: !!mentionedMe,
    };
  }
}
