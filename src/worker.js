require('dotenv').config();
const { initializeDatabase } = require('./utils/database');
const { initializeQueue } = require('./utils/queue');
const { logger } = require('./utils/logger');

async function start() {
  try {
    await initializeDatabase();
    initializeQueue();
    logger.info('Worker process started');
  } catch (error) {
    logger.error(error, 'Worker failed to start');
    process.exit(1);
  }
}

process.on('SIGTERM', () => {
  logger.info('Worker shutting down');
  process.exit(0);
});

start();
