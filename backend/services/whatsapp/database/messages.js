/**
 * WhatsApp Messages Database Layer
 * Handles all WhatsApp message data operations using Prisma
 */

const prisma = require('../../../core/prisma');
const logger = require('../../../core/utils/logger');

/**
 * Store a new WhatsApp message
 *
 * @param {Object} messageData - Message data
 * @param {string} messageData.conversationId - Conversation ID
 * @param {boolean} messageData.fromMe - Whether message is from us (true) or contact (false)
 * @param {string} messageData.body - Message content
 * @param {string} [messageData.messageType='TEXT'] - Message type (TEXT, IMAGE, etc.)
 * @param {string} [messageData.mediaUrl] - Media URL if applicable
 * @param {string} [messageData.sentiment] - Sentiment analysis result
 * @param {string} [messageData.intent] - Detected intent
 * @param {number} operatorId - Operator ID for IDOR protection
 * @returns {Promise<Object>} Created message
 */
async function storeMessage(messageData, operatorId) {
  try {
    // Verify conversation belongs to company (IDOR protection)
    const conversation = await prisma.conversation.findFirst({
      where: {
        id: messageData.conversationId,
        session: {
          operatorId,
        },
      },
    });

    if (!conversation) {
      throw new Error('Conversation not found or unauthorized');
    }

    // Generate a unique ID for the message
    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const message = await prisma.message.create({
      data: {
        id: messageId,
        conversationId: messageData.conversationId,
        fromMe: messageData.fromMe,
        body: messageData.body,
        messageType: messageData.messageType || 'TEXT',
        mediaUrl: messageData.mediaUrl || null,
        timestamp: messageData.timestamp || new Date(),
        sentiment: messageData.sentiment || null,
        intent: messageData.intent || null,
      },
      include: {
        conversation: {
          include: {
            session: true,
          },
        },
      },
    });

    logger.info({
      messageId: message.id,
      conversationId: message.conversationId,
      operatorId,
    }, 'Message stored successfully');

    return message;
  } catch (error) {
    logger.error({
      error: error.message,
      messageData,
      operatorId,
    }, 'Failed to store message');
    throw error;
  }
}

/**
 * Get messages for a conversation
 *
 * @param {number} conversationId - Conversation ID
 * @param {number} operatorId - Operator ID for IDOR protection
 * @param {Object} options - Query options
 * @param {number} [options.limit=50] - Number of messages to return
 * @param {number} [options.offset=0] - Offset for pagination
 * @returns {Promise<Array>} Array of messages
 */
async function getMessages(conversationId, operatorId, options = {}) {
  try {
    const { limit = 50, offset = 0 } = options;

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

    const messages = await prisma.message.findMany({
      where: {
        conversationId,
      },
      orderBy: {
        timestamp: 'desc',
      },
      take: limit,
      skip: offset,
    });

    return messages;
  } catch (error) {
    logger.error({
      error: error.message,
      conversationId,
      operatorId,
    }, 'Failed to get messages');
    throw error;
  }
}

/**
 * Search messages
 *
 * @param {string} query - Search query
 * @param {number} operatorId - Operator ID for IDOR protection
 * @param {Object} options - Search options
 * @returns {Promise<Array>} Array of matching messages
 */
async function searchMessages(query, operatorId, options = {}) {
  try {
    const { limit = 50, offset = 0 } = options;

    const messages = await prisma.message.findMany({
      where: {
        conversation: {
          session: {
            operatorId,
          },
        },
        message: {
          contains: query,
          mode: 'insensitive',
        },
      },
      include: {
        conversation: {
          include: {
            session: true,
          },
        },
      },
      orderBy: {
        timestamp: 'desc',
      },
      take: limit,
      skip: offset,
    });

    return messages;
  } catch (error) {
    logger.error({
      error: error.message,
      query,
      operatorId,
    }, 'Failed to search messages');
    throw error;
  }
}

module.exports = {
  storeMessage,
  getMessages,
  searchMessages,
  storeMessagesBatch,
};

/**
 * Batch store messages
 * 
 * @param {Array} messages - Array of message objects
 * @param {string} sessionId - Session ID
 * @param {number} operatorId - Operator ID
 */
async function storeMessagesBatch(messages, sessionId, operatorId) {
  if (!messages || messages.length === 0) return;

  try {
    // 1. Ensure conversations exist for all messages
    // We can't easily do this in one query if we need to create them.
    // For performance, we'll group by remoteJid.
    const messagesByJid = messages.reduce((acc, msg) => {
      if (!acc[msg.remoteJid]) acc[msg.remoteJid] = [];
      acc[msg.remoteJid].push(msg);
      return acc;
    }, {});

    await prisma.$transaction(async (tx) => {
      for (const [remoteJid, msgs] of Object.entries(messagesByJid)) {
        // Find or create conversation
        // We need the conversation ID for the messages
        
        // Try to find existing conversation
        let conversation = await tx.conversation.findFirst({
            where: {
                sessionId,
                remoteJid
            }
        });

        if (!conversation) {
            // Create new conversation
            // We might not have contact info here, so we use placeholders
            conversation = await tx.conversation.create({
                data: {
                    id: `conv_${sessionId}_${remoteJid}`, // Deterministic ID if possible, or uuid
                    sessionId,
                    chatId: remoteJid, // Usually same as remoteJid for 1:1
                    remoteJid,
                    contactNumber: remoteJid.split('@')[0],
                    // operatorId is inferred from session
                }
            });
        }

        // Now insert messages
        // We use createMany for performance
        const messagesData = msgs.map(msg => ({
            id: msg.id, // Use ID provided by WhatsApp
            conversationId: conversation.id,
            fromMe: msg.fromMe,
            body: msg.body,
            messageType: msg.messageType || 'TEXT',
            timestamp: new Date(msg.timestamp * 1000), // Convert unix timestamp
            status: msg.status || 'DELIVERED', // Default to delivered for history
            // mediaUrl, sentiment, intent left null for history sync
        }));

        // createMany is not supported for SQLite, but we are using Postgres.
        // However, we should use skipDuplicates to avoid errors if we sync same history twice.
        await tx.message.createMany({
            data: messagesData,
            skipDuplicates: true
        });
      }
    });

    logger.info({ 
      count: messages.length, 
      sessionId, 
      operatorId 
    }, 'Messages batch stored successfully');

  } catch (error) {
    logger.error({ 
      error: error.message, 
      sessionId, 
      operatorId 
    }, 'Failed to batch store messages');
    throw error;
  }
}
