import { NextRequest, NextResponse } from 'next/server';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getWebhookConfig, saveWebhookConfig } = require('@/src/utils/database');

export async function GET() {
  const config = await getWebhookConfig();
  return NextResponse.json({
    url: config.url,
    enabled: config.enabled,
    has_secret: !!config.secret_header,
    updated_at: config.updated_at,
  });
}

export async function PUT(request: NextRequest) {
  const { url, enabled, secret_header } = await request.json();
  const updated = await saveWebhookConfig({ url, enabled, secret_header });
  return NextResponse.json({
    url: updated.url,
    enabled: updated.enabled,
    has_secret: !!updated.secret_header,
    updated_at: updated.updated_at,
  });
}
