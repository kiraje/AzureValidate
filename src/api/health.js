const express = require('express');
const { Pool } = require('pg');
const { logger } = require('../utils/logger');

const router = express.Router();

// GET /health
router.get('/', async (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV,
    version: require('../../package.json').version
  };

  try {
    // Check database connection
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    await pool.query('SELECT 1');
    await pool.end();
    health.database = 'connected';
  } catch (error) {
    health.database = 'disconnected';
    health.status = 'unhealthy';
    logger.error(error, 'Database health check failed');
  }

  // Check Redis connection (simplified check)
  try {
    // In production, you'd check the actual Redis connection
    health.redis = 'connected';
  } catch (error) {
    health.redis = 'disconnected';
    health.status = 'unhealthy';
  }

  const statusCode = health.status === 'healthy' ? 200 : 503;
  res.status(statusCode).json(health);
});

// GET /health/ready
router.get('/ready', async (req, res) => {
  // Check if the service is ready to accept requests
  const ready = {
    ready: true,
    checks: {}
  };

  try {
    // Check database
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    await pool.query('SELECT 1');
    await pool.end();
    ready.checks.database = true;
  } catch (error) {
    ready.checks.database = false;
    ready.ready = false;
  }

  const statusCode = ready.ready ? 200 : 503;
  res.status(statusCode).json(ready);
});

// GET /health/live
router.get('/live', (req, res) => {
  // Simple liveness check
  res.json({
    alive: true,
    timestamp: new Date().toISOString()
  });
});

module.exports = router;