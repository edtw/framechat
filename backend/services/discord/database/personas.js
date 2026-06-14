/**
 * Discord Personas Database Layer
 *
 * CRUD for roleplay personas (characters the AI can assume).
 * Also manages assigning a persona to a Discord account so replies
 * come from the chosen character.
 *
 * No content restrictions — the systemPrompt defines whatever
 * character/role the operator wants.
 */

const prisma = require('../../../core/prisma');
const logger = require('../../../core/utils/logger');

// ==================== PERSONA CRUD ====================

async function createPersona(operatorId, data) {
  const { name, description, systemPrompt, avatarUrl } = data;

  if (!name || !systemPrompt) {
    const err = new Error('name and systemPrompt are required');
    err.status = 400;
    throw err;
  }

  const persona = await prisma.persona.create({
    data: {
      operatorId,
      name,
      description: description || null,
      systemPrompt,
      avatarUrl: avatarUrl || null,
    },
  });

  logger.info({ personaId: persona.id, operatorId, name }, 'Persona created');
  return persona;
}

async function getPersonas(operatorId) {
  return prisma.persona.findMany({
    where: { operatorId },
    orderBy: { createdAt: 'desc' },
    include: {
      _count: { select: { agentConfigs: true } },
    },
  });
}

async function getPersona(id, operatorId) {
  const persona = await prisma.persona.findFirst({
    where: { id, operatorId },
    include: {
      _count: { select: { agentConfigs: true } },
    },
  });
  if (!persona) {
    const err = new Error('Persona not found or unauthorized');
    err.status = 404;
    throw err;
  }
  return persona;
}

async function updatePersona(id, operatorId, data) {
  const persona = await prisma.persona.findFirst({
    where: { id, operatorId },
  });
  if (!persona) {
    const err = new Error('Persona not found or unauthorized');
    err.status = 404;
    throw err;
  }

  const updateData = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.systemPrompt !== undefined) updateData.systemPrompt = data.systemPrompt;
  if (data.avatarUrl !== undefined) updateData.avatarUrl = data.avatarUrl;
  if (data.isActive !== undefined) updateData.isActive = data.isActive;

  const updated = await prisma.persona.update({
    where: { id: persona.id },
    data: updateData,
  });

  logger.info({ personaId: id, operatorId }, 'Persona updated');
  return updated;
}

async function deletePersona(id, operatorId) {
  const persona = await prisma.persona.findFirst({
    where: { id, operatorId },
  });
  if (!persona) {
    const err = new Error('Persona not found or unauthorized');
    err.status = 404;
    throw err;
  }

  // Unlink this persona from any Discord account using it
  await prisma.discordAgentConfig.updateMany({
    where: { personaId: id },
    data: { personaId: null },
  });

  await prisma.persona.delete({ where: { id: persona.id } });

  logger.info({ personaId: id, operatorId }, 'Persona deleted');
  return { id, deleted: true };
}

// ==================== ACCOUNT-PERSONA ASSIGNMENT ====================

async function setActivePersona(accountId, personaId, operatorId) {
  // Verify the account belongs to this operator
  const account = await prisma.discordAccount.findFirst({
    where: { id: accountId, operatorId },
  });
  if (!account) {
    const err = new Error('Discord account not found or unauthorized');
    err.status = 404;
    throw err;
  }

  // If personaId is null, just unlink (remove persona from account)
  if (personaId === null || personaId === undefined) {
    const updated = await prisma.discordAgentConfig.upsert({
      where: { accountId },
      create: { accountId, operatorId, enabled: false, personaId: null },
      update: { personaId: null },
    });
    logger.info({ accountId, operatorId }, 'Persona unlinked from account');
    return { accountId, personaId: null, persona: null };
  }

  // Verify the persona belongs to this operator
  const persona = await prisma.persona.findFirst({
    where: { id: personaId, operatorId },
  });
  if (!persona) {
    const err = new Error('Persona not found or unauthorized');
    err.status = 404;
    throw err;
  }

  // Upsert agent config with the persona, preserving existing config
  const existing = await prisma.discordAgentConfig.findUnique({
    where: { accountId },
  });
  const config = await prisma.discordAgentConfig.upsert({
    where: { accountId },
    create: {
      accountId,
      operatorId,
      enabled: false,
      personaId,
    },
    update: { personaId },
  });

  logger.info({ accountId, operatorId, personaId, personaName: persona.name }, 'Active persona set on account');
  return {
    accountId,
    personaId,
    persona: {
      id: persona.id,
      name: persona.name,
      description: persona.description,
      avatarUrl: persona.avatarUrl,
    },
  };
}

async function getActivePersona(accountId, operatorId) {
  // Verify the account belongs to this operator
  const account = await prisma.discordAccount.findFirst({
    where: { id: accountId, operatorId },
    select: { id: true },
  });
  if (!account) {
    const err = new Error('Discord account not found or unauthorized');
    err.status = 404;
    throw err;
  }

  const config = await prisma.discordAgentConfig.findUnique({
    where: { accountId },
    include: { persona: true },
  });

  if (!config || !config.persona) {
    return { accountId, personaId: null, persona: null };
  }

  return {
    accountId,
    personaId: config.personaId,
    persona: {
      id: config.persona.id,
      name: config.persona.name,
      description: config.persona.description,
      systemPrompt: config.persona.systemPrompt,
      avatarUrl: config.persona.avatarUrl,
    },
  };
}

/**
 * Internal-only: return the active persona's system prompt + name.
 * Used by discord-service when generating AI replies.
 * No operatorId check needed — called from trusted internal service.
 */
async function getActivePersonaInternal(accountId) {
  const config = await prisma.discordAgentConfig.findUnique({
    where: { accountId },
    include: { persona: true },
  });

  if (!config || !config.persona) {
    return null;
  }

  return {
    personaId: config.personaId,
    name: config.persona.name,
    systemPrompt: config.persona.systemPrompt,
    description: config.persona.description,
    avatarUrl: config.persona.avatarUrl,
  };
}

module.exports = {
  createPersona,
  getPersonas,
  getPersona,
  updatePersona,
  deletePersona,
  setActivePersona,
  getActivePersona,
  getActivePersonaInternal,
};
