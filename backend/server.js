/**
 * AFILIATORS Backend - Main Entry Point
 *
 * Unified API Gateway for:
 * - Auth Service
 * - CRM (Leads, Tasks, Contacts)
 * - WhatsApp Integration
 * - Knowledge Base
 * - Operators
 * - PIX Payments
 * - Virtual Cards
 * - LGPD Compliance
 */

require('dotenv/config');

const express = require('express');
const { createServer } = require('http');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const { Server } = require('socket.io');

// Core modules
const logger = require('./core/utils/logger');
const { validateEnv } = require('./core/config/env');

// Validate environment variables
validateEnv();

const app = express();
const server = createServer(app);

// ==================== WEBSOCKET ====================

const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3001',
    credentials: true,
  },
  path: '/socket.io',
});

io.on('connection', (socket) => {
  const authOperatorId = socket.handshake.auth?.operatorId;
  const queryOperatorId = socket.handshake.query?.operatorId;
  const resolvedOperatorId = (authOperatorId || queryOperatorId || '').toString().trim();

  if (resolvedOperatorId) {
    socket.join(`operator:${resolvedOperatorId}`);
    logger.info({ socketId: socket.id, operatorId: resolvedOperatorId }, 'Socket joined operator room');
  }

  logger.info({ socketId: socket.id }, 'Client connected via WebSocket');

  socket.on('disconnect', () => {
    logger.info({ socketId: socket.id }, 'Client disconnected');
  });
});

// ==================== MIDDLEWARE ====================

// Security
app.use(helmet({
  contentSecurityPolicy: false,
}));

// CORS
const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',')
  : ['http://localhost:3001'];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));

// Compression
app.use(compression());

// Body parsers
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Request logging
app.use((req, res, next) => {
  const isHealthCheck = req.path === '/health';
  if (!isHealthCheck) {
    logger.info({
      method: req.method,
      path: req.path,
      ip: req.ip,
    }, 'Incoming request');
  }
  next();
});

// ==================== HEALTH CHECK ====================

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    services: {
      auth: 'running',
      crm_leads: 'running',
      crm_tasks: 'running',
      crm_contacts: 'running',
      crm_deals: 'running',
      crm_commissions: 'running',
      analytics: 'running',
      affiliates: 'running',
      whatsapp: 'running',
      knowledge: 'running',
      operators: 'running',
      pix: 'running',
      virtual_cards: 'running',
      lgpd: 'running',
    },
  });
});

app.get('/', (req, res) => {
  res.json({
    name: 'AFILIATORS Backend API',
    version: '1.0.0',
    description: 'Unified API Gateway for AFILIATORS Platform',
    endpoints: {
      health: '/health',
      auth: '/api/auth',
      crm_leads: '/api/crm/leads',
      crm_tasks: '/api/crm/tasks',
      crm_contacts: '/api/crm/contacts',
      crm_deals: '/api/crm/deals',
      crm_commissions: '/api/crm/commissions',
      affiliates: '/api/affiliates',
      analytics: '/api/analytics',
      whatsapp: '/api/whatsapp',
      knowledge: '/api/knowledge',
      operators: '/api/operators',
      pix: '/api/pix',
      virtual_cards: '/api/virtual-cards',
      lgpd: '/api/lgpd',
    },
  });
});

// ==================== API ROUTES ====================

// Auth
app.use('/api/auth', require('./services/auth/routes/auth'));

// CRM
app.use('/api/crm/leads', require('./services/crm/routes/leads'));
app.use('/api/crm/tasks', require('./services/crm/routes/tasks'));
app.use('/api/crm/contacts', require('./services/crm/routes/contacts'));
app.use('/api/crm/deals', require('./services/crm/routes/deals'));
app.use('/api/crm/commissions', require('./services/crm/routes/commissions'));

// Follow-ups (automated sequences)
app.use('/api/followups', require('./services/crm/routes/followups'));

// Analytics
app.use('/api/analytics', require('./services/crm/routes/analytics'));

// Affiliates
app.use('/api/affiliates', require('./services/crm/routes/affiliates'));

// WhatsApp
app.use('/api/whatsapp', require('./services/whatsapp/routes/index'));

// Discord
app.use('/api/discord', require('./services/discord/routes/index'));

// Knowledge Base
app.use('/api/knowledge', require('./services/knowledge/routes/knowledge'));

// Operators
app.use('/api/operators', require('./services/operators/routes/index'));

// PIX
app.use('/api/pix', require('./services/pix/routes/pix'));

// Virtual Cards
app.use('/api/virtual-cards', require('./services/virtualcard/routes/vcc'));

// LGPD
app.use('/api/lgpd', require('./services/lgpd/routes/index'));

// AI Orchestrator webhooks — receives alerts from AI handler
app.post('/api/webhooks/orchestrator', (req, res) => {
  const { severity, title, message, conversation, timestamp } = req.body || {};
  logger.warn({
    severity,
    title,
    message,
    conversation,
    timestamp,
  }, 'Orchestrator alert received');

  // TODO: Store alert in DB and notify operators via WebSocket
  io.to('operator:admin').emit('orchestrator:alert', {
    severity,
    title,
    message,
    conversation,
    timestamp,
  });

  res.json({ success: true, received: true });
});

// AI Orchestrator metrics proxy — forward to AI handler
app.get('/api/orchestrator/health', async (req, res) => {
  try {
    const axios = require('axios');
    const { data } = await axios.get('http://ai-handler:8000/api/orchestrator/health', { timeout: 5000 });
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: 'Orchestrator unreachable', message: e.message });
  }
});

app.get('/api/orchestrator/pipeline', async (req, res) => {
  try {
    const axios = require('axios');
    const { data } = await axios.get('http://ai-handler:8000/api/orchestrator/pipeline', { timeout: 5000 });
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: 'Orchestrator unreachable' });
  }
});

app.get('/api/orchestrator/alerts', async (req, res) => {
  try {
    const axios = require('axios');
    const { data } = await axios.get('http://ai-handler:8000/api/orchestrator/alerts', {
      params: req.query,
      timeout: 5000,
    });
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: 'Orchestrator unreachable' });
  }
});

// ==================== ERROR HANDLING ====================

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.path} not found`,
  });
});

// Global error handler
app.use((err, req, res, _next) => {
  logger.error({
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  }, 'Unhandled error');

  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

// ==================== SERVER START ====================

const PORT = process.env.PORT || 3005;

server.listen(PORT, () => {
  logger.info({
    port: PORT,
    env: process.env.NODE_ENV,
    corsOrigin: allowedOrigins,
  }, 'AFILIATORS Backend started successfully');

  console.log(`
  ╔═══════════════════════════════════════════════════════╗
  ║                                                       ║
  ║      AFILIATORS Backend API v1.0.0                    ║
  ║                                                       ║
  ║   Server: http://localhost:${PORT}                      ║
  ║   WebSocket: ws://localhost:${PORT}/socket.io           ║
  ║   Health: http://localhost:${PORT}/health               ║
  ║                                                       ║
  ║   Services:                                           ║
  ║   Auth      - /api/auth                              ║
  ║   Leads     - /api/crm/leads                         ║
  ║   Tasks     - /api/crm/tasks                         ║
  ║   Contacts  - /api/crm/contacts                      ║
	  ║   Deals     - /api/crm/deals                         ║
	  ║   Commissions - /api/crm/commissions                ║
	  ║   Analytics - /api/analytics                         ║
	  ║   Affiliates- /api/affiliates                        ║
  ║   WhatsApp  - /api/whatsapp                          ║
  ║   Knowledge - /api/knowledge                         ║
  ║   Operators - /api/operators                         ║
  ║   PIX       - /api/pix                               ║
  ║   Cards     - /api/virtual-cards                     ║
  ║   LGPD      - /api/lgpd                              ║
  ║                                                       ║
  ╚═══════════════════════════════════════════════════════╝
  `);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully...');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  logger.error({ error: err.message, stack: err.stack }, 'Uncaught Exception');
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error({ reason, promise }, 'Unhandled Rejection');
  process.exit(1);
});

module.exports = { app, server, io };
