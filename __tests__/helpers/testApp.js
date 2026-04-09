/**
 * Creates a minimal Express app for integration testing.
 * Mounts individual route files with all external dependencies mocked.
 */
const express = require('express');

function createTestApp() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));
  return app;
}

module.exports = { createTestApp };
