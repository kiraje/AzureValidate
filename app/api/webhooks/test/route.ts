import { NextResponse } from 'next/server';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getWebhookConfig } = require('@/src/utils/database');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { sendWebhook } = require('@/src/webhooks/webhookSender');

export async function POST() {
  const config = await getWebhookConfig();
  if (!config.enabled || !config.url) {
    return NextResponse.json({ error: 'No webhook configured' }, { status: 400 });
  }

  const mockPayload = {
    validation_id: 'test-' + Date.now(),
    timestamp: new Date().toISOString(),
    status: 'valid',
    test: true,
  };

  try {
    // sendWebhook signature: (webhookUrl, payload, validationId, secretHeader)
    await sendWebhook(config.url, mockPayload, 'test-delivery', config.secret_header || null);
    return NextResponse.json({ ok: true, message: 'Test delivery sent' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ ok: false, message }, { status: 200 });
  }
}
