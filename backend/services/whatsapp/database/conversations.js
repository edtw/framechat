/**
 * WhatsApp Conversations Database Layer
 * Handles all WhatsApp conversation data operations using Prisma
 */

const prisma = require('../../../core/prisma');
const logger = require('../../../core/utils/logger');
const crypto = require('crypto');

/**
 * Create or update a conversation
 *
 * @param {Object} conversationData - Conversation data
 * @param {number} conversationData.sessionId - WhatsApp session ID
 * @param {string} conversationData.remoteJid - Remote contact JID
 * @param {string} [conversationData.contactName] - Contact name
 * @param {string} [conversationData.contactNumber] - Contact phone number
 * @param {string} [conversationData.lastMessage] - Last message preview
 * @param {Date} [conversationData.lastMessageTime] - Last message timestamp
 * @param {number} operatorId - Operator ID for IDOR protection
 * @returns {Promise<Object>} Created/updated conversation
 */
async function upsertConversation(conversationData, operatorId) {
  try {
    const session = await prisma.whatsAppSession.findFirst({
      where: {
        id: conversationData.sessionId,
        operatorId,
      },
    });

    if (!session) {
      throw new Error('Session not found or unauthorized');
    }

    const chatId =
      conversationData.remoteJid ||
      conversationData.chatId ||
      conversationData.contactNumber ||
      null;

    if (!chatId) {
      throw new Error('Conversation identifier (remoteJid/chatId) is required');
    }

    const contactNumber =
      conversationData.contactNumber ||
      chatId.replace(/@.+$/, '') ||
      'unknown';

    const payload = {
      contactName: conversationData.contactName,
      contactNumber,
      lastMessage: conversationData.lastMessage,
      lastMessageTime: conversationData.lastMessageTime || new Date(),
      unreadCount: conversationData.unreadCount || 0,
    };

    const existing = await prisma.conversation.findFirst({
      where: {
        sessionId: conversationData.sessionId,
        chatId,
      },
    });

    let conversation;
    if (existing) {
      conversation = await prisma.conversation.update({
        where: { id: existing.id },
        data: payload,
        include: { session: true },
      });
    } else {
      conversation = await prisma.conversation.create({
        data: {
          id: crypto.randomUUID(),
          sessionId: conversationData.sessionId,
          chatId,
          ...payload,
        },
        include: { session: true },
      });
    }

    logger.info({
      conversationId: conversation.id,
      sessionId: conversationData.sessionId,
      operatorId,
    }, 'Conversation upserted successfully');

    return conversation;
  } catch (error) {
    logger.error({
      error: error.message,
      conversationData,
      operatorId,
    }, 'Failed to upsert conversation');
    throw error;
  }
}

/**
 * Get all conversations for a company
 *
 * @param {number} operatorId - Operator ID for IDOR protection
 * @param {Object} options - Query options
 * @param {number} [options.limit=50] - Number of conversations to return
 * @param {number} [options.offset=0] - Offset for pagination
 * @returns {Promise<Array>} Array of conversations
 */
async function getConversations(operatorId, options = {}) {
  try {
    const { limit = 50, offset = 0 } = options;

    const conversations = await prisma.conversation.findMany({
      where: {
        session: {
          operatorId,
        },
      },
      include: {
        session: true,
        _count: {
          select: {
            messages: true,
          },
        },
      },
      orderBy: {
        lastMessageTime: 'desc',
      },
      take: limit,
      skip: offset,
    });

    return conversations;
  } catch (error) {
    logger.error({
      error: error.message,
      operatorId,
    }, 'Failed to get conversations');
    throw error;
  }
}

/**
 * Get conversation by ID
 *
 * @param {number} conversationId - Conversation ID
 * @param {number} operatorId - Operator ID for IDOR protection
 * @returns {Promise<Object>} Conversation
 */
async function getConversationById(conversationId, operatorId) {
  try {
    const conversation = await prisma.conversation.findFirst({
      where: {
        id: conversationId,
        session: {
          operatorId,
        },
      },
      include: {
        session: true,
        messages: {
          orderBy: {
            timestamp: 'desc',
          },
          take: 50,
        },
      },
    });

    if (!conversation) {
      throw new Error('Conversation not found or unauthorized');
    }

    return conversation;
  } catch (error) {
    logger.error({
      error: error.message,
      conversationId,
      operatorId,
    }, 'Failed to get conversation');
    throw error;
  }
}

/**
 * Mark conversation as read
 *
 * @param {number} conversationId - Conversation ID
 * @param {number} operatorId - Operator ID for IDOR protection
 * @returns {Promise<Object>} Updated conversation
 */
async function markConversationAsRead(conversationId, operatorId) {
  try {
    // Verify conversation belongs to company
    const conversation = await prisma.conversation.findFirst({
      where: {
        id: conversationId,
        session: {
          operatorId,
        },
      },
    });

    if (!conversation) {
      throw new Error('Conversation not found or unauthorized');
    }

    const updated = await prisma.conversation.update({
      where: {
        id: conversationId,
      },
      data: {
        unreadCount: 0,
      },
    });

    logger.info({
      conversationId,
      operatorId,
    }, 'Conversation marked as read');

    return updated;
  } catch (error) {
    logger.error({
      error: error.message,
      conversationId,
      operatorId,
    }, 'Failed to mark conversation as read');
    throw error;
  }
}

/**
 * Get conversations by session
 *
 * @param {string} sessionId - WhatsApp session ID
 * @param {number} operatorId - Operator ID for IDOR protection
 * @returns {Promise<Array>} Array of conversations
 */
async function getConversationsBySession(sessionId, operatorId) {
  try {
    const conversations = await prisma.conversation.findMany({
      where: {
        session: {
          id: sessionId,
          operatorId,
        },
      },
      include: {
        session: true,
        _count: {
          select: {
            messages: true,
          },
        },
      },
      orderBy: {
        lastMessageTime: 'desc',
      },
    });

    return conversations;
  } catch (error) {
    logger.error({
      error: error.message,
      sessionId,
      operatorId,
    }, 'Failed to get conversations by session');
    throw error;
  }
}

/**
 * Get conversation by phone number
 *
 * @param {string} sessionId - WhatsApp session ID
 * @param {string} userPhone - User phone number
 * @param {number} operatorId - Operator ID for IDOR protection
 * @returns {Promise<Object|null>} Conversation or null
 */
async function getConversationByPhone(sessionId, userPhone, operatorId) {
  try {
    const conversation = await prisma.conversation.findFirst({
      where: {
        session: {
          id: sessionId,
          operatorId,
        },
        OR: [
          { remoteJid: { contains: userPhone } },
          { contactNumber: userPhone },
        ],
      },
      include: {
        session: true,
      },
    });

    return conversation;
  } catch (error) {
    logger.error({
      error: error.message,
      sessionId,
      userPhone,
      operatorId,
    }, 'Failed to get conversation by phone');
    throw error;
  }
}

/**
 * Take over a conversation (switch from AI to human)
 *
 * @param {string} sessionId - WhatsApp session ID
 * @param {string} userPhone - User phone number
 * @param {string} operatorName - Name of operator taking over
 * @param {number} operatorId - Operator ID for IDOR protection
 * @returns {Promise<Object>} Updated conversation
 */
async function takeover(sessionId, userPhone, operatorName, operatorId) {
  try {
    const conversation = await getConversationByPhone(sessionId, userPhone, operatorId);

    if (!conversation) {
      throw new Error('Conversation not found or unauthorized');
    }

    const updated = await prisma.conversation.update({
      where: {
        id: conversation.id,
      },
      data: {
        taken_over_by: operatorName,
        taken_over_at: new Date(),
      },
    });

    logger.info({
      conversationId: conversation.id,
      operatorName,
      operatorId,
    }, 'Conversation taken over');

    return updated;
  } catch (error) {
    logger.error({
      error: error.message,
      sessionId,
      userPhone,
      operatorId,
    }, 'Failed to takeover conversation');
    throw error;
  }
}

/**
 * Return conversation to AI
 *
 * @param {string} sessionId - WhatsApp session ID
 * @param {string} userPhone - User phone number
 * @param {number} operatorId - Operator ID for IDOR protection
 * @returns {Promise<Object>} Updated conversation
 */
async function returnToAI(sessionId, userPhone, operatorId) {
  try {
    const conversation = await getConversationByPhone(sessionId, userPhone, operatorId);

    if (!conversation) {
      throw new Error('Conversation not found or unauthorized');
    }

    const updated = await prisma.conversation.update({
      where: {
        id: conversation.id,
      },
      data: {
        taken_over_by: null,
        taken_over_at: null,
      },
    });

    logger.info({
      conversationId: conversation.id,
      operatorId,
    }, 'Conversation returned to AI');

    return updated;
  } catch (error) {
    logger.error({
      error: error.message,
      sessionId,
      userPhone,
      operatorId,
    }, 'Failed to return conversation to AI');
    throw error;
  }
}

module.exports = {
  upsertConversation,
  getConversations,
  getConversationById,
  markConversationAsRead,
  getConversationsBySession,
  getConversationByPhone,
  takeover,
  returnToAI,
};
