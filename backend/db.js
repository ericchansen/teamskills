const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  user: process.env.PGUSER || process.env.DB_USER || 'postgres',
  host: process.env.PGHOST || process.env.DB_HOST || 'localhost',
  database: process.env.PGDATABASE || process.env.DB_NAME || 'teamskills',
  password: process.env.PGPASSWORD || process.env.DB_PASSWORD || 'postgres',
  port: process.env.PGPORT || process.env.DB_PORT || 5432,
  ssl: process.env.PGSSLMODE === 'require' ? { rejectUnauthorized: true } : false,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  // Do not exit — Azure PostgreSQL auto-pause causes transient errors
  // Container restart would break in-flight requests
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};
