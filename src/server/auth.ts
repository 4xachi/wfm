import crypto from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import type { AuthenticatedUser, Role, SurfaceScope } from '@/domain/types';

export class HttpError extends Error {
  readonly status: number;
  readonly isHttpError = true as const;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

export function isHttpError(err: unknown): err is HttpError {
  return (
    typeof err === 'object' &&
    err !== null &&
    'isHttpError' in err &&
    (err as { isHttpError?: unknown }).isHttpError === true &&
    typeof (err as { status?: unknown }).status === 'number'
  );
}

export function isDemoModeEnabled(): boolean {
  if (process.env.FIBERBLAZE_STRICT_PRODUCTION === 'true') return false;
  if (process.env.FIBERBLAZE_DEMO_MODE === 'false') return false;
  return true;
}

const JWT_ISSUER = 'fiberblaze-wfm-core';
const JWT_AUDIENCE = 'fiberblaze-wfm';

const PLACEHOLDER_SECRETS = new Set([
  'replace-with-at-least-32-bytes-high-entropy-secret-in-production',
  'your-secret-here',
  'default-secret',
]);

// Per-process ephemeral fallback secret if FIBERBLAZE_JWT_SECRET is unset in dev/test
const FALLBACK_RUNTIME_SECRET = crypto.randomBytes(32).toString('hex');

function getJwtSecretBytes(): Uint8Array {
  const configured = process.env.FIBERBLAZE_JWT_SECRET?.trim();
  const isStrictProd = process.env.FIBERBLAZE_STRICT_PRODUCTION === 'true';

  if (configured) {
    if (PLACEHOLDER_SECRETS.has(configured)) {
      if (isStrictProd) {
        throw new Error(
          'Production security violation: placeholder FIBERBLAZE_JWT_SECRET detected. Provide a high-entropy secret (>=32 bytes).',
        );
      }
      return new TextEncoder().encode(FALLBACK_RUNTIME_SECRET);
    }
    if (configured.length < 32) {
      if (isStrictProd) {
        throw new Error(
          'Production security violation: FIBERBLAZE_JWT_SECRET must be at least 32 characters in strict production mode.',
        );
      }
      return new TextEncoder().encode(FALLBACK_RUNTIME_SECRET);
    }
    return new TextEncoder().encode(configured);
  }

  if (isStrictProd) {
    throw new Error(
      'Production security violation: FIBERBLAZE_JWT_SECRET must be explicitly configured when FIBERBLAZE_STRICT_PRODUCTION=true.',
    );
  }

  return new TextEncoder().encode(FALLBACK_RUNTIME_SECRET);
}

export function getCookieNameForSurface(surface: SurfaceScope): string {
  return surface === 'tech' ? 'fb_tech_session' : 'fb_ops_session';
}

export function hashPassword(plainPassword: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto
    .scryptSync(plainPassword, salt, 64, { N: 16384, r: 8, p: 1 })
    .toString('hex');
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(
  plainPassword: string,
  storedHash: string,
): boolean {
  const parts = storedHash.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, salt, expectedHex] = parts;
  if (!salt || !expectedHex) return false;

  const derived = crypto.scryptSync(plainPassword, salt, 64, {
    N: 16384,
    r: 8,
    p: 1,
  });
  const expectedBuf = Buffer.from(expectedHex, 'hex');
  if (derived.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(derived, expectedBuf);
}

export type SessionUserValidator = (
  user: AuthenticatedUser,
  surface: SurfaceScope,
) => AuthenticatedUser | null | Promise<AuthenticatedUser | null>;

let globalSessionUserValidator: SessionUserValidator | null = null;

export function registerSessionUserValidator(fn: SessionUserValidator): void {
  globalSessionUserValidator = fn;
}

export async function signSurfaceToken(
  user: AuthenticatedUser,
  surface: SurfaceScope,
): Promise<string> {
  return new SignJWT({
    employeeCode: user.employeeCode,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    surface,
    ver: user.sessionVersion ?? 1,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime('12h')
    .sign(getJwtSecretBytes());
}

export async function verifySurfaceToken(
  token: string,
  expectedSurface: SurfaceScope,
): Promise<AuthenticatedUser | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getJwtSecretBytes(), {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      algorithms: ['HS256'],
    });
    if (payload.surface !== expectedSurface || typeof payload.sub !== 'string') {
      return null;
    }
    const role = payload.role as Role;
    if (
      role !== 'TECHNICIAN' &&
      role !== 'JOB_CONTROLLER' &&
      role !== 'SUPERVISOR' &&
      role !== 'ADMINISTRATOR'
    ) {
      return null;
    }
    const user: AuthenticatedUser = {
      id: payload.sub,
      employeeCode: String(payload.employeeCode ?? ''),
      email: String(payload.email ?? ''),
      fullName: String(payload.fullName ?? ''),
      role,
      sessionVersion:
        typeof payload.ver === 'number' ? payload.ver : undefined,
    };

    if (globalSessionUserValidator) {
      const validated = await globalSessionUserValidator(user, expectedSurface);
      return validated;
    }

    return user;
  } catch {
    return null;
  }
}

function parseCookies(cookieHeader: string | null | undefined): Record<string, string> {
  if (!cookieHeader) return {};
  const map: Record<string, string> = {};
  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=');
    if (eq > 0) {
      const k = part.slice(0, eq).trim();
      const v = part.slice(eq + 1).trim();
      try {
        map[k] = decodeURIComponent(v);
      } catch {
        map[k] = v;
      }
    }
  }
  return map;
}

export async function resolveSurfaceSession(input: {
  cookieHeader?: string | null;
  surfaceHeader?: string | null;
  authorizationHeader?: string | null;
}): Promise<AuthenticatedUser | null> {
  const surface: SurfaceScope =
    input.surfaceHeader === 'tech' ? 'tech' : 'ops';

  if (input.authorizationHeader?.startsWith('Bearer ')) {
    const bearer = input.authorizationHeader.slice(7).trim();
    return verifySurfaceToken(bearer, surface);
  }

  const cookies = parseCookies(input.cookieHeader);
  const primaryCookie = cookies[getCookieNameForSurface(surface)];
  if (primaryCookie) {
    return verifySurfaceToken(primaryCookie, surface);
  }

  // Fallback when no explicit X-FB-Surface header is passed (e.g. SSE EventSource or image fetch)
  if (!input.surfaceHeader && cookies.fb_tech_session) {
    return verifySurfaceToken(cookies.fb_tech_session, 'tech');
  }

  return null;
}

export async function resolveRequestUser(
  request: Request,
): Promise<AuthenticatedUser | null> {
  const url = new URL(request.url);
  const querySurface = url.searchParams.get('surface');
  const surfaceHeader =
    request.headers.get('x-fb-surface') ?? querySurface ?? null;

  return resolveSurfaceSession({
    cookieHeader: request.headers.get('cookie'),
    surfaceHeader,
    authorizationHeader: request.headers.get('authorization'),
  });
}

export function assertRoleAllowed(
  user: AuthenticatedUser | null,
  allowedRoles: Role[],
): asserts user is AuthenticatedUser {
  if (!user) {
    throw new HttpError(401, 'Unauthorized: valid session token required.');
  }
  if (!allowedRoles.includes(user.role)) {
    throw new HttpError(
      403,
      `Forbidden: role ${user.role} lacks permission for this action.`,
    );
  }
}
