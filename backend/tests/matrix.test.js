const request = require('supertest');
const db = require('../db');

jest.mock('../db');

describe('Matrix API', () => {
  describe('GET /api/matrix', () => {
    test('should return complete matrix data', async () => {
      const mockUsers = [
        { id: 1, name: 'John Doe', email: 'john@example.com', role: 'SE', team: 'Enterprise' },
      ];

      const mockSkills = [
        { id: 1, name: 'Azure Functions', category_id: 1, category_name: 'Azure Compute' },
        { id: 2, name: 'Azure SQL', category_id: 2, category_name: 'Azure Data' },
      ];

      const mockUserSkills = [
        { user_id: 1, skill_id: 1, proficiency_level: 'L300', notes: null },
        { user_id: 1, skill_id: 2, proficiency_level: 'L400', notes: 'Expert' },
      ];

      db.query
        .mockResolvedValueOnce({ rows: mockUsers })
        .mockResolvedValueOnce({ rows: mockSkills })
        .mockResolvedValueOnce({ rows: mockUserSkills });

      const app = require('../server');
      const response = await request(app).get('/api/matrix');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('users');
      expect(response.body).toHaveProperty('skills');
      expect(response.body).toHaveProperty('userSkills');
      expect(response.body.users).toEqual(mockUsers);
      expect(response.body.skills).toEqual(mockSkills);
      expect(response.body.userSkills).toHaveProperty('1-1');
      expect(response.body.userSkills['1-1'].proficiency_level).toBe('L300');
    });
  });
});
