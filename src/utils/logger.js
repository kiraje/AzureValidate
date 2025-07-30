const pino = require('pino');
const path = require('path');

const logLevel = process.env.LOG_LEVEL || 'info';
const isDevelopment = process.env.NODE_ENV !== 'production';

const logger = pino({
  level: logLevel,
  transport: isDevelopment ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname'
    }
  } : undefined,
  formatters: {
    level: (label) => {
      return { level: label };
    }
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: ['credentials.client_secret', 'credentials.tenant_id', 'credentials.client_id', '*.password', '*.secret'],
    censor: '[REDACTED]'
  }
});

// Create file transport for production
if (!isDevelopment) {
  const fileTransport = pino.transport({
    target: 'pino/file',
    options: { 
      destination: path.join(__dirname, '../../logs/app.log'),
      mkdir: true
    }
  });
  logger.add(fileTransport);
}

module.exports = { logger };