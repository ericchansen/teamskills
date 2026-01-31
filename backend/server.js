const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://ca-frontend-teamskills.greenwater-c5983efd.centralus.azurecontainerapps.io';
app.use(cors({
  origin: FRONTEND_URL,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Routes
const usersRouter = require('./routes/users');
const skillsRouter = require('./routes/skills');
const categoriesRouter = require('./routes/categories');
const userSkillsRouter = require('./routes/userSkills');
const matrixRouter = require('./routes/matrix');
const adminRouter = require('./routes/admin');

app.use('/api/users', usersRouter);
app.use('/api/skills', skillsRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/user-skills', userSkillsRouter);
app.use('/api/matrix', matrixRouter);
app.use('/api/admin', adminRouter);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Only start server if not in test mode
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = app;
