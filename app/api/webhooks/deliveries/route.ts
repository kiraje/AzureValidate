import { NextResponse } from 'next/server';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getRecentDeliveries } = require('@/src/utils/database');

export async function GET() {
  const rows = await getRecentDeliveries(10);
  return NextResponse.json({
    deliveries: rows.map((r: Record<string, unknown>) => ({
      id: r.id,
      validation_id: r.validation_id,
      http_status: r.response_status,
      success: r.status === 'delivered',
      attempted_at: r.last_attempt_at,
    })),
  });
}
