/**
 * Auth Routes
 * AFILIATORS Backend
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const prisma = require('../../../core/prisma');
const { config } = require('../../../core/config/env');
const { authenticateToken, requireRole } = require('../../../core/middleware/auth');

const router = express.Router();

/**
 * POST /api/auth/login
 * Authenticate user and return JWT
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Email and password are required',
      });
    }

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email },
      include: { operator: true },
    });

    if (!user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid email or password',
      });
    }

    if (!user.active) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Account is deactivated',
      });
    }

    // Verify password
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid email or password',
      });
    }

    // Create session
    const token = uuidv4();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await prisma.session.create({
      data: {
        userId: user.id,
        token,
        expiresAt,
      },
    });

    // Generate JWT
    const jwtToken = jwt.sign(
      {
        sub: user.id,
        operatorId: user.operatorId,
        email: user.email,
        name: user.name,
        role: user.role,
        sessionId: token,
      },
      config.jwtSecret,
      { expiresIn: config.jwtExpiresIn }
    );

    res.json({
      success: true,
      data: {
        token: jwtToken,
        user: {
          id: user.id,
          operatorId: user.operatorId,
          email: user.email,
          name: user.name,
          role: user.role,
          operatorName: user.operator?.name,
        },
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message,
    });
  }
});

/**
 * POST /api/auth/register
 * Create a new operator and admin user
 */
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Name, email, and password are required',
      });
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(409).json({
        error: 'Conflict',
        message: 'A user with this email already exists',
      });
    }

    // Create operator and user in a transaction
    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await prisma.$transaction(async (tx) => {
      // Create operator
      const operator = await tx.operator.create({
        data: {
          name,
          email,
          phone: phone || null,
        },
      });

      // Create admin user
      const user = await tx.user.create({
        data: {
          operatorId: operator.id,
          email,
          password: hashedPassword,
          name,
          role: 'ADMIN',
        },
      });

      return { operator, user };
    });

    // Generate JWT
    const token = uuidv4();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await prisma.session.create({
      data: {
        userId: result.user.id,
        token,
        expiresAt,
      },
    });

    const jwtToken = jwt.sign(
      {
        sub: result.user.id,
        operatorId: result.operator.id,
        email: result.user.email,
        name: result.user.name,
        role: result.user.role,
        sessionId: token,
      },
      config.jwtSecret,
      { expiresIn: config.jwtExpiresIn }
    );

    res.status(201).json({
      success: true,
      data: {
        token: jwtToken,
        user: {
          id: result.user.id,
          operatorId: result.operator.id,
          email: result.user.email,
          name: result.user.name,
          role: result.user.role,
          operatorName: result.operator.name,
        },
      },
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message,
    });
  }
});

/**
 * GET /api/auth/me
 * Get current user from JWT
 */
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: { operator: true },
    });

    if (!user) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'User not found',
      });
    }

    res.json({
      success: true,
      data: {
        id: user.id,
        operatorId: user.operatorId,
        email: user.email,
        name: user.name,
        role: user.role,
        active: user.active,
        operatorName: user.operator?.name,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
    });
  } catch (error) {
    console.error('Get me error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message,
    });
  }
});

module.exports = router;
