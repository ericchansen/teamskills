const request = require('supertest');

// Mock dependencies before requiring modules
jest.mock('../db');
jest.mock('../services/oboClient');

const { isOboConfigured, extractBearerToken } = require('../services/oboClient');

describe('SharePoint Sync API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: OBO not configured (safe for non-SharePoint tests)
    isOboConfigured.mockReturnValue(false);
    extractBearerToken.mockReturnValue(null);
  });

  describe('GET /api/sharepoint/status', () => {
    test('should return not configured when OBO env vars missing', async () => {
      isOboConfigured.mockReturnValue(false);

      const app = require('../server');
      const response = await request(app).get('/api/sharepoint/status');

      expect(response.status).toBe(200);
      expect(response.body.configured).toBe(false);
    });

    test('should return configured when OBO env vars present', async () => {
      isOboConfigured.mockReturnValue(true);

      const app = require('../server');
      const response = await request(app).get('/api/sharepoint/status');

      expect(response.status).toBe(200);
      expect(response.body.configured).toBe(true);
    });
  });

  describe('POST /api/sharepoint/pull', () => {
    test('should return 501 when OBO not configured', async () => {
      isOboConfigured.mockReturnValue(false);

      const app = require('../server');
      const response = await request(app).post('/api/sharepoint/pull');

      expect(response.status).toBe(501);
      expect(response.body.error).toMatch(/not configured/i);
    });

    test('should return 401 when no bearer token', async () => {
      isOboConfigured.mockReturnValue(true);
      extractBearerToken.mockReturnValue(null);

      const app = require('../server');
      const response = await request(app).post('/api/sharepoint/pull');

      expect(response.status).toBe(401);
    });
  });

  describe('POST /api/sharepoint/push', () => {
    test('should return 501 when OBO not configured', async () => {
      isOboConfigured.mockReturnValue(false);

      const app = require('../server');
      const response = await request(app).post('/api/sharepoint/push');

      expect(response.status).toBe(501);
      expect(response.body.error).toMatch(/not configured/i);
    });

    test('should return 401 when no bearer token', async () => {
      isOboConfigured.mockReturnValue(true);
      extractBearerToken.mockReturnValue(null);

      const app = require('../server');
      const response = await request(app).post('/api/sharepoint/push');

      expect(response.status).toBe(401);
    });
  });
});
