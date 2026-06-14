/**
 * Conversation Context Manager
 *
 * Manages conversation history for AI context.
 * Uses Redis as primary store with in-memory Map fallback if Redis is unavailable.
 * Stores last 10 messages per conversation for better AI responses.
 */

import { logger } from '../utils/logger.js';

let Redis = null;
try {
  Redis = (await import('ioredis')).default;
} catch {
  logger.warn('ioredis not available, using in-memory context store');
}

export class ContextManager {
  constructor(redisUrl = null) {
    this.redisUrl = redisUrl || process.env.REDIS_URL || 'redis://localhost:6379';
    this.redis = null;
    this.initialized = false;
    this.useRedis = false;
    this.contextWindowSize = parseInt(process.env.CONTEXT_WINDOW_SIZE || '10', 10);
    this.contextTTL = parseInt(process.env.CONTEXT_TTL_HOURS || '24', 10) * 3600;

    // In-memory fallback storage
    this.memoryStore = new Map(); // key -> message[]
    this.memoryTimestamps = new Map(); // key -> lastAccessTime
  }

  /**
   * Initialize Redis connection. Falls back to in-memory Map on failure.
   */
  async initialize() {
    if (this.initialized) return;

    try {
      this.redis = new Redis(this.redisUrl, {
        retryStrategy: (times) => {
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
        maxRetriesPerRequest: 3,
        connectTimeout: 3000,
        lazyConnect: true,
      });

      await this.redis.connect();
      await this.redis.ping();
      this.useRedis = true;
      this.initialized = true;
      logger.info('ContextManager initialized with Redis');
    } catch (error) {
      logger.warn({ error: error.message }, 'Redis unavailable - using in-memory context store (not for production)');
      this.useRedis = false;
      this.initialized = true;
      logger.info('ContextManager initialized with in-memory fallback');
    }
  }

  /**
   * Generate storage key for conversation context.
   */
  _getContextKey(sessionId, chatJid) {
    return `context:${sessionId}:${chatJid}`;
  }

  /**
   * Add a message to conversation context.
   * @param {string} sessionId - WhatsApp session ID
   * @param {string} chatJid - Chat JID (user phone number)
   * @param {string} role - 'user' or 'assistant'
   * @param {string} content - Message content
   * @param {object} metadata - Optional metadata (timestamp, messageId, etc)
   */
  async addMessage(sessionId, chatJid, role, content, metadata = {}) {
    if (!this.initialized) await this.initialize();

    try {
      const messageEntry = {
        role,
        content,
        timestamp: metadata.timestamp || new Date().toISOString(),
        messageId: metadata.messageId || null,
      };

      if (this.useRedis) {
        const key = this._getContextKey(sessionId, chatJid);
        await this.redis.lpush(key, JSON.stringify(messageEntry));
        await this.redis.ltrim(key, 0, this.contextWindowSize - 1);
        await this.redis.expire(key, this.contextTTL);
      } else {
        const key = this._getContextKey(sessionId, chatJid);
        if (!this.memoryStore.has(key)) {
          this.memoryStore.set(key, []);
        }
        const arr = this.memoryStore.get(key);
        arr.unshift(messageEntry);
        // Trim to window size
        if (arr.length > this.contextWindowSize) {
          arr.length = this.contextWindowSize;
        }
        this.memoryTimestamps.set(key, Date.now());
      }

      logger.debug({
        sessionId,
        chatJid: chatJid.substring(0, 15) + '...',
        role,
        contentLength: content.length,
      }, 'Added message to context');

    } catch (error) {
      logger.error({
        error: error.message,
        sessionId,
        chatJid,
      }, 'Failed to add message to context');
    }
  }

  /**
   * Get conversation context (last N messages in chronological order).
   * @param {string} sessionId
   * @param {string} chatJid
   * @param {number} limit - Max messages to retrieve
   * @returns {Array} Array of {role, content, timestamp} objects
   */
  async getContext(sessionId, chatJid, limit = null) {
    if (!this.initialized) await this.initialize();

    try {
      const key = this._getContextKey(sessionId, chatJid);
      const maxMessages = limit || this.contextWindowSize;

      if (this.useRedis) {
        const messages = await this.redis.lrange(key, 0, maxMessages - 1);

        if (!messages || messages.length === 0) {
          return [];
        }

        const parsedMessages = messages
          .map(msg => {
            try { return JSON.parse(msg); } catch (e) { return null; }
          })
          .filter(Boolean)
          .reverse(); // chronological order

        return parsedMessages;
      } else {
        const arr = this.memoryStore.get(key) || [];
        const sliced = arr.slice(0, maxMessages);
        return [...sliced].reverse(); // chronological order
      }

    } catch (error) {
      logger.error({
        error: error.message,
        sessionId,
        chatJid,
      }, 'Failed to get context');
      return [];
    }
  }

  /**
   * Clear conversation context.
   */
  async clearContext(sessionId, chatJid) {
    if (!this.initialized) await this.initialize();

    try {
      const key = this._getContextKey(sessionId, chatJid);

      if (this.useRedis) {
        await this.redis.del(key);
      } else {
        this.memoryStore.delete(key);
        this.memoryTimestamps.delete(key);
      }

      logger.info({ sessionId, chatJid: chatJid.substring(0, 15) + '...' }, 'Cleared context');

    } catch (error) {
      logger.error({ error: error.message, sessionId, chatJid }, 'Failed to clear context');
    }
  }

  /**
   * Get context formatted for AI (OpenAI format).
   * @returns {Array} Array of {role, content} objects
   */
  async getContextForAI(sessionId, chatJid, limit = null) {
    const context = await this.getContext(sessionId, chatJid, limit);
    return context.map(msg => ({
      role: msg.role,
      content: msg.content,
    }));
  }

  /**
   * Get context statistics for a conversation.
   */
  async getContextStats(sessionId, chatJid) {
    if (!this.initialized) await this.initialize();

    try {
      const key = this._getContextKey(sessionId, chatJid);

      if (this.useRedis) {
        const count = await this.redis.llen(key);
        if (count === 0) {
          return { messageCount: 0, oldestTimestamp: null, newestTimestamp: null };
        }
        const newest = await this.redis.lindex(key, 0);
        const oldest = await this.redis.lindex(key, -1);
        const newestParsed = newest ? JSON.parse(newest) : null;
        const oldestParsed = oldest ? JSON.parse(oldest) : null;

        return {
          messageCount: count,
          oldestTimestamp: oldestParsed?.timestamp || null,
          newestTimestamp: newestParsed?.timestamp || null,
          ttl: await this.redis.ttl(key),
        };
      } else {
        const arr = this.memoryStore.get(key) || [];
        if (arr.length === 0) {
          return { messageCount: 0, oldestTimestamp: null, newestTimestamp: null };
        }
        return {
          messageCount: arr.length,
          oldestTimestamp: arr[arr.length - 1]?.timestamp || null,
          newestTimestamp: arr[0]?.timestamp || null,
        };
      }
    } catch (error) {
      logger.error({ error: error.message, sessionId, chatJid }, 'Failed to get context stats');
      return { messageCount: 0, oldestTimestamp: null, newestTimestamp: null };
    }
  }

  /**
   * Clear all contexts for a session (useful when session is deleted).
   */
  async clearSessionContexts(sessionId) {
    if (!this.initialized) await this.initialize();

    try {
      if (this.useRedis) {
        const pattern = `context:${sessionId}:*`;
        const keys = await this.redis.keys(pattern);
        if (keys.length === 0) {
          logger.debug({ sessionId }, 'No contexts found for session');
          return 0;
        }
        await this.redis.del(...keys);
        logger.info({ sessionId, clearedCount: keys.length }, 'Cleared all session contexts');
        return keys.length;
      } else {
        let count = 0;
        const prefix = `context:${sessionId}:`;
        for (const key of this.memoryStore.keys()) {
          if (key.startsWith(prefix)) {
            this.memoryStore.delete(key);
            this.memoryTimestamps.delete(key);
            count++;
          }
        }
        logger.info({ sessionId, clearedCount: count }, 'Cleared all session contexts (memory)');
        return count;
      }
    } catch (error) {
      logger.error({ error: error.message, sessionId }, 'Failed to clear session contexts');
      return 0;
    }
  }

  /**
   * Get summary of all active conversations for a session.
   */
  async getSessionSummary(sessionId) {
    if (!this.initialized) await this.initialize();

    try {
      if (this.useRedis) {
        const pattern = `context:${sessionId}:*`;
        const keys = await this.redis.keys(pattern);
        if (keys.length === 0) return [];

        const summary = await Promise.all(
          keys.map(async (key) => {
            const chatJid = key.split(':').slice(2).join(':');
            const count = await this.redis.llen(key);
            const newest = await this.redis.lindex(key, 0);
            const newestParsed = newest ? JSON.parse(newest) : null;

            return {
              chatJid,
              messageCount: count,
              lastActivity: newestParsed?.timestamp || null,
            };
          })
        );

        return summary.sort((a, b) => new Date(b.lastActivity) - new Date(a.lastActivity));
      } else {
        const summary = [];
        const prefix = `context:${sessionId}:`;
        for (const [key, arr] of this.memoryStore.entries()) {
          if (key.startsWith(prefix)) {
            const chatJid = key.split(':').slice(2).join(':');
            summary.push({
              chatJid,
              messageCount: arr.length,
              lastActivity: arr[0]?.timestamp || null,
            });
          }
        }
        return summary.sort((a, b) => new Date(b.lastActivity) - new Date(a.lastActivity));
      }
    } catch (error) {
      logger.error({ error: error.message, sessionId }, 'Failed to get session summary');
      return [];
    }
  }

  /**
   * Close Redis connection gracefully.
   */
  async close() {
    if (this.redis) {
      await this.redis.quit();
      this.useRedis = false;
      this.initialized = false;
      logger.info('ContextManager closed');
    }
  }
}

// Global singleton instance
let contextManager = null;

/**
 * Get or create global ContextManager instance.
 */
export function getContextManager() {
  if (!contextManager) {
    contextManager = new ContextManager();
  }
  return contextManager;
}

export default ContextManager;
