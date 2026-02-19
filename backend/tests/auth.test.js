/**
 * Auth middleware tests
 */

const { findOrCreateUser, requireAdmin, requireOwnership } = require('../auth');

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
      // Third query (insert) returns new user
      db.query.mockResolvedValueOnce({ rows: [newUser] });

      const result = await findOrCreateUser(mockClaims);

      expect(db.query).toHaveBeenCalledTimes(3);
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
      db.query.mockResolvedValueOnce({ rows: [{ id: 4, email: 'user@company.com' }] });

      await findOrCreateUser(claims);

      // Verify INSERT used preferred_username as email
      expect(db.query).toHaveBeenNthCalledWith(3,
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
