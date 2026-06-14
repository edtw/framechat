/**
 * Discord Accounts Database Layer
 * Handles DiscordAccount + DiscordAgentConfig operations using Prisma.
 *
 * Security: the Discord user token is stored encrypted (AES-256-GCM) and is
 * NEVER returned to public/frontend callers. Only getDecryptedToken (used by
 * the internal service route) exposes the plaintext token.
 */

const prisma = require('../../../core/prisma');
const logger = require('../../../core/utils/logger');
const { encrypt, decrypt } = require('../../../core/utils/encryption');

/**
 * Strip sensitive fields and expose only safe account data to the frontend.
 */
const toPublicAccount = (account) => {
  if (!account) return null;
  const { encryptedToken, agentConfig, ...rest } = account;
  return {
    ...rest,
    status: typeof rest.status === 'string' ? rest.status.toLowerCase() : rest.status,
    hasToken: !!encryptedToken,
    aiEnabled: agentConfig?.enabled ?? false,
    engagementEnabled: agentConfig?.engagementEnabled ?? false,
  };
};

async function createAccount({ operatorId, name, token }) {
  if (!token) {
    const err = new Error('Discord token is required');
    err.status = 400;
    throw err;
  }

  const account = await prisma.discordAccount.create({
    data: {
      operatorId,
      name,
      encryptedToken: encrypt(token),
      status: 'DISCONNECTED',
      agentConfig: {
        create: { operatorId, enabled: false },
      },
    },
    include: { agentConfig: true },
  });

  logger.info({ accountId: account.id, operatorId }, 'Discord account created');
  return toPublicAccount(account);
}

async function getAccounts(operatorId) {
  const accounts = await prisma.discordAccount.findMany({
    where: { operatorId },
    include: { agentConfig: true, _count: { select: { conversations: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return accounts.map(toPublicAccount);
}

async function getAccountById(id, operatorId) {
  const account = await prisma.discordAccount.findFirst({
    where: { id, operatorId },
    include: { agentConfig: true },
  });
  if (!account) {
    const err = new Error('Discord account not found or unauthorized');
    err.status = 404;
    throw err;
  }
  return toPublicAccount(account);
}

/**
 * Internal-only: return the decrypted token for the discord-service to connect.
 * operatorId is optional here because the internal service is already trusted,
 * but when provided it is enforced for defense in depth.
 */
async function getDecryptedToken(id, operatorId = null) {
  const where = operatorId ? { id, operatorId } : { id };
  const account = await prisma.discordAccount.findFirst({ where });
  if (!account) {
    const err = new Error('Discord account not found');
    err.status = 404;
    throw err;
  }
  return decrypt(account.encryptedToken);
}

async function updateToken(id, operatorId, token) {
  const account = await prisma.discordAccount.findFirst({ where: { id, operatorId } });
  if (!account) {
    const err = new Error('Discord account not found or unauthorized');
    err.status = 404;
    throw err;
  }
  const updated = await prisma.discordAccount.update({
    where: { id: account.id },
    data: { encryptedToken: encrypt(token), status: 'DISCONNECTED', lastError: null },
    include: { agentConfig: true },
  });
  return toPublicAccount(updated);
}

async function updateAccountStatus(id, status, meta = {}) {
  const data = { status };
  if (meta.discordUserId !== undefined) data.discordUserId = meta.discordUserId;
  if (meta.username !== undefined) data.username = meta.username;
  if (meta.avatarUrl !== undefined) data.avatarUrl = meta.avatarUrl;
  if (meta.lastError !== undefined) data.lastError = meta.lastError;

  const updated = await prisma.discordAccount.update({
    where: { id },
    data,
    include: { agentConfig: true },
  });
  logger.info({ accountId: id, status }, 'Discord account status updated');
  return toPublicAccount(updated);
}

async function deleteAccount(id, operatorId) {
  const account = await prisma.discordAccount.findFirst({ where: { id, operatorId } });
  if (!account) {
    const err = new Error('Discord account not found or unauthorized');
    err.status = 404;
    throw err;
  }
  await prisma.discordAccount.delete({ where: { id: account.id } });
  logger.info({ accountId: id, operatorId }, 'Discord account deleted');
  return { id, deleted: true };
}

// ==================== AGENT CONFIG ====================

async function getAgentConfig(accountId) {
  return prisma.discordAgentConfig.findUnique({ where: { accountId } });
}

async function upsertAgentConfig(accountId, operatorId, config = {}) {
  const data = {
    enabled: config.enabled,
    maxTokens: config.maxTokens,
    temperature: config.temperature,
    agentConfig: config.agentConfig,
    replyToDms: config.replyToDms,
    replyToMentions: config.replyToMentions,
    scope: config.scope,
    engagementEnabled: config.engagementEnabled,
    engagementPlan: config.engagementPlan,
  };
  // Drop undefined so partial updates don't overwrite existing values
  Object.keys(data).forEach((k) => data[k] === undefined && delete data[k]);

  const saved = await prisma.discordAgentConfig.upsert({
    where: { accountId },
    create: { accountId, operatorId, ...data },
    update: data,
  });
  logger.info({ accountId, operatorId }, 'Discord agent config saved');
  return saved;
}

// ==================== SELF SIGNATURE ====================

async function getSelfSignature(accountId) {
  const account = await prisma.discordAccount.findUnique({
    where: { id: accountId },
    select: { id: true, selfSignature: true, selfSignatureUpdatedAt: true },
  });
  if (!account) return null;
  return {
    signature: account.selfSignature,
    updatedAt: account.selfSignatureUpdatedAt,
  };
}

async function saveSelfSignature(accountId, signature) {
  const updated = await prisma.discordAccount.update({
    where: { id: accountId },
    data: {
      selfSignature: signature,
      selfSignatureUpdatedAt: new Date(),
    },
  });
  logger.info({ accountId }, 'Self-signature saved');
  return {
    signature: updated.selfSignature,
    updatedAt: updated.selfSignatureUpdatedAt,
  };
}

module.exports = {
  toPublicAccount,
  createAccount,
  getAccounts,
  getAccountById,
  getDecryptedToken,
  updateToken,
  updateAccountStatus,
  deleteAccount,
  getAgentConfig,
  upsertAgentConfig,
  getSelfSignature,
  saveSelfSignature,
};
