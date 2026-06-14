/**
 * WhatsAppManager - Pure Baileys Connection Manager
 *
 * This class ONLY handles WhatsApp connections via Baileys.
 * ALL business logic and data storage is delegated to the Backend API.
 */

import baileys, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  Browsers,
  jidNormalizedUser,
  isLidUser,
  isPnUser,
} from "baileys";
import pino from "pino";
import QRCode from "qrcode";
import fs from "fs";
import path from "path";
import { logger } from "../utils/logger.js";
import { backendClient } from "../api/backend-client.js";

const makeWASocket = baileys.default || baileys;

export class WhatsAppManager {
  constructor() {
    this.sessions = new Map(); // sessionId -> Baileys socket
    this.sessionLocks = new Map(); // sessionId -> boolean (prevents duplicate creation)
    this.reconnectTimers = new Map(); // sessionId -> timeout reference
    this.sessionsPath = process.env.SESSIONS_PATH || "./sessions";
    this.socketManager = null; // Will be set by index.js for WebSocket events
    this.aiProfiles = new Map(); // cache session AI configs
    this.aiProfileTTL = parseInt(process.env.AI_PROFILE_TTL_MIN || '5', 10) * 60 * 1000;

    // Ensure sessions directory exists
    if (!fs.existsSync(this.sessionsPath)) {
      fs.mkdirSync(this.sessionsPath, { recursive: true });
    }

    logger.info('WhatsAppManager initialized');
  }

  /**
   * Set the Socket Manager for real-time WebSocket events
   */
  setSocketManager(socketManager) {
    this.socketManager = socketManager;
    logger.info('Socket Manager connected to WhatsApp Manager');
  }

  /**
   * Create a new WhatsApp session.
   * @param {string} sessionId - Unique session identifier
   * @param {number|string} operatorId - Operator ID for this session
   */
  async createSession(sessionId, operatorId = null) {
    try {
      // Check if already creating this session (prevent duplicate creation)
      if (this.sessionLocks.get(sessionId)) {
        logger.warn({ sessionId }, 'Session creation already in progress');
        return null;
      }

      logger.info({ sessionId, operatorId }, 'Creating WhatsApp session');

      // Set lock
      this.sessionLocks.set(sessionId, true);

      // Clear any existing reconnect timer
      if (this.reconnectTimers.has(sessionId)) {
        clearTimeout(this.reconnectTimers.get(sessionId));
        this.reconnectTimers.delete(sessionId);
      }

      // Check if session already exists
      if (this.sessions.has(sessionId)) {
        logger.warn({ sessionId }, 'Session already exists');
        this.sessionLocks.delete(sessionId);
        return this.sessions.get(sessionId);
      }

      // Create session directory
      const sessionDir = path.join(this.sessionsPath, sessionId);
      if (!fs.existsSync(sessionDir)) {
        fs.mkdirSync(sessionDir, { recursive: true });
      }

      // Get latest Baileys version
      const { version, isLatest } = await fetchLatestBaileysVersion();
      logger.info({
        version: version.join("."),
        isLatest
      }, 'Using WhatsApp Web version');

      // Load auth state
      const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

      // Create Baileys socket
      const sock = makeWASocket({
        version,
        logger: pino({ level: "silent" }),
        printQRInTerminal: false,
        browser: Browsers.macOS('Safari'),
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" })),
        },
        getMessage: async (key) => {
          // Required by Baileys for message retries
          return { conversation: "" };
        },
      });

      // Store session metadata
      sock._sessionId = sessionId;
      sock._operatorId = operatorId;
      sock._createdAt = new Date();

      // Save session
      this.sessions.set(sessionId, sock);

      // ==================== EVENT HANDLERS ====================

      // 1. Handle credentials update (save auth state)
      sock.ev.on("creds.update", saveCreds);

      // 2. Handle connection updates
      sock.ev.on("connection.update", async (update) => {
        try {
          logger.info({ sessionId, update }, 'CONNECTION UPDATE EVENT');

          const { connection, lastDisconnect, qr } = update;
          const statusCode =
            lastDisconnect?.error?.output?.statusCode ||
            lastDisconnect?.error?.data?.statusCode ||
            lastDisconnect?.error?.output?.payload?.statusCode;
          const disconnectReason =
            lastDisconnect?.error?.output?.payload?.message ||
            lastDisconnect?.error?.message ||
            '';
          const normalizedReason = disconnectReason.toLowerCase();
          const hasRegistered = !!state?.creds?.registered;

          const syncStatus = async (nextStatus) => {
            if (!operatorId || !nextStatus) return;
            try {
              await backendClient.updateSessionStatus(sessionId, nextStatus, operatorId);
            } catch (statusErr) {
              logger.warn({ error: statusErr.message }, 'Failed to sync session status with backend');
            }
          };

          const syncQr = async (value) => {
            if (!operatorId) return;
            try {
              await backendClient.updateSessionQRCode(sessionId, value, operatorId);
            } catch (qrErr) {
              logger.warn({ error: qrErr.message }, value ? 'Failed to sync QR with backend' : 'Failed to clear QR in backend');
            }
          };

          const emitStatus = (status) => {
            if (this.socketManager) {
              this.socketManager.emitConnectionStatus(operatorId || sessionId, {
                sessionId,
                status,
                timestamp: new Date().toISOString(),
              });
            }
          };

          // Emit QR code for scanning
          if (qr) {
            try {
              const qrDataUrl = await QRCode.toDataURL(qr);

              if (this.socketManager) {
                this.socketManager.emitQRCode(operatorId || sessionId, {
                  sessionId,
                  qr: qrDataUrl,
                  timestamp: new Date().toISOString(),
                });
              }

              await syncQr(qrDataUrl);
              await syncStatus('QR_READY');
              logger.info({ sessionId }, 'QR code generated and emitted');
            } catch (qrError) {
              logger.error({ error: qrError.message }, 'Failed to generate QR code');
            }
          }

          // Handle connection status changes
          if (connection === "close") {
            const isLoggedOut = statusCode === DisconnectReason.loggedOut;
            const isBadSession = statusCode === DisconnectReason.badSession;
            const isRestartRequired =
              statusCode === DisconnectReason.restartRequired ||
              normalizedReason.includes('restart required') ||
              normalizedReason.includes('stream errored');
            const isQrTimeout = !hasRegistered && statusCode === DisconnectReason.timedOut;
            const isConnectionIssue = [
              DisconnectReason.connectionClosed,
              DisconnectReason.connectionLost,
              DisconnectReason.timedOut,
              DisconnectReason.restartRequired,
            ].includes(statusCode);
            const isConflict = /conflict/i.test(disconnectReason) || statusCode === DisconnectReason.connectionReplaced;

            const shouldCleanCredentials = isLoggedOut || isBadSession || isConflict;
            const shouldReconnect =
              !isLoggedOut &&
              !isBadSession &&
              !isQrTimeout &&
              !isConflict &&
              (isConnectionIssue || isRestartRequired || typeof statusCode === 'undefined');

            logger.warn({
              sessionId,
              statusCode,
              reason: disconnectReason,
              shouldReconnect,
              shouldCleanCredentials,
              isQrTimeout,
              isRestartRequired,
              hasRegistered,
            }, 'WhatsApp connection closed');

            const cleanupSessionDir = async (context) => {
              try {
                const sessionDir = path.join(this.sessionsPath, sessionId);
                await fs.promises.rm(sessionDir, { recursive: true, force: true });
              } catch (cleanupErr) {
                logger.warn({ error: cleanupErr.message }, context);
              }
            };

            // Remove session from memory
            this.sessions.delete(sessionId);
            this.sessionLocks.delete(sessionId);
            if (this.reconnectTimers.has(sessionId)) {
              clearTimeout(this.reconnectTimers.get(sessionId));
              this.reconnectTimers.delete(sessionId);
            }

            await syncQr(null);

            if (shouldCleanCredentials) {
              emitStatus('DISCONNECTED');
              await syncStatus('DISCONNECTED');
              await cleanupSessionDir('Cleaning session directory after logout/conflict');
              logger.warn({ sessionId }, 'Session logged out or replaced - manual reconnection required');
              return;
            }

            if (isQrTimeout) {
              await cleanupSessionDir('Cleaning credentials after QR timeout to force fresh QR on next attempt');
              emitStatus('DISCONNECTED');
              await syncStatus('DISCONNECTED');
              logger.info({ sessionId }, 'QR code expired - credentials cleaned, fresh QR will be generated on next attempt');
              return;
            }

            if (shouldReconnect) {
              emitStatus('RECONNECTING');
              await syncStatus('RECONNECTING');

              if (this.reconnectTimers.has(sessionId)) {
                clearTimeout(this.reconnectTimers.get(sessionId));
                this.reconnectTimers.delete(sessionId);
              }

              logger.info({ sessionId }, 'Scheduling reconnection after transient failure...');
              const reconnectTimer = setTimeout(() => {
                this.createSession(sessionId, operatorId).catch(err => {
                  logger.error({ error: err.message }, 'Reconnection failed');
                });
              }, 5000);
              this.reconnectTimers.set(sessionId, reconnectTimer);
              return;
            }

            emitStatus('DISCONNECTED');
            await syncStatus('DISCONNECTED');
            logger.warn({ sessionId, statusCode }, 'Session disconnected - awaiting manual action');
          }

          // Handle successful connection
          if (connection === "open") {
            logger.info({ sessionId }, 'WhatsApp connection established');

            if (this.socketManager) {
              this.socketManager.emitConnectionStatus(operatorId || sessionId, {
                sessionId,
                status: 'CONNECTED',
                timestamp: new Date().toISOString(),
              });
            }

            await syncStatus('CONNECTED');
            await syncQr(null);

            // Release lock
            this.sessionLocks.delete(sessionId);
          }
        } catch (error) {
          logger.error({
            error: error.message,
            stack: error.stack,
            sessionId,
          }, 'Failed to handle connection.update event');
        }
      });

      // 3. Handle LID / PN mapping updates
      sock.ev.on("lid-mapping.update", (updates = []) => {
        try {
          logger.debug({ sessionId, count: updates.length }, 'LID mapping update received');
        } catch (error) {
          logger.warn({ sessionId, error: error.message }, 'Failed to log LID mapping update');
        }
      });

      // 4. Handle incoming messages
      sock.ev.on("messages.upsert", async ({ messages, type }) => {
        if (type !== "notify") return; // Only process new messages

        for (const message of messages) {
          try {
            await this.handleIncomingMessage(sock, sessionId, operatorId, message);
          } catch (error) {
            logger.error({
              error: error.message,
              sessionId,
              messageId: message.key?.id
            }, 'Error processing incoming message');
          }
        }
      });

      // 5. Handle message updates (read receipts, deletions, reactions)
      sock.ev.on("messages.update", async (updates) => {
        for (const update of updates) {
          logger.debug({
            sessionId,
            messageId: update.key?.id,
            update: update.update
          }, 'Message update received');

          if (this.socketManager) {
            this.socketManager.emitMessageUpdate(operatorId || sessionId, {
              sessionId,
              messageId: update.key?.id,
              update: update.update,
              timestamp: new Date().toISOString(),
            });
          }
        }
      });

      // 6. Handle presence updates (online/offline, typing)
      sock.ev.on("presence.update", async ({ id, presences }) => {
        logger.debug({
          sessionId,
          jid: id,
          presences
        }, 'Presence update received');

        if (this.socketManager) {
          this.socketManager.emitPresenceUpdate(operatorId || sessionId, {
            sessionId,
            jid: id,
            presences,
            timestamp: new Date().toISOString(),
          });
        }
      });

      // 7. Handle contacts upsert
      sock.ev.on("contacts.upsert", async (contacts) => {
        logger.info({ sessionId, count: contacts.length }, 'Received contacts upsert');
        if (operatorId && contacts.length > 0) {
          try {
            const formattedContacts = contacts.map(c => ({
              remoteJid: c.id,
              name: c.name || c.notify || c.verifiedName,
              pushName: c.notify,
              verifiedName: c.verifiedName,
              imgUrl: c.imgUrl,
            }));
            await backendClient.importContacts({
              sessionId,
              operatorId,
              contacts: formattedContacts,
            });
          } catch (err) {
            logger.warn({ error: err.message, sessionId }, 'Failed to sync contacts to backend');
          }
        }
      });

      // Persist session metadata
      await this.saveSessionMetadata(sessionId, operatorId);
      logger.info({ sessionId }, 'WhatsApp session created successfully');
      return sock;

    } catch (error) {
      logger.error({
        error: error.message,
        stack: error.stack,
        sessionId
      }, 'Failed to create WhatsApp session');

      // Clean up
      this.sessions.delete(sessionId);
      this.sessionLocks.delete(sessionId);

      throw error;
    }
  }

  /**
   * Handle incoming WhatsApp message.
   * NOTE: This method is meant to be overridden by index.js
   * to integrate with backend-client and ai-handler-client.
   */
  async handleIncomingMessage(sock, sessionId, operatorId, message) {
    // Default implementation (will be overridden in index.js)
    logger.info({
      sessionId,
      operatorId,
      from: message.key?.remoteJid,
      messageId: message.key?.id
    }, 'Incoming message (default handler - should be overridden)');
  }

  /**
   * Disconnect a WhatsApp session.
   */
  async disconnectSession(sessionId) {
    try {
      logger.info({ sessionId }, 'Disconnecting WhatsApp session');

      const sock = this.sessions.get(sessionId);
      if (!sock) {
        logger.warn({ sessionId }, 'Session not found for disconnection');
        return false;
      }

      // Clear reconnect timer
      if (this.reconnectTimers.has(sessionId)) {
        clearTimeout(this.reconnectTimers.get(sessionId));
        this.reconnectTimers.delete(sessionId);
      }

      // Logout from WhatsApp
      await sock.logout();

      // Remove from memory
      this.sessions.delete(sessionId);
      this.sessionLocks.delete(sessionId);
      this.invalidateAIProfile(sessionId, sock._operatorId);

      // Emit disconnection event
      if (this.socketManager) {
        this.socketManager.emitConnectionStatus(sock._operatorId || sessionId, {
          sessionId,
          status: 'DISCONNECTED',
          timestamp: new Date().toISOString(),
        });
      }

      logger.info({ sessionId }, 'WhatsApp session disconnected');
      return true;

    } catch (error) {
      logger.error({
        error: error.message,
        sessionId
      }, 'Failed to disconnect session');
      throw error;
    }
  }

  /**
   * Disconnect all active sessions (graceful shutdown).
   */
  async disconnectAll() {
    logger.info('Disconnecting all WhatsApp sessions...');

    const disconnectPromises = [];
    for (const [sessionId] of this.sessions) {
      disconnectPromises.push(
        this.disconnectSession(sessionId).catch(err => {
          logger.error({ error: err.message, sessionId }, 'Failed to disconnect session');
        })
      );
    }

    await Promise.allSettled(disconnectPromises);
    logger.info('All WhatsApp sessions disconnected');
  }

  /**
   * Get all active session info.
   */
  getAllSessions() {
    return Array.from(this.sessions.keys()).map(sessionId => {
      const sock = this.sessions.get(sessionId);
      return {
        sessionId,
        operatorId: sock._operatorId,
        createdAt: sock._createdAt?.toISOString(),
        isConnected: sock.ws?.readyState === 1, // WebSocket OPEN
      };
    });
  }

  /**
   * Get active sessions count.
   */
  getActiveSessionsCount() {
    return this.sessions.size;
  }

  /**
   * Get a specific session.
   */
  getSession(sessionId) {
    return this.sessions.get(sessionId);
  }

  /**
   * Check if session exists and is connected.
   */
  isSessionActive(sessionId) {
    const sock = this.sessions.get(sessionId);
    if (!sock) return false;
    return sock.ws?.readyState === 1;
  }

  /**
   * Normalize a WhatsApp JID.
   */
  normalizeJid(jid) {
    if (!jid) return null;
    try {
      return jidNormalizedUser(jid);
    } catch (error) {
      logger.warn({ jid, error: error.message }, 'Failed to normalize JID');
      return jid;
    }
  }

  /**
   * Extract bare identifier from a JID (strip @s.whatsapp.net part).
   */
  extractBareIdentifier(jid) {
    return jid ? jid.split('@')[0] : null;
  }

  /**
   * Resolve remote identity from primary and alternate JIDs.
   */
  async resolveRemoteIdentity(sock, primaryJid, alternateJid) {
    const normalizedPrimary = this.normalizeJid(primaryJid);
    const normalizedAlternate = this.normalizeJid(alternateJid);

    const identity = {
      primaryJid: normalizedPrimary,
      alternateJid: normalizedAlternate,
      lid: null,
      phoneNumber: null,
      pnJid: null,
      identifier: null,
      addressingMode: 'unknown',
    };

    const processJid = (jid) => {
      if (!jid) return;
      if (isPnUser(jid) && !identity.phoneNumber) {
        identity.phoneNumber = this.extractBareIdentifier(jid);
        identity.pnJid = jid;
      } else if (isLidUser(jid) && !identity.lid) {
        identity.lid = jid;
      }
    };

    processJid(normalizedPrimary);
    processJid(normalizedAlternate);

    const mappingStore = sock?.signalRepository?.lidMapping;

    if (!identity.phoneNumber && identity.lid && mappingStore?.getPNForLID) {
      try {
        const pnJid = await mappingStore.getPNForLID(identity.lid);
        if (pnJid) {
          const normalizedPn = this.normalizeJid(pnJid);
          if (isPnUser(normalizedPn)) {
            identity.phoneNumber = this.extractBareIdentifier(normalizedPn);
            identity.pnJid = normalizedPn;
          }
        }
      } catch (error) {
        logger.warn({
          sessionId: sock?._sessionId,
          error: error.message
        }, 'Failed to resolve PN from LID');
      }
    }

    if (!identity.lid && identity.phoneNumber && mappingStore?.getLIDForPN) {
      try {
        const pnJid = this.normalizeJid(`${identity.phoneNumber}@s.whatsapp.net`);
        const lid = await mappingStore.getLIDForPN(pnJid);
        if (lid) {
          identity.lid = this.normalizeJid(lid);
        }
        identity.pnJid = pnJid;
      } catch (error) {
        logger.warn({
          sessionId: sock?._sessionId,
          error: error.message
        }, 'Failed to resolve LID from PN');
      }
    }

    const bareLid = this.extractBareIdentifier(identity.lid);
    const barePrimary = this.extractBareIdentifier(identity.primaryJid);
    const bareAlt = this.extractBareIdentifier(identity.alternateJid);

    identity.identifier = identity.phoneNumber || bareLid || barePrimary || bareAlt || 'unknown';
    identity.addressingMode = identity.lid ? 'lid' : identity.phoneNumber ? 'pn' : 'unknown';

    return identity;
  }

  /**
   * Get AI profile cache key.
   */
  getAIProfileCacheKey(sessionId, operatorId) {
    return `${operatorId || 'unknown'}:${sessionId}`;
  }

  /**
   * Invalidate cached AI profile.
   */
  invalidateAIProfile(sessionId, operatorId) {
    const key = this.getAIProfileCacheKey(sessionId, operatorId);
    this.aiProfiles.delete(key);
  }

  /**
   * Get AI profile for a session (with caching).
   */
  async getAIProfile(sessionId, operatorId, { force = false } = {}) {
    if (!operatorId) return null;
    const cacheKey = this.getAIProfileCacheKey(sessionId, operatorId);
    if (!force && this.aiProfiles.has(cacheKey)) {
      const cached = this.aiProfiles.get(cacheKey);
      if (Date.now() - cached.cachedAt < this.aiProfileTTL) {
        return cached.profile;
      }
    }

    try {
      const payload = await backendClient.getAIProfile(sessionId, operatorId);
      if (payload?.operatorId && payload.operatorId !== operatorId) {
        throw new Error('AI profile belongs to a different operator');
      }

      const profile = {
        config: payload?.ai_config || { enabled: false },
        knowledgeBase: payload?.knowledgeBase || [],
      };

      this.aiProfiles.set(cacheKey, {
        cachedAt: Date.now(),
        profile,
      });

      return profile;
    } catch (error) {
      logger.warn({
        error: error.message,
        sessionId,
        operatorId,
      }, 'Failed to load AI profile');
      return null;
    }
  }

  /**
   * Prepare knowledge base payload for AI consumption.
   */
  prepareKnowledgePayload(items = []) {
    const limit = parseInt(process.env.KNOWLEDGE_SNIPPETS || '8', 10);
    return (items || [])
      .slice(0, limit)
      .map(item => {
        let tags = [];
        if (Array.isArray(item.tags)) {
          tags = item.tags.map(t => typeof t === 'string' ? t : (t.name || t.tag?.name || String(t)));
        }

        return {
          id: String(item.id || ''),
          title: String(item.title || ''),
          content: String(item.content || ''),
          category: item.category ? String(item.category) : null,
          tags,
          updatedAt: item.updatedAt,
        };
      });
  }

  /**
   * Persist session metadata to disk.
   */
  async saveSessionMetadata(sessionId, operatorId) {
    try {
      if (!operatorId) return;
      const sessionDir = path.join(this.sessionsPath, sessionId);
      if (!fs.existsSync(sessionDir)) {
        fs.mkdirSync(sessionDir, { recursive: true });
      }
      const metaPath = path.join(sessionDir, 'session.meta.json');
      const payload = {
        sessionId,
        operatorId,
        updatedAt: new Date().toISOString(),
      };
      await fs.promises.writeFile(metaPath, JSON.stringify(payload, null, 2), 'utf-8');
    } catch (error) {
      logger.warn({ sessionId, error: error.message }, 'Failed to persist session metadata');
    }
  }

  /**
   * Load existing sessions from disk at startup.
   */
  async loadExistingSessions() {
    try {
      const entries = await fs.promises.readdir(this.sessionsPath, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const sessionId = entry.name;
        const metaPath = path.join(this.sessionsPath, sessionId, 'session.meta.json');
        let meta;
        try {
          const raw = await fs.promises.readFile(metaPath, 'utf-8');
          meta = JSON.parse(raw);
        } catch (metaError) {
          logger.warn({ sessionId, error: metaError.message }, 'Skipping session without metadata');
          continue;
        }

        const operatorId = meta?.operatorId;
        if (!operatorId) {
          logger.warn({ sessionId }, 'Skipping session - missing operatorId in metadata');
          continue;
        }

        if (this.sessions.has(sessionId)) {
          continue;
        }

        logger.info({ sessionId, operatorId }, 'Restoring WhatsApp session from disk');
        try {
          await this.createSession(sessionId, operatorId);
        } catch (error) {
          logger.error({ sessionId, error: error.message }, 'Failed to restore session from disk');
        }
      }
    } catch (error) {
      if (error.code === 'ENOENT') {
        return;
      }
      logger.error({ error: error.message }, 'Failed to load sessions directory');
    }
  }
}
