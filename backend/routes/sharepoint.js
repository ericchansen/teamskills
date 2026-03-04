/**
 * SharePoint Sync Routes
 * 
 * Provides endpoints for bi-directional sync between the web app
 * and the SharePoint "Skills Matrix MVP" list via OBO (On-Behalf-Of) flow.
 * 
 * OBO exchanges the user's API access token for a Microsoft Graph token,
 * then calls SharePoint under the user's identity. This is the
 * architecturally correct approach — it requires tenant admin consent
 * for the app's Graph permissions (Sites.ReadWrite.All).
 * 
 * Sync is controlled by isOboConfigured(): returns true when
 * AZURE_AD_CLIENT_ID, AZURE_AD_CLIENT_SECRET, and AZURE_AD_TENANT_ID
 * are all set. When unconfigured, all endpoints return 501.
 */

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../auth');
const { isOboConfigured, getGraphClientOnBehalfOf, extractBearerToken } = require('../services/oboClient');
const sharepoint = require('../services/sharepoint');

/**
 * GET /api/sharepoint/status
 * Check if SharePoint sync is configured.
 */
router.get('/status', requireAuth, (req, res) => {
  const configured = isOboConfigured();

  res.json({
    configured,
    method: configured ? 'obo' : 'none',
    message: configured
      ? 'SharePoint sync via OBO flow is configured and ready'
      : 'SharePoint sync is not configured. Set AZURE_AD_CLIENT_SECRET to enable OBO flow.'
  });
});

/**
 * POST /api/sharepoint/pull
 * Pull all skill data from SharePoint into the database.
 */
router.post('/pull', requireAuth, async (req, res) => {
  if (!isOboConfigured()) {
    return res.status(501).json({ error: 'SharePoint sync not configured' });
  }

  try {
    const bearerToken = extractBearerToken(req);
    if (!bearerToken) {
      return res.status(401).json({ error: 'Bearer token required for OBO SharePoint sync' });
    }

    const graphClient = await getGraphClientOnBehalfOf(bearerToken);
    const pivotData = await sharepoint.fetchPivotFromSharePoint(graphClient);
    const stats = await sharepoint.syncPivotToDatabase(pivotData);

    res.json({
      message: 'SharePoint pull completed',
      method: 'obo',
      source: 'sharepoint',
      ...stats
    });
  } catch (err) {
    console.error('[SharePoint Pull] Error:', err.message);

    if (err.message?.includes('AADSTS65001') || err.message?.includes('has not consented')) {
      return res.status(403).json({
        error: 'Admin consent required',
        detail: 'A tenant admin must grant this app permission to access SharePoint. ' +
          'Ask your admin to visit the admin consent URL for this application.',
        consentRequired: true
      });
    }

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
 */
router.post('/push', requireAuth, async (req, res) => {
  if (!isOboConfigured()) {
    return res.status(501).json({ error: 'SharePoint sync not configured' });
  }

  if (!req.user || !req.user.id) {
    return res.status(401).json({ error: 'User must be authenticated' });
  }

  try {
    const bearerToken = extractBearerToken(req);
    if (!bearerToken) {
      return res.status(401).json({ error: 'Bearer token required for OBO SharePoint sync' });
    }

    const graphClient = await getGraphClientOnBehalfOf(bearerToken);
    const result = await sharepoint.pushUserSkillsToSharePoint(graphClient, req.user);

    res.json({
      message: 'SharePoint push completed',
      method: 'obo',
      ...result
    });
  } catch (err) {
    console.error('[SharePoint Push] Error:', err.message);

    if (err.message?.includes('AADSTS65001') || err.message?.includes('has not consented')) {
      return res.status(403).json({
        error: 'Admin consent required',
        detail: 'A tenant admin must grant this app permission to access SharePoint. ' +
          'Ask your admin to visit the admin consent URL for this application.',
        consentRequired: true
      });
    }

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
