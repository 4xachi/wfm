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
    assertRoleAllowed(user, ['SUPERVISOR', 'ADMINISTRATOR']);

    const body = await readJsonObject<{
      workOrderId?: string;
      notes?: string;
    }>(request);
    const workOrder = getWfmRepository().approveSupervisorReview(
      user,
      String(body.workOrderId ?? ''),
      String(body.notes ?? ''),
    );
    return jsonOk({ workOrder });
  } catch (err) {
    return handleApiError(err);
  }
}
