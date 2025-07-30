const express = require('express');
const Joi = require('joi');
const { v4: uuidv4 } = require('uuid');
const { logger } = require('../utils/logger');
const { ValidationError } = require('../utils/errorHandler');
const { saveValidation, getValidation } = require('../utils/database');
const { addValidationJob } = require('../utils/queue');
const { authenticateRequest } = require('../utils/auth');

const router = express.Router();

// Validation schema
const validateSchema = Joi.object({
  credentials: Joi.object({
    tenant_id: Joi.string().required(),
    client_id: Joi.string().required(),
    client_secret: Joi.string().required(),
    display_name: Joi.string().optional().allow('')
  }).required(),
  subscription_id: Joi.string().required(),
  webhook_url: Joi.string().uri().optional(),
  test_config: Joi.object({
    resource_group: Joi.string().default('validation-rg'),
    location: Joi.string().default('eastus'),
    test_files: Joi.array().items(Joi.string()).optional()
  }).optional()
});

// POST /api/validate
router.post('/', authenticateRequest, async (req, res, next) => {
  try {
    // Validate request body
    const { error, value } = validateSchema.validate(req.body);
    if (error) {
      throw new ValidationError(error.details[0].message);
    }

    const { credentials, subscription_id, webhook_url, test_config } = value;

    // Create validation record
    const validationId = uuidv4();
    const validation = await saveValidation({
      id: validationId,
      tenant_id: credentials.tenant_id,
      client_id: credentials.client_id,
      subscription_id,
      status: 'pending',
      webhook_url
    });

    // Queue validation job
    await addValidationJob(
      validationId,
      credentials,
      subscription_id,
      test_config || {}
    );

    logger.info({ validationId }, 'Validation job created');

    res.status(202).json({
      validation_id: validationId,
      status: 'pending',
      message: 'Validation job has been queued',
      status_url: `/api/validation/${validationId}/status`
    });

  } catch (err) {
    next(err);
  }
});

// GET /api/validation/:id/status
router.get('/:id/status', authenticateRequest, async (req, res, next) => {
  try {
    const { id } = req.params;

    const validation = await getValidation(id);
    if (!validation) {
      throw new ValidationError('Validation not found', 404);
    }

    res.json({
      validation_id: validation.id,
      status: validation.status,
      started_at: validation.started_at,
      completed_at: validation.completed_at
    });

  } catch (err) {
    next(err);
  }
});

// GET /api/validation/:id/report
router.get('/:id/report', authenticateRequest, async (req, res, next) => {
  try {
    const { id } = req.params;

    const validation = await getValidation(id);
    if (!validation) {
      throw new ValidationError('Validation not found', 404);
    }

    if (validation.status === 'pending' || validation.status === 'in_progress') {
      throw new ValidationError('Validation still in progress', 425);
    }

    res.json({
      validation_id: validation.id,
      status: validation.status,
      started_at: validation.started_at,
      completed_at: validation.completed_at,
      report: validation.report || {}
    });

  } catch (err) {
    next(err);
  }
});

module.exports = router;