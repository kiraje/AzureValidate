const express = require('express');
const Joi = require('joi');
const { v4: uuidv4 } = require('uuid');
const { logger } = require('../utils/logger');
const { ValidationError } = require('../utils/errorHandler');
const { authenticateRequest } = require('../utils/auth');

const router = express.Router();

// In-memory webhook storage (replace with database in production)
const webhooks = new Map();

// Webhook registration schema
const webhookSchema = Joi.object({
  url: Joi.string().uri().required(),
  events: Joi.array().items(
    Joi.string().valid('validation.completed', 'validation.failed')
  ).default(['validation.completed', 'validation.failed'])
});

// POST /api/webhook/register
router.post('/register', authenticateRequest, async (req, res, next) => {
  try {
    const { error, value } = webhookSchema.validate(req.body);
    if (error) {
      throw new ValidationError(error.details[0].message);
    }

    const webhookId = uuidv4();
    const webhook = {
      id: webhookId,
      url: value.url,
      events: value.events,
      created_at: new Date()
    };

    webhooks.set(webhookId, webhook);

    logger.info({ webhookId, url: value.url }, 'Webhook registered');

    res.status(201).json({
      webhook_id: webhookId,
      url: webhook.url,
      events: webhook.events,
      created_at: webhook.created_at
    });

  } catch (err) {
    next(err);
  }
});

// GET /api/webhook/:id
router.get('/:id', authenticateRequest, async (req, res, next) => {
  try {
    const { id } = req.params;
    const webhook = webhooks.get(id);

    if (!webhook) {
      throw new ValidationError('Webhook not found', 404);
    }

    res.json({
      webhook_id: webhook.id,
      url: webhook.url,
      events: webhook.events,
      created_at: webhook.created_at
    });

  } catch (err) {
    next(err);
  }
});

// DELETE /api/webhook/:id
router.delete('/:id', authenticateRequest, async (req, res, next) => {
  try {
    const { id } = req.params;
    
    if (!webhooks.has(id)) {
      throw new ValidationError('Webhook not found', 404);
    }

    webhooks.delete(id);

    logger.info({ webhookId: id }, 'Webhook deleted');

    res.status(204).send();

  } catch (err) {
    next(err);
  }
});

// GET /api/webhook
router.get('/', authenticateRequest, async (req, res, next) => {
  try {
    const webhookList = Array.from(webhooks.values());

    res.json({
      webhooks: webhookList,
      total: webhookList.length
    });

  } catch (err) {
    next(err);
  }
});

module.exports = router;