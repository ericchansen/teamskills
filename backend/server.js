require('dotenv').config();

if (process.env.APPLICATIONINSIGHTS_CONNECTION_STRING) {
  const { useAzureMonitor } = require('@azure/monitor-opentelemetry');
  useAzureMonitor();
}

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const pinoHttp = require('pino-http');
const logger = require('./logger');

const app = express();
const PORT = process.env.PORT || 3001;

// Trust proxy for correct client IP behind load balancers
app.set('trust proxy', 1);

// Correlation ID middleware
app.use((req, res, next) => {
  req.correlationId = req.headers['x-correlation-id'] || crypto.randomUUID();
  res.setHeader('x-correlation-id', req.correlationId);
  next();
});

// Request logging
app.use(pinoHttp({
  logger,
  genReqId: (req) => req.correlationId,
  customLogLevel: (req, res, err) => {
    if (res.statusCode >= 500 || err) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  customSuccessMessage: (req, res) => `${req.method} ${req.url} ${res.statusCode}`,
  customErrorMessage: (req, res) => `${req.method} ${req.url} ${res.statusCode}`,
}));

// Security headers
app.use(helmet());

// Rate limiting
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: process.env.RATE_LIMIT_MAX || 100, // 100 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' }
});
app.use('/api/', limiter);

// Middleware
const FRONTEND_URL = process.env.FRONTEND_URL;
if (!FRONTEND_URL || FRONTEND_URL === '*') {
  logger.warn('FRONTEND_URL not set or is wildcard. CORS will be restrictive in production.');
}
const corsOrigin = process.env.NODE_ENV === 'production' && (!FRONTEND_URL || FRONTEND_URL === '*')
  ? false  // Reject all cross-origin requests if not configured in production
  : FRONTEND_URL || true;  // Allow all in development if not set
app.use(cors({
  origin: corsOrigin,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '100kb' }));

// Routes
const usersRouter = require('./routes/users');
const skillsRouter = require('./routes/skills');
const categoriesRouter = require('./routes/categories');
const userSkillsRouter = require('./routes/userSkills');
const matrixRouter = require('./routes/matrix');
const adminRouter = require('./routes/admin');
const authRouter = require('./routes/authRoutes');
const proposalsRouter = require('./routes/proposals');
const trendsRouter = require('./routes/trends');
const sharepointRouter = require('./routes/sharepoint');
const { requireAuth } = require('./auth');

// Pre-auth routes (have their own per-route authentication)
app.use('/api/auth', authRouter);
app.use('/api/admin', adminRouter); // Uses INIT_SECRET or per-route requireAuth+requireAdmin

// All other API routes require authentication (passes through in demo mode)
app.use('/api', requireAuth);

app.use('/api/users', usersRouter);
app.use('/api/skills', skillsRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/user-skills', userSkillsRouter);
app.use('/api/matrix', matrixRouter);
app.use('/api/proposals', proposalsRouter);
app.use('/api/trends', trendsRouter);
app.use('/api/sharepoint', sharepointRouter);

// Liveness probe — cheap, no dependencies. Proves the process is alive.
app.get('/health/live', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Readiness probe — checks DB connectivity and schema compatibility.
app.get('/health/ready', async (req, res) => {
  const start = Date.now();
  try {
    const db = require('./db');
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
    const isSchemaError = error.code === '42703'; // undefined_column
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
app.get('/health', async (req, res) => {
  const start = Date.now();
  try {
    const db = require('./db');
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

// Error handling middleware
app.use((err, req, res, _next) => {
  logger.error({ err, requestId: req.correlationId }, 'Unhandled server error');
  // Return generic message to client
  res.status(500).json({ error: 'Something went wrong!' });
});

// Only start server if not in test mode
let server;
if (process.env.NODE_ENV !== 'test') {
  const { runMigrations } = require('./migrate');
  runMigrations().then(() => {
    server = app.listen(PORT, () => {
      logger.info({ port: PORT }, 'Server running');
    });
  });
}

// Graceful shutdown on SIGTERM (Azure Container Apps scale-down/redeploy)
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, closing server gracefully');
  if (server) {
    server.close(() => {
      logger.info('HTTP server closed');
    });
  }
  try {
    const { pool } = require('./db');
    await pool.end();
    logger.info('Database pool closed');
  } catch (err) {
    logger.error({ err }, 'Error closing database pool');
  }
  process.exit(0);
});

module.exports = app;
