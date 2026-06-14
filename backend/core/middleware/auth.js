/**
 * Authentication Middleware
 * AFILIATORS Backend - CommonJS
 */

const jwt = require('jsonwebtoken');
const { config } = require('../config/env');

/**
 * Verify a JWT access token
 * @param {string} token - JWT token
 * @returns {object|null} Decoded payload or null
 */
function verifyAccessToken(token) {
  try {
    return jwt.verify(token, config.jwtSecret);
  } catch (error) {
    return null;
  }
}

/**
 * Resolve operatorId from request headers, query, or body
 */
function resolveOperatorId(req) {
  const candidates = [
    req.headers['x-operator-id'],
    req.headers['x-operatorid'],
    req.query?.operator_id,
    req.query?.operatorId,
    req.body?.operator_id,
    req.body?.operatorId,
  ].filter((value) => value !== undefined && value !== null && `${value}`.trim() !== '');

  if (candidates.length > 0) {
    const parsed = Number(candidates[0]);
    return Number.isNaN(parsed) ? undefined : parsed;
  }

  return undefined;
}

/**
 * Attach operator context to req.user if missing
 */
function attachOperatorContext(req) {
  if (!req.user) return;
  if (req.user.operatorId) return;
  const resolved = resolveOperatorId(req);
  if (resolved !== undefined) {
    req.user.operatorId = resolved;
  }
}

/**
 * Main auth middleware
 */
function authMiddleware(req, res, next) {
  const apiKey = req.headers['x-api-key'] || req.query.api_key;
  const bearerToken = req.headers['authorization']?.replace('Bearer ', '');

  // If no authentication provided at all
  if (!apiKey && !bearerToken) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Authentication required. Provide API key in X-API-Key header or Bearer token.',
    });
  }

  // Check Bearer token (JWT for dashboard users)
  if (bearerToken) {
    const decoded = verifyAccessToken(bearerToken);

    if (!decoded) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid or expired token',
      });
    }

    req.user = {
      id: decoded.sub,
      sessionId: decoded.sessionId,
      role: decoded.role,
      operatorId: decoded.operatorId,
      email: decoded.email,
      name: decoded.name,
      username: decoded.email?.split('@')[0],
      authenticated: true,
      source: 'dashboard',
    };

    attachOperatorContext(req);
    return next();
  }

  // Check API key (for external API access)
  if (apiKey) {
    const validApiKey = process.env.API_KEY;
    if (validApiKey && apiKey !== validApiKey) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Invalid API key',
      });
    }
    req.user = req.user || {};
    req.user.authenticated = true;
    req.user.source = 'api';
    attachOperatorContext(req);
    return next();
  }

  next();
}

/**
 * Role-based access control middleware factory
 * @param  {...string} roles - Allowed roles
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: `Role ${req.user.role} not allowed. Required: ${roles.join(', ')}`,
      });
    }
    next();
  };
}

// Aliases for compatibility
const authenticateToken = authMiddleware;
const authenticate = authMiddleware;

module.exports = {
  authMiddleware,
  authenticateToken,
  authenticate,
  requireRole,
  verifyAccessToken,
  resolveOperatorId,
};
