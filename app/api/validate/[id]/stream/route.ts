import { NextRequest } from 'next/server';
import Redis from 'ioredis';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getValidation } = require('@/src/utils/database');

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const validation = await getValidation(id).catch(() => null);
  if (!validation) {
    return new Response(JSON.stringify({ error: 'Validation not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const encoder = new TextEncoder();
  let sub: Redis | null = null;
  let closed = false;
  // These are promoted to outer scope so cancel() can clean them up
  let fallbackPoll: ReturnType<typeof setInterval> | null = null;
  let fallbackTimeout: ReturnType<typeof setTimeout> | null = null;
  let safetyTimeout: ReturnType<typeof setTimeout> | null = null;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        if (!closed) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        }
      };

      // Safety timeout: 6 minutes
      safetyTimeout = setTimeout(() => {
        send({ step: 'done', status: 'failed', errors: ['Timed out waiting for validation result'] });
        controller.close();
      }, 6 * 60 * 1000);

      try {
        sub = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

        await sub.subscribe(`validation:progress:${id}`);

        sub.on('message', (_channel: string, message: string) => {
          try {
            const event = JSON.parse(message);
            send(event);
            if (event.step === 'done') {
              clearTimeout(safetyTimeout!);
              controller.close();
            }
          } catch {
            // ignore parse errors
          }
        });

        sub.on('error', async () => {
          // Fallback: poll DB every 2s
          clearTimeout(safetyTimeout!);
          fallbackTimeout = setTimeout(() => {
            send({ step: 'done', status: 'failed', errors: ['Timed out'] });
            controller.close();
          }, 6 * 60 * 1000);

          fallbackPoll = setInterval(async () => {
            const v = await getValidation(id).catch(() => null);
            if (v && ['valid', 'invalid', 'failed'].includes(v.status)) {
              clearInterval(fallbackPoll!);
              clearTimeout(fallbackTimeout!);
              fallbackPoll = null;
              fallbackTimeout = null;
              send({ step: 'done', status: v.status === 'valid' ? 'complete' : 'failed' });
              controller.close();
            }
          }, 2000);
        });

      } catch {
        clearTimeout(safetyTimeout!);
        controller.close();
      }
    },

    cancel() {
      closed = true;
      if (safetyTimeout) { clearTimeout(safetyTimeout); safetyTimeout = null; }
      if (fallbackPoll) { clearInterval(fallbackPoll); fallbackPoll = null; }
      if (fallbackTimeout) { clearTimeout(fallbackTimeout); fallbackTimeout = null; }
      if (sub) {
        sub.unsubscribe().finally(() => sub?.disconnect());
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
