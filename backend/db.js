const { Pool } = require('pg');
const logger = require('./logger');
require('dotenv').config();

const pool = new Pool({
  user: process.env.PGUSER || process.env.DB_USER || 'postgres',
  host: process.env.PGHOST || process.env.DB_HOST || 'localhost',
  database: process.env.PGDATABASE || process.env.DB_NAME || 'teamskills',
  password: process.env.PGPASSWORD || process.env.DB_PASSWORD || 'postgres',
  port: process.env.PGPORT || process.env.DB_PORT || 5432,
  ssl: process.env.PGSSLMODE === 'require' ? { rejectUnauthorized: true } : false,
  max: parseInt(process.env.DB_POOL_MAX, 10) || 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,  // Fail fast if DB unreachable (e.g. auto-paused)
  statement_timeout: 30000,       // Kill queries that hang >30s
});

pool.on('error', (err) => {
  logger.error({ err }, 'Unexpected error on idle client');
  // Do not exit — Azure PostgreSQL auto-pause causes transient errors
  // Pool auto-removes the dead client and creates a new one on next checkout
});

// Error codes that indicate a transient connection issue worth retrying
const TRANSIENT_ERROR_CODES = new Set([
  'ECONNREFUSED',  // DB not listening (stopped/restarting)
  'ECONNRESET',    // Connection dropped mid-flight
  'ETIMEDOUT',     // Network timeout
  'EPIPE',         // Broken pipe
  '57P01',         // PG: admin_shutdown
  '57P03',         // PG: cannot_connect_now (starting up)
  '08006',         // PG: connection_failure
  '08001',         // PG: sqlclient_unable_to_establish_sqlconnection
  '08003',         // PG: connection_does_not_exist
  '08004',         // PG: sqlserver_rejected_establishment_of_sqlconnection
]);

function isTransientError(err) {
  return TRANSIENT_ERROR_CODES.has(err.code) ||
    err.message?.includes('Connection terminated') ||
    err.message?.includes('connection timeout') ||
    err.message?.includes('the database system is starting up');
}

/**
 * Execute a query with automatic retry on transient DB errors.
 * Retries up to `maxRetries` times with exponential backoff.
 */
async function queryWithRetry(text, params, maxRetries = 3) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await pool.query(text, params);
    } catch (err) {
      if (attempt < maxRetries && isTransientError(err)) {
        const delayMs = Math.min(1000 * 2 ** attempt, 8000);
        logger.warn(
          { attempt: attempt + 1, maxAttempts: maxRetries + 1, delayMs, errorCode: err.code },
          'Transient DB error, retrying'
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }
      throw err;
    }
  }
}

module.exports = {
  query: (text, params) => queryWithRetry(text, params),
  pool,
};
