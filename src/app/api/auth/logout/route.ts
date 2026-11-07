import { resolveRequestUser } from '@/server/auth';
import {
  assertMutationSurfaceHeader,
  buildSessionCookieHeader,
  handleApiError,
  jsonOk,
} from '@/server/apiHelpers';
import { getWfmRepository } from '@/server/repository';

export async function POST(request: Request): Promise<Response> {
  try {
    const surface = assertMutationSurfaceHeader(request);
    const user = await resolveRequestUser(request);
    if (user) {
      const repo = getWfmRepository();
      repo.invalidateUserSessions(user.id);
      if (user.role === 'TECHNICIAN') {
        repo.setTechnicianSession(user.id, false);
      }
    }

    const clearCookie = buildSessionCookieHeader(surface, '', 0);
    return jsonOk(
      { ok: true, gpsTrackingHalted: user?.role === 'TECHNICIAN' },
      200,
      { 'Set-Cookie': clearCookie },
    );
  } catch (err) {
    return handleApiError(err);
  }
}
