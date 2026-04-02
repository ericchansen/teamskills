const logger = require('../logger');

// Express 5 error-handling middleware — catches all unhandled async errors.
// Must have 4 parameters for Express to recognize it as error middleware.
function errorHandler(err, req, res, _next) {
  logger.error({ err, requestId: req.correlationId }, 'Request failed');
  const status = err.status || 500;
  res.status(status).json({ error: err.expose ? err.message : 'Internal server error' });
}

module.exports = errorHandler;
