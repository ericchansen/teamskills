const pino = require('pino');

const isTest = process.env.NODE_ENV === 'test';
const isDev = process.env.NODE_ENV !== 'production' && !isTest;

const logger = pino({
  level: process.env.LOG_LEVEL || (isTest ? 'silent' : 'info'),
  base: { service: 'teamskills-backend' },
  timestamp: pino.stdTimeFunctions.isoTime,
  ...(isDev ? { transport: { target: 'pino-pretty', options: { colorize: true } } } : {}),
});

module.exports = logger;
