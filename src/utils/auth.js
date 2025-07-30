const { ValidationError } = require('./errorHandler');
const { logger } = require('./logger');

function authenticateRequest(req, res, next) {
  const apiKey = req.headers['x-api-key'] || req.headers['authorization'];
  
  if (!apiKey) {
    logger.warn({ ip: req.ip, path: req.path }, 'Missing API key');
    throw new ValidationError('API key required', 401);
  }

  // In production, validate against stored API keys
  const validApiKey = process.env.API_KEY;
  
  if (apiKey !== validApiKey && apiKey !== `Bearer ${validApiKey}`) {
    logger.warn({ ip: req.ip, path: req.path }, 'Invalid API key');
    throw new ValidationError('Invalid API key', 401);
  }

  next();
}

module.exports = {
  authenticateRequest
};