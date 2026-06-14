/**
 * Prisma Client Singleton
 * AFILIATORS Backend - CommonJS
 */

const { PrismaClient } = require('@prisma/client');
const logger = require('./utils/logger');

let prisma;
const LOG_PRISMA_QUERIES = process.env.LOG_PRISMA_QUERIES === 'true';

if (process.env.NODE_ENV === 'production') {
  prisma = new PrismaClient({
    log: [
      { level: 'error', emit: 'stdout' },
      { level: 'warn', emit: 'stdout' },
    ],
  });
} else {
  // Development: use globalThis singleton for hot-reload
  if (!globalThis.prisma) {
    globalThis.prisma = new PrismaClient({
      log: [
        ...(LOG_PRISMA_QUERIES ? [{ level: 'query', emit: 'event' }] : []),
        { level: 'error', emit: 'stdout' },
        { level: 'warn', emit: 'stdout' },
      ],
    });

    if (LOG_PRISMA_QUERIES) {
      globalThis.prisma.$on('query', (e) => {
        logger.debug({
          query: e.query,
          params: e.params,
          duration: `${e.duration}ms`,
        }, 'Prisma Query');
      });
    }
  }
  prisma = globalThis.prisma;
}

// Graceful shutdown
const disconnect = async () => {
  await prisma.$disconnect();
  logger.info('Prisma Client disconnected');
};

process.on('beforeExit', disconnect);
process.on('SIGTERM', disconnect);
process.on('SIGINT', disconnect);

module.exports = prisma;
