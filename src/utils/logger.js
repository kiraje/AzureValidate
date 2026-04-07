const pino = require('pino');
const path = require('path');

const logLevel = process.env.LOG_LEVEL || 'info';
const isDevelopment = process.env.NODE_ENV !== 'production';

const transportOption = isDevelopment
  ? {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
      },
    }
  : {
      target: 'pino/file',
      options: {
        destination: path.join(__dirname, '../../logs/app.log'),
        mkdir: true,
      },
    };

const logger = pino({
  level: logLevel,
  transport: transportOption,
  formatters: {
    level: (label) => {
      return { level: label };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: ['credentials.client_secret', 'credentials.tenant_id', 'credentials.client_id', '*.password', '*.secret'],
    censor: '[REDACTED]',
  },
});

module.exports = { logger };