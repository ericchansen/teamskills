const pino = require('pino');

const isTest = process.env.NODE_ENV === 'test';
const isDev = process.env.NODE_ENV !== 'production' && !isTest;

// Only use pino-pretty transport in dev if the package is available
let prettyAvailable = false;
if (isDev) {
  try { require.resolve('pino-pretty'); prettyAvailable = true; } catch { /* not installed */ }
}

const logger = pino({
  level: process.env.LOG_LEVEL || (isTest ? 'silent' : 'info'),
  base: { service: 'teamskills-backend' },
  timestamp: pino.stdTimeFunctions.isoTime,
  ...(prettyAvailable ? { transport: { target: 'pino-pretty', options: { colorize: true } } } : {}),
});

module.exports = logger;
