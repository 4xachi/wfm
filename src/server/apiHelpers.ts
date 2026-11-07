import type { SurfaceScope } from '@/domain/types';
import { getCookieNameForSurface, HttpError, isHttpError } from './auth';

export async function readJsonObject<T = Record<string, unknown>>(
  request: Request,
  maxBytes = 2 * 1024 * 1024,
): Promise<T> {
  let text: string;
  try {
    text = await request.text();
  } catch {
    throw new HttpError(400, 'Unable to read request payload.');
  }

  if (Buffer.byteLength(text, 'utf8') > maxBytes) {
    throw new HttpError(
      413,
      `Payload exceeds ${Math.round(maxBytes / 1024)} KB limit.`,
    );
  }

  const trimmed = text.trim();
  if (!trimmed) {
    return {} as T;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new HttpError(400, 'Malformed JSON payload.');
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new HttpError(400, 'JSON body must be a valid non-array object.');
  }

  return parsed as T;
}

export function assertMutationSurfaceHeader(request: Request): SurfaceScope {
  const raw = request.headers.get('x-fb-surface');
  if (raw !== 'ops' && raw !== 'tech') {
    throw new HttpError(
      403,
      'Forbidden: missing or invalid X-FB-Surface protection header.',
    );
  }
  return raw;
}

export function buildSessionCookieHeader(
  surface: SurfaceScope,
  token: string,
  maxAgeSeconds: number,
): string {
  const name = getCookieNameForSurface(surface);
  const securePart = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${name}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${securePart}`;
}

export function jsonOk(
  payload: unknown,
  status = 200,
  extraHeaders?: Record<string, string>,
): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...(extraHeaders ?? {}),
    },
  });
}

export function handleApiError(err: unknown): Response {
  if (isHttpError(err)) {
    return jsonOk({ error: err.message }, err.status);
  }
  const isStrictProd =
    process.env.NODE_ENV === 'production' &&
    process.env.FIBERBLAZE_STRICT_PRODUCTION === 'true';
  const message = isStrictProd
    ? 'Internal server error.'
    : err instanceof Error
      ? err.message
      : 'Unexpected server error.';
  return jsonOk({ error: message }, 500);
}
