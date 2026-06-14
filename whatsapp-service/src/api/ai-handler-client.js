/**
 * AI Handler Client
 *
 * HTTP client for whatsapp-service to communicate with the AI Handler service (port 8000).
 * Always uses DeepSeek as the AI provider.
 */

import { logger } from '../utils/logger.js';

class AIHandlerClient {
  constructor() {
    this.baseURL = process.env.AI_HANDLER_URL || 'http://localhost:8000';

    logger.info({
      baseURL: this.baseURL,
      provider: 'deepseek',
    }, 'AI Handler client initialized (DeepSeek)');
  }

  /**
   * Make request to AI Handler
   */
  async request(method, path, data = null) {
    const url = `${this.baseURL}${path}`;

    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Service-Name': 'whatsapp-service',
      },
    };

    if (data && (method === 'POST' || method === 'PUT')) {
      options.body = JSON.stringify(data);
    }

    try {
      const response = await fetch(url, options);

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(`AI Handler error: ${response.status} - ${error.detail || error.error}`);
      }

      return await response.json();
    } catch (error) {
      logger.error({
        error: error.message,
        method,
        path,
        url,
      }, 'AI Handler request failed');
      throw error;
    }
  }

  // ==================== CHAT ====================

  /**
   * Process message with DeepSeek AI and get response.
   *
   * @param {string} message - User message
   * @param {Object} options - Processing options
   * @param {boolean} [options.detect_intent=true] - Detect intent
   * @param {Array} [options.context] - Conversation context
   * @param {string} [options.system_prompt] - System prompt
   * @param {Object} [options.behavior] - Agent behavior config
   * @param {Array} [options.knowledge_base] - Knowledge base entries
   * @param {number} [options.max_tokens] - Max tokens
   * @param {number} [options.temperature] - Temperature
   * @param {string} [options.session_id] - WhatsApp session ID (enables orchestrator tracking)
   * @param {string} [options.chat_jid] - Contact chat JID (per-contact pipeline tracking)
   * @param {string} [options.contact_name] - Contact display name (for alerts)
   * @param {string} [options.contact_phone] - Contact phone number (for alerts)
   * @returns {Promise<Object>} AI response
   */
  async processMessage(message, options = {}) {
    logger.info({
      messageLength: message.length,
      detectIntent: options.detect_intent !== false,
      hasContext: !!(options.context && options.context.length > 0),
      hasKnowledge: !!(options.knowledge_base && options.knowledge_base.length > 0),
      sessionId: options.session_id || null,
    }, 'Processing message with DeepSeek AI');

    return this.request('POST', '/api/chat/', {
      message,
      detect_intent: options.detect_intent !== false,
      provider: 'deepseek',
      context: options.context || [],
      system_prompt: options.system_prompt || null,
      behavior: options.behavior || null,
      knowledge_base: options.knowledge_base || [],
      max_tokens: options.max_tokens,
      temperature: options.temperature,
      session_id: options.session_id || null,
      chat_jid: options.chat_jid || null,
      contact_name: options.contact_name || null,
      contact_phone: options.contact_phone || null,
    });
  }

  /**
   * Detect intent of a message
   *
   * @param {string} message - User message
   * @returns {Promise<Object>} Intent detection result
   */
  async detectIntent(message) {
    logger.info({
      messageLength: message.length,
    }, 'Detecting message intent');

    return this.request('POST', '/api/chat/intent', {
      message,
    });
  }

  // ==================== HEALTH CHECK ====================

  /**
   * Check if AI Handler is healthy
   */
  async healthCheck() {
    try {
      const response = await fetch(`${this.baseURL}/health`);
      return response.ok;
    } catch (error) {
      logger.error({
        error: error.message,
      }, 'AI Handler health check failed');
      return false;
    }
  }
}

// Proxy-based lazy initialization to ensure env vars are loaded
const handler = {
  _instance: null,

  get(target, prop) {
    if (!this._instance) {
      this._instance = new AIHandlerClient();
    }
    const value = this._instance[prop];
    return typeof value === 'function' ? value.bind(this._instance) : value;
  }
};

export const aiHandlerClient = new Proxy({}, handler);

export default AIHandlerClient;
