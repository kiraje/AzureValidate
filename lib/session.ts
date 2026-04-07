import type { SessionOptions } from 'iron-session';

export interface SessionData {
  authenticated: boolean;
}

export const sessionOptions: SessionOptions = {
  cookieName: 'az-validator-session',
  password: process.env.SESSION_SECRET!,
  cookieOptions: {
    httpOnly: true,
    sameSite: 'strict' as const,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 7, // 7 days
  },
};
