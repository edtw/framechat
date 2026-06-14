/**
 * WhatsApp Sessions Database Layer
 * Handles all WhatsApp session data operations using Prisma
 */

const prisma = require('../../../core/prisma');
const logger = require('../../../core/utils/logger');

const normalizeSession = (session) => {
  if (!session) return null;
  const { _count, agentConfig, ...rest } = session;
  const statusValue = typeof rest.status === 'string'
    ? rest.status.toLowerCase()
    : rest.status;

  return {
    ...rest,
    sessionId: rest.sessionId || rest.id,
    sessionName: rest.name,
    status: statusValue,
    messageCount: rest.messageCount ?? _count?.conversations ?? 0,
    aiEnabled: agentConfig?.enabled ?? false, // Include AI enabled status
  };
};

/**
 * Create a new WhatsApp session
 *
 * @param {Object} sessionData - Session data
 * @param {string} sessionData.sessionId - Unique session ID
 * @param {string} sessionData.name - Session name
 * @param {number} sessionData.operatorId - Operator ID
 * @param {string} [sessionData.status='DISCONNECTED'] - Session status
 * @returns {Promise<Object>} Created session
 */
async function createSession(sessionData) {
  try {
    // Check if session already exists for this company
    const existing = await prisma.whatsAppSession.findFirst({
      where: {
        id: sessionData.sessionId,
        operatorId: sessionData.operatorId,
      },
      include: {
        operator: true,
      },
    });

    if (existing) {
      logger.info({
        sessionId: existing.id,
        operatorId: existing.operatorId,
        status: existing.status,
      }, 'WhatsApp session already exists, returning existing session');

      // If session exists but is disconnected, update status to CONNECTING
      if (existing.status === 'DISCONNECTED' || existing.status === 'ERROR') {
        const updated = await prisma.whatsAppSession.update({
          where: { id: existing.id },
          data: {
            status: 'CONNECTING',
            updatedAt: new Date(),
          },
          include: {
            operator: true,
          },
        });
        return normalizeSession(updated);
      }

      return normalizeSession(existing);
    }

    const session = await prisma.whatsAppSession.create({
      data: {
        id: sessionData.sessionId,
        name: sessionData.name,
        operatorId: sessionData.operatorId,
        status: sessionData.status || 'DISCONNECTED',
      },
      include: {
        operator: true,
      },
    });

    logger.info({
      sessionId: session.id,
      operatorId: session.operatorId,
    }, 'WhatsApp session created');

    return normalizeSession(session);
  } catch (error) {
    if (error.code === 'P2002') {
      logger.warn({
        sessionId: sessionData.sessionId,
        operatorId: sessionData.operatorId,
      }, 'Attempted to create duplicate WhatsApp session');
      const dupError = new Error('Session already exists');
      dupError.status = 409;
      throw dupError;
    }

    logger.error({
      error: error.message,
      sessionData,
    }, 'Failed to create session');
    throw error;
  }
}

/**
 * Update session status
 *
 * @param {string} sessionId - Session ID
 * @param {string} status - New status (CONNECTED, DISCONNECTED, CONNECTING, QR_READY, RECONNECTING, ERROR)
 * @param {number} operatorId - Operator ID for IDOR protection
 * @returns {Promise<Object>} Updated session
 */
async function updateSessionStatus(sessionId, status, operatorId) {
  try {
    const session = await prisma.whatsAppSession.findFirst({
      where: {
        id: sessionId,
        operatorId,
      },
    });

    if (!session) {
      throw new Error('Session not found or unauthorized');
    }

    const updated = await prisma.whatsAppSession.update({
      where: {
        id: session.id,
      },
      data: {
        status,
        updatedAt: new Date(),
      },
    });

    logger.info({
      sessionId,
      status,
      operatorId,
    }, 'Session status updated');

    return normalizeSession(updated);
  } catch (error) {
    logger.error({
      error: error.message,
      sessionId,
      status,
      operatorId,
    }, 'Failed to update session status');
    throw error;
  }
}

async function updateSessionQRCode(sessionId, qrCode, operatorId) {
  try {
    const session = await prisma.whatsAppSession.findFirst({
      where: {
        id: sessionId,
        operatorId,
      },
    });

    if (!session) {
      throw new Error('Session not found or unauthorized');
    }

    const data = {
      qrCode,
    };

    if (qrCode) {
      data.status = 'QR_READY';
    }

    const updated = await prisma.whatsAppSession.update({
      where: {
        id: session.id,
      },
      data,
    });

    logger.info({
      sessionId,
      operatorId,
      hasQr: !!qrCode,
    }, 'Session QR updated');

    return normalizeSession(updated);
  } catch (error) {
    logger.error({
      error: error.message,
      sessionId,
      operatorId,
    }, 'Failed to update session QR');
    throw error;
  }
}

/**
 * Get all sessions for a company
 *
 * @param {number} operatorId - Operator ID for IDOR protection
 * @returns {Promise<Array>} Array of sessions
 */
async function getSessions(operatorId) {
  try {
    const sessions = await prisma.whatsAppSession.findMany({
      where: {
        operatorId,
      },
      include: {
        _count: {
          select: {
            conversations: true,
          },
        },
        agentConfig: true, // Include AI configuration (correct field name)
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return sessions.map((session) => normalizeSession(session));
  } catch (error) {
    logger.error({
      error: error.message,
      operatorId,
    }, 'Failed to get sessions');
    throw error;
  }
}

/**
 * Get session by ID
 *
 * @param {string} sessionId - Session ID
 * @param {number} operatorId - Operator ID for IDOR protection
 * @returns {Promise<Object>} Session
 */
async function getSessionById(sessionId, operatorId) {
  try {
    const session = await prisma.whatsAppSession.findFirst({
      where: {
        id: sessionId,
        operatorId,
      },
      include: {
        operator: true,
        conversations: {
          orderBy: {
            lastMessageTime: 'desc',
          },
          take: 10,
        },
      },
    });

    if (!session) {
      throw new Error('Session not found or unauthorized');
    }

    return normalizeSession(session);
  } catch (error) {
    logger.error({
      error: error.message,
      sessionId,
      operatorId,
    }, 'Failed to get session');
    throw error;
  }
}

/**
 * Delete session
 *
 * @param {string} sessionId - Session ID
 * @param {number} operatorId - Operator ID for IDOR protection
 * @returns {Promise<Object>} Deleted session
 */
async function deleteSession(sessionId, operatorId) {
  try {
    // Verify session belongs to company
    const session = await prisma.whatsAppSession.findFirst({
      where: {
        id: sessionId,
        operatorId,
      },
    });

    if (!session) {
      throw new Error('Session not found or unauthorized');
    }

    const deleted = await prisma.whatsAppSession.delete({
      where: {
        id: session.id,
      },
    });

    logger.info({
      sessionId,
      operatorId,
    }, 'Session deleted');

    return normalizeSession(deleted);
  } catch (error) {
    logger.error({
      error: error.message,
      sessionId,
      operatorId,
    }, 'Failed to delete session');
    throw error;
  }
}

module.exports = {
  createSession,
  updateSessionStatus,
  updateSessionQRCode,
  getSessions,
  getSessionById,
  deleteSession,
};
