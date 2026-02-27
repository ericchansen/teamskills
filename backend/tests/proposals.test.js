const request = require('supertest');
const db = require('../db');

jest.mock('../db');

describe('Proposals API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/proposals', () => {
    test('should create a new proposal', async () => {
      const newProposal = { name: 'Azure Quantum', category_id: 1, description: 'Quantum computing' };
      const mockResult = { id: 1, ...newProposal, status: 'pending', proposed_by: null };

      // Check existing skill - none found
      db.query.mockResolvedValueOnce({ rows: [] });
      // Check pending duplicate - none found
      db.query.mockResolvedValueOnce({ rows: [] });
      // Insert proposal
      db.query.mockResolvedValueOnce({ rows: [mockResult] });

      const app = require('../server');
      const response = await request(app)
        .post('/api/proposals')
        .send(newProposal);

      expect(response.status).toBe(201);
      expect(response.body.name).toBe('Azure Quantum');
      expect(response.body.status).toBe('pending');
    });

    test('should reject empty skill name', async () => {
      const app = require('../server');
      const response = await request(app)
        .post('/api/proposals')
        .send({ name: '', category_id: 1 });

      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/name is required/i);
    });

    test('should reject duplicate existing skill', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ id: 1 }] });

      const app = require('../server');
      const response = await request(app)
        .post('/api/proposals')
        .send({ name: 'Existing Skill' });

      expect(response.status).toBe(409);
      expect(response.body.error).toMatch(/already exists/i);
    });

    test('should reject duplicate pending proposal', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });
      db.query.mockResolvedValueOnce({ rows: [{ id: 1 }] });

      const app = require('../server');
      const response = await request(app)
        .post('/api/proposals')
        .send({ name: 'Pending Skill' });

      expect(response.status).toBe(409);
      expect(response.body.error).toMatch(/already pending/i);
    });

    test('should handle database errors', async () => {
      db.query.mockRejectedValue(new Error('Database error'));

      const app = require('../server');
      const response = await request(app)
        .post('/api/proposals')
        .send({ name: 'Test Skill' });

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/proposals', () => {
    test('should return proposals', async () => {
      const mockProposals = [
        { id: 1, name: 'Azure Quantum', status: 'pending', category_name: 'Apps & AI' },
      ];

      db.query.mockResolvedValue({ rows: mockProposals });

      const app = require('../server');
      const response = await request(app).get('/api/proposals');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockProposals);
    });

    test('should handle database errors', async () => {
      db.query.mockRejectedValue(new Error('Database error'));

      const app = require('../server');
      const response = await request(app).get('/api/proposals');

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('POST /api/proposals/:id/approve', () => {
    test('should approve a pending proposal and create the skill', async () => {
      const mockProposal = { id: 1, name: 'Azure Quantum', category_id: 1, description: 'Quantum' };
      const mockSkill = { id: 10, name: 'Azure Quantum', category_id: 1 };

      // Get proposal
      db.query.mockResolvedValueOnce({ rows: [mockProposal] });
      // Create skill
      db.query.mockResolvedValueOnce({ rows: [mockSkill] });
      // Update proposal status
      db.query.mockResolvedValueOnce({ rows: [] });

      const app = require('../server');
      const response = await request(app)
        .post('/api/proposals/1/approve');

      expect(response.status).toBe(200);
      expect(response.body.skill.name).toBe('Azure Quantum');
      expect(response.body.proposal.status).toBe('approved');
    });

    test('should return 404 for non-existent proposal', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });

      const app = require('../server');
      const response = await request(app)
        .post('/api/proposals/999/approve');

      expect(response.status).toBe(404);
    });
  });

  describe('POST /api/proposals/:id/reject', () => {
    test('should reject a pending proposal', async () => {
      const mockResult = { id: 1, name: 'Bad Skill', status: 'rejected' };
      db.query.mockResolvedValue({ rows: [mockResult] });

      const app = require('../server');
      const response = await request(app)
        .post('/api/proposals/1/reject');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('rejected');
    });

    test('should return 404 for non-existent proposal', async () => {
      db.query.mockResolvedValue({ rows: [] });

      const app = require('../server');
      const response = await request(app)
        .post('/api/proposals/999/reject');

      expect(response.status).toBe(404);
    });
  });
});
