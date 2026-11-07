import { assertRoleAllowed, resolveRequestUser } from '@/server/auth';
import {
  assertMutationSurfaceHeader,
  handleApiError,
  jsonOk,
} from '@/server/apiHelpers';
import { getWfmRepository } from '@/server/repository';

export async function POST(request: Request): Promise<Response> {
  try {
    assertMutationSurfaceHeader(request);
    const user = await resolveRequestUser(request);
    assertRoleAllowed(user, ['ADMINISTRATOR']);

    const summary = getWfmRepository().resetDemoData(user);
    return jsonOk({ ok: true, summary });
  } catch (err) {
    return handleApiError(err);
  }
}
