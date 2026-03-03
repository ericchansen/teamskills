/**
 * SharePoint Sync Routes
 * 
 * Provides endpoints for bi-directional sync between the web app
 * and the SharePoint "Skills Matrix MVP" list via OBO flow.
 * 
 * All endpoints require authentication. The user's API token is
 * exchanged for a Graph token via OBO to call SharePoint under
 * the user's identity.
 */

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../auth');
const { isOboConfigured, getGraphClientOnBehalfOf, extractBearerToken } = require('../services/oboClient');
const sharepoint = require('../services/sharepoint');

/**
 * GET /api/sharepoint/status
 * Check if SharePoint sync is configured and available.
 */
router.get('/status', requireAuth, (req, res) => {
  res.json({
    configured: isOboConfigured(),
    message: isOboConfigured()
      ? 'SharePoint sync is configured and ready'
      : 'SharePoint sync requires AZURE_AD_CLIENT_ID, AZURE_AD_CLIENT_SECRET, and AZURE_AD_TENANT_ID'
  });
});

/**
 * POST /api/sharepoint/pull
 * Pull all skill data from SharePoint into the database.
 * Uses OBO to read SharePoint under the calling user's identity.
 */
router.post('/pull', requireAuth, async (req, res) => {
  if (!isOboConfigured()) {
    return res.status(501).json({ error: 'SharePoint sync not configured' });
  }

  const bearerToken = extractBearerToken(req);
  if (!bearerToken) {
    return res.status(401).json({ error: 'Bearer token required for SharePoint sync' });
  }

  try {
    const graphClient = await getGraphClientOnBehalfOf(bearerToken);
    const pivotData = await sharepoint.fetchPivotFromSharePoint(graphClient);
    const stats = await sharepoint.syncPivotToDatabase(pivotData);

    res.json({
      message: 'SharePoint pull completed',
      source: 'sharepoint',
      ...stats
    });
  } catch (err) {
    console.error('[SharePoint Pull] Error:', err.message);

    if (err.statusCode === 403 || err.message?.includes('Access denied')) {
      return res.status(403).json({
        error: 'You do not have access to this SharePoint site',
        detail: err.message
      });
    }

    res.status(500).json({ error: 'SharePoint pull failed', detail: err.message });
  }
});

/**
 * POST /api/sharepoint/push
 * Push the current user's skill levels from the database back to SharePoint.
 * Uses OBO to write SharePoint under the calling user's identity.
 */
router.post('/push', requireAuth, async (req, res) => {
  if (!isOboConfigured()) {
    return res.status(501).json({ error: 'SharePoint sync not configured' });
  }

  const bearerToken = extractBearerToken(req);
  if (!bearerToken) {
    return res.status(401).json({ error: 'Bearer token required for SharePoint sync' });
  }

  if (!req.user || !req.user.id) {
    return res.status(401).json({ error: 'User must be authenticated' });
  }

  try {
    const graphClient = await getGraphClientOnBehalfOf(bearerToken);
    const result = await sharepoint.pushUserSkillsToSharePoint(graphClient, req.user);

    res.json({
      message: 'SharePoint push completed',
      ...result
    });
  } catch (err) {
    console.error('[SharePoint Push] Error:', err.message);

    if (err.statusCode === 403 || err.message?.includes('Access denied')) {
      return res.status(403).json({
        error: 'You do not have permission to update this SharePoint list',
        detail: err.message
      });
    }

    res.status(500).json({ error: 'SharePoint push failed', detail: err.message });
  }
});

module.exports = router;
