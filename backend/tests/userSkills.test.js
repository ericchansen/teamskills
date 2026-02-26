const request = require('supertest');
const db = require('../db');

jest.mock('../db');

describe('User Skills API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/user-skills/:userId', () => {
    test('should return skills for a user', async () => {
      const mockSkills = [
        { id: 1, user_id: 1, skill_id: 1, proficiency_level: 'L300', skill_name: 'Azure Functions', category_name: 'Apps & AI' },
        { id: 2, user_id: 1, skill_id: 2, proficiency_level: 'L200', skill_name: 'Azure SQL', category_name: 'Data' },
      ];

      db.query.mockResolvedValue({ rows: mockSkills });

      const app = require('../server');
      const response = await request(app).get('/api/user-skills/1');

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(2);
      expect(response.body[0].skill_name).toBe('Azure Functions');
    });

    test('should return empty array for user with no skills', async () => {
      db.query.mockResolvedValue({ rows: [] });

      const app = require('../server');
      const response = await request(app).get('/api/user-skills/999');

      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });

    test('should handle database errors', async () => {
      db.query.mockRejectedValue(new Error('Database error'));

      const app = require('../server');
      const response = await request(app).get('/api/user-skills/1');

      expect(response.status).toBe(500);
      expect(response.body.error).toMatch(/failed to fetch/i);
    });
  });

  describe('PUT /api/user-skills', () => {
    test('should create or update a user skill', async () => {
      const mockResult = { id: 1, user_id: 1, skill_id: 5, proficiency_level: 'L300' };
      db.query.mockResolvedValue({ rows: [mockResult] });

      const app = require('../server');
      const response = await request(app)
        .put('/api/user-skills')
        .send({ user_id: 1, skill_id: 5, proficiency_level: 'L300' });

      expect(response.status).toBe(200);
      expect(response.body.proficiency_level).toBe('L300');
    });

    test('should reject invalid proficiency level', async () => {
      const app = require('../server');
      const response = await request(app)
        .put('/api/user-skills')
        .send({ user_id: 1, skill_id: 5, proficiency_level: 'INVALID' });

      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/invalid proficiency/i);
    });

    test('should handle database errors', async () => {
      db.query.mockRejectedValue(new Error('Database error'));

      const app = require('../server');
      const response = await request(app)
        .put('/api/user-skills')
        .send({ user_id: 1, skill_id: 5, proficiency_level: 'L200' });

      expect(response.status).toBe(500);
      expect(response.body.error).toMatch(/failed to update/i);
    });
  });

  describe('DELETE /api/user-skills', () => {
    test('should delete a user skill', async () => {
      db.query.mockResolvedValue({ rows: [{ id: 1 }] });

      const app = require('../server');
      const response = await request(app)
        .delete('/api/user-skills')
        .send({ user_id: 1, skill_id: 5 });

      expect(response.status).toBe(200);
      expect(response.body.message).toMatch(/deleted/i);
    });

    test('should return 404 when skill not found', async () => {
      db.query.mockResolvedValue({ rows: [] });

      const app = require('../server');
      const response = await request(app)
        .delete('/api/user-skills')
        .send({ user_id: 1, skill_id: 999 });

      expect(response.status).toBe(404);
    });

    test('should handle database errors', async () => {
      db.query.mockRejectedValue(new Error('Database error'));

      const app = require('../server');
      const response = await request(app)
        .delete('/api/user-skills')
        .send({ user_id: 1, skill_id: 5 });

      expect(response.status).toBe(500);
      expect(response.body.error).toMatch(/failed to delete/i);
    });
  });
});
