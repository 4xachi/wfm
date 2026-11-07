import {
  validateMappedDispatchRows,
  type DispatchColumnMapping,
} from '@/domain/excelImport';
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
    assertRoleAllowed(user, ['JOB_CONTROLLER', 'ADMINISTRATOR']);

    const body = await readJsonObject<{
      rows?: Record<string, string>[];
      mapping?: DispatchColumnMapping;
      sourceChannel?: 'EXCEL_BATCH' | 'DIGITAL_INTAKE';
    }>(request, 5 * 1024 * 1024);

    if (!Array.isArray(body.rows) || !body.mapping) {
      throw new HttpError(400, 'Mapped rows and column mapping are required.');
    }
    if (body.rows.length > 500) {
      throw new HttpError(400, 'Import batch exceeds maximum limit of 500 rows per transaction.');
    }

    const { validRows, invalidRows } = validateMappedDispatchRows(
      body.rows,
      body.mapping,
    );
    if (validRows.length === 0) {
      throw new HttpError(
        422,
        `Zero valid Cavite rows to import (${invalidRows.length} failed validation).`,
      );
    }

    const created = getWfmRepository().importValidatedBatch(
      user,
      validRows,
      body.sourceChannel === 'DIGITAL_INTAKE'
        ? 'DIGITAL_INTAKE'
        : 'EXCEL_BATCH',
    );

    return jsonOk({
      createdCount: created.length,
      skippedInvalidCount: invalidRows.length,
      workOrders: created,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
