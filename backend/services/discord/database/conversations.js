/**
 * Discord Conversations Database Layer
 * One conversation per (account, channel) — a DM channel or a guild text channel.
 */

const prisma = require('../../../core/prisma');
const logger = require('../../../core/utils/logger');

async function upsertConversation(data) {
  const {
    accountId,
    channelId,
    guildId = null,
    channelType = 'DM',
    contactDiscordId = null,
    contactName = null,
    lastMessage = null,
    lastMessageTime = null,
    source = 'REACTIVE',
    unreadCount,
  } = data;

  const conversation = await prisma.discordConversation.upsert({
    where: { accountId_channelId: { accountId, channelId } },
    create: {
      accountId,
      channelId,
      guildId,
      channelType,
      contactDiscordId,
      contactName,
      lastMessage,
      lastMessageTime: lastMessageTime ? new Date(lastMessageTime) : null,
      source,
      unreadCount: unreadCount ?? 1,
    },
    update: {
      contactName: contactName ?? undefined,
      lastMessage: lastMessage ?? undefined,
      lastMessageTime: lastMessageTime ? new Date(lastMessageTime) : undefined,
      unreadCount: unreadCount !== undefined ? unreadCount : { increment: 1 },
    },
  });

  return conversation;
}

async function getConversations(accountId, operatorId) {
  // operatorId enforced via the account relation
  return prisma.discordConversation.findMany({
    where: { accountId, account: { operatorId } },
    orderBy: { lastMessageTime: 'desc' },
    take: 100,
  });
}

async function getConversationById(id, operatorId) {
  const conversation = await prisma.discordConversation.findFirst({
    where: { id, account: { operatorId } },
    include: {
      messages: { orderBy: { timestamp: 'asc' }, take: 50 },
    },
  });
  if (!conversation) {
    const err = new Error('Conversation not found or unauthorized');
    err.status = 404;
    throw err;
  }
  return conversation;
}

async function setBotActive(id, operatorId, isBotActive) {
  const conversation = await prisma.discordConversation.findFirst({
    where: { id, account: { operatorId } },
  });
  if (!conversation) {
    const err = new Error('Conversation not found or unauthorized');
    err.status = 404;
    throw err;
  }
  return prisma.discordConversation.update({
    where: { id: conversation.id },
    data: { isBotActive },
  });
}

/**
 * Get messages for a conversation with cursor-based pagination.
 * @param {string} conversationId
 * @param {number} operatorId
 * @param {object} [opts]
 * @param {number} [opts.limit=50]
 * @param {string} [opts.before] - messageId cursor
 * @returns {{ messages: object[], hasMore: boolean }}
 */
async function getMessages(conversationId, operatorId, opts = {}) {
  const limit = Math.min(Math.max(parseInt(opts.limit) || 50, 1), 200);
  const { before } = opts;

  // Verify conversation exists and belongs to this operator
  const conversation = await prisma.discordConversation.findFirst({
    where: { id: conversationId, account: { operatorId } },
  });
  if (!conversation) {
    const err = new Error('Conversation not found or unauthorized');
    err.status = 404;
    throw err;
  }

  // Build where clause
  const where = { conversationId };
  if (before) {
    // Resolve the cursor message to get its timestamp
    const cursorMessage = await prisma.discordMessage.findUnique({
      where: { id: before },
      select: { timestamp: true },
    });
    if (cursorMessage) {
      where.timestamp = { lt: cursorMessage.timestamp };
    }
  }

  // Fetch one extra to determine hasMore
  const messages = await prisma.discordMessage.findMany({
    where,
    orderBy: { timestamp: 'desc' },
    take: limit + 1,
    select: {
      id: true,
      fromMe: true,
      body: true,
      messageType: true,
      timestamp: true,
      aiProcessed: true,
    },
  });

  const hasMore = messages.length > limit;
  if (hasMore) messages.pop();

  return { messages, hasMore };
}

/**
 * List conversations for an account with pagination and optional channelType filter.
 * Returns summary fields with message count and hasSignature derived from cached data.
 */
async function getConversationsForAccount(accountId, operatorId, opts = {}) {
  const { limit = 50, offset = 0, channelType } = opts;

  const where = { accountId, account: { operatorId } };
  if (channelType) {
    where.channelType = channelType;
  }

  const conversations = await prisma.discordConversation.findMany({
    where,
    orderBy: { lastMessageTime: { sort: 'desc', nulls: 'last' } },
    take: Math.min(limit, 200),
    skip: offset,
    include: {
      _count: { select: { messages: true } },
    },
  });

  return conversations.map((c) => ({
    id: c.id,
    channelId: c.channelId,
    channelType: c.channelType,
    guildId: c.guildId,
    guildName: null, // not stored on conversation yet; resolve from guild cache when available
    contactName: c.contactName,
    contactDiscordId: c.contactDiscordId,
    lastMessage: c.lastMessage,
    lastMessageTime: c.lastMessageTime,
    messageCount: c._count.messages,
    hasSignature: c.writingSignature !== null,
    takeoverActive: c.takeoverActive,
    source: c.source,
  }));
}

/**
 * Get a single conversation by id with full details including messages,
 * total message count, and the cached writing signature.
 */
async function getConversationByIdFull(id, operatorId) {
  const conversation = await prisma.discordConversation.findFirst({
    where: { id, account: { operatorId } },
    include: {
      messages: { orderBy: { timestamp: 'asc' }, take: 100 },
      _count: { select: { messages: true } },
    },
  });

  if (!conversation) {
    const err = new Error('Conversation not found or unauthorized');
    err.status = 404;
    throw err;
  }

  const { _count, ...rest } = conversation;
  return {
    ...rest,
    messageCount: _count.messages,
    hasSignature: conversation.writingSignature !== null,
  };
}

/**
 * Set takeover mode on a conversation (operator takes manual control).
 * @param {string} id - conversation id
 * @param {number} operatorId
 * @param {boolean} active - true = takeover active (AI paused), false = release back to AI
 */
async function setTakeover(id, operatorId, active) {
  const conversation = await prisma.discordConversation.findFirst({
    where: { id, account: { operatorId } },
  });
  if (!conversation) {
    const err = new Error('Conversation not found or unauthorized');
    err.status = 404;
    throw err;
  }
  return prisma.discordConversation.update({
    where: { id: conversation.id },
    data: { takeoverActive: active },
  });
}

/**
 * Get takeover status for a conversation (internal, no operatorId gate).
 * @param {string} id - conversation id
 * @returns {{ takeoverActive: boolean }}
 */
async function getTakeoverStatus(id) {
  const conversation = await prisma.discordConversation.findUnique({
    where: { id },
    select: { takeoverActive: true },
  });
  if (!conversation) {
    const err = new Error('Conversation not found');
    err.status = 404;
    throw err;
  }
  return { takeoverActive: conversation.takeoverActive };
}

module.exports = {
  upsertConversation,
  getConversations,
  getConversationById,
  setBotActive,
  getMessages,
  getConversationsForAccount,
  getConversationByIdFull,
  setTakeover,
  getTakeoverStatus,
};
