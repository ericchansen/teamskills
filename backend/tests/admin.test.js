const request = require('supertest');
const db = require('../db');

jest.mock('../db');

describe('Admin API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/admin/init', () => {
    test('should reject without INIT_SECRET', async () => {
      delete process.env.INIT_SECRET;

      const app = require('../server');
      const response = await request(app)
        .post('/api/admin/init')
        .send({ secret: 'wrong' });

      expect(response.status).toBe(401);
      expect(response.body.error).toMatch(/unauthorized/i);
    });

    test('should reject with wrong secret', async () => {
      process.env.INIT_SECRET = 'correct-secret';

      const app = require('../server');
      const response = await request(app)
        .post('/api/admin/init')
        .send({ secret: 'wrong-secret' });

      expect(response.status).toBe(401);

      delete process.env.INIT_SECRET;
    });

    test('should skip when database already initialized', async () => {
      process.env.INIT_SECRET = 'test-secret';

      // tables exist
      db.query.mockResolvedValueOnce({ rows: [{ count: '1' }] });
      // data exists
      db.query.mockResolvedValueOnce({ rows: [{ count: '10' }] });

      const app = require('../server');
      const response = await request(app)
        .post('/api/admin/init')
        .send({ secret: 'test-secret' });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('skipped');

      delete process.env.INIT_SECRET;
    });
  });

  describe('GET /api/admin/status', () => {
    test('should return database status', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ time: '2026-01-01T00:00:00Z' }] })
        .mockResolvedValueOnce({ rows: [{ count: '5' }] })
        .mockResolvedValueOnce({ rows: [{ count: '20' }] });

      const app = require('../server');
      const response = await request(app).get('/api/admin/status');

      expect(response.status).toBe(200);
      expect(response.body.connected).toBe(true);
      expect(response.body.counts).toHaveProperty('users');
      expect(response.body.counts).toHaveProperty('skills');
    });

    test('should handle database connection failure', async () => {
      db.query.mockRejectedValue(new Error('Connection refused'));

      const app = require('../server');
      const response = await request(app).get('/api/admin/status');

      expect(response.status).toBe(500);
      expect(response.body.connected).toBe(false);
    });
  });

  describe('GET /api/admin/users', () => {
    test('should return all users with admin status', async () => {
      const mockUsers = [
        { id: 1, name: 'Admin User', email: 'admin@example.com', is_admin: true },
        { id: 2, name: 'Regular User', email: 'user@example.com', is_admin: false },
      ];

      db.query.mockResolvedValue({ rows: mockUsers });

      const app = require('../server');
      const response = await request(app).get('/api/admin/users');

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(2);
    });
  });

  describe('PUT /api/admin/users/:id/admin', () => {
    test('should grant admin access', async () => {
      const mockResult = { id: 2, name: 'User', email: 'user@example.com', is_admin: true };
      db.query.mockResolvedValue({ rows: [mockResult] });

      const app = require('../server');
      const response = await request(app)
        .put('/api/admin/users/2/admin')
        .send({ is_admin: true });

      expect(response.status).toBe(200);
      expect(response.body.is_admin).toBe(true);
    });

    test('should reject non-boolean is_admin', async () => {
      const app = require('../server');
      const response = await request(app)
        .put('/api/admin/users/2/admin')
        .send({ is_admin: 'yes' });

      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/boolean/i);
    });

    test('should return 404 for non-existent user', async () => {
      db.query.mockResolvedValue({ rows: [] });

      const app = require('../server');
      const response = await request(app)
        .put('/api/admin/users/999/admin')
        .send({ is_admin: true });

      expect(response.status).toBe(404);
    });
  });

  describe('PUT /api/admin/user-skills', () => {
    test('should update any user skill as admin', async () => {
      const mockResult = { id: 1, user_id: 2, skill_id: 5, proficiency_level: 'L400' };
      db.query.mockResolvedValue({ rows: [mockResult] });

      const app = require('../server');
      const response = await request(app)
        .put('/api/admin/user-skills')
        .send({ user_id: 2, skill_id: 5, proficiency_level: 'L400' });

      expect(response.status).toBe(200);
      expect(response.body.proficiency_level).toBe('L400');
    });

    test('should reject missing required fields', async () => {
      const app = require('../server');
      const response = await request(app)
        .put('/api/admin/user-skills')
        .send({ user_id: 2 });

      expect(response.status).toBe(400);
    });

    test('should reject invalid proficiency level', async () => {
      const app = require('../server');
      const response = await request(app)
        .put('/api/admin/user-skills')
        .send({ user_id: 2, skill_id: 5, proficiency_level: 'L500' });

      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/invalid proficiency/i);
    });
  });

  describe('DELETE /api/admin/user-skills', () => {
    test('should delete any user skill as admin', async () => {
      db.query.mockResolvedValue({ rows: [] });

      const app = require('../server');
      const response = await request(app)
        .delete('/api/admin/user-skills')
        .send({ user_id: 2, skill_id: 5 });

      expect(response.status).toBe(200);
      expect(response.body.message).toMatch(/removed/i);
    });

    test('should reject missing required fields', async () => {
      const app = require('../server');
      const response = await request(app)
        .delete('/api/admin/user-skills')
        .send({});

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/admin/status - Auth enforcement', () => {
    afterEach(() => {
      delete process.env.AZURE_AD_CLIENT_ID;
      delete process.env.AZURE_AD_TENANT_ID;
    });

    test('should return 401 when auth is configured but no token provided', async () => {
      process.env.AZURE_AD_CLIENT_ID = 'test-client-id';
      process.env.AZURE_AD_TENANT_ID = 'test-tenant-id';

      const app = require('../server');
      const response = await request(app).get('/api/admin/status');

      expect(response.status).toBe(401);
    });

    test('should succeed in demo mode (auth not configured)', async () => {
      delete process.env.AZURE_AD_CLIENT_ID;
      delete process.env.AZURE_AD_TENANT_ID;

      db.query
        .mockResolvedValueOnce({ rows: [{ time: '2026-01-01T00:00:00Z' }] })
        .mockResolvedValueOnce({ rows: [{ count: '5' }] })
        .mockResolvedValueOnce({ rows: [{ count: '20' }] });

      const app = require('../server');
      const response = await request(app).get('/api/admin/status');

      expect(response.status).toBe(200);
      expect(response.body.connected).toBe(true);
    });
  });

  describe('GET /api/admin/status - Error handling', () => {
    test('should return generic error message, not raw error details', async () => {
      db.query.mockRejectedValue(new Error('ECONNREFUSED 127.0.0.1:5432'));

      const app = require('../server');
      const response = await request(app).get('/api/admin/status');

      expect(response.status).toBe(500);
      expect(response.body.connected).toBe(false);
      expect(response.body.error).toBe('Database connection failed');
      expect(response.body.error).not.toContain('ECONNREFUSED');
    });
  });
});
