/**
 * Discord Integration Routes Index
 * Combines public (frontend) and internal (service) routes.
 */

const express = require('express');
const publicRoutes = require('./public');
const internalRoutes = require('./internal');

const router = express.Router();

// Internal routes (called by discord-service)
router.use('/internal', internalRoutes);

// Public routes (called by frontend)
router.use('/', publicRoutes);

module.exports = router;
