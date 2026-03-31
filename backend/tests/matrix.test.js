const request = require('supertest');
const db = require('../db');

jest.mock('../db');

describe('Matrix API', () => {
  describe('GET /api/matrix', () => {
    test('should return complete matrix data with categories', async () => {
      const mockUsers = [
        { id: 1, name: 'John Doe', email: 'john@example.com', role: 'SE', team: 'Enterprise' },
      ];

      const mockCategories = [
        { id: 1, name: 'Apps & AI', parent_id: null, level: 1, sort_order: 1 },
        { id: 2, name: 'Data', parent_id: null, level: 1, sort_order: 2 },
      ];

      const mockSkills = [
        { id: 1, name: 'Azure Functions', category_id: 1, description: null, target_level: 'L200', is_core: false, sort_order: 1, category_name: 'Apps & AI', category_parent_id: null, category_level: 1 },
        { id: 2, name: 'Azure SQL', category_id: 2, description: null, target_level: 'L200', is_core: false, sort_order: 1, category_name: 'Data', category_parent_id: null, category_level: 1 },
      ];

      const mockUserSkills = [
        { user_id: 1, skill_id: 1, proficiency_level: 'L300', notes: null },
        { user_id: 1, skill_id: 2, proficiency_level: 'L400', notes: 'Expert' },
      ];

      db.query
        .mockResolvedValueOnce({ rows: mockUsers })
        .mockResolvedValueOnce({ rows: mockCategories })
        .mockResolvedValueOnce({ rows: mockSkills })
        .mockResolvedValueOnce({ rows: mockUserSkills });

      const app = require('../server');
      const response = await request(app).get('/api/matrix');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('users');
      expect(response.body).toHaveProperty('skills');
      expect(response.body).toHaveProperty('categories');
      expect(response.body).toHaveProperty('userSkills');
      expect(response.body.users).toEqual(mockUsers);
      // categories get enriched with children arrays by the tree builder
      expect(response.body.categories).toHaveLength(2);
      expect(response.body.categories[0].name).toBe('Apps & AI');
      expect(response.body.categories[0]).toHaveProperty('children');
      expect(response.body.skills[0]).toHaveProperty('category_path');
      expect(response.body.skills[0].category_path).toBe('Apps & AI');
      expect(response.body.userSkills).toHaveProperty('1-1');
      expect(response.body.userSkills['1-1'].proficiency_level).toBe('L300');
    });
  });
});
