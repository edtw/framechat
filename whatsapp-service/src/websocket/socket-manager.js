/**
 * WebSocket Manager - Socket.io Server
 *
 * Manages real-time WebSocket connections for:
 * - New message notifications
 * - Typing indicators
 * - Takeover status changes
 * - WhatsApp session status updates
 * - QR code delivery
 *
 * Architecture:
 * - Operator-based rooms for multi-tenant isolation
 * - Events are typed and structured
 */

import { Server } from 'socket.io';
import { logger } from '../utils/logger.js';

class SocketManager {
  constructor() {
    this.io = null;
    this.connectedClients = new Map(); // userId -> socket.id
  }

  /**
   * Initialize the Socket.io server.
   * @param {import('http').Server} httpServer - Express HTTP server
   */
  initialize(httpServer) {
    this.io = new Server(httpServer, {
      cors: {
        origin: [
          'http://localhost:3001',
          'http://localhost:3000',
          'http://localhost:5173',
        ],
        credentials: true,
        methods: ['GET', 'POST'],
      },
      transports: ['websocket', 'polling'],
      pingTimeout: 60000,
      pingInterval: 25000,
    });

    // Simplified authentication middleware (backend handles full auth)
    this.io.use(async (socket, next) => {
      try {
        socket.operatorId = socket.handshake.auth.operatorId || socket.handshake.query.operatorId || 'default';
        socket.userId = socket.handshake.auth.userId || socket.id;
        socket.userEmail = socket.handshake.auth.userEmail || socket.handshake.auth.email || socket.handshake.query.email || null;

        logger.info(`[WebSocket] Connection from operatorId: ${socket.operatorId}`);
        next();
      } catch (error) {
        logger.error('[WebSocket] Connection error:', error.message);
        next(error);
      }
    });

    // Handle connections
    this.io.on('connection', (socket) => {
      this.handleConnection(socket);
    });

    logger.info('WebSocket server initialized');
  }

  /**
   * Handle new client connection.
   */
  handleConnection(socket) {
    const { userId, userEmail, operatorId } = socket;

    const label = userEmail || userId || socket.id;
    logger.info(`[WebSocket] Client connected: ${label} (socket: ${socket.id})`);

    // Store connection
    this.connectedClients.set(userId, socket.id);

    // Join user room
    socket.join(`user:${userId}`);

    // Join operator room
    if (operatorId) {
      socket.join(`operator:${operatorId}`);
      logger.info(`[WebSocket] User ${label} joined operator room: ${operatorId}`);
    }

    // Send connection confirmation
    socket.emit('connected', {
      userId,
      socketId: socket.id,
      timestamp: new Date().toISOString(),
    });

    // Event: Join specific conversation
    socket.on('join:conversation', (data) => {
      const { operatorId, userPhone } = data;
      const roomName = `conversation:${operatorId}:${userPhone}`;
      socket.join(roomName);
      logger.info(`[WebSocket] ${label} joined conversation: ${roomName}`);

      socket.emit('conversation:joined', {
        operatorId,
        userPhone,
        roomName,
      });
    });

    // Event: Leave conversation
    socket.on('leave:conversation', (data) => {
      const { operatorId, userPhone } = data;
      const roomName = `conversation:${operatorId}:${userPhone}`;
      socket.leave(roomName);
      logger.info(`[WebSocket] ${label} left conversation: ${roomName}`);
    });

    // Event: Operator typing indicator
    socket.on('typing:start', (data) => {
      const { operatorId, userPhone } = data;
      const roomName = `conversation:${operatorId}:${userPhone}`;
      const operatorName = userEmail ? userEmail.split('@')[0] : (userId || 'operator');
      socket.to(roomName).emit('typing:operator', {
        operatorId,
        userPhone,
        operatorName,
        isTyping: true,
      });
    });

    socket.on('typing:stop', (data) => {
      const { operatorId, userPhone } = data;
      const roomName = `conversation:${operatorId}:${userPhone}`;
      const operatorName = userEmail ? userEmail.split('@')[0] : (userId || 'operator');
      socket.to(roomName).emit('typing:operator', {
        operatorId,
        userPhone,
        operatorName,
        isTyping: false,
      });
    });

    // Event: Ping/Pong for keep-alive
    socket.on('ping', () => {
      socket.emit('pong', { timestamp: Date.now() });
    });

    // Disconnection
    socket.on('disconnect', (reason) => {
      const disconnectLabel = userEmail || userId || socket.id;
      if (reason === 'transport close') {
        logger.debug(`[WebSocket] Client transport closed: ${disconnectLabel}`);
      } else {
        logger.info(`[WebSocket] Client disconnected: ${disconnectLabel} (reason: ${reason})`);
      }
      this.connectedClients.delete(userId);
    });

    // Error
    socket.on('error', (error) => {
      logger.error(`[WebSocket] Socket error for ${userEmail}:`, error);
    });
  }

  /**
   * Emit a new message to all users in the operator's room.
   */
  emitNewMessage(operatorId, message) {
    if (!this.io) return;

    const operatorRoom = `operator:${operatorId}`;
    const conversationRoom = `conversation:${operatorId}:${message.from || message.to}`;

    this.io.to(operatorRoom).emit('message:new', {
      operatorId,
      message,
      timestamp: new Date().toISOString(),
    });

    this.io.to(conversationRoom).emit('message:received', {
      operatorId,
      message,
      timestamp: new Date().toISOString(),
    });

    logger.debug(`[WebSocket] New message emitted to operator ${operatorId}`);
  }

  /**
   * Emit a message update (read receipts, deletions, reactions).
   */
  emitMessageUpdate(operatorId, update) {
    if (!this.io) return;

    const operatorRoom = `operator:${operatorId}`;

    this.io.to(operatorRoom).emit('message:update', {
      operatorId,
      update,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Emit takeover status change.
   */
  emitTakeoverChange(operatorId, userPhone, takeoverData) {
    if (!this.io) return;

    const operatorRoom = `operator:${operatorId}`;
    const conversationRoom = `conversation:${operatorId}:${userPhone}`;

    const payload = {
      operatorId,
      userPhone,
      takenOver: takeoverData.taken_over_by !== null,
      takenOverBy: takeoverData.taken_over_by,
      takenOverAt: takeoverData.taken_over_at,
      reason: takeoverData.reason,
      timestamp: new Date().toISOString(),
    };

    this.io.to(operatorRoom).emit('takeover:changed', payload);
    this.io.to(conversationRoom).emit('takeover:status', payload);

    logger.info(`[WebSocket] Takeover change emitted: ${operatorId}:${userPhone}`);
  }

  /**
   * Emit typing indicator (WhatsApp user is typing).
   */
  emitTypingIndicator(operatorId, userPhone, isTyping) {
    if (!this.io) return;

    const conversationRoom = `conversation:${operatorId}:${userPhone}`;

    this.io.to(conversationRoom).emit('typing:user', {
      operatorId,
      userPhone,
      isTyping,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Emit presence update (online/offline).
   */
  emitPresenceUpdate(operatorId, presenceData) {
    if (!this.io) return;

    const operatorRoom = `operator:${operatorId}`;

    this.io.to(operatorRoom).emit('presence:update', {
      operatorId,
      ...presenceData,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Emit QR Code for scanning.
   */
  emitQRCode(operatorId, qrData) {
    if (!this.io) return;

    const operatorRoom = `operator:${operatorId}`;

    this.io.to(operatorRoom).emit('qr:code', {
      sessionId: qrData.sessionId,
      qr: qrData.qr,
      timestamp: qrData.timestamp || new Date().toISOString(),
    });

    logger.info(`[WebSocket] QR Code emitted: ${operatorId} - ${qrData.sessionId}`);
  }

  /**
   * Emit connection status.
   */
  emitConnectionStatus(operatorId, statusData) {
    if (!this.io) return;

    const operatorRoom = `operator:${operatorId}`;

    this.io.to(operatorRoom).emit('session:status', {
      operatorId,
      sessionId: statusData.sessionId || null,
      status: statusData.status,
      qrCode: statusData.qrCode || null,
      error: statusData.error || null,
      timestamp: new Date().toISOString(),
    });

    logger.info(`[WebSocket] Session status emitted: ${operatorId} - ${statusData.status}`);
  }

  /**
   * Emit notification to specific user.
   */
  emitNotification(userId, notification) {
    if (!this.io) return;

    const roomName = `user:${userId}`;

    this.io.to(roomName).emit('notification', {
      ...notification,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Get connection statistics.
   */
  getStats() {
    return {
      totalConnections: this.connectedClients.size,
      connectedUsers: Array.from(this.connectedClients.keys()),
    };
  }

  /**
   * Check if user is connected.
   */
  isUserConnected(userId) {
    return this.connectedClients.has(userId);
  }

  /**
   * Disconnect all clients (graceful shutdown).
   */
  async disconnectAll() {
    if (!this.io) return;

    logger.info('[WebSocket] Disconnecting all clients...');

    this.io.emit('server:shutdown', {
      message: 'Server is shutting down',
      timestamp: new Date().toISOString(),
    });

    await new Promise(resolve => setTimeout(resolve, 1000));

    this.io.close();
    logger.info('[WebSocket] All clients disconnected');
  }
}

// Singleton instance
export const socketManager = new SocketManager();
