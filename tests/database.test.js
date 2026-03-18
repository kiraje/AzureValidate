// Smoke test — requires a running PostgreSQL (use docker-compose)
const { initializeDatabase, getWebhookConfig, saveWebhookConfig, getRecentDeliveries } = require('../src/utils/database');

describe('webhook_config helpers', () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/validator';
    await initializeDatabase();
  });

  it('returns default config on fresh table', async () => {
    const config = await getWebhookConfig();
    expect(config).toMatchObject({ enabled: false });
  });

  it('saves and retrieves config', async () => {
    await saveWebhookConfig({ url: 'https://example.com/hook', enabled: true, secret_header: null });
    const config = await getWebhookConfig();
    expect(config.url).toBe('https://example.com/hook');
    expect(config.enabled).toBe(true);
    // cleanup
    await saveWebhookConfig({ url: null, enabled: false, secret_header: null });
  });

  it('getRecentDeliveries returns an array', async () => {
    const deliveries = await getRecentDeliveries();
    expect(Array.isArray(deliveries)).toBe(true);
  });
});
