import { assertRoleAllowed, resolveRequestUser } from '@/server/auth';
import { handleApiError } from '@/server/apiHelpers';
import { generateSampleCaviteDispatchXlsx } from '@/server/sampleExcel';

export async function GET(request: Request): Promise<Response> {
  try {
    const user = await resolveRequestUser(request);
    assertRoleAllowed(user, ['JOB_CONTROLLER', 'SUPERVISOR', 'ADMINISTRATOR']);

    const bytes = generateSampleCaviteDispatchXlsx();
    return new Response(Buffer.from(bytes), {
      status: 200,
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition':
          'attachment; filename="FiberBlaze_Cavite_Dispatch_Batch_2026-11-07.xlsx"',
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
