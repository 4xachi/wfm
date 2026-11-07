import { assertRoleAllowed, resolveRequestUser } from '@/server/auth';
import {
  assertMutationSurfaceHeader,
  handleApiError,
  jsonOk,
  readJsonObject,
} from '@/server/apiHelpers';
import {
  getWfmRepository,
  type SubmitFieldOutcomeInput,
} from '@/server/repository';

export async function POST(request: Request): Promise<Response> {
  try {
    assertMutationSurfaceHeader(request);
    const user = await resolveRequestUser(request);
    assertRoleAllowed(user, ['TECHNICIAN', 'ADMINISTRATOR']);

    const body = await readJsonObject<SubmitFieldOutcomeInput>(request, 8 * 1024 * 1024);
    const result = getWfmRepository().submitFieldOutcome(user, body);
    return jsonOk(result);
  } catch (err) {
    return handleApiError(err);
  }
}
