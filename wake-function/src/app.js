const { app } = require('@azure/functions');

// Register all functions
require('./functions/wake-postgres');

module.exports = app;
