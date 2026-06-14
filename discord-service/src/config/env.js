import { logger } from '../utils/logger.js';

/**
 * Validate and load environment configuration.
 */
export function validateEnv() {
  const errors = [];

  if (!process.env.BACKEND_URL) {
    errors.push('BACKEND_URL is required (e.g. http://localhost:3005)');
  }
  if (!process.env.BACKEND_API_KEY) {
    errors.push('BACKEND_API_KEY is required for service-to-service auth');
  }
  if (!process.env.AI_HANDLER_URL) {
    errors.push('AI_HANDLER_URL is required (e.g. http://localhost:8000)');
  }

  if (!process.env.PORT) process.env.PORT = '3007';

  if (errors.length > 0) {
    errors.forEach((e) => logger.error(`Environment error: ${e}`));
    throw new Error('Environment configuration errors - check logs');
  }

  logger.info('Environment configuration validated');
}

export const config = {
  port: parseInt(process.env.PORT || '3007', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  backendUrl: process.env.BACKEND_URL || 'http://localhost:3005',
  backendApiKey: process.env.BACKEND_API_KEY,
  aiHandlerUrl: process.env.AI_HANDLER_URL || 'http://localhost:8000',
  logLevel: process.env.LOG_LEVEL || 'info',
  messageBufferMs: parseInt(process.env.MESSAGE_BUFFER_MS || '3000', 10),
};
