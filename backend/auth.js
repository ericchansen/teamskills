/**
 * Microsoft Entra ID Authentication Middleware
 * 
 * Validates JWT Bearer tokens from Entra ID and attaches user info to req.user.
 * Supports both authenticated and optional authentication modes.
 */

const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');
const db = require('./db');

// JWKS client for fetching Microsoft's signing keys
// Use tenant-specific endpoint when configured, fall back to 'common' for demo mode
const jwksUri = process.env.AZURE_AD_TENANT_ID
  ? `https://login.microsoftonline.com/${process.env.AZURE_AD_TENANT_ID}/discovery/v2.0/keys`
  : 'https://login.microsoftonline.com/common/discovery/v2.0/keys';

const client = jwksClient({
  jwksUri,
  cache: true,
  cacheMaxAge: 86400000, // 24 hours
  rateLimit: true,
  jwksRequestsPerMinute: 10
});

/**
 * Get the signing key from JWKS endpoint
 */
function getKey(header, callback) {
  client.getSigningKey(header.kid, (err, key) => {
    if (err) {
      callback(err);
      return;
    }
    const signingKey = key.getPublicKey();
    callback(null, signingKey);
  });
}

/**
 * Verify JWT token from Entra ID
 */
function verifyToken(token) {
  return new Promise((resolve, reject) => {
    const options = {
      audience: [`api://${process.env.AZURE_AD_CLIENT_ID}`, process.env.AZURE_AD_CLIENT_ID],
      algorithms: ['RS256']
    };

    // Validate issuer when tenant ID is configured (prevents cross-tenant token abuse)
    if (process.env.AZURE_AD_TENANT_ID) {
      options.issuer = [
        `https://login.microsoftonline.com/${process.env.AZURE_AD_TENANT_ID}/v2.0`,
        `https://sts.windows.net/${process.env.AZURE_AD_TENANT_ID}/`
      ];
    }

    jwt.verify(token, getKey, options, (err, decoded) => {
      if (err) {
        reject(err);
      } else {
        resolve(decoded);
      }
    });
  });
}

/**
 * Find or create user based on Entra ID claims
 */
async function findOrCreateUser(claims) {
  const oid = claims.oid || claims.sub;
  const email = claims.email || claims.preferred_username || claims.upn;
  const name = claims.name || email?.split('@')[0] || 'Unknown User';

  // First, try to find by Entra OID (most reliable)
  let result = await db.query(
    'SELECT * FROM users WHERE entra_oid = $1',
    [oid]
  );

  if (result.rows.length > 0) {
    return result.rows[0];
  }

  // Next, try to find by email (links pre-existing users)
  if (email) {
    result = await db.query(
      'SELECT * FROM users WHERE LOWER(email) = LOWER($1)',
      [email]
    );

    if (result.rows.length > 0) {
      // Link existing user to Entra ID
      const user = result.rows[0];
      await db.query(
        'UPDATE users SET entra_oid = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [oid, user.id]
      );
      return { ...user, entra_oid: oid };
    }
  }

  // Create new user
  result = await db.query(
    `INSERT INTO users (name, email, entra_oid, role, team) 
     VALUES ($1, $2, $3, $4, $5) 
     RETURNING *`,
    [name, email, oid, 'Team Member', null]
  );

  return result.rows[0];
}

/**
 * Check if Entra ID authentication is configured
 */
function isAuthConfigured() {
  return !!(process.env.AZURE_AD_CLIENT_ID && process.env.AZURE_AD_TENANT_ID);
}

/**
 * Required authentication middleware
 * Rejects requests without valid token when auth is configured.
 * Passes through when auth is not configured (demo mode).
 */
async function requireAuth(req, res, next) {
  if (!isAuthConfigured()) {
    if (process.env.NODE_ENV === 'production') {
      return res.status(503).json({ error: 'Authentication not configured. Contact administrator.' });
    }
    // Auth not configured — allow all requests (demo mode)
    return next();
  }

  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization header required' });
  }

  const token = authHeader.substring(7);

  try {
    const claims = await verifyToken(token);
    const user = await findOrCreateUser(claims);
    req.user = user;
    req.claims = claims;
    next();
  } catch (err) {
    console.error('Auth error:', err.message);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/**
 * Optional authentication middleware
 * Allows requests without token, but attaches user if token provided
 */
async function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    // No token - continue without user
    req.user = null;
    return next();
  }

  const token = authHeader.substring(7);

  try {
    const claims = await verifyToken(token);
    const user = await findOrCreateUser(claims);
    req.user = user;
    req.claims = claims;
  } catch (err) {
    // Invalid token - continue without user (don't fail)
    console.warn('Optional auth failed:', err.message);
    req.user = null;
  }

  next();
}

/**
 * Ownership check middleware factory
 * Ensures user can only modify their own resources (unless admin).
 * Passes through when auth is not configured (demo mode).
 */
function requireOwnership(getUserIdFromRequest) {
  return (req, res, next) => {
    if (!isAuthConfigured()) {
      return next();
    }

    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Admins can modify any user's data
    if (req.user.is_admin) {
      return next();
    }

    const resourceUserId = getUserIdFromRequest(req);
    
    if (req.user.id !== parseInt(resourceUserId, 10)) {
      return res.status(403).json({ error: 'You can only modify your own data' });
    }

    next();
  };
}

/**
 * Admin-only middleware
 * Requires the authenticated user to have is_admin = true.
 * Passes through when auth is not configured (demo mode).
 */
function requireAdmin(req, res, next) {
  if (!isAuthConfigured()) {
    return next();
  }

  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  if (!req.user.is_admin) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  next();
}

module.exports = {
  requireAuth,
  optionalAuth,
  requireOwnership,
  requireAdmin,
  verifyToken,
  findOrCreateUser,
  isAuthConfigured
};
