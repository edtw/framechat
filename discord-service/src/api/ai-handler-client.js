/**
 * AI Handler Client (discord-service -> ai-handler, DeepSeek).
 * Passes session_id/chat_jid so the platform-agnostic orchestrator tracks
 * each Discord channel/DM as its own conversation.
 */

import { logger } from '../utils/logger.js';

class AIHandlerClient {
  constructor() {
    this.baseURL = process.env.AI_HANDLER_URL || 'http://localhost:8000';
    logger.info({ baseURL: this.baseURL }, 'AI Handler client initialized (DeepSeek)');
  }

  async processMessage(message, options = {}) {
    const body = {
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
      contact_phone: null,
      writing_signature: options.writing_signature || null,
      self_signature: options.self_signature || null,
    };

    const response = await fetch(`${this.baseURL}/api/chat/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Service-Name': 'discord-service' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
      throw new Error(`AI Handler error: ${response.status} - ${error.detail || error.error}`);
    }
    return response.json();
  }

  async analyzeSignature(messages, options = {}) {
    const body = {
      messages,
      provider: 'deepseek',
      session_id: options.session_id || null,
    };

    const response = await fetch(`${this.baseURL}/api/chat/analyze-signature`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Service-Name': 'discord-service' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
      throw new Error(`AI Handler error: ${response.status} - ${error.detail || error.error}`);
    }
    return response.json();
  }

  async healthCheck() {
    try {
      const r = await fetch(`${this.baseURL}/health`);
      return r.ok;
    } catch {
      return false;
    }
  }
}

export const aiHandlerClient = new AIHandlerClient();
export default AIHandlerClient;
