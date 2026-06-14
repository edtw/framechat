/**
 * Discord Messages Database Layer
 */

const prisma = require('../../../core/prisma');

const VALID_TYPES = new Set(['TEXT', 'IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT']);

async function storeMessage(data) {
  const {
    conversationId,
    fromMe,
    body,
    messageType = 'TEXT',
    timestamp,
    intent = null,
    aiProcessed = false,
  } = data;

  const message = await prisma.discordMessage.create({
    data: {
      conversationId,
      fromMe: !!fromMe,
      body: body || null,
      messageType: VALID_TYPES.has(messageType) ? messageType : 'TEXT',
      timestamp: timestamp ? new Date(timestamp) : new Date(),
      intent,
      aiProcessed,
    },
  });

  return message;
}

module.exports = { storeMessage };
