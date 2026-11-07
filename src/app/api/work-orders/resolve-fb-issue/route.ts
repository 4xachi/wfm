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
      resolutionNotes?: string;
      reassignTechId?: string;
    }>(request);
    const workOrder = getWfmRepository().resolveFbIssue(
      user,
      String(body.workOrderId ?? ''),
      {
        resolutionNotes: String(body.resolutionNotes ?? ''),
        reassignTechId: body.reassignTechId,
      },
    );
    return jsonOk({ workOrder });
  } catch (err) {
    return handleApiError(err);
  }
}
