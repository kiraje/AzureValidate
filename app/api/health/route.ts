import { NextResponse } from 'next/server';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { initializeDatabase } = require('@/src/utils/database');
import Redis from 'ioredis';

export async function GET() {
  let dbOk = false;
  let redisOk = false;

  try {
    // initializeDatabase is idempotent — safe to call here
    await initializeDatabase();
    dbOk = true;
  } catch { /* db down */ }

  try {
    const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      connectTimeout: 2000,
      lazyConnect: true,
    });
    await redis.connect();
    await redis.ping();
    redis.disconnect();
    redisOk = true;
  } catch { /* redis down */ }

  const status = dbOk && redisOk ? 'ok' : 'degraded';
  return NextResponse.json({ status, db: dbOk, redis: redisOk }, {
    status: status === 'ok' ? 200 : 503,
  });
}
