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
    assertRoleAllowed(user, ['JOB_CONTROLLER', 'ADMINISTRATOR']);

    const body = await readJsonObject<{
      workOrderId?: string;
      techUserId?: string;
      notes?: string;
    }>(request);
    const updated = getWfmRepository().assignWorkOrder(
      user,
      String(body.workOrderId ?? ''),
      String(body.techUserId ?? ''),
      body.notes,
    );
    return jsonOk({ workOrder: updated });
  } catch (err) {
    return handleApiError(err);
  }
}
