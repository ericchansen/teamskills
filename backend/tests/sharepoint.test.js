const request = require('supertest');

describe('SharePoint Sync API', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.SHAREPOINT_SYNC_METHOD;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  function setupMocks({ oboConfigured = false, paConfigured = false } = {}) {
    jest.doMock('../db');
    jest.doMock('../services/oboClient', () => ({
      isOboConfigured: jest.fn().mockReturnValue(oboConfigured),
      getGraphClientOnBehalfOf: jest.fn(),
      extractBearerToken: jest.fn().mockReturnValue(null),
      acquireGraphTokenOnBehalfOf: jest.fn()
    }));
    jest.doMock('../services/powerAutomateSync', () => ({
      isPowerAutomateConfigured: jest.fn().mockReturnValue(paConfigured),
      pullFromSharePoint: jest.fn(),
      transformFlowItemsToPivotFormat: jest.fn(),
      pushToSharePoint: jest.fn()
    }));
  }

  describe('getSyncMethod', () => {
    test('returns "none" when env var not set', () => {
      setupMocks();
      const router = require('../routes/sharepoint');
      expect(router._getSyncMethod()).toBe('none');
    });

    test('returns "obo" when method is obo and OBO is configured', () => {
      process.env.SHAREPOINT_SYNC_METHOD = 'obo';
      setupMocks({ oboConfigured: true });
      const router = require('../routes/sharepoint');
      expect(router._getSyncMethod()).toBe('obo');
    });

    test('returns "power-automate" when method is power-automate and PA is configured', () => {
      process.env.SHAREPOINT_SYNC_METHOD = 'power-automate';
      setupMocks({ paConfigured: true });
      const router = require('../routes/sharepoint');
      expect(router._getSyncMethod()).toBe('power-automate');
    });

    test('returns "none" when method is obo but OBO not configured', () => {
      process.env.SHAREPOINT_SYNC_METHOD = 'obo';
      setupMocks({ oboConfigured: false });
      const router = require('../routes/sharepoint');
      expect(router._getSyncMethod()).toBe('none');
    });

    test('returns "none" when method is power-automate but PA not configured', () => {
      process.env.SHAREPOINT_SYNC_METHOD = 'power-automate';
      setupMocks({ paConfigured: false });
      const router = require('../routes/sharepoint');
      expect(router._getSyncMethod()).toBe('none');
    });
  });

  describe('GET /api/sharepoint/status', () => {
    test('should return not configured when sync method is none', async () => {
      setupMocks();
      const app = require('../server');
      const response = await request(app).get('/api/sharepoint/status');

      expect(response.status).toBe(200);
      expect(response.body.configured).toBe(false);
      expect(response.body.method).toBe('none');
    });

    test('should return configured with obo method', async () => {
      process.env.SHAREPOINT_SYNC_METHOD = 'obo';
      setupMocks({ oboConfigured: true });
      const app = require('../server');
      const response = await request(app).get('/api/sharepoint/status');

      expect(response.status).toBe(200);
      expect(response.body.configured).toBe(true);
      expect(response.body.method).toBe('obo');
    });

    test('should return configured with power-automate method', async () => {
      process.env.SHAREPOINT_SYNC_METHOD = 'power-automate';
      setupMocks({ paConfigured: true });
      const app = require('../server');
      const response = await request(app).get('/api/sharepoint/status');

      expect(response.status).toBe(200);
      expect(response.body.configured).toBe(true);
      expect(response.body.method).toBe('power-automate');
    });
  });

  describe('POST /api/sharepoint/pull', () => {
    test('should return 501 when sync method is none', async () => {
      setupMocks();
      const app = require('../server');
      const response = await request(app).post('/api/sharepoint/pull');

      expect(response.status).toBe(501);
      expect(response.body.error).toMatch(/not configured/i);
    });

    test('should return 401 when OBO method and no bearer token', async () => {
      process.env.SHAREPOINT_SYNC_METHOD = 'obo';
      setupMocks({ oboConfigured: true });
      const app = require('../server');
      const response = await request(app).post('/api/sharepoint/pull');

      expect(response.status).toBe(401);
    });
  });

  describe('POST /api/sharepoint/push', () => {
    test('should return 501 when sync method is none', async () => {
      setupMocks();
      const app = require('../server');
      const response = await request(app).post('/api/sharepoint/push');

      expect(response.status).toBe(501);
      expect(response.body.error).toMatch(/not configured/i);
    });

    test('should return 401 when OBO method and no bearer token', async () => {
      process.env.SHAREPOINT_SYNC_METHOD = 'obo';
      setupMocks({ oboConfigured: true });
      const app = require('../server');
      const response = await request(app).post('/api/sharepoint/push');

      // Hits user auth check (401) since no user set
      expect(response.status).toBe(401);
    });
  });
});
