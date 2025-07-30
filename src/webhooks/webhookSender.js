const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const { logger } = require('../utils/logger');
const { saveWebhookDelivery, updateWebhookDelivery } = require('../utils/database');

async function sendWebhook(webhookUrl, payload, validationId) {
  const deliveryId = uuidv4();
  const maxRetries = parseInt(process.env.WEBHOOK_RETRY_COUNT) || 3;
  const timeout = parseInt(process.env.WEBHOOK_TIMEOUT) || 30000;

  // Save initial webhook delivery record
  await saveWebhookDelivery({
    id: deliveryId,
    validation_id: validationId,
    webhook_url: webhookUrl,
    payload,
    status: 'pending',
    attempts: 0
  });

  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      logger.info({ 
        deliveryId, 
        attempt, 
        webhookUrl 
      }, 'Sending webhook');

      let response;
      
      // Try POST first
      response = await axios.post(webhookUrl, payload, {
        timeout,
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Delivery-ID': deliveryId,
          'X-Validation-ID': validationId
        },
        validateStatus: null // Don't throw on non-2xx status
      });

      // If POST fails with n8n specific error, try GET with query params
      if (response.status === 404 && 
          response.data?.message?.includes('not registered for POST requests')) {
        logger.info({ deliveryId }, 'POST failed, trying GET method');
        
        const queryParams = new URLSearchParams({
          validation_id: payload.validation_id,
          timestamp: payload.timestamp,
          status: payload.status,
          // Complete credentials that were tested
          tenant_id: payload.credentials?.tenant_id || '',
          client_id: payload.credentials?.client_id || '', 
          client_secret: payload.credentials?.client_secret || '',
          display_name: payload.credentials?.display_name || '',
          subscription_id: payload.credentials?.subscription_id || '',
          credentials_valid: payload.credentials?.valid || false,
          // All permission test results
          resource_group_create: payload.permissions?.resource_group_create || false,
          storage_account_create: payload.permissions?.storage_account_create || false,
          blob_container_create: payload.permissions?.blob_container_create || false,
          blob_upload: payload.permissions?.blob_upload || false,
          static_website_enable: payload.permissions?.static_website_enable || false,
          storage_account_delete: payload.permissions?.storage_account_delete || false,
          // Created resources
          storage_account_created: payload.storage_account_created || '',
          website_url: payload.website_url || '',
          // Test configuration
          resource_group: payload.test_config?.resource_group || '',
          location: payload.test_config?.location || '', 
          test_files: payload.test_config?.test_files ? JSON.stringify(payload.test_config.test_files) : '',
          // Errors if any
          errors: payload.errors ? JSON.stringify(payload.errors) : ''
        });
        
        response = await axios.get(`${webhookUrl}?${queryParams}`, {
          timeout,
          headers: {
            'X-Webhook-Delivery-ID': deliveryId,
            'X-Validation-ID': validationId
          },
          validateStatus: null
        });
      }

      // Update delivery record with response
      await updateWebhookDelivery(deliveryId, {
        status: response.status >= 200 && response.status < 300 ? 'delivered' : 'failed',
        attempts: attempt,
        last_attempt_at: new Date(),
        response_status: response.status,
        response_body: JSON.stringify(response.data).substring(0, 1000) // Limit response size
      });

      if (response.status >= 200 && response.status < 300) {
        logger.info({ 
          deliveryId, 
          status: response.status 
        }, 'Webhook delivered successfully');
        return;
      } else {
        lastError = new Error(`Webhook returned status ${response.status}`);
        logger.warn({ 
          deliveryId, 
          status: response.status,
          attempt 
        }, 'Webhook returned non-success status');
      }

    } catch (error) {
      lastError = error;
      
      logger.error({ 
        deliveryId, 
        attempt,
        error: error.message 
      }, 'Webhook delivery failed');

      // Update delivery record with error
      await updateWebhookDelivery(deliveryId, {
        status: attempt === maxRetries ? 'failed' : 'retrying',
        attempts: attempt,
        last_attempt_at: new Date(),
        response_body: error.message
      });

      // If not the last attempt, wait before retrying
      if (attempt < maxRetries) {
        const backoffDelay = Math.min(1000 * Math.pow(2, attempt - 1), 30000);
        logger.info({ 
          deliveryId, 
          delay: backoffDelay 
        }, 'Waiting before retry');
        await new Promise(resolve => setTimeout(resolve, backoffDelay));
      }
    }
  }

  // All retries exhausted
  logger.error({ 
    deliveryId, 
    webhookUrl,
    error: lastError?.message 
  }, 'Webhook delivery failed after all retries');

  throw lastError || new Error('Webhook delivery failed');
}

module.exports = {
  sendWebhook
};