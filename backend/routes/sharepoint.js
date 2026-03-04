/**
 * SharePoint Sync Routes
 * 
 * Provides endpoints for bi-directional sync between the web app
 * and the SharePoint "Skills Matrix MVP" list.
 * 
 * Sync method is controlled by SHAREPOINT_SYNC_METHOD env var:
 *   - "obo"             → OBO flow (correct solution, requires tenant admin consent)
 *   - "power-automate"  → Power Automate HTTP trigger proxy (workaround)
 *   - "none" / unset    → Sync disabled
 * 
 * The OBO code is the architecturally correct approach. Power Automate
 * is a workaround for environments where the consuming tenant blocks
 * OAuth consent for unverified publisher apps.
 */

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../auth');
const { isOboConfigured, getGraphClientOnBehalfOf, extractBearerToken } = require('../services/oboClient');
const sharepoint = require('../services/sharepoint');
const pa = require('../services/powerAutomateSync');
const db = require('../db');

/**
 * Resolve the active sync method from SHAREPOINT_SYNC_METHOD env var.
 * Returns 'obo', 'power-automate', or 'none'.
 */
function getSyncMethod() {
  const method = (process.env.SHAREPOINT_SYNC_METHOD || '').toLowerCase().trim();
  if (method === 'obo' && isOboConfigured()) return 'obo';
  if (method === 'power-automate' && pa.isPowerAutomateConfigured()) return 'power-automate';
  return 'none';
}

/**
 * GET /api/sharepoint/status
 * Check if SharePoint sync is configured and which method is active.
 */
router.get('/status', requireAuth, (req, res) => {
  const method = getSyncMethod();
  const configured = method !== 'none';
  const messages = {
    'obo': 'SharePoint sync via OBO flow is configured and ready',
    'power-automate': 'SharePoint sync via Power Automate proxy is configured and ready',
    'none': 'SharePoint sync is not configured. Set SHAREPOINT_SYNC_METHOD to "obo" or "power-automate"'
  };

  res.json({ configured, method, message: messages[method] });
});

/**
 * POST /api/sharepoint/pull
 * Pull all skill data from SharePoint into the database.
 */
router.post('/pull', requireAuth, async (req, res) => {
  const method = getSyncMethod();

  if (method === 'none') {
    return res.status(501).json({ error: 'SharePoint sync not configured' });
  }

  try {
    let pivotData;

    if (method === 'power-automate') {
      // Power Automate proxy: flow handles its own auth
      const { items, columnMap } = await pa.pullFromSharePoint();
      pivotData = pa.transformFlowItemsToPivotFormat(items, columnMap);
    } else {
      // OBO flow: exchange user's token for Graph token
      const bearerToken = extractBearerToken(req);
      if (!bearerToken) {
        return res.status(401).json({ error: 'Bearer token required for OBO SharePoint sync' });
      }
      const graphClient = await getGraphClientOnBehalfOf(bearerToken);
      pivotData = await sharepoint.fetchPivotFromSharePoint(graphClient);
    }

    const stats = await sharepoint.syncPivotToDatabase(pivotData);

    res.json({
      message: 'SharePoint pull completed',
      method,
      source: 'sharepoint',
      ...stats
    });
  } catch (err) {
    console.error(`[SharePoint Pull][${method}] Error:`, err.message);

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
  const method = getSyncMethod();

  if (method === 'none') {
    return res.status(501).json({ error: 'SharePoint sync not configured' });
  }

  if (!req.user || !req.user.id) {
    return res.status(401).json({ error: 'User must be authenticated' });
  }

  try {
    let result;

    if (method === 'power-automate') {
      // Read user's skills from DB and push via Power Automate
      const userSkills = await db.query(`
        SELECT s.name as skill_name, us.proficiency_level
        FROM user_skills us
        JOIN skills s ON us.skill_id = s.id
        WHERE us.user_id = $1
      `, [req.user.id]);

      const fieldUpdates = {};
      for (const row of userSkills.rows) {
        const numericValue = parseInt(row.proficiency_level.replace('L', ''), 10);
        fieldUpdates[row.skill_name] = numericValue;
      }

      if (Object.keys(fieldUpdates).length === 0) {
        result = { status: 'skipped', reason: 'No skills to push' };
      } else {
        await pa.pushToSharePoint(req.user.name, fieldUpdates);
        result = { status: 'success', fieldsUpdated: Object.keys(fieldUpdates).length };
      }
    } else {
      // OBO flow
      const bearerToken = extractBearerToken(req);
      if (!bearerToken) {
        return res.status(401).json({ error: 'Bearer token required for OBO SharePoint sync' });
      }
      const graphClient = await getGraphClientOnBehalfOf(bearerToken);
      result = await sharepoint.pushUserSkillsToSharePoint(graphClient, req.user);
    }

    res.json({
      message: 'SharePoint push completed',
      method,
      ...result
    });
  } catch (err) {
    console.error(`[SharePoint Push][${method}] Error:`, err.message);

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

// Exported for testing
router._getSyncMethod = getSyncMethod;

module.exports = router;
