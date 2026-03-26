const request = require('supertest');
const db = require('../db');

jest.mock('../db');

describe('Health Endpoints', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    app = require('../server');
  });

  describe('GET /health/live', () => {
    test('should return 200 with status ok', async () => {
      const response = await request(app).get('/health/live');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('ok');
      expect(response.body).toHaveProperty('timestamp');
    });

    test('should not query the database', async () => {
      await request(app).get('/health/live');

      expect(db.query).not.toHaveBeenCalled();
    });
  });

  describe('GET /health/ready', () => {
    test('should return 200 when database is connected', async () => {
      db.query.mockResolvedValue({ rows: [{ '?column?': 1 }] });

      const response = await request(app).get('/health/ready');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('ok');
      expect(response.body.database).toBe('connected');
      expect(response.body).toHaveProperty('database_latency_ms');
      expect(response.body).toHaveProperty('timestamp');
    });

    test('should return 503 when database is disconnected', async () => {
      db.query.mockRejectedValue(new Error('Connection refused'));

      const response = await request(app).get('/health/ready');

      expect(response.status).toBe(503);
      expect(response.body.status).toBe('unavailable');
      expect(response.body.database).toBe('disconnected');
      expect(response.body.error).toBe('Database connection failed');
    });
  });

  describe('GET /health (legacy)', () => {
    test('should return 200 when database is connected', async () => {
      db.query.mockResolvedValue({ rows: [{ '?column?': 1 }] });

      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('ok');
      expect(response.body.database).toBe('connected');
    });
  });
});
