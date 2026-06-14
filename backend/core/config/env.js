/**
 * Environment Configuration and Validation
 * AFILIATORS Backend
 */

const logger = require('../utils/logger');

function validateEnv() {
  const required = [];

  if (!process.env.DATABASE_URL) {
    required.push('DATABASE_URL');
  }

  if (required.length > 0) {
    logger.error(`Missing required environment variables: ${required.join(', ')}`);
    throw new Error(`Missing required environment variables: ${required.join(', ')}`);
  }

  logger.info('Environment configuration validated');
}

const config = {
  port: parseInt(process.env.PORT || '3005', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL,
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3001',
  jwtSecret: process.env.JWT_SECRET || 'development-secret-change-in-production',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',

  // DeepSeek AI (only provider)
  deepseekApiKey: process.env.DEEPSEEK_API_KEY || '',
  deepseekModel: process.env.DEEPSEEK_MODEL || 'deepseek-chat',

  // Encryption
  encryptionKey: process.env.ENCRYPTION_KEY || '',

  // WhatsApp Service Auth
  whatsappServiceApiKey: process.env.WHATSAPP_SERVICE_API_KEY || '',

  // Computed
  isDevelopment: () => config.nodeEnv === 'development',
  isProduction: () => config.nodeEnv === 'production',
};

module.exports = { validateEnv, config };
