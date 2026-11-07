import { isDemoModeEnabled, resolveRequestUser } from '@/server/auth';
import { handleApiError, jsonOk } from '@/server/apiHelpers';
import { getWfmRepository } from '@/server/repository';

export async function GET(request: Request): Promise<Response> {
  try {
    const repo = getWfmRepository();
    const user = await resolveRequestUser(request);
    return jsonOk({
      user,
      demoPersonas: isDemoModeEnabled() ? repo.listDemoUsers() : [],
    });
  } catch (err) {
    return handleApiError(err);
  }
}
