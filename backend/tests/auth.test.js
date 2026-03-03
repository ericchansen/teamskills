/**
 * Auth middleware tests
 */

const { findOrCreateUser, requireAdmin, requireOwnership, requireAuth, isAuthConfigured } = require('../auth');

// Mock the database module
jest.mock('../db', () => ({
  query: jest.fn()
}));

const db = require('../db');

describe('Auth Middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('findOrCreateUser', () => {
    const mockClaims = {
      oid: 'test-oid-12345',
      email: 'test@example.com',
      name: 'Test User'
    };

    it('should find existing user by entra_oid', async () => {
      const existingUser = {
        id: 1,
        name: 'Test User',
        email: 'test@example.com',
        entra_oid: 'test-oid-12345'
      };

      db.query.mockResolvedValueOnce({ rows: [existingUser] });

      const result = await findOrCreateUser(mockClaims);

      expect(db.query).toHaveBeenCalledWith(
        'SELECT * FROM users WHERE entra_oid = $1',
        ['test-oid-12345']
      );
      expect(result).toEqual(existingUser);
    });

    it('should find and link existing user by email', async () => {
      const existingUser = {
        id: 2,
        name: 'Existing User',
        email: 'test@example.com',
        entra_oid: null
      };

      // First query (by oid) returns nothing
      db.query.mockResolvedValueOnce({ rows: [] });
      // Second query (by email) returns user
      db.query.mockResolvedValueOnce({ rows: [existingUser] });
      // Third query (update entra_oid)
      db.query.mockResolvedValueOnce({ rows: [] });

      const result = await findOrCreateUser(mockClaims);

      expect(db.query).toHaveBeenCalledTimes(3);
      expect(db.query).toHaveBeenNthCalledWith(2,
        'SELECT * FROM users WHERE LOWER(email) = LOWER($1)',
        ['test@example.com']
      );
      expect(result.entra_oid).toBe('test-oid-12345');
    });

    it('should link CSV-imported user by name when oid and email miss', async () => {
      const csvUser = {
        id: 5,
        name: 'Test User',
        email: 'test.user@placeholder.local',
        entra_oid: null
      };

      // First query (by oid) returns nothing
      db.query.mockResolvedValueOnce({ rows: [] });
      // Second query (by email) returns nothing (placeholder email doesn't match)
      db.query.mockResolvedValueOnce({ rows: [] });
      // Third query (by name) returns CSV user
      db.query.mockResolvedValueOnce({ rows: [csvUser] });
      // Fourth query (update oid + email)
      db.query.mockResolvedValueOnce({ rows: [] });

      const result = await findOrCreateUser(mockClaims);

      expect(db.query).toHaveBeenCalledTimes(4);
      expect(db.query).toHaveBeenNthCalledWith(3,
        'SELECT * FROM users WHERE LOWER(name) = LOWER($1)',
        ['Test User']
      );
      expect(result.entra_oid).toBe('test-oid-12345');
      expect(result.email).toBe('test@example.com');
    });

    it('should not match by name when multiple users have the same name', async () => {
      const duplicateUser1 = {
        id: 10,
        name: 'Test User',
        email: 'test.user@placeholder.local',
        entra_oid: null
      };
      const duplicateUser2 = {
        id: 11,
        name: 'Test User',
        email: 'test.user2@placeholder.local',
        entra_oid: null
      };
      const newUser = {
        id: 12,
        name: 'Test User',
        email: 'test@example.com',
        entra_oid: 'test-oid-12345',
        role: 'Team Member',
        team: null
      };

      // First query (by oid) returns nothing
      db.query.mockResolvedValueOnce({ rows: [] });
      // Second query (by email) returns nothing
      db.query.mockResolvedValueOnce({ rows: [] });
      // Third query (by name) returns multiple users
      db.query.mockResolvedValueOnce({ rows: [duplicateUser1, duplicateUser2] });
      // Fourth query (insert) creates new user
      db.query.mockResolvedValueOnce({ rows: [newUser] });

      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

      const result = await findOrCreateUser(mockClaims);

      expect(db.query).toHaveBeenCalledTimes(4);
      expect(db.query).toHaveBeenNthCalledWith(4,
        expect.stringContaining('INSERT INTO users'),
        ['Test User', 'test@example.com', 'test-oid-12345', 'Team Member', null]
      );
      expect(result).toEqual(newUser);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Multiple users found with name "Test User"')
      );

      warnSpy.mockRestore();
    });

    it('should create new user if not found', async () => {
      const newUser = {
        id: 3,
        name: 'Test User',
        email: 'test@example.com',
        entra_oid: 'test-oid-12345',
        role: 'Team Member',
        team: null
      };

      // First query (by oid) returns nothing
      db.query.mockResolvedValueOnce({ rows: [] });
      // Second query (by email) returns nothing
      db.query.mockResolvedValueOnce({ rows: [] });
      // Third query (by name) returns nothing
      db.query.mockResolvedValueOnce({ rows: [] });
      // Fourth query (insert) returns new user
      db.query.mockResolvedValueOnce({ rows: [newUser] });

      const result = await findOrCreateUser(mockClaims);

      expect(db.query).toHaveBeenCalledTimes(4);
      expect(result).toEqual(newUser);
    });

    it('should handle claims with preferred_username', async () => {
      const claims = {
        oid: 'another-oid',
        preferred_username: 'user@company.com',
        name: 'Company User'
      };

      db.query.mockResolvedValueOnce({ rows: [] });
      db.query.mockResolvedValueOnce({ rows: [] });
      db.query.mockResolvedValueOnce({ rows: [] });
      db.query.mockResolvedValueOnce({ rows: [{ id: 4, email: 'user@company.com' }] });

      await findOrCreateUser(claims);

      // Verify INSERT used preferred_username as email
      expect(db.query).toHaveBeenNthCalledWith(4,
        expect.stringContaining('INSERT INTO users'),
        ['Company User', 'user@company.com', 'another-oid', 'Team Member', null]
      );
    });
  });

  describe('requireAdmin', () => {
    it('should pass through when auth is not configured', () => {
      delete process.env.AZURE_AD_CLIENT_ID;
      delete process.env.AZURE_AD_TENANT_ID;

      const req = {};
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();

      requireAdmin(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('should reject when no user is authenticated', () => {
      process.env.AZURE_AD_CLIENT_ID = 'test-client-id';
      process.env.AZURE_AD_TENANT_ID = 'test-tenant-id';

      const req = { user: null };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();

      requireAdmin(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();

      delete process.env.AZURE_AD_CLIENT_ID;
      delete process.env.AZURE_AD_TENANT_ID;
    });

    it('should reject non-admin users', () => {
      process.env.AZURE_AD_CLIENT_ID = 'test-client-id';
      process.env.AZURE_AD_TENANT_ID = 'test-tenant-id';

      const req = { user: { id: 1, is_admin: false } };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();

      requireAdmin(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();

      delete process.env.AZURE_AD_CLIENT_ID;
      delete process.env.AZURE_AD_TENANT_ID;
    });

    it('should allow admin users', () => {
      process.env.AZURE_AD_CLIENT_ID = 'test-client-id';
      process.env.AZURE_AD_TENANT_ID = 'test-tenant-id';

      const req = { user: { id: 1, is_admin: true } };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();

      requireAdmin(req, res, next);
      expect(next).toHaveBeenCalled();

      delete process.env.AZURE_AD_CLIENT_ID;
      delete process.env.AZURE_AD_TENANT_ID;
    });
  });

  describe('requireAuth', () => {
    let savedNodeEnv;

    beforeEach(() => {
      savedNodeEnv = process.env.NODE_ENV;
      delete process.env.AZURE_AD_CLIENT_ID;
      delete process.env.AZURE_AD_TENANT_ID;
    });

    afterEach(() => {
      process.env.NODE_ENV = savedNodeEnv;
      delete process.env.AZURE_AD_CLIENT_ID;
      delete process.env.AZURE_AD_TENANT_ID;
    });

    it('should return 503 in production when auth env vars are missing', async () => {
      process.env.NODE_ENV = 'production';

      const req = {};
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();

      await requireAuth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Authentication not configured. Contact administrator.'
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should call next() in non-production when auth env vars are missing (demo mode)', async () => {
      process.env.NODE_ENV = 'development';

      const req = {};
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();

      await requireAuth(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should call next() in test env when auth env vars are missing (demo mode)', async () => {
      process.env.NODE_ENV = 'test';

      const req = {};
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();

      await requireAuth(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should return 401 when auth is configured but no Authorization header', async () => {
      process.env.AZURE_AD_CLIENT_ID = 'test-client-id';
      process.env.AZURE_AD_TENANT_ID = 'test-tenant-id';

      const req = { headers: {} };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();

      await requireAuth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Authorization header required' });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('isAuthConfigured', () => {
    afterEach(() => {
      delete process.env.AZURE_AD_CLIENT_ID;
      delete process.env.AZURE_AD_TENANT_ID;
    });

    it('should return false when CLIENT_ID is missing', () => {
      delete process.env.AZURE_AD_CLIENT_ID;
      delete process.env.AZURE_AD_TENANT_ID;
      expect(isAuthConfigured()).toBe(false);
    });

    it('should return true when only CLIENT_ID is set (multi-tenant)', () => {
      process.env.AZURE_AD_CLIENT_ID = 'test-id';
      delete process.env.AZURE_AD_TENANT_ID;
      expect(isAuthConfigured()).toBe(true);
    });

    it('should return true when both env vars are set', () => {
      process.env.AZURE_AD_CLIENT_ID = 'test-id';
      process.env.AZURE_AD_TENANT_ID = 'test-tenant';
      expect(isAuthConfigured()).toBe(true);
    });
  });

  describe('requireOwnership with admin bypass', () => {
    it('should allow admin to modify any user data', () => {
      process.env.AZURE_AD_CLIENT_ID = 'test-client-id';
      process.env.AZURE_AD_TENANT_ID = 'test-tenant-id';

      const middleware = requireOwnership(req => req.body.user_id);
      const req = { user: { id: 1, is_admin: true }, body: { user_id: 99 } };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();

      middleware(req, res, next);
      expect(next).toHaveBeenCalled();

      delete process.env.AZURE_AD_CLIENT_ID;
      delete process.env.AZURE_AD_TENANT_ID;
    });
  });
});
