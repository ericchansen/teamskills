const request = require('supertest');
const db = require('../db');

jest.mock('../db');

describe('Skills API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/skills', () => {
    test('should return all skills with categories', async () => {
      const mockSkills = [
        { id: 1, name: 'Azure Functions', category_id: 1, category_name: 'Azure Compute' },
        { id: 2, name: 'Azure SQL', category_id: 2, category_name: 'Azure Data' },
      ];

      db.query.mockResolvedValue({ rows: mockSkills });

      const app = require('../server');
      const response = await request(app).get('/api/skills');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockSkills);
    });
  });

  describe('POST /api/skills', () => {
    test('should create a new skill', async () => {
      const newSkill = {
        name: 'Azure OpenAI',
        category_id: 3,
        description: 'GPT models',
      };

      const createdSkill = { id: 10, ...newSkill };
      db.query.mockResolvedValue({ rows: [createdSkill] });

      const app = require('../server');
      const response = await request(app)
        .post('/api/skills')
        .send(newSkill);

      expect(response.status).toBe(201);
      expect(response.body).toEqual(createdSkill);
    });
  });

  describe('GET /api/skills/:id/related', () => {
    test('should return related skills', async () => {
      const mockRelated = [
        { id: 2, name: 'PostgreSQL', relationship: 'child' },
        { id: 3, name: 'MySQL', relationship: 'child' },
      ];

      db.query.mockResolvedValue({ rows: mockRelated });

      const app = require('../server');
      const response = await request(app).get('/api/skills/1/related');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockRelated);
    });
  });
});
