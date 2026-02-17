/**
 * Auth middleware tests
 */

const { findOrCreateUser } = require('../auth');

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
});
