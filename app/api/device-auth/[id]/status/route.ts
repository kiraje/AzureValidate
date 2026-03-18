import { NextRequest, NextResponse } from 'next/server';
import { sessions } from '@/lib/device-auth-sessions';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = sessions.get(id);

  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  if (session.status === 'completed') {
    const accountInfo = session.accountInfo?.[0];
    return NextResponse.json({
      status: 'completed',
      account: accountInfo
        ? {
            name: accountInfo.name,
            id: accountInfo.id,
            tenantId: accountInfo.tenantId,
            user: accountInfo.user,
          }
        : session.account,
    });
  }

  if (session.status === 'failed') {
    return NextResponse.json({
      status: 'failed',
      error: session.error,
    });
  }

  // pending
  return NextResponse.json({
    status: 'pending',
    user_code: session.userCode,
    verification_url: session.verificationUrl,
  });
}
