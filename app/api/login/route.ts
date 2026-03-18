import { NextRequest, NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { sessionOptions, type SessionData } from '@/lib/session';

export async function POST(request: NextRequest) {
  const { apiKey } = await request.json();

  if (!apiKey || apiKey !== process.env.API_KEY) {
    return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
  }

  const response = NextResponse.json({});
  const session = await getIronSession<SessionData>(request, response, sessionOptions);
  session.authenticated = true;
  await session.save();

  return response;
}
