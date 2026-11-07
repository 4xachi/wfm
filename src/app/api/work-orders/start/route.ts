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
    assertRoleAllowed(user, ['TECHNICIAN', 'ADMINISTRATOR']);

    const body = await readJsonObject<{
      workOrderId?: string;
      idempotencyKey?: string;
    }>(request);
    const result = getWfmRepository().startWorkOrder(
      user,
      String(body.workOrderId ?? ''),
      String(body.idempotencyKey ?? ''),
    );
    return jsonOk(result);
  } catch (err) {
    return handleApiError(err);
  }
}
