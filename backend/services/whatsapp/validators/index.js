/**
 * WhatsApp Integration Validators
 * Input validation using Joi to prevent injection attacks and malformed data
 */

const Joi = require('joi');

const sessionIdPattern = /^[a-zA-Z0-9_\-\s]{3,64}$/;
const conversationIdPattern = /^[\w.@:+-]{1,200}$/;
const participantPattern = /^[\w.@:+-]{1,64}$/;

// ==================== MESSAGE VALIDATORS ====================

const storeMessageSchema = Joi.object({
  conversationId: Joi.string().pattern(conversationIdPattern).required(),
  fromMe: Joi.boolean().required(),
  body: Joi.string().max(10000).allow('', null).optional(),
  messageType: Joi.string().valid('TEXT', 'IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT', 'STICKER').default('TEXT'),
  mediaUrl: Joi.string().uri().allow('', null).optional(),
  sentiment: Joi.string().max(100).allow('', null).optional(),
  intent: Joi.string().max(100).allow('', null).optional(),
  operatorId: Joi.number().integer().positive().required(),
  timestamp: Joi.date().iso().optional(),
});

const getMessagesSchema = Joi.object({
  conversationId: Joi.string().pattern(conversationIdPattern).required(),
  limit: Joi.number().integer().min(1).max(100).default(50),
  offset: Joi.number().integer().min(0).default(0),
});

const searchMessagesSchema = Joi.object({
  q: Joi.string().min(1).max(500).required(),
  limit: Joi.number().integer().min(1).max(100).default(50),
  offset: Joi.number().integer().min(0).default(0),
});

// ==================== CONVERSATION VALIDATORS ====================

const upsertConversationSchema = Joi.object({
  sessionId: Joi.string().pattern(sessionIdPattern).required(),
  remoteJid: Joi.string().max(100).required(),
  contactName: Joi.string().max(200).allow(null, '').optional(),
  contactNumber: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).allow(null, '').optional(),
  lastMessage: Joi.string().max(1000).allow(null, '').optional(),
  lastMessageTime: Joi.date().iso().optional(),
  unreadCount: Joi.number().integer().min(0).max(9999).default(0),
  operatorId: Joi.number().integer().positive().required(),
});

const getConversationsSchema = Joi.object({
  limit: Joi.number().integer().min(1).max(100).default(50),
  offset: Joi.number().integer().min(0).default(0),
});

const conversationIdSchema = Joi.object({
  id: Joi.string().pattern(conversationIdPattern).required(),
});

// ==================== SESSION VALIDATORS ====================

const createSessionSchema = Joi.object({
  sessionId: Joi.string().pattern(sessionIdPattern).required(),
  name: Joi.string().min(1).max(200).required(),
});

const updateSessionStatusSchema = Joi.object({
  sessionId: Joi.string().pattern(sessionIdPattern).required(),
  status: Joi.string().valid('CONNECTED', 'DISCONNECTED', 'CONNECTING', 'QR_READY', 'RECONNECTING', 'ERROR').required(),
  operatorId: Joi.number().integer().positive().required(),
});

const updateSessionQrSchema = Joi.object({
  sessionId: Joi.string().pattern(sessionIdPattern).required(),
  operatorId: Joi.number().integer().positive().required(),
  qrCode: Joi.string().allow('', null).optional(),
});

const validateSessionSchema = Joi.object({
  sessionId: Joi.string().pattern(sessionIdPattern).required(),
  operatorId: Joi.number().integer().positive().required(),
});

const sessionIdSchema = Joi.object({
  sessionId: Joi.string().pattern(sessionIdPattern).required(),
});

// ==================== VALIDATION MIDDLEWARE ====================

/**
 * Validate request body against schema
 *
 * @param {Joi.Schema} schema - Joi validation schema
 * @param {string} source - Data source ('body', 'query', 'params')
 * @returns {Function} Middleware function
 */
function validate(schema, source = 'body') {
  return (req, res, next) => {
    const data = req[source];

    const { error, value } = schema.validate(data, {
      abortEarly: false, // Return all errors
      stripUnknown: true, // Remove unknown fields (security)
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
      }));

      return res.status(400).json({
        error: 'Validation failed',
        details: errors,
      });
    }

    // Replace request data with validated & sanitized data
    req[source] = value;
    next();
  };
}

module.exports = {
  storeMessageSchema,
  getMessagesSchema,
  searchMessagesSchema,
  upsertConversationSchema,
  getConversationsSchema,
  conversationIdSchema,
  createSessionSchema,
  updateSessionStatusSchema,
  updateSessionQrSchema,
  validateSessionSchema,
  sessionIdSchema,
  validate,
};
