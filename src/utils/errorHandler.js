const { logger } = require('./logger');

class ValidationError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'ValidationError';
    this.statusCode = statusCode;
  }
}

class AzureError extends Error {
  constructor(message, details, statusCode = 500) {
    super(message);
    this.name = 'AzureError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

function errorHandler(err, req, res, next) {
  logger.error({
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method
  }, 'Error occurred');

  // Handle known errors
  if (err instanceof ValidationError) {
    return res.status(err.statusCode).json({
      error: err.message,
      type: 'validation_error'
    });
  }

  if (err instanceof AzureError) {
    return res.status(err.statusCode).json({
      error: err.message,
      type: 'azure_error',
      details: err.details
    });
  }

  // Handle Joi validation errors
  if (err.name === 'ValidationError' && err.details) {
    return res.status(400).json({
      error: 'Invalid request data',
      type: 'validation_error',
      details: err.details.map(d => d.message)
    });
  }

  // Default error response
  res.status(500).json({
    error: 'Internal server error',
    type: 'internal_error'
  });
}

module.exports = {
  errorHandler,
  ValidationError,
  AzureError
};