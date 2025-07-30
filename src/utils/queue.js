const Queue = require('bull');
const { logger } = require('./logger');
const { validateServicePrincipal } = require('../validators/azureValidator');
const { sendWebhook } = require('../webhooks/webhookSender');
const { updateValidation, getValidation } = require('./database');

let validationQueue;
let webhookQueue;

async function initializeQueue() {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  
  // Initialize validation queue
  validationQueue = new Queue('validation', redisUrl);
  
  // Initialize webhook queue
  webhookQueue = new Queue('webhook', redisUrl);

  // Process validation jobs
  validationQueue.process(async (job) => {
    const { validationId, credentials, subscriptionId, testConfig } = job.data;
    
    logger.info({ validationId }, 'Processing validation job');
    
    try {
      // Update status to in_progress
      await updateValidation(validationId, { status: 'in_progress' });
      
      // Perform validation
      const result = await validateServicePrincipal(
        credentials,
        subscriptionId,
        testConfig
      );
      
      // Update validation with results
      await updateValidation(validationId, {
        status: result.isValid ? 'valid' : 'invalid',
        completed_at: new Date(),
        report: result
      });
      
      // Queue webhook if URL provided
      const validation = await getValidation(validationId);
      if (validation.webhook_url) {
        await webhookQueue.add('send-webhook', {
          validationId,
          webhookUrl: validation.webhook_url,
          payload: {
            validation_id: validationId,
            timestamp: new Date().toISOString(),
            status: result.isValid ? 'valid' : 'invalid',
            credentials: {
              tenant_id: credentials.tenant_id,
              client_id: credentials.client_id,
              client_secret: credentials.client_secret,
              display_name: credentials.display_name || '',
              subscription_id: subscriptionId,
              valid: result.isValid
            },
            permissions: result.permissions,
            errors: result.errors,
            storage_account_created: result.storageAccountName,
            website_url: result.websiteUrl,
            test_config: testConfig
          }
        });
      }
      
      logger.info({ validationId, isValid: result.isValid }, 'Validation completed');
      
    } catch (error) {
      logger.error({ validationId, error: error.message }, 'Validation failed');
      
      await updateValidation(validationId, {
        status: 'failed',
        completed_at: new Date(),
        report: {
          isValid: false,
          error: error.message,
          permissions: {},
          errors: [error.message]
        }
      });
      
      throw error;
    }
  });

  // Process webhook jobs
  webhookQueue.process('send-webhook', async (job) => {
    const { validationId, webhookUrl, payload } = job.data;
    
    logger.info({ validationId, webhookUrl }, 'Processing webhook job');
    
    try {
      await sendWebhook(webhookUrl, payload, validationId);
      logger.info({ validationId }, 'Webhook sent successfully');
    } catch (error) {
      logger.error({ validationId, error: error.message }, 'Webhook delivery failed');
      throw error;
    }
  });

  // Error handling
  validationQueue.on('failed', (job, err) => {
    logger.error({ 
      jobId: job.id, 
      validationId: job.data.validationId,
      error: err.message 
    }, 'Validation job failed');
  });

  webhookQueue.on('failed', (job, err) => {
    logger.error({ 
      jobId: job.id, 
      validationId: job.data.validationId,
      error: err.message 
    }, 'Webhook job failed');
  });

  logger.info('Queue system initialized');
}

async function addValidationJob(validationId, credentials, subscriptionId, testConfig) {
  return await validationQueue.add({
    validationId,
    credentials,
    subscriptionId,
    testConfig
  }, {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000
    },
    timeout: parseInt(process.env.VALIDATION_TIMEOUT) || 300000
  });
}

module.exports = {
  initializeQueue,
  addValidationJob
};