import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { v4 as uuidv4 } from 'uuid';
import { sessions, cleanExpiredSessions, type DeviceAuthSession } from '@/lib/device-auth-sessions';

export async function POST() {
  cleanExpiredSessions();

  const sessionId = uuidv4();

  // Spawn az CLI with static args only — no user input, no shell injection risk
  // Using spawn (not exec/shell) for safety
  const azProcess = spawn('az', ['login', '--use-device-code', '--output', 'json'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const session: DeviceAuthSession = {
    sessionId,
    status: 'pending',
    startedAt: new Date(),
    expiresAt: Date.now() + 20 * 60 * 1000,
  };
  sessions.set(sessionId, session);

  // Accumulate stdout to parse final account JSON on completion
  let stdoutBuffer = '';
  azProcess.stdout?.on('data', (data: Buffer) => {
    stdoutBuffer += data.toString();
  });

  azProcess.on('close', (code) => {
    const s = sessions.get(sessionId);
    if (!s) return;
    if (code === 0 && stdoutBuffer) {
      try {
        const accounts = JSON.parse(stdoutBuffer);
        s.accountInfo = Array.isArray(accounts) ? accounts : [accounts];
        s.account = {
          name: s.accountInfo[0].name,
          id: s.accountInfo[0].id,
          tenantId: s.accountInfo[0].tenantId,
          user: s.accountInfo[0].user,
        };
        s.subscriptionId = s.accountInfo[0].id;
        s.status = 'completed';
      } catch {
        s.status = 'failed';
        s.error = 'Failed to parse Azure CLI account output';
      }
    } else if (code !== 0) {
      if (s.status !== 'failed') {
        s.status = 'failed';
        s.error = `Azure CLI exited with code ${code}`;
      }
    }
  });

  azProcess.on('error', () => {
    const s = sessions.get(sessionId);
    if (s) {
      s.status = 'failed';
      s.error = 'Azure CLI not found';
    }
  });

  // Azure CLI prints device code info to stderr
  // Pattern: "To sign in, use a web browser to open the page https://... and enter the code XXXXXXX"
  azProcess.stderr?.on('data', (data: Buffer) => {
    const output = data.toString();
    const s = sessions.get(sessionId);
    if (!s) return;

    const deviceCodeMatch = output.match(
      /To sign in, use a web browser to open the page (https:\/\/[^\s]+) and enter the code ([A-Z0-9]+)/
    );

    if (deviceCodeMatch) {
      const [, verificationUrl, userCode] = deviceCodeMatch;
      s.userCode = userCode;
      s.verificationUrl = verificationUrl;
      s.deviceCodeReceived = true;
    }
  });

  // Poll for device code (max 10 seconds — 50 × 200ms — matching original implementation)
  let attempts = 0;
  while (attempts < 50) {
    await new Promise<void>((resolve) => setTimeout(resolve, 200));
    const s = sessions.get(sessionId);
    if (s?.deviceCodeReceived) {
      return NextResponse.json({
        session_id: sessionId,
        user_code: s.userCode,
        verification_url: s.verificationUrl,
        message: `Go to ${s.verificationUrl} and enter code: ${s.userCode}`,
        expires_in: 900,
      });
    }
    // Check if process errored out early (e.g. az CLI not installed)
    if (s?.status === 'failed') {
      const isNotFound = s.error?.includes('not found') || s.error?.includes('ENOENT');
      return NextResponse.json(
        {
          error: isNotFound
            ? 'Azure CLI not found. Install with: pip install azure-cli'
            : (s.error ?? 'Azure CLI failed'),
        },
        { status: 500 }
      );
    }
    attempts++;
  }

  return NextResponse.json(
    { error: 'Timed out waiting for device code from Azure CLI' },
    { status: 500 }
  );
}
