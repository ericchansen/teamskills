/**
 * Auth Routes
 * 
 * Endpoints for authentication-related operations
 */

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../auth');

/**
 * GET /api/auth/me
 * Returns the currently authenticated user's profile
 */
router.get('/me', requireAuth, (req, res) => {
  const { id, name, email, role, team, is_admin, created_at, updated_at } = req.user;
  res.json({
    id,
    name,
    email,
    role,
    team,
    is_admin: is_admin || false,
    created_at,
    updated_at
  });
});

/**
 * GET /api/auth/config
 * Returns Entra ID configuration for frontend MSAL
 * (public endpoint - no auth required)
 */
router.get('/config', (req, res) => {
  const clientId = process.env.AZURE_AD_CLIENT_ID;
  const tenantId = process.env.AZURE_AD_TENANT_ID;

  if (!clientId || !tenantId) {
    return res.json({
      enabled: false,
      message: 'Authentication not configured'
    });
  }

  res.json({
    enabled: true,
    clientId,
    tenantId,
    authority: `https://login.microsoftonline.com/${tenantId}`,
    redirectUri: process.env.FRONTEND_URL || 'http://localhost:3000',
    scopes: [`api://${clientId}/access_as_user`]
  });
});

module.exports = router;
