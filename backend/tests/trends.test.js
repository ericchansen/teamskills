const request = require('supertest');
const db = require('../db');

jest.mock('../db');

describe('Trends API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/trends (team-wide)', () => {
    test('should return monthly averages by category', async () => {
      const mockData = [
        { month: '2025-01-01', category_name: 'Azure Compute', avg_level: '250', user_count: '3' },
        { month: '2025-02-01', category_name: 'Azure Compute', avg_level: '275', user_count: '3' },
      ];

      db.query.mockResolvedValue({ rows: mockData });

      const app = require('../server');
      const response = await request(app).get('/api/trends');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockData);
      expect(db.query).toHaveBeenCalledTimes(1);
      // Should use the team-wide query (GROUP BY month, category)
      expect(db.query.mock.calls[0][0]).toContain('GROUP BY');
    });

    test('should return per-user trends when userId specified', async () => {
      const mockData = [
        { skill_name: 'Azure Functions', category_name: 'Azure Compute', proficiency_level: 'L200', changed_at: '2025-01-15' },
        { skill_name: 'Azure Functions', category_name: 'Azure Compute', proficiency_level: 'L300', changed_at: '2025-02-20' },
      ];

      db.query.mockResolvedValue({ rows: mockData });

      const app = require('../server');
      const response = await request(app).get('/api/trends?userId=1');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockData);
      expect(db.query).toHaveBeenCalledWith(expect.any(String), ['1']);
    });

    test('should handle database errors', async () => {
      db.query.mockRejectedValue(new Error('Database error'));

      const app = require('../server');
      const response = await request(app).get('/api/trends');

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
    });
  });
});
