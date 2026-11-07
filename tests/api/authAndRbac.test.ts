import { describe, expect, it } from 'vitest';
import {
  assertRoleAllowed,
  hashPassword,
  resolveSurfaceSession,
  signSurfaceToken,
  verifyPassword,
  verifySurfaceToken,
} from '@/server/auth';

describe('Cryptographic Password Hashing, Scoped JWT & RBAC Guards', () => {
  it('hashes passwords with random salt and verifies in constant time', () => {
    const hash = hashPassword('FiberBlaze#2026!');
    expect(hash).not.toContain('FiberBlaze#2026!');
    expect(verifyPassword('FiberBlaze#2026!', hash)).toBe(true);
    expect(verifyPassword('WrongPassword', hash)).toBe(false);
  });

  it('signs and verifies HS256 surface tokens and rejects tampered payloads', async () => {
    const token = await signSurfaceToken(
      {
        id: 'u-ctrl-1',
        employeeCode: 'FB-JC01',
        email: 'controller@fiberblaze.ph',
        fullName: 'Camille Reyes',
        role: 'JOB_CONTROLLER',
      },
      'ops',
    );

    const verified = await verifySurfaceToken(token, 'ops');
    expect(verified?.role).toBe('JOB_CONTROLLER');
    expect(verified?.employeeCode).toBe('FB-JC01');

    // Cross-surface replay rejected: ops token must not validate as tech surface
    const wrongSurface = await verifySurfaceToken(token, 'tech');
    expect(wrongSurface).toBeNull();

    // Tampered signature rejected
    const tampered = `${token.slice(0, -4)}xxxx`;
    expect(await verifySurfaceToken(tampered, 'ops')).toBeNull();
  });

  it('keeps ops and tech cookies isolated when both exist in Split-Screen Demo Theater', async () => {
    const opsToken = await signSurfaceToken(
      {
        id: 'u-ctrl-1',
        employeeCode: 'FB-JC01',
        email: 'controller@fiberblaze.ph',
        fullName: 'Camille Reyes',
        role: 'JOB_CONTROLLER',
      },
      'ops',
    );
    const techToken = await signSurfaceToken(
      {
        id: 'u-tech-1',
        employeeCode: 'FB-T01',
        email: 'mateo@fiberblaze.ph',
        fullName: 'Mateo Villanueva',
        role: 'TECHNICIAN',
      },
      'tech',
    );

    const cookieHeader = `fb_ops_session=${opsToken}; fb_tech_session=${techToken}`;

    const opsUser = await resolveSurfaceSession({
      cookieHeader,
      surfaceHeader: 'ops',
    });
    const techUser = await resolveSurfaceSession({
      cookieHeader,
      surfaceHeader: 'tech',
    });

    expect(opsUser?.role).toBe('JOB_CONTROLLER');
    expect(techUser?.role).toBe('TECHNICIAN');
  });

  it('enforces strict least-privilege role checks', () => {
    const techUser = {
      id: 'u-tech-1',
      employeeCode: 'FB-T01',
      email: 'mateo@fiberblaze.ph',
      fullName: 'Mateo Villanueva',
      role: 'TECHNICIAN' as const,
    };

    expect(() =>
      assertRoleAllowed(techUser, ['JOB_CONTROLLER', 'ADMINISTRATOR']),
    ).toThrow(/Forbidden/i);
    expect(() =>
      assertRoleAllowed(null, ['TECHNICIAN']),
    ).toThrow(/Unauthorized/i);
  });
});
