import { assertRoleAllowed, resolveRequestUser } from '@/server/auth';
import { handleApiError } from '@/server/apiHelpers';
import { wfmEventBus } from '@/server/events';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  try {
    const user = await resolveRequestUser(request);
    assertRoleAllowed(user, [
      'TECHNICIAN',
      'JOB_CONTROLLER',
      'SUPERVISOR',
      'ADMINISTRATOR',
    ]);

    const encoder = new TextEncoder();
    let unsubscribe: (() => void) | null = null;
    let keepAlive: ReturnType<typeof setInterval> | null = null;

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: 'CONNECTED', role: user.role })}\n\n`,
          ),
        );

        unsubscribe = wfmEventBus.subscribe((evt) => {
          try {
            // Technicians only receive scoped events; fleet GPS telemetry is restricted to NOC
            if (user.role === 'TECHNICIAN') {
              if (evt.type === 'TECHNICIAN_GPS') return;
              if (
                evt.type === 'SESSION_CHANGED' &&
                evt.entityId &&
                evt.entityId !== user.id
              ) {
                return;
              }
            }
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(evt)}\n\n`));
          } catch {
            // Stream already closed
          }
        });

        keepAlive = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(': heartbeat\n\n'));
          } catch {
            // Stream closed
          }
        }, 15_000);
      },
      cancel() {
        if (unsubscribe) unsubscribe();
        if (keepAlive) clearInterval(keepAlive);
      },
    });

    request.signal.addEventListener('abort', () => {
      if (unsubscribe) unsubscribe();
      if (keepAlive) clearInterval(keepAlive);
    });

    return new Response(stream, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
