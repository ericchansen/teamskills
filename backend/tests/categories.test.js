const request = require('supertest');
const db = require('../db');

jest.mock('../db');

describe('Categories API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/categories', () => {
    test('should return all categories', async () => {
      const mockCategories = [
        { id: 1, name: 'Azure Compute' },
        { id: 2, name: 'Azure Data' },
      ];

      db.query.mockResolvedValue({ rows: mockCategories });

      const app = require('../server');
      const response = await request(app).get('/api/categories');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockCategories);
    });

    test('should handle database errors', async () => {
      db.query.mockRejectedValue(new Error('Database error'));

      const app = require('../server');
      const response = await request(app).get('/api/categories');

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('POST /api/categories', () => {
    test('should create a new category', async () => {
      const newCategory = { name: 'Azure Networking' };
      const mockResult = { id: 3, name: 'Azure Networking' };

      db.query.mockResolvedValue({ rows: [mockResult] });

      const app = require('../server');
      const response = await request(app)
        .post('/api/categories')
        .send(newCategory);

      expect(response.status).toBe(201);
      expect(response.body).toEqual(mockResult);
    });

    test('should handle missing category name', async () => {
      db.query.mockRejectedValue(new Error('null value in column "name"'));

      const app = require('../server');
      const response = await request(app)
        .post('/api/categories')
        .send({});

      expect(response.status).toBe(500);
    });
  });

  describe('POST /api/categories - Auth enforcement', () => {
    afterEach(() => {
      delete process.env.AZURE_AD_CLIENT_ID;
      delete process.env.AZURE_AD_TENANT_ID;
    });

    test('should return 401 when auth is configured but no token provided', async () => {
      process.env.AZURE_AD_CLIENT_ID = 'test-client-id';
      process.env.AZURE_AD_TENANT_ID = 'test-tenant-id';

      const app = require('../server');
      const response = await request(app)
        .post('/api/categories')
        .send({ name: 'Test Category' });

      expect(response.status).toBe(401);
    });

    test('should succeed in demo mode (auth not configured)', async () => {
      delete process.env.AZURE_AD_CLIENT_ID;
      delete process.env.AZURE_AD_TENANT_ID;

      const mockResult = { id: 1, name: 'New Category' };
      db.query.mockResolvedValue({ rows: [mockResult] });

      const app = require('../server');
      const response = await request(app)
        .post('/api/categories')
        .send({ name: 'New Category' });

      expect(response.status).toBe(201);
      expect(response.body).toEqual(mockResult);
    });
  });
});
