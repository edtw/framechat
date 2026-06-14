import { logger } from '../utils/logger.js';

/**
 * Validate and load environment configuration.
 */
export function validateEnv() {
  const errors = [];

  // Required variables
  if (!process.env.BACKEND_URL) {
    errors.push('BACKEND_URL is required (e.g. http://localhost:3005)');
  }

  if (!process.env.BACKEND_API_KEY) {
    errors.push('BACKEND_API_KEY is required for service-to-service auth');
  }

  if (!process.env.AI_HANDLER_URL) {
    errors.push('AI_HANDLER_URL is required (e.g. http://localhost:8000)');
  }

  // Port validation
  const port = parseInt(process.env.PORT || '3006', 10);
  if (isNaN(port) || port < 1 || port > 65535) {
    errors.push('PORT must be a valid number between 1 and 65535');
  }

  if (!process.env.PORT) {
    process.env.PORT = '3006';
  }

  if (errors.length > 0) {
    errors.forEach(error => logger.error(`Environment error: ${error}`));
    throw new Error('Environment configuration errors - check logs');
  }

  logger.info('Environment configuration validated');
}

export const config = {
  port: parseInt(process.env.PORT || '3006', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  backendUrl: process.env.BACKEND_URL || 'http://localhost:3005',
  backendApiKey: process.env.BACKEND_API_KEY,
  aiHandlerUrl: process.env.AI_HANDLER_URL || 'http://localhost:8000',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  sessionsPath: process.env.SESSIONS_PATH || './sessions',
  logLevel: process.env.LOG_LEVEL || 'info',

  isProduction: () => config.nodeEnv === 'production',
  isDevelopment: () => config.nodeEnv === 'development'
};
