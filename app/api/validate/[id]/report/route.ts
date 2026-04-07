import { NextRequest, NextResponse } from 'next/server';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getValidation } = require('@/src/utils/database');

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const validation = await getValidation(id).catch(() => null);
  if (!validation) {
    return NextResponse.json({ error: 'Validation not found' }, { status: 404 });
  }
  if (['pending', 'in_progress'].includes(validation.status)) {
    return NextResponse.json({ error: 'Validation still in progress' }, { status: 202 });
  }
  return NextResponse.json({
    validation_id: validation.id,
    status: validation.status,
    started_at: validation.started_at,
    completed_at: validation.completed_at,
    report: validation.report || {},
  });
}
