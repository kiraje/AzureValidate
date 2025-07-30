const { Pool } = require('pg');
const { logger } = require('./logger');

let pool;

async function initializeDatabase() {
  try {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    // Test connection
    await pool.query('SELECT NOW()');

    // Create tables if not exists
    await createTables();
    
    logger.info('Database connection established');
  } catch (error) {
    logger.error(error, 'Failed to initialize database');
    throw error;
  }
}

async function createTables() {
  const queries = [
    `CREATE TABLE IF NOT EXISTS validations (
      id UUID PRIMARY KEY,
      tenant_id VARCHAR(255) NOT NULL,
      client_id VARCHAR(255) NOT NULL,
      subscription_id VARCHAR(255) NOT NULL,
      status VARCHAR(50) NOT NULL,
      webhook_url TEXT,
      started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      completed_at TIMESTAMP,
      report JSONB,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    
    `CREATE TABLE IF NOT EXISTS webhook_deliveries (
      id UUID PRIMARY KEY,
      validation_id UUID REFERENCES validations(id),
      webhook_url TEXT NOT NULL,
      payload JSONB NOT NULL,
      status VARCHAR(50) NOT NULL,
      attempts INT DEFAULT 0,
      last_attempt_at TIMESTAMP,
      response_status INT,
      response_body TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,

    `CREATE INDEX IF NOT EXISTS idx_validations_status ON validations(status)`,
    `CREATE INDEX IF NOT EXISTS idx_validations_tenant ON validations(tenant_id)`,
    `CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_validation ON webhook_deliveries(validation_id)`
  ];

  for (const query of queries) {
    await pool.query(query);
  }
}

async function saveValidation(validation) {
  const query = `
    INSERT INTO validations (id, tenant_id, client_id, subscription_id, status, webhook_url)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *
  `;
  
  const values = [
    validation.id,
    validation.tenant_id,
    validation.client_id,
    validation.subscription_id,
    validation.status,
    validation.webhook_url
  ];

  const result = await pool.query(query, values);
  return result.rows[0];
}

async function updateValidation(id, updates) {
  const fields = [];
  const values = [];
  let paramCount = 1;

  Object.entries(updates).forEach(([key, value]) => {
    fields.push(`${key} = $${paramCount}`);
    values.push(value);
    paramCount++;
  });

  values.push(id);
  
  const query = `
    UPDATE validations 
    SET ${fields.join(', ')}
    WHERE id = $${paramCount}
    RETURNING *
  `;

  const result = await pool.query(query, values);
  return result.rows[0];
}

async function getValidation(id) {
  const query = 'SELECT * FROM validations WHERE id = $1';
  const result = await pool.query(query, [id]);
  return result.rows[0];
}

async function saveWebhookDelivery(delivery) {
  const query = `
    INSERT INTO webhook_deliveries 
    (id, validation_id, webhook_url, payload, status, attempts)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *
  `;
  
  const values = [
    delivery.id,
    delivery.validation_id,
    delivery.webhook_url,
    delivery.payload,
    delivery.status,
    delivery.attempts || 0
  ];

  const result = await pool.query(query, values);
  return result.rows[0];
}

async function updateWebhookDelivery(id, updates) {
  const fields = [];
  const values = [];
  let paramCount = 1;

  Object.entries(updates).forEach(([key, value]) => {
    fields.push(`${key} = $${paramCount}`);
    values.push(value);
    paramCount++;
  });

  values.push(id);
  
  const query = `
    UPDATE webhook_deliveries 
    SET ${fields.join(', ')}
    WHERE id = $${paramCount}
    RETURNING *
  `;

  const result = await pool.query(query, values);
  return result.rows[0];
}

module.exports = {
  initializeDatabase,
  saveValidation,
  updateValidation,
  getValidation,
  saveWebhookDelivery,
  updateWebhookDelivery
};