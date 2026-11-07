import { describe, expect, it } from 'vitest';
import { POST as loginPost } from '@/app/api/auth/login/route';
import { POST as logoutPost } from '@/app/api/auth/logout/route';
import { GET as bootstrapGet } from '@/app/api/bootstrap/route';
import { POST as assignPost } from '@/app/api/work-orders/assign/route';
import { GET as sampleXlsxGet } from '@/app/api/import/sample-xlsx/route';

describe('HTTP Route Handlers — CSRF Header Guard, Least-Privilege Bootstrap & Cookie Auth', () => {
  it('blocks state-changing POST requests missing X-FB-Surface CSRF header', async () => {
    const req = new Request('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'controller@fiberblaze.ph',
        password: 'FiberBlaze2026!',
      }),
    });
    const res = await loginPost(req);
    expect(res.status).toBe(403);
  });

  it('authenticates JOB_CONTROLLER on ops and TECHNICIAN on tech simultaneously, enforcing role-scoped bootstrap visibility', async () => {
    const opsLoginRes = await loginPost(
      new Request('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-fb-surface': 'ops',
        },
        body: JSON.stringify({
          email: 'controller@fiberblaze.ph',
          password: 'FiberBlaze2026!',
        }),
      }),
    );
    expect(opsLoginRes.status).toBe(200);
    const opsSetCookie = opsLoginRes.headers.get('set-cookie') ?? '';
    expect(opsSetCookie).toContain('fb_ops_session=');
    expect(opsSetCookie).toContain('HttpOnly');

    const techLoginRes = await loginPost(
      new Request('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-fb-surface': 'tech',
        },
        body: JSON.stringify({
          email: 'mateo@fiberblaze.ph',
          password: 'FiberBlaze2026!',
        }),
      }),
    );
    expect(techLoginRes.status).toBe(200);
    const techSetCookie = techLoginRes.headers.get('set-cookie') ?? '';
    expect(techSetCookie).toContain('fb_tech_session=');

    const combinedCookie = [
      opsSetCookie.split(';')[0],
      techSetCookie.split(';')[0],
    ].join('; ');

    // Tech bootstrap ONLY sees Mateo's own work orders and zero audit logs
    const techBootRes = await bootstrapGet(
      new Request('http://localhost:3000/api/bootstrap', {
        headers: { cookie: combinedCookie, 'x-fb-surface': 'tech' },
      }),
    );
    expect(techBootRes.status).toBe(200);
    const techBoot = await techBootRes.json();
    expect(techBoot.user.role).toBe('TECHNICIAN');
    expect(
      techBoot.workOrders.every(
        (w: { assignedTechId: string }) => w.assignedTechId === techBoot.user.id,
      ),
    ).toBe(true);
    expect(techBoot.auditLogs).toEqual([]);

    // Technician attempting to call /api/work-orders/assign gets 403 Forbidden
    const forbiddenAssign = await assignPost(
      new Request('http://localhost:3000/api/work-orders/assign', {
        method: 'POST',
        headers: {
          cookie: combinedCookie,
          'x-fb-surface': 'tech',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          workOrderId: 'wo-1004',
          techUserId: techBoot.user.id,
        }),
      }),
    );
    expect(forbiddenAssign.status).toBe(403);

    // Sample .xlsx endpoint serves valid OOXML spreadsheet for Job Controller
    const xlsxRes = await sampleXlsxGet(
      new Request('http://localhost:3000/api/import/sample-xlsx', {
        headers: { cookie: combinedCookie, 'x-fb-surface': 'ops' },
      }),
    );
    expect(xlsxRes.status).toBe(200);
    expect(xlsxRes.headers.get('content-type')).toContain('spreadsheetml');

    // Tech logout clears tech cookie without invalidating ops session
    const logoutRes = await logoutPost(
      new Request('http://localhost:3000/api/auth/logout', {
        method: 'POST',
        headers: { cookie: combinedCookie, 'x-fb-surface': 'tech' },
      }),
    );
    expect(logoutRes.status).toBe(200);
    expect(logoutRes.headers.get('set-cookie')).toContain('Max-Age=0');
  });
});
