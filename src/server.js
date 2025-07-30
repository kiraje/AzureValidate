require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { logger } = require('./utils/logger');
const { errorHandler } = require('./utils/errorHandler');
const validateRoutes = require('./api/validate');
const webhookRoutes = require('./api/webhook');
const healthRoutes = require('./api/health');
const deviceAuthRoutes = require('./api/deviceAuth');
const { initializeDatabase } = require('./utils/database');
const { initializeQueue } = require('./utils/queue');

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// Request logging
app.use((req, res, next) => {
  logger.info({
    method: req.method,
    path: req.path,
    ip: req.ip
  }, 'Incoming request');
  next();
});

// Serve static files
app.use(express.static('public'));

// Routes
app.use('/api/validate', validateRoutes);
app.use('/api/webhook', webhookRoutes);
app.use('/api/device-auth', deviceAuthRoutes);
app.use('/health', healthRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handling
app.use(errorHandler);

// Initialize services and start server
async function startServer() {
  try {
    // Initialize database
    await initializeDatabase();
    logger.info('Database initialized');

    // Initialize queue
    await initializeQueue();
    logger.info('Queue system initialized');

    // Start server
    app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV}`);
    });
  } catch (error) {
    logger.error(error, 'Failed to start server');
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT signal received: closing HTTP server');
  process.exit(0);
});

startServer();