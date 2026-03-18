import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { sessions } from '@/lib/device-auth-sessions';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { saveValidation } = require('@/src/utils/database');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { addValidationJob } = require('@/src/utils/queue');

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = sessions.get(id);

  if (!session?.servicePrincipal) {
    return NextResponse.json({ error: 'Service principal not created' }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const { webhook_url, test_config } = body as {
    webhook_url?: string;
    test_config?: Record<string, unknown>;
  };

  const { servicePrincipal } = session;
  const subscriptionId = session.subscriptionId ?? session.accountInfo?.[0]?.id ?? '';

  const credentials = {
    tenant_id: servicePrincipal.tenant,
    client_id: servicePrincipal.appId,
    client_secret: servicePrincipal.password,
    display_name: servicePrincipal.displayName,
  };

  const validationId = uuidv4();
  await saveValidation({
    id: validationId,
    tenant_id: servicePrincipal.tenant,
    client_id: servicePrincipal.appId,
    subscription_id: subscriptionId,
    status: 'pending',
    webhook_url: webhook_url ?? null,
  });

  await addValidationJob(validationId, credentials, subscriptionId, test_config ?? {});

  return NextResponse.json(
    {
      validation_id: validationId,
      status: 'pending',
      message: 'Validation job has been queued',
      status_url: `/api/validate/${validationId}/status`,
      service_principal: {
        appId: servicePrincipal.appId,
        displayName: servicePrincipal.displayName,
        tenant: servicePrincipal.tenant,
      },
      subscription_id: subscriptionId,
    },
    { status: 202 }
  );
}
