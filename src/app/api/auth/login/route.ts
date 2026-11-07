import {
  HttpError,
  signSurfaceToken,
} from '@/server/auth';
import {
  assertMutationSurfaceHeader,
  buildSessionCookieHeader,
  handleApiError,
  jsonOk,
  readJsonObject,
} from '@/server/apiHelpers';
import { getWfmRepository } from '@/server/repository';

export async function POST(request: Request): Promise<Response> {
  try {
    const surface = assertMutationSurfaceHeader(request);
    const body = await readJsonObject<{
      email?: string;
      password?: string;
    }>(request);

    if (!body.email?.trim() || !body.password) {
      throw new HttpError(400, 'Email and password are required.');
    }

    const repo = getWfmRepository();
    const user = repo.authenticateCredentials(body.email, body.password);
    if (!user) {
      throw new HttpError(401, 'Invalid FiberBlaze email or password.');
    }

    if (surface === 'ops' && user.role === 'TECHNICIAN') {
      throw new HttpError(
        403,
        'Technician accounts sign in through the Field Technician Mobile Cockpit (/tech).',
      );
    }
    if (
      surface === 'tech' &&
      user.role !== 'TECHNICIAN' &&
      user.role !== 'ADMINISTRATOR'
    ) {
      throw new HttpError(
        403,
        `${user.role} accounts sign in through the Operations Portal (/ops).`,
      );
    }

    repo.recordLoginSuccess(user);

    const token = await signSurfaceToken(user, surface);
    const setCookie = buildSessionCookieHeader(surface, token, 12 * 60 * 60);

    return jsonOk({ user, surface }, 200, { 'Set-Cookie': setCookie });
  } catch (err) {
    return handleApiError(err);
  }
}
