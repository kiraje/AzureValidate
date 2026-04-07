export interface DeviceAuthSession {
  sessionId: string;
  status: 'pending' | 'completed' | 'failed';
  userCode?: string;
  verificationUrl?: string;
  deviceCodeReceived?: boolean;
  error?: string;
  account?: {
    name: string;
    id: string;
    tenantId: string;
    user: { name: string } | string;
  };
  accountInfo?: Array<{
    name: string;
    id: string;
    tenantId: string;
    user: { name: string } | string;
  }>;
  servicePrincipal?: {
    appId: string;
    displayName: string;
    password: string;
    tenant: string;
  };
  subscriptionId?: string;
  startedAt: Date;
  expiresAt: number;
}

// Module-level Map persists for the lifetime of the Next.js server process
export const sessions = new Map<string, DeviceAuthSession>();

// Clean up expired sessions (> 20 min old)
export function cleanExpiredSessions() {
  const now = Date.now();
  for (const [id, session] of sessions.entries()) {
    if (session.expiresAt < now) sessions.delete(id);
  }
}
