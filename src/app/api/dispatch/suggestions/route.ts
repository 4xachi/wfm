import { rankTechnicianSuggestions } from '@/domain/dispatchRecommender';
import { estimateTechnicianStreetEta } from '@/map-engine';
import {
  assertRoleAllowed,
  HttpError,
  resolveRequestUser,
} from '@/server/auth';
import { handleApiError, jsonOk } from '@/server/apiHelpers';
import { getWfmRepository } from '@/server/repository';

export async function GET(request: Request): Promise<Response> {
  try {
    const user = await resolveRequestUser(request);
    assertRoleAllowed(user, ['JOB_CONTROLLER', 'SUPERVISOR', 'ADMINISTRATOR']);

    const url = new URL(request.url);
    const workOrderId = url.searchParams.get('workOrderId');
    if (!workOrderId) {
      throw new HttpError(400, 'workOrderId query parameter is required.');
    }

    const repo = getWfmRepository();
    const wo = repo.getWorkOrderForActor(user, workOrderId);
    const techs = repo.listTechnicians();

    const eligibleTechs = techs.filter(
      (t) =>
        t.gpsFreshness !== 'OFFLINE' &&
        t.lastLat !== null &&
        t.lastLng !== null,
    );

    const candidates = await Promise.all(
      eligibleTechs.map(async (t) => {
        const eta = await estimateTechnicianStreetEta(
          { lat: t.lastLat!, lng: t.lastLng! },
          { lat: wo.targetLat, lng: wo.targetLng },
          {
            profile: t.vehicleType,
            forceOfflineGraph: true,
          },
        );

        return {
          userId: t.userId,
          fullName: t.fullName,
          employeeCode: t.employeeCode,
          vehicleType: t.vehicleType,
          gpsFreshness: t.gpsFreshness,
          activeJobCount: t.activeJobCount,
          streetEtaSeconds: Math.max(90, Math.round(eta.etaSeconds)),
          streetDistanceMeters: Math.round(eta.distanceMeters),
        };
      }),
    );

    const suggestions = rankTechnicianSuggestions({
      workflowType: wo.workflowType,
      candidates,
    });

    return jsonOk({ workOrderId, suggestions });
  } catch (err) {
    return handleApiError(err);
  }
}
