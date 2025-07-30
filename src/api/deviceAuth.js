const express = require('express');
const { exec } = require('child_process');
const { promisify } = require('util');
const { v4: uuidv4 } = require('uuid');
const { logger } = require('../utils/logger');
const { authenticateRequest } = require('../utils/auth');

const router = express.Router();
const execAsync = promisify(exec);

// Store device auth sessions
const authSessions = new Map();

// POST /api/device-auth/start - Start device code flow
router.post('/start', authenticateRequest, async (req, res, next) => {
  try {
    const sessionId = uuidv4();
    
    logger.info({ sessionId }, 'Starting device code authentication');
    
    // Start Azure CLI device login in background
    const loginProcess = execAsync('az login --use-device-code --output json', {
      timeout: 900000 // 15 minutes
    });
    
    // Store session info
    authSessions.set(sessionId, {
      status: 'pending',
      loginProcess,
      startedAt: new Date()
    });
    
    // Parse device code from the login process (it outputs to stderr)
    loginProcess.child.stderr.on('data', (data) => {
      const output = data.toString();
      logger.info({ sessionId, output }, 'Azure CLI output');
      
      // Look for device code pattern
      const deviceCodeMatch = output.match(/To sign in, use a web browser to open the page (https:\/\/[^\s]+) and enter the code ([A-Z0-9]+)/);
      
      if (deviceCodeMatch) {
        const [, verificationUrl, userCode] = deviceCodeMatch;
        const session = authSessions.get(sessionId);
        if (session) {
          session.userCode = userCode;
          session.verificationUrl = verificationUrl;
          session.deviceCodeReceived = true;
        }
      }
    });
    
    // Handle completion
    loginProcess.then(({ stdout }) => {
      const session = authSessions.get(sessionId);
      if (session) {
        session.status = 'completed';
        session.completedAt = new Date();
        session.accountInfo = JSON.parse(stdout);
      }
    }).catch((error) => {
      const session = authSessions.get(sessionId);
      if (session) {
        session.status = 'failed';
        session.error = error.message;
      }
    });
    
    // Wait for device code to be extracted
    let attempts = 0;
    while (attempts < 50) { // 10 seconds max
      await new Promise(resolve => setTimeout(resolve, 200));
      const session = authSessions.get(sessionId);
      if (session && session.deviceCodeReceived) {
        return res.json({
          session_id: sessionId,
          user_code: session.userCode,
          verification_url: session.verificationUrl,
          message: `Go to ${session.verificationUrl} and enter code: ${session.userCode}`,
          expires_in: 900 // 15 minutes
        });
      }
      attempts++;
    }
    
    throw new Error('Failed to get device code from Azure CLI');
    
  } catch (error) {
    logger.error({ error: error.message }, 'Device auth start failed');
    next(error);
  }
});

// GET /api/device-auth/status/:sessionId - Check authentication status
router.get('/status/:sessionId', authenticateRequest, async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    const session = authSessions.get(sessionId);
    
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    if (session.status === 'completed') {
      res.json({
        status: 'completed',
        account: {
          name: session.accountInfo[0].name,
          id: session.accountInfo[0].id,
          tenantId: session.accountInfo[0].tenantId,
          user: session.accountInfo[0].user
        }
      });
    } else if (session.status === 'failed') {
      res.json({
        status: 'failed',
        error: session.error
      });
    } else {
      res.json({
        status: 'pending',
        user_code: session.userCode,
        verification_url: session.verificationUrl
      });
    }
    
  } catch (error) {
    logger.error({ error: error.message }, 'Device auth status check failed');
    next(error);
  }
});

// POST /api/device-auth/create-sp - Create service principal after authentication
router.post('/create-sp/:sessionId', authenticateRequest, async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    const { name = 'AzureValidatorSP', role = 'Contributor' } = req.body;
    
    const session = authSessions.get(sessionId);
    
    if (!session || session.status !== 'completed') {
      return res.status(400).json({ error: 'Authentication not completed' });
    }
    
    const subscriptionId = session.accountInfo[0].id;
    
    logger.info({ sessionId, name, subscriptionId }, 'Creating service principal');
    
    // First create service principal without role assignment (works even with disabled subscriptions)
    const spCommand = `az ad sp create-for-rbac --name "${name}" --skip-assignment --output json`;
    
    let stdout, stderr;
    try {
      const result = await execAsync(spCommand, {
        timeout: 60000 // 1 minute
      });
      stdout = result.stdout;
      stderr = result.stderr;
    } catch (error) {
      // If basic SP creation fails, throw the error
      throw new Error(`Service principal creation failed: ${error.message}`);
    }
    
    const servicePrincipal = JSON.parse(stdout);
    
    // Try to assign role, but don't fail if subscription is disabled
    let roleAssignmentError = null;
    try {
      const roleCommand = `az role assignment create --assignee "${servicePrincipal.appId}" --role "${role}" --scope "/subscriptions/${subscriptionId}" --output json`;
      await execAsync(roleCommand, {
        timeout: 30000 // 30 seconds
      });
      logger.info({ sessionId, appId: servicePrincipal.appId, role }, 'Role assignment successful');
    } catch (roleError) {
      roleAssignmentError = roleError.message;
      logger.warn({ sessionId, appId: servicePrincipal.appId, role, error: roleError.message }, 'Role assignment failed, continuing without role');
    }
    
    // Update session with SP info
    session.servicePrincipal = servicePrincipal;
    
    logger.info({ sessionId, appId: servicePrincipal.appId }, 'Service principal created');
    
    res.json({
      session_id: sessionId,
      service_principal: {
        appId: servicePrincipal.appId,
        displayName: servicePrincipal.displayName,
        password: servicePrincipal.password,
        tenant: servicePrincipal.tenant
      },
      subscription_id: subscriptionId,
      account_name: session.accountInfo[0].name,
      message: 'Service principal created successfully'
    });
    
  } catch (error) {
    logger.error({ error: error.message }, 'Service principal creation failed');
    next(error);
  }
});

// POST /api/device-auth/validate/:sessionId - Validate the created service principal
router.post('/validate/:sessionId', authenticateRequest, async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    const { webhook_url, test_config } = req.body;
    
    const session = authSessions.get(sessionId);
    
    if (!session || !session.servicePrincipal) {
      return res.status(400).json({ error: 'Service principal not created' });
    }
    
    const { servicePrincipal, accountInfo } = session;
    const subscriptionId = accountInfo.id;
    
    // Import validation modules
    const { saveValidation } = require('../utils/database');
    const { addValidationJob } = require('../utils/queue');
    
    // Create validation record
    const validationId = uuidv4();
    const validation = await saveValidation({
      id: validationId,
      tenant_id: servicePrincipal.tenant,
      client_id: servicePrincipal.appId,
      subscription_id: subscriptionId,
      status: 'pending',
      webhook_url
    });
    
    // Queue validation job
    const credentials = {
      tenant_id: servicePrincipal.tenant,
      client_id: servicePrincipal.appId,
      client_secret: servicePrincipal.password,
      display_name: servicePrincipal.displayName
    };
    
    await addValidationJob(
      validationId,
      credentials,
      subscriptionId,
      test_config || {}
    );
    
    logger.info({ validationId, sessionId }, 'Device auth validation job created');
    
    res.json({
      validation_id: validationId,
      status: 'pending',
      message: 'Validation job has been queued',
      status_url: `/api/validate/${validationId}/status`,
      service_principal: {
        appId: servicePrincipal.appId,
        displayName: servicePrincipal.displayName,
        tenant: servicePrincipal.tenant
      },
      subscription_id: subscriptionId
    });
    
  } catch (error) {
    logger.error({ error: error.message }, 'Device auth validation failed');
    next(error);
  }
});

// DELETE /api/device-auth/cleanup/:sessionId - Clean up session
router.delete('/cleanup/:sessionId', authenticateRequest, async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    
    if (authSessions.has(sessionId)) {
      authSessions.delete(sessionId);
      logger.info({ sessionId }, 'Device auth session cleaned up');
    }
    
    res.json({ message: 'Session cleaned up' });
    
  } catch (error) {
    logger.error({ error: error.message }, 'Session cleanup failed');
    next(error);
  }
});

module.exports = router;