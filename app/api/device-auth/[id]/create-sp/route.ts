import { NextRequest, NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { sessions } from '@/lib/device-auth-sessions';

const execFileAsync = promisify(execFile);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = sessions.get(id);

  if (!session || session.status !== 'completed') {
    return NextResponse.json({ error: 'Authentication not completed' }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const { name = 'AzureValidatorSP', role = 'Contributor' } = body as {
    name?: string;
    role?: string;
  };

  const accountInfo = session.accountInfo?.[0];
  if (!accountInfo) {
    return NextResponse.json({ error: 'Account info missing from session' }, { status: 400 });
  }
  const subscriptionId = accountInfo.id;

  // First create SP without role assignment (works even with disabled subscriptions)
  // Using execFile with explicit args array — no shell interpolation, no injection risk
  let spStdout: string;
  try {
    const { stdout } = await execFileAsync(
      'az',
      ['ad', 'sp', 'create-for-rbac', '--name', name, '--skip-assignment', '--output', 'json'],
      { timeout: 60000 }
    );
    spStdout = stdout;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `Service principal creation failed: ${message}` },
      { status: 500 }
    );
  }

  let servicePrincipal: {
    appId: string;
    displayName: string;
    password: string;
    tenant: string;
  };
  try {
    servicePrincipal = JSON.parse(spStdout);
  } catch {
    return NextResponse.json(
      { error: 'Failed to parse service principal output from Azure CLI' },
      { status: 500 }
    );
  }

  // Try to assign role — don't fail if subscription is disabled or insufficient perms
  try {
    await execFileAsync(
      'az',
      [
        'role',
        'assignment',
        'create',
        '--assignee',
        servicePrincipal.appId,
        '--role',
        role,
        '--scope',
        `/subscriptions/${subscriptionId}`,
        '--output',
        'json',
      ],
      { timeout: 30000 }
    );
  } catch {
    // Role assignment failure is non-fatal — log and continue
    console.warn(
      `[device-auth/create-sp] Role assignment failed for ${servicePrincipal.appId}, continuing without role`
    );
  }

  // Store SP in session for later validate step
  session.servicePrincipal = servicePrincipal;

  const accountName =
    typeof accountInfo.user === 'object' && accountInfo.user !== null
      ? (accountInfo.user as { name: string }).name
      : String(accountInfo.user ?? accountInfo.name);

  return NextResponse.json({
    session_id: id,
    service_principal: {
      appId: servicePrincipal.appId,
      displayName: servicePrincipal.displayName,
      password: servicePrincipal.password,
      tenant: servicePrincipal.tenant,
    },
    subscription_id: subscriptionId,
    account_name: accountName,
    message: 'Service principal created successfully',
  });
}
