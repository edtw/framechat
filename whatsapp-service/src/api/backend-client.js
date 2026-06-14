/**
 * Backend API Client
 *
 * HTTP client for whatsapp-service to communicate with the main AFILIATORS backend (port 3005).
 * Handles service-to-service authentication and provides methods
 * for storing WhatsApp data (messages, conversations, sessions).
 */

import { logger } from '../utils/logger.js';

class BackendClient {
  constructor() {
    this.baseURL = process.env.BACKEND_URL || 'http://localhost:3005';
    this.apiKey = process.env.BACKEND_API_KEY;
    this.serviceName = 'whatsapp-service';

    if (!this.apiKey) {
      logger.warn('BACKEND_API_KEY not set - service-to-service communication will fail');
    }

    logger.info({
      baseURL: this.baseURL,
      hasApiKey: !!this.apiKey,
    }, 'Backend client initialized');
  }

  /**
   * Make authenticated request to backend
   */
  async request(method, path, data = null) {
    const url = `${this.baseURL}${path}`;

    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
        'X-Service-Name': this.serviceName,
      },
    };

    if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      options.body = JSON.stringify(data);
    }

    try {
      const response = await fetch(url, options);

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(`Backend API error: ${response.status} - ${error.error || error.message}`);
      }

      return await response.json();
    } catch (error) {
      logger.error({
        error: error.message,
        method,
        path,
        url,
      }, 'Backend API request failed');
      throw error;
    }
  }

  // ==================== CONVERSATIONS ====================

  /**
   * Create or update a conversation in the backend
   */
  async upsertConversation(data) {
    logger.info({
      sessionId: data.sessionId,
      remoteJid: data.remoteJid,
      operatorId: data.operatorId,
    }, 'Upserting conversation in backend');

    return this.request('POST', '/api/whatsapp/internal/conversations', data);
  }

  // ==================== MESSAGES ====================

  /**
   * Store a WhatsApp message in the backend
   */
  async storeMessage(data) {
    logger.info({
      conversationId: data.conversationId,
      fromMe: data.fromMe,
      operatorId: data.operatorId,
    }, 'Storing message in backend');

    return this.request('POST', '/api/whatsapp/internal/messages', data);
  }

  // ==================== SESSIONS ====================

  /**
   * Update session status in the backend
   */
  async updateSessionStatus(sessionId, status, operatorId) {
    logger.info({ sessionId, status, operatorId }, 'Updating session status in backend');

    return this.request('PUT', '/api/whatsapp/internal/sessions/status', {
      sessionId,
      status,
      operatorId,
    });
  }

  /**
   * Update session QR code in the backend
   */
  async updateSessionQRCode(sessionId, qrCode, operatorId) {
    logger.info({ sessionId, hasQr: !!qrCode, operatorId }, 'Updating session QR in backend');

    return this.request('PUT', '/api/whatsapp/internal/sessions/qr', {
      sessionId,
      qrCode,
      operatorId,
    });
  }

  /**
   * Validate session exists and belongs to operator
   */
  async validateSession(sessionId, operatorId) {
    logger.info({ sessionId, operatorId }, 'Validating session in backend');

    const params = new URLSearchParams({ sessionId, operatorId: String(operatorId) });
    return this.request('GET', `/api/whatsapp/internal/sessions/validate?${params}`);
  }

  // ==================== AI CONFIG ====================

  /**
   * Fetch AI configuration for a session
   */
  async getAIProfile(sessionId, operatorId) {
    logger.info({ sessionId, operatorId }, 'Loading AI profile for session');
    return this.request('GET', `/api/whatsapp/internal/sessions/${encodeURIComponent(sessionId)}/ai-config`);
  }

  // ==================== CONTACTS ====================

  /**
   * Batch import contacts to the backend
   */
  async storeContactsBatch(contacts) {
    logger.info({ count: contacts.length }, 'Storing contacts batch in backend');
    return this.request('POST', '/api/whatsapp/internal/contacts/batch', { contacts });
  }

  // ==================== BATCH IMPORTS ====================

  /**
   * Batch import messages
   */
  async importMessages(payload) {
    return this.request('POST', '/api/whatsapp/internal/messages/batch', payload);
  }

  /**
   * Batch import contacts
   */
  async importContacts(payload) {
    return this.request('POST', '/api/whatsapp/internal/contacts/batch', payload);
  }

  // ==================== HEALTH CHECK ====================

  /**
   * Check if backend is healthy
   */
  async healthCheck() {
    try {
      const response = await fetch(`${this.baseURL}/health`);
      return response.ok;
    } catch (error) {
      logger.error({ error: error.message }, 'Backend health check failed');
      return false;
    }
  }
}

// Proxy-based lazy initialization to ensure env vars are loaded
const handler = {
  _instance: null,

  get(target, prop) {
    if (!this._instance) {
      this._instance = new BackendClient();
    }
    const value = this._instance[prop];
    return typeof value === 'function' ? value.bind(this._instance) : value;
  }
};

export const backendClient = new Proxy({}, handler);

export default BackendClient;
