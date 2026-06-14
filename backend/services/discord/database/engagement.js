/**
 * Discord Engagement Database Layer
 * Proactive engagement targets (servers) + approval queue items.
 */

const prisma = require('../../../core/prisma');
const logger = require('../../../core/utils/logger');

// ==================== TARGETS ====================

async function upsertTarget(data) {
  const {
    operatorId,
    accountId,
    guildId,
    guildName = null,
    inviteCode = null,
    status,
    relevanceScore = null,
    keywords = null,
  } = data;

  return prisma.engagementTarget.upsert({
    where: { accountId_guildId: { accountId, guildId } },
    create: {
      operatorId, accountId, guildId, guildName, inviteCode,
      status: status || 'DISCOVERED', relevanceScore, keywords,
    },
    update: {
      guildName: guildName ?? undefined,
      inviteCode: inviteCode ?? undefined,
      status: status ?? undefined,
      relevanceScore: relevanceScore ?? undefined,
      keywords: keywords ?? undefined,
    },
  });
}

async function getTargets(operatorId, { accountId, status } = {}) {
  return prisma.engagementTarget.findMany({
    where: {
      operatorId,
      ...(accountId ? { accountId } : {}),
      ...(status ? { status } : {}),
    },
    orderBy: [{ relevanceScore: 'desc' }, { createdAt: 'desc' }],
  });
}

async function updateTargetStatus(id, operatorId, status, meta = {}) {
  const target = await prisma.engagementTarget.findFirst({ where: { id, operatorId } });
  if (!target) {
    const err = new Error('Engagement target not found or unauthorized');
    err.status = 404;
    throw err;
  }
  const data = { status };
  if (meta.joinedAt !== undefined) data.joinedAt = meta.joinedAt ? new Date(meta.joinedAt) : null;
  if (meta.lastEngagedAt !== undefined) data.lastEngagedAt = meta.lastEngagedAt ? new Date(meta.lastEngagedAt) : null;
  return prisma.engagementTarget.update({ where: { id: target.id }, data });
}

// ==================== APPROVAL QUEUE ====================

async function createQueueItem(data) {
  const item = await prisma.engagementQueueItem.create({
    data: {
      operatorId: data.operatorId,
      accountId: data.accountId,
      guildId: data.guildId || null,
      guildName: data.guildName || null,
      channelId: data.channelId,
      channelName: data.channelName || null,
      triggerMessageId: data.triggerMessageId || null,
      triggerContext: data.triggerContext || null,
      proposedMessage: data.proposedMessage,
      relevanceScore: data.relevanceScore ?? null,
      status: 'PENDING',
    },
  });
  logger.info({ itemId: item.id, accountId: data.accountId }, 'Engagement queue item created');
  return item;
}

async function getQueueItems(operatorId, { status = 'PENDING', accountId, limit = 50 } = {}) {
  return prisma.engagementQueueItem.findMany({
    where: {
      operatorId,
      ...(status ? { status } : {}),
      ...(accountId ? { accountId } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: Math.min(200, limit),
  });
}

async function reviewQueueItem(id, operatorId, { status, reviewedBy, proposedMessage, rejectionReason }) {
  const item = await prisma.engagementQueueItem.findFirst({ where: { id, operatorId } });
  if (!item) {
    const err = new Error('Queue item not found or unauthorized');
    err.status = 404;
    throw err;
  }
  const data = {};
  if (status) data.status = status;
  if (reviewedBy !== undefined) data.reviewedBy = reviewedBy;
  if (proposedMessage !== undefined) data.proposedMessage = proposedMessage;
  if (rejectionReason !== undefined) data.rejectionReason = rejectionReason;
  return prisma.engagementQueueItem.update({ where: { id: item.id }, data });
}

/** Internal: mark an item sent/failed after the discord-service posts it. */
async function markQueueItemResult(id, { status, sentAt }) {
  const data = { status };
  if (sentAt !== undefined) data.sentAt = sentAt ? new Date(sentAt) : new Date();
  return prisma.engagementQueueItem.update({ where: { id }, data });
}

/** Internal: items that have been approved and are ready for the service to send. */
async function getApprovedItems(accountId, limit = 10) {
  return prisma.engagementQueueItem.findMany({
    where: { accountId, status: 'APPROVED' },
    orderBy: { updatedAt: 'asc' },
    take: Math.min(50, limit),
  });
}

module.exports = {
  upsertTarget,
  getTargets,
  updateTargetStatus,
  createQueueItem,
  getQueueItems,
  reviewQueueItem,
  markQueueItemResult,
  getApprovedItems,
};
