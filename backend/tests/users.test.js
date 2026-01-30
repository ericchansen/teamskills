const request = require('supertest');
const db = require('../db');

// Mock the database module for tests
jest.mock('../db');

describe('Users API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/users', () => {
    test('should return all users', async () => {
      const mockUsers = [
        { id: 1, name: 'John Doe', email: 'john@example.com', role: 'SE', team: 'Enterprise' },
        { id: 2, name: 'Jane Smith', email: 'jane@example.com', role: 'Senior SE', team: 'SMB' },
      ];

      db.query.mockResolvedValue({ rows: mockUsers });

      const app = require('../server');
      const response = await request(app).get('/api/users');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockUsers);
      expect(db.query).toHaveBeenCalledWith('SELECT * FROM users ORDER BY name');
    });
  });

  describe('POST /api/users', () => {
    test('should create a new user', async () => {
      const newUser = {
        name: 'Bob Johnson',
        email: 'bob@example.com',
        role: 'SE',
        team: 'Enterprise',
      };

      const createdUser = { id: 3, ...newUser };
      db.query.mockResolvedValue({ rows: [createdUser] });

      const app = require('../server');
      const response = await request(app)
        .post('/api/users')
        .send(newUser);

      expect(response.status).toBe(201);
      expect(response.body).toEqual(createdUser);
    });
  });

  describe('GET /api/users/:id', () => {
    test('should return a single user', async () => {
      const mockUser = { id: 1, name: 'John Doe', email: 'john@example.com' };
      db.query.mockResolvedValue({ rows: [mockUser] });

      const app = require('../server');
      const response = await request(app).get('/api/users/1');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockUser);
    });

    test('should return 404 for non-existent user', async () => {
      db.query.mockResolvedValue({ rows: [] });

      const app = require('../server');
      const response = await request(app).get('/api/users/999');

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('PUT /api/users/:id', () => {
    test('should update a user', async () => {
      const updatedUser = {
        id: 1,
        name: 'John Updated',
        email: 'john.updated@example.com',
        role: 'Senior SE',
        team: 'Enterprise',
      };

      db.query.mockResolvedValue({ rows: [updatedUser] });

      const app = require('../server');
      const response = await request(app)
        .put('/api/users/1')
        .send(updatedUser);

      expect(response.status).toBe(200);
      expect(response.body).toEqual(updatedUser);
    });
  });

  describe('DELETE /api/users/:id', () => {
    test('should delete a user', async () => {
      db.query.mockResolvedValue({ rows: [{ id: 1 }] });

      const app = require('../server');
      const response = await request(app).delete('/api/users/1');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message');
    });
  });
});
