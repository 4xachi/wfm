import { assertRoleAllowed, resolveRequestUser } from '@/server/auth';
import {
  assertMutationSurfaceHeader,
  handleApiError,
  jsonOk,
  readJsonObject,
} from '@/server/apiHelpers';
import { getWfmRepository } from '@/server/repository';

export async function POST(request: Request): Promise<Response> {
  try {
    assertMutationSurfaceHeader(request);
    const user = await resolveRequestUser(request);
    assertRoleAllowed(user, ['TECHNICIAN']);

    const body = await readJsonObject<{
      lat?: number;
      lng?: number;
      speedKmh?: number;
    }>(request);
    const technician = getWfmRepository().recordTechnicianGps(user, {
      lat: Number(body.lat),
      lng: Number(body.lng),
      speedKmh: typeof body.speedKmh === 'number' ? body.speedKmh : 0,
    });
    return jsonOk({ technician });
  } catch (err) {
    return handleApiError(err);
  }
}
