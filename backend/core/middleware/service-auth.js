/**
 * Service-to-Service Authentication Middleware
 * AFILIATORS Backend - CommonJS
 *
 * Used by internal routes that are called by whatsapp-service microservice.
 * Verifies the X-Service-Name header and API key.
 */

const logger = require('../utils/logger');

/**
 * Authenticate that the request comes from a known internal service.
 * Checks X-Service-Name header and X-API-Key against configured secrets.
 */
function authenticateService(req, res, next) {
  const serviceName = req.headers['x-service-name'];
  const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');

  if (!serviceName) {
    logger.warn({ ip: req.ip, path: req.path }, 'Internal request missing X-Service-Name header');
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Missing X-Service-Name header',
    });
  }

  const validApiKey = process.env.WHATSAPP_SERVICE_API_KEY;
  if (validApiKey && apiKey !== validApiKey) {
    logger.warn({ serviceName, ip: req.ip, path: req.path }, 'Internal request with invalid API key');
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Invalid service API key',
    });
  }

  req.service = {
    name: serviceName,
    authenticated: true,
  };

  logger.debug({ serviceName, path: req.path }, 'Service authenticated successfully');
  next();
}

/**
 * Require that the authenticated service matches a specific service name.
 * @param {string} expectedService - The expected service name
 */
function requireService(expectedService) {
  return (req, res, next) => {
    if (!req.service || !req.service.authenticated) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Service authentication required',
      });
    }

    if (req.service.name !== expectedService) {
      logger.warn({
        expected: expectedService,
        actual: req.service.name,
        path: req.path,
      }, 'Service name mismatch');
      return res.status(403).json({
        error: 'Forbidden',
        message: `Service '${req.service.name}' is not authorized for this endpoint`,
      });
    }

    next();
  };
}

module.exports = {
  authenticateService,
  requireService,
};
