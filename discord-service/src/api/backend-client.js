/**
 * Backend API Client (discord-service -> backend internal routes).
 * Auth: X-Service-Name: discord-service + shared service key.
 */

import { logger } from '../utils/logger.js';

const REQUEST_TIMEOUT_MS = 15_000;

class BackendClient {
  constructor() {
    this.baseURL = process.env.BACKEND_URL || 'http://localhost:3005';
    this.apiKey = process.env.BACKEND_API_KEY;
    this.serviceName = 'discord-service';

    if (!this.apiKey) {
      logger.warn('BACKEND_API_KEY not set - service-to-service communication will fail');
    }
    logger.info({ baseURL: this.baseURL, hasApiKey: !!this.apiKey }, 'Backend client initialized');
  }

  async request(method, path, data = null) {
    const url = `${this.baseURL}${path}`;
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
        'X-Service-Name': this.serviceName,
      },
    };
    if (data && (method === 'POST' || method === 'PUT')) {
      options.body = JSON.stringify(data);
    }

    const response = await fetch(url, { ...options, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(`Backend API error: ${response.status} - ${error.error || error.message}`);
    }
    return response.json();
  }

  // ---- accounts ----
  listAccounts() {
    return this.request('GET', '/api/discord/internal/accounts');
  }
  getCredentials(accountId) {
    return this.request('GET', `/api/discord/internal/accounts/${accountId}/credentials`);
  }
  getAiConfig(accountId) {
    return this.request('GET', `/api/discord/internal/accounts/${accountId}/ai-config`);
  }
  updateStatus(accountId, status, meta = {}) {
    return this.request('POST', `/api/discord/internal/accounts/${accountId}/status`, { status, ...meta });
  }

  // ---- conversations / messages ----
  upsertConversation(data) {
    return this.request('POST', '/api/discord/internal/conversations', data);
  }
  storeMessage(data) {
    return this.request('POST', '/api/discord/internal/messages', data);
  }

  // ---- takeover ----
  getTakeoverStatus(conversationId) {
    return this.request('GET', `/api/discord/internal/conversations/${conversationId}/takeover-status`);
  }

  // ---- signature ----
  getSignature(conversationId) {
    return this.request('GET', `/api/discord/internal/conversations/${conversationId}/signature`);
  }
  saveSignature(conversationId, signature, messageCount) {
    return this.request('PUT', `/api/discord/internal/conversations/${conversationId}/signature`, { signature, messageCount });
  }
  getMessages(conversationId, limit = 50) {
    return this.request('GET', `/api/discord/internal/conversations/${conversationId}/messages?limit=${limit}`);
  }

  // ---- self-signature (AI writes as the USER) ----
  getSelfSignature(accountId) {
    return this.request('GET', `/api/discord/internal/accounts/${accountId}/self-signature`);
  }
  saveSelfSignature(accountId, signature) {
    return this.request('PUT', `/api/discord/internal/accounts/${accountId}/self-signature`, { signature });
  }

  // ---- persona / roleplay ----
  getActivePersona(accountId) {
    return this.request('GET', `/api/discord/internal/accounts/${accountId}/active-persona`);
  }

  // ---- engagement ----
  getEngagementPlan(accountId) {
    return this.request('GET', `/api/discord/internal/accounts/${accountId}/engagement-plan`);
  }
  upsertTarget(data) {
    return this.request('POST', '/api/discord/internal/targets', data);
  }
  createQueueItem(data) {
    return this.request('POST', '/api/discord/internal/queue', data);
  }
  getApprovedQueue(accountId, limit = 10) {
    return this.request('GET', `/api/discord/internal/accounts/${accountId}/queue/approved?limit=${limit}`);
  }
  markQueueResult(itemId, status, sentAt = null) {
    return this.request('POST', `/api/discord/internal/queue/${itemId}/result`, { status, sentAt });
  }

  async healthCheck() {
    try {
      const r = await fetch(`${this.baseURL}/health`, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      return r.ok;
    } catch {
      return false;
    }
  }
}

export const backendClient = new BackendClient();
export default BackendClient;
