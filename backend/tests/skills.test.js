const request = require('supertest');
const db = require('../db');

jest.mock('../db');

describe('Skills API', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    db.pool.connect.mockImplementation(async () => ({
      query: db.query,
      release: jest.fn(),
    }));
  });

  describe('GET /api/skills', () => {
    test('returns all skills with categories', async () => {
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
    test('creates a new skill with normalized metadata', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ id: 3 }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 10 }] })
        .mockResolvedValueOnce({
          rows: [{
            id: 10,
            name: 'Azure OpenAI',
            category_id: 3,
            category_name: 'Azure AI',
            lifecycle_status: 'active',
          }],
        });

      const app = require('../server');
      const response = await request(app)
        .post('/api/skills')
        .send({
          name: 'Azure OpenAI',
          category_id: 3,
          description: 'GPT models',
        });

      expect(response.status).toBe(201);
      expect(response.body.id).toBe(10);
      expect(response.body.name).toBe('Azure OpenAI');
    });

    test('rejects duplicate skill names', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ id: 3 }] })
        .mockResolvedValueOnce({ rows: [{ id: 12, name: 'Azure OpenAI', preferred_label: 'Azure OpenAI' }] });

      const app = require('../server');
      const response = await request(app)
        .post('/api/skills')
        .send({
          name: 'Azure OpenAI',
          category_id: 3,
        });

      expect(response.status).toBe(409);
      expect(response.body.error).toMatch(/already exists/i);
    });
  });

  describe('POST /api/skills/merge', () => {
    test('merges duplicate skills into the surviving skill', async () => {
      const release = jest.fn();
      db.pool.connect.mockResolvedValueOnce({ query: db.query, release });

      db.query
        .mockResolvedValueOnce({
          rows: [
            { id: 1, name: 'Microsoft Fabric', category_id: 4, lifecycle_status: 'active', vendor_namespace: null },
            { id: 2, name: 'Fabric Data Engineering', category_id: 4, lifecycle_status: 'active', vendor_namespace: null },
          ],
        })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rows: [{ user_id: 7, proficiency_level: 'L300', notes: 'Deep experience' }] })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({
          rows: [{
            id: 1,
            name: 'Microsoft Fabric',
            category_id: 4,
            category_name: 'Data Platform',
          }],
        });

      const app = require('../server');
      const response = await request(app)
        .post('/api/skills/merge')
        .send({
          surviving_skill_id: 1,
          merged_skill_ids: [2],
        });

      expect(response.status).toBe(200);
      expect(response.body.message).toMatch(/merged successfully/i);
      expect(response.body.skill.name).toBe('Microsoft Fabric');
      expect(db.pool.connect).toHaveBeenCalled();
      expect(release).toHaveBeenCalled();
    });
  });

  describe('PUT /api/skills/:id', () => {
    test('updates skill metadata without requiring every field', async () => {
      db.query
        .mockResolvedValueOnce({
          rows: [{
            id: 5,
            name: 'Copilot Studio',
            category_id: 4,
            category_name: 'Business Applications',
            description: 'Legacy description',
            lifecycle_status: 'active',
          }],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({
          rows: [{
            id: 5,
            name: 'Microsoft Copilot Studio',
            category_id: 4,
            category_name: 'Business Applications',
            description: 'Legacy description',
            lifecycle_status: 'active',
          }],
        });

      const app = require('../server');
      const response = await request(app)
        .put('/api/skills/5')
        .send({ name: 'Microsoft Copilot Studio' });

      expect(response.status).toBe(200);
      expect(response.body.name).toBe('Microsoft Copilot Studio');
    });

    test('supports retiring a skill', async () => {
      db.query
        .mockResolvedValueOnce({
          rows: [{
            id: 6,
            name: 'Legacy Skill',
            category_id: 2,
            category_name: 'Apps & AI',
            description: null,
            lifecycle_status: 'active',
          }],
        })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({
          rows: [{
            id: 6,
            name: 'Legacy Skill',
            category_id: 2,
            category_name: 'Apps & AI',
            description: null,
            lifecycle_status: 'retired',
          }],
        });

      const app = require('../server');
      const response = await request(app)
        .put('/api/skills/6')
        .send({ lifecycle_status: 'retired' });

      expect(response.status).toBe(200);
      expect(response.body.lifecycle_status).toBe('retired');
    });
  });

  describe('GET /api/skills/:id/related', () => {
    test('returns related skills', async () => {
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
