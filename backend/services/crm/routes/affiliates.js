/**
 * Affiliate Links Routes
 * AFILIATORS Backend - CRM
 *
 * Manages Revolut affiliate tracking links with click, signup,
 * and conversion counters. Click and signup endpoints are public
 * (called by tracking pixels, redirects, or webhooks).
 */

const express = require('express');
const prisma = require('../../../core/prisma');
const { authenticateToken } = require('../../../core/middleware/auth');

const router = express.Router();

// ==================== LINK CRUD ====================

/**
 * POST /api/affiliates/links
 * Create a new affiliate link
 */
router.post('/links', authenticateToken, async (req, res) => {
  try {
    const { name, url, utmSource, utmMedium, utmCampaign, shortCode } = req.body;

    if (!name || !url) {
      return res.status(400).json({
        success: false,
        error: 'Name and URL are required',
      });
    }

    // Validate shortCode uniqueness if provided
    if (shortCode) {
      const existing = await prisma.affiliateLink.findUnique({
        where: { shortCode },
      });
      if (existing) {
        return res.status(409).json({
          success: false,
          error: 'Short code already in use',
        });
      }
    }

    const link = await prisma.affiliateLink.create({
      data: {
        operatorId: req.user.operatorId,
        name,
        url,
        utmSource: utmSource || null,
        utmMedium: utmMedium || null,
        utmCampaign: utmCampaign || null,
        shortCode: shortCode || null,
      },
    });

    res.status(201).json({ success: true, data: link });
  } catch (error) {
    console.error('Error creating affiliate link:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create affiliate link',
      message: error.message,
    });
  }
});

/**
 * GET /api/affiliates/links
 * List affiliate links with stats
 */
router.get('/links', authenticateToken, async (req, res) => {
  try {
    const { isActive, search, page = 1, limit = 50 } = req.query;
    const pageNum = parseInt(page);
    const limitNum = Math.min(parseInt(limit), 200);
    const skip = (pageNum - 1) * limitNum;

    const where = { operatorId: req.user.operatorId };

    if (isActive !== undefined) {
      where.isActive = isActive === 'true';
    }
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { url: { contains: search, mode: 'insensitive' } },
        { utmSource: { contains: search, mode: 'insensitive' } },
        { utmCampaign: { contains: search, mode: 'insensitive' } },
        { shortCode: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [links, total] = await Promise.all([
      prisma.affiliateLink.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { updatedAt: 'desc' },
        include: {
          operator: {
            select: { id: true, name: true },
          },
        },
      }),
      prisma.affiliateLink.count({ where }),
    ]);

    // Aggregate totals
    const aggregateTotals = links.reduce(
      (acc, link) => {
        acc.totalClicks += link.clicks;
        acc.totalSignups += link.signups;
        acc.totalConversions += link.conversions;
        return acc;
      },
      { totalClicks: 0, totalSignups: 0, totalConversions: 0 },
    );

    res.json({
      success: true,
      data: links,
      aggregateTotals,
      pagination: {
        total,
        page: pageNum,
        totalPages: Math.ceil(total / limitNum),
        limit: limitNum,
      },
    });
  } catch (error) {
    console.error('Error listing affiliate links:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list affiliate links',
      message: error.message,
    });
  }
});

/**
 * PUT /api/affiliates/links/:id
 * Update an affiliate link
 */
router.put('/links/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, url, utmSource, utmMedium, utmCampaign, shortCode, isActive } = req.body;

    // Verify ownership
    const existing = await prisma.affiliateLink.findFirst({
      where: { id, operatorId: req.user.operatorId },
    });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Affiliate link not found' });
    }

    // Validate shortCode uniqueness if being changed
    if (shortCode && shortCode !== existing.shortCode) {
      const conflict = await prisma.affiliateLink.findUnique({
        where: { shortCode },
      });
      if (conflict) {
        return res.status(409).json({
          success: false,
          error: 'Short code already in use',
        });
      }
    }

    const link = await prisma.affiliateLink.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(url !== undefined && { url }),
        ...(utmSource !== undefined && { utmSource }),
        ...(utmMedium !== undefined && { utmMedium }),
        ...(utmCampaign !== undefined && { utmCampaign }),
        ...(shortCode !== undefined && { shortCode }),
        ...(isActive !== undefined && { isActive }),
      },
    });

    res.json({ success: true, data: link });
  } catch (error) {
    console.error('Error updating affiliate link:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update affiliate link',
      message: error.message,
    });
  }
});

/**
 * DELETE /api/affiliates/links/:id
 * Delete an affiliate link
 */
router.delete('/links/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await prisma.affiliateLink.findFirst({
      where: { id, operatorId: req.user.operatorId },
    });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Affiliate link not found' });
    }

    await prisma.affiliateLink.delete({ where: { id } });

    res.json({ success: true, message: 'Affiliate link deleted successfully' });
  } catch (error) {
    console.error('Error deleting affiliate link:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete affiliate link',
      message: error.message,
    });
  }
});

// ==================== TRACKING (PUBLIC) ====================

/**
 * POST /api/affiliates/links/:id/click
 * Increment click counter — called by tracking pixel or redirect.
 * PUBLIC endpoint (no auth required).
 */
router.post('/links/:id/click', async (req, res) => {
  try {
    const { id } = req.params;

    // Look up by shortCode first, fall back to cuid id
    let link = await prisma.affiliateLink.findUnique({
      where: { shortCode: id },
    });
    if (!link) {
      link = await prisma.affiliateLink.findUnique({
        where: { id },
      });
    }
    if (!link) {
      return res.status(404).json({ success: false, error: 'Affiliate link not found' });
    }

    if (!link.isActive) {
      return res.status(410).json({ success: false, error: 'Affiliate link is inactive' });
    }

    const updated = await prisma.affiliateLink.update({
      where: { id: link.id },
      data: { clicks: { increment: 1 } },
    });

    res.json({
      success: true,
      data: {
        id: updated.id,
        clicks: updated.clicks,
        redirectUrl: updated.url,
      },
    });
  } catch (error) {
    console.error('Error tracking click:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to track click',
      message: error.message,
    });
  }
});

/**
 * POST /api/affiliates/links/:id/signup
 * Increment signup counter — called by webhook or callback.
 * PUBLIC endpoint (no auth required).
 */
router.post('/links/:id/signup', async (req, res) => {
  try {
    const { id } = req.params;

    // Look up by shortCode first, fall back to cuid id
    let link = await prisma.affiliateLink.findUnique({
      where: { shortCode: id },
    });
    if (!link) {
      link = await prisma.affiliateLink.findUnique({
        where: { id },
      });
    }
    if (!link) {
      return res.status(404).json({ success: false, error: 'Affiliate link not found' });
    }

    const updated = await prisma.affiliateLink.update({
      where: { id: link.id },
      data: {
        signups: { increment: 1 },
        conversions: { increment: 1 },
      },
    });

    res.json({
      success: true,
      data: {
        id: updated.id,
        signups: updated.signups,
        conversions: updated.conversions,
      },
    });
  } catch (error) {
    console.error('Error tracking signup:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to track signup',
      message: error.message,
    });
  }
});

// ==================== AGGREGATE STATS ====================

/**
 * GET /api/affiliates/stats
 * Aggregate stats across all affiliate links for the operator
 */
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const operatorId = req.user.operatorId;

    const [links, aggregate] = await Promise.all([
      prisma.affiliateLink.findMany({
        where: { operatorId },
        orderBy: { clicks: 'desc' },
        select: {
          id: true,
          name: true,
          shortCode: true,
          clicks: true,
          signups: true,
          conversions: true,
          isActive: true,
        },
      }),
      prisma.affiliateLink.aggregate({
        where: { operatorId },
        _sum: { clicks: true, signups: true, conversions: true },
        _count: { id: true },
      }),
    ]);

    const conversionRate =
      aggregate._sum.clicks > 0
        ? ((aggregate._sum.conversions / aggregate._sum.clicks) * 100).toFixed(2)
        : '0.00';

    res.json({
      success: true,
      data: {
        totals: {
          clicks: aggregate._sum.clicks || 0,
          signups: aggregate._sum.signups || 0,
          conversions: aggregate._sum.conversions || 0,
          conversionRate: `${conversionRate}%`,
          totalLinks: aggregate._count.id,
          activeLinks: links.filter((l) => l.isActive).length,
        },
        links,
      },
    });
  } catch (error) {
    console.error('Error getting affiliate stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get affiliate stats',
      message: error.message,
    });
  }
});

module.exports = router;
