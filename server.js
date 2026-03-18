require('dotenv').config();
const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { initializeDatabase } = require('./src/utils/database');
const { logger } = require('./src/utils/logger');

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(async () => {
  try {
    await initializeDatabase();
    logger.info('Database initialized');
  } catch (error) {
    logger.error(error, 'Failed to initialize database');
    process.exit(1);
  }

  const server = createServer((req, res) => {
    handle(req, res, parse(req.url, true));
  });

  const port = parseInt(process.env.PORT || '3000', 10);
  server.listen(port, () => {
    logger.info({ port }, 'Next.js server started');
  });

  process.on('SIGTERM', () => {
    server.close(() => {
      logger.info('Server closed');
      process.exit(0);
    });
  });
});
