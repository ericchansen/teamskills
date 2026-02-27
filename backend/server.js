const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
require('dotenv').config();

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
  console.warn('WARNING: FRONTEND_URL not set or is wildcard. CORS will be restrictive in production.');
}
const corsOrigin = process.env.NODE_ENV === 'production' && (!FRONTEND_URL || FRONTEND_URL === '*')
  ? false  // Reject all cross-origin requests if not configured in production
  : FRONTEND_URL || true;  // Allow all in development if not set
app.use(cors({
  origin: corsOrigin,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

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

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((err, req, res, _next) => {
  // Log full error with correlation ID for debugging (server-side only)
  console.error(`[${req.correlationId}] Server error:`, err.message);
  if (process.env.NODE_ENV !== 'production') {
    console.error(err.stack);
  }
  // Return generic message to client
  res.status(500).json({ error: 'Something went wrong!' });
});

// Only start server if not in test mode
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = app;
