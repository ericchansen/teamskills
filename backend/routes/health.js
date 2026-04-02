const express = require('express');
const router = express.Router();
const db = require('../db');
const logger = require('../logger');

// Liveness probe — cheap, no dependencies. Proves the process is alive.
router.get('/live', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Readiness probe — checks DB connectivity and schema compatibility.
router.get('/ready', async (req, res) => {
  const start = Date.now();
  try {
    // Verify schema has required columns (catches missed migrations)
    await db.query('SELECT id, parent_id FROM skill_categories LIMIT 1');
    const latencyMs = Date.now() - start;
    res.json({
      status: 'ok',
      database: 'connected',
      database_latency_ms: latencyMs,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const latencyMs = Date.now() - start;
    const schemaErrorCodes = ['42703', '42P01']; // undefined_column, undefined_table
    const isSchemaError = schemaErrorCodes.includes(error.code);
    logger.error({ err: error, requestId: req.correlationId }, 'Readiness check failed');
    res.status(503).json({
      status: 'unavailable',
      database: isSchemaError ? 'schema_outdated' : 'disconnected',
      database_latency_ms: latencyMs,
      error: isSchemaError ? 'Schema migration required' : 'Database connection failed',
      timestamp: new Date().toISOString(),
    });
  }
});

// Legacy health endpoint — kept for backward compatibility (e.g. external monitors)
router.get('/', async (req, res) => {
  const start = Date.now();
  try {
    await db.query('SELECT 1');
    const latencyMs = Date.now() - start;
    res.json({
      status: 'ok',
      database: 'connected',
      database_latency_ms: latencyMs,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const latencyMs = Date.now() - start;
    logger.error({ err: error, requestId: req.correlationId }, 'Health check failed');
    res.status(503).json({
      status: 'unavailable',
      database: 'disconnected',
      database_latency_ms: latencyMs,
      error: 'Database connection failed',
      timestamp: new Date().toISOString(),
    });
  }
});

module.exports = router;
