const request = require('supertest');

describe('SharePoint Sync API', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  function setupMocks({ oboConfigured = false } = {}) {
    jest.doMock('../db');
    jest.doMock('../services/oboClient', () => ({
      isOboConfigured: jest.fn().mockReturnValue(oboConfigured),
      getGraphClientOnBehalfOf: jest.fn(),
      extractBearerToken: jest.fn().mockReturnValue(null),
      acquireGraphTokenOnBehalfOf: jest.fn()
    }));
  }

  describe('GET /api/sharepoint/status', () => {
    test('should return not configured when OBO is not configured', async () => {
      setupMocks();
      const app = require('../server');
      const response = await request(app).get('/api/sharepoint/status');

      expect(response.status).toBe(200);
      expect(response.body.configured).toBe(false);
      expect(response.body.method).toBe('none');
    });

    test('should return configured when OBO is configured', async () => {
      setupMocks({ oboConfigured: true });
      const app = require('../server');
      const response = await request(app).get('/api/sharepoint/status');

      expect(response.status).toBe(200);
      expect(response.body.configured).toBe(true);
      expect(response.body.method).toBe('obo');
    });
  });

  describe('POST /api/sharepoint/pull', () => {
    test('should return 501 when OBO is not configured', async () => {
      setupMocks();
      const app = require('../server');
      const response = await request(app).post('/api/sharepoint/pull');

      expect(response.status).toBe(501);
      expect(response.body.error).toMatch(/not configured/i);
    });

    test('should return 401 when OBO configured but no bearer token', async () => {
      setupMocks({ oboConfigured: true });
      const app = require('../server');
      const response = await request(app).post('/api/sharepoint/pull');

      expect(response.status).toBe(401);
    });
  });

  describe('POST /api/sharepoint/push', () => {
    test('should return 501 when OBO is not configured', async () => {
      setupMocks();
      const app = require('../server');
      const response = await request(app).post('/api/sharepoint/push');

      expect(response.status).toBe(501);
      expect(response.body.error).toMatch(/not configured/i);
    });

    test('should return 401 when OBO configured but no bearer token', async () => {
      setupMocks({ oboConfigured: true });
      const app = require('../server');
      const response = await request(app).post('/api/sharepoint/push');

      // Hits user auth check (401) since no user set
      expect(response.status).toBe(401);
    });
  });
});
