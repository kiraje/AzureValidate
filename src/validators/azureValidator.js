const { ClientSecretCredential } = require('@azure/identity');
const { ResourceManagementClient } = require('@azure/arm-resources');
const { StorageManagementClient } = require('@azure/arm-storage');
const { BlobServiceClient, StorageSharedKeyCredential } = require('@azure/storage-blob');
const path = require('path');
const fs = require('fs').promises;
const mime = require('mime-types');
const { logger } = require('../utils/logger');
const { AzureError } = require('../utils/errorHandler');

async function validateServicePrincipal(credentials, subscriptionId, testConfig) {
  const result = {
    isValid: false,
    permissions: {
      resource_group_create: false,
      storage_account_create: false,
      blob_container_create: false,
      blob_upload: false,
      static_website_enable: false,
      storage_account_delete: false
    },
    errors: [],
    storageAccountName: null,
    websiteUrl: null
  };

  let credential;
  let resourceClient;
  let storageClient;
  let storageAccountName;
  let createdResources = [];

  try {
    // Create credential
    credential = new ClientSecretCredential(
      credentials.tenant_id,
      credentials.client_id,
      credentials.client_secret
    );

    // Initialize clients
    resourceClient = new ResourceManagementClient(credential, subscriptionId);
    storageClient = new StorageManagementClient(credential, subscriptionId);

    // Test 1: Create/Get Resource Group
    logger.info('Testing resource group creation...');
    try {
      const resourceGroupName = testConfig.resource_group || 'validation-rg';
      const location = testConfig.location || 'eastus';
      
      await resourceClient.resourceGroups.createOrUpdate(resourceGroupName, {
        location: location
      });
      
      result.permissions.resource_group_create = true;
      createdResources.push({ type: 'resourceGroup', name: resourceGroupName });
      logger.info(`Resource group '${resourceGroupName}' created/verified`);
    } catch (error) {
      result.errors.push(`Resource group creation failed: ${error.message}`);
      logger.error(error, 'Resource group creation failed');
      return result;
    }

    // Test 2: Create Storage Account
    logger.info('Testing storage account creation...');
    try {
      storageAccountName = generateStorageAccountName();
      const resourceGroupName = testConfig.resource_group || 'validation-rg';
      const location = testConfig.location || 'eastus';

      const createParams = {
        sku: { name: 'Standard_LRS' },
        kind: 'StorageV2',
        location: location,
        allowBlobPublicAccess: true
      };

      const poller = await storageClient.storageAccounts.beginCreate(
        resourceGroupName,
        storageAccountName,
        createParams
      );

      // Wait for completion with timeout
      const storageAccount = await poller.pollUntilDone();
      
      result.permissions.storage_account_create = true;
      result.storageAccountName = storageAccountName;
      createdResources.push({ type: 'storageAccount', name: storageAccountName });
      logger.info(`Storage account '${storageAccountName}' created`);

      // Get storage account keys
      const keys = await storageClient.storageAccounts.listKeys(
        resourceGroupName,
        storageAccountName
      );
      const storageKey = keys.keys[0].value;
      const storageCredential = new StorageSharedKeyCredential(storageAccountName, storageKey);

      // Test 3: Enable Static Website
      logger.info('Testing static website enablement...');
      try {
        const blobServiceClient = new BlobServiceClient(
          `https://${storageAccountName}.blob.core.windows.net`,
          storageCredential
        );

        await blobServiceClient.setProperties({
          staticWebsite: {
            enabled: true,
            indexDocument: 'index.html',
            errorDocument404Path: '404.html'
          }
        });

        result.permissions.static_website_enable = true;
        logger.info('Static website hosting enabled');
      } catch (error) {
        result.errors.push(`Static website enable failed: ${error.message}`);
        logger.error(error, 'Static website enable failed');
      }

      // Test 4: Create Container and Set Access
      logger.info('Testing container creation...');
      try {
        const blobServiceClient = new BlobServiceClient(
          `https://${storageAccountName}.blob.core.windows.net`,
          storageCredential
        );

        const containerClient = blobServiceClient.getContainerClient('$web');
        
        // Check if container exists, create if not
        const exists = await containerClient.exists();
        if (!exists) {
          await containerClient.create();
        }

        // Set public access - use correct parameters for Node.js SDK
        await containerClient.setAccessPolicy('Container');
        
        result.permissions.blob_container_create = true;
        logger.info('Container created/verified with public access');
      } catch (error) {
        result.errors.push(`Container creation failed: ${error.message}`);
        logger.error(error, 'Container creation failed');
      }

      // Test 5: Upload Test Files
      logger.info('Testing file upload...');
      try {
        // Use storage account key for blob operations (like Python version)
        const blobServiceClient = new BlobServiceClient(
          `https://${storageAccountName}.blob.core.windows.net`,
          storageCredential
        );

        const containerClient = blobServiceClient.getContainerClient('$web');
        
        // Upload test files
        const testFiles = testConfig.test_files || ['index.html', '404.html'];
        const testFilesPath = path.join(__dirname, '../../test-files');

        for (const fileName of testFiles) {
          const filePath = path.join(testFilesPath, fileName);
          let content;
          
          try {
            content = await fs.readFile(filePath);
          } catch (error) {
            // If file doesn't exist, create a simple one
            content = Buffer.from(`<html><body><h1>${fileName}</h1></body></html>`);
          }

          const blockBlobClient = containerClient.getBlockBlobClient(fileName);
          const contentType = mime.lookup(fileName) || 'application/octet-stream';
          
          await blockBlobClient.upload(content, content.length, {
            blobHTTPHeaders: { blobContentType: contentType }
          });
          
          logger.info(`Uploaded ${fileName}`);
        }

        result.permissions.blob_upload = true;
        logger.info('Test files uploaded successfully');
      } catch (error) {
        result.errors.push(`File upload failed: ${error.message}`);
        logger.error(error, 'File upload failed');
      }

      // Get website URL
      const properties = await storageClient.storageAccounts.getProperties(
        resourceGroupName,
        storageAccountName
      );
      
      if (properties.primaryEndpoints && properties.primaryEndpoints.web) {
        result.websiteUrl = properties.primaryEndpoints.web.replace(/\/$/, '');
        logger.info(`Website URL: ${result.websiteUrl}`);
      }

      // Test 6: Storage Account Deletion (Cleanup)
      if (process.env.CLEANUP_ENABLED === 'true') {
        logger.info('Testing storage account deletion...');
        try {
          // Create a temporary storage account to test deletion
          const tempStorageName = generateStorageAccountName();
          const tempPoller = await storageClient.storageAccounts.beginCreate(
            resourceGroupName,
            tempStorageName,
            {
              sku: { name: 'Standard_LRS' },
              kind: 'StorageV2',
              location: testConfig.location || 'eastus'
            }
          );
          
          await tempPoller.pollUntilDone();
          
          // Now delete it
          await storageClient.storageAccounts.beginDeleteAndWait(
            resourceGroupName,
            tempStorageName
          );
          
          result.permissions.storage_account_delete = true;
          logger.info('Storage account deletion test passed');
        } catch (error) {
          result.errors.push(`Storage account deletion test failed: ${error.message}`);
          logger.error(error, 'Storage account deletion test failed');
        }
      }

      // All critical tests passed
      result.isValid = result.permissions.resource_group_create && 
                      result.permissions.storage_account_create &&
                      result.permissions.blob_container_create &&
                      result.permissions.blob_upload;

    } catch (error) {
      result.errors.push(`Storage account creation failed: ${error.message}`);
      logger.error(error, 'Storage account creation failed');
    }

  } catch (error) {
    result.errors.push(`Authentication failed: ${error.message}`);
    logger.error(error, 'Authentication failed');
  } finally {
    // Cleanup created resources if enabled
    if (process.env.CLEANUP_ENABLED === 'true' && createdResources.length > 0) {
      await cleanupResources(createdResources, resourceClient, storageClient, testConfig.resource_group);
    }
  }

  return result;
}

function generateStorageAccountName() {
  const timestamp = Date.now().toString().slice(-6); // 6 digits instead of 8
  const random = Math.random().toString(36).substring(2, 8); // 6 chars instead of 8  
  return `azval${random}${timestamp}`.toLowerCase(); // "azval" instead of "azvalidator"
}

async function cleanupResources(resources, resourceClient, storageClient, resourceGroupName) {
  logger.info('Cleaning up created resources...');
  
  for (const resource of resources) {
    try {
      if (resource.type === 'storageAccount') {
        await storageClient.storageAccounts.beginDeleteAndWait(
          resourceGroupName,
          resource.name
        );
        logger.info(`Deleted storage account: ${resource.name}`);
      }
    } catch (error) {
      logger.error(error, `Failed to cleanup ${resource.type}: ${resource.name}`);
    }
  }
}

module.exports = {
  validateServicePrincipal
};