import { assertRoleAllowed, HttpError, resolveRequestUser } from '@/server/auth';
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
      discrepancyId?: string;
      decision?: 'APPROVED' | 'REJECTED';
      reviewNotes?: string;
    }>(request);

    if (!body.discrepancyId?.trim()) {
      throw new HttpError(400, 'discrepancyId is required.');
    }
    if (body.decision !== 'APPROVED' && body.decision !== 'REJECTED') {
      throw new HttpError(400, "decision must be strictly 'APPROVED' or 'REJECTED'.");
    }

    const discrepancy = getWfmRepository().resolveDiscrepancy(
      user,
      body.discrepancyId.trim(),
      {
        decision: body.decision,
        reviewNotes: String(body.reviewNotes ?? ''),
      },
    );
    return jsonOk({ discrepancy });
  } catch (err) {
    return handleApiError(err);
  }
}
