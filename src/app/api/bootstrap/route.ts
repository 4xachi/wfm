import { verifyAuditChain } from '@/domain/auditChain';
import { assertRoleAllowed, resolveRequestUser } from '@/server/auth';
import { handleApiError, jsonOk } from '@/server/apiHelpers';
import { getWfmRepository } from '@/server/repository';

export async function GET(request: Request): Promise<Response> {
  try {
    const user = await resolveRequestUser(request);
    assertRoleAllowed(user, [
      'TECHNICIAN',
      'JOB_CONTROLLER',
      'SUPERVISOR',
      'ADMINISTRATOR',
    ]);

    const repo = getWfmRepository();
    const includeImages = user.role === 'SUPERVISOR' || user.role === 'ADMINISTRATOR' || user.role === 'TECHNICIAN';
    const workOrders = repo.listWorkOrders({
      role: user.role,
      userId: user.id,
      includeEvidenceDataUrl: includeImages,
    });
    const napBoxes = repo.listNapBoxes();

    const isOps = user.role !== 'TECHNICIAN';
    const isGovernance =
      user.role === 'SUPERVISOR' || user.role === 'ADMINISTRATOR';

    const technicians = isOps
      ? repo.listTechnicians()
      : repo.listTechnicians().filter((t) => t.userId === user.id);

    const discrepancies = isGovernance ? repo.listDiscrepancies() : [];
    const outbox = isGovernance ? repo.listIntegrationOutbox() : [];
    const auditLogs =
      user.role === 'ADMINISTRATOR' || user.role === 'SUPERVISOR'
        ? repo.listAuditLogs()
        : [];
    const auditIntegrity =
      auditLogs.length > 0 ? verifyAuditChain(auditLogs) : { valid: true, checkedCount: 0 };

    const kpis = {
      totalOrders: workOrders.length,
      unassignedCount: workOrders.filter((w) => w.status === 'UNASSIGNED').length,
      activeFieldCount: workOrders.filter(
        (w) => w.status === 'ASSIGNED' || w.status === 'WORKING',
      ).length,
      completedCount: workOrders.filter((w) => w.status === 'COMPLETED').length,
      fbIssueCount: workOrders.filter((w) => w.status === 'FB_ISSUE').length,
      custIssueCount: workOrders.filter((w) => w.status === 'CUST_ISSUE').length,
      pendingReviewCount: workOrders.filter((w) => w.supervisorReviewRequired)
        .length,
      pendingGpsDiffCount: discrepancies.filter((d) => d.status === 'PENDING')
        .length,
      liveTechCount: technicians.filter((t) => t.gpsFreshness === 'LIVE').length,
    };

    return jsonOk({
      user,
      workOrders,
      napBoxes,
      technicians,
      discrepancies,
      outbox,
      auditLogs: [...auditLogs].reverse().slice(0, 80),
      auditIntegrity,
      kpis,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
