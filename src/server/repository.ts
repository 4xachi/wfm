import crypto from 'node:crypto';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { computeAuditEntryHash } from '@/domain/auditChain';
import type { ValidatedDispatchRow } from '@/domain/excelImport';
import {
  computeGpsFreshness,
  evaluateSubscriberCoordinateCapture,
  isInsideCavite,
} from '@/domain/gpsIntegrity';
import {
  planNapPortAllocation,
  validateCompletionRequirements,
} from '@/domain/opticalAndNap';
import type {
  AuditLogRecord,
  AuthenticatedUser,
  CaptureMode,
  DiscrepancyStatus,
  EvidenceKind,
  FieldEvidenceRecord,
  IntegrationOutboxRecord,
  LocationDiscrepancyRecord,
  NapBoxRecord,
  NapPortRecord,
  NapPortStatus,
  OpticalSignalBand,
  Role,
  SubscriberRecord,
  TechnicianTelemetryView,
  VehicleType,
  WorkOrderPriority,
  WorkOrderRecord,
  WorkOrderStatus,
  WorkflowType,
} from '@/domain/types';
import { validateWorkOrderTransition } from '@/domain/workOrderLifecycle';
import {
  HttpError,
  registerSessionUserValidator,
  verifyPassword,
} from './auth';
import { openSqliteDatabase, runInTransaction } from './db';
import { wfmEventBus } from './events';
import { persistEvidenceDataUrl, readEvidenceAsDataUrl } from './evidenceStore';
import { seedCaviteBaseline } from './seed';

export interface EvidenceSubmissionItem {
  kind: EvidenceKind;
  captureMode: CaptureMode;
  dataUrl: string;
  watermark: string;
}

export interface SubmitFieldOutcomeInput {
  idempotencyKey: string;
  workOrderId: string;
  outcomeStatus: 'COMPLETED' | 'FB_ISSUE' | 'CUST_ISSUE';
  selectedNapBoxId?: string | null;
  selectedPortNumber?: number | null;
  fiberTag?: string | null;
  onuSerial?: string | null;
  opticalRxDbm?: number | null;
  capturedLat?: number | null;
  capturedLng?: number | null;
  exceptionReasonCode?: string | null;
  exceptionNotes?: string | null;
  evidenceItems?: EvidenceSubmissionItem[];
}

export interface RepositoryConfig {
  dbPath: string;
  evidenceDir: string;
}

export function createWfmRepository(config: RepositoryConfig) {
  const db: DatabaseSync = openSqliteDatabase(config.dbPath);

  registerSessionUserValidator(async (claims) => {
    const row = db
      .prepare(
        'SELECT id, employee_code, email, full_name, role, active, session_version FROM users WHERE id = ?',
      )
      .get(claims.id) as
      | {
          id: string;
          employee_code: string;
          email: string;
          full_name: string;
          role: string;
          active: number;
          session_version: number;
        }
      | undefined;
    if (!row || !row.active) return null;
    const currentVersion = Number(row.session_version ?? 1);
    if (
      claims.sessionVersion !== undefined &&
      claims.sessionVersion !== currentVersion
    ) {
      return null;
    }
    return {
      id: String(row.id),
      employeeCode: String(row.employee_code),
      email: String(row.email),
      fullName: String(row.full_name),
      role: row.role as Role,
      sessionVersion: currentVersion,
    };
  });

  function appendAudit(
    actor: AuthenticatedUser,
    action: string,
    entityType: string,
    entityId: string,
    detail: Record<string, unknown>,
  ): void {
    const last = db
      .prepare('SELECT entry_hash FROM audit_logs ORDER BY seq DESC LIMIT 1')
      .get() as { entry_hash?: string } | undefined;
    const prevHash = last?.entry_hash ?? 'GENESIS';
    const createdAt = new Date().toISOString();
    const detailJson = JSON.stringify(detail);
    const entryHash = computeAuditEntryHash({
      prevHash,
      actorId: actor.id,
      actorRole: actor.role,
      action,
      entityType,
      entityId,
      detailJson,
      createdAt,
    });

    db.prepare(`
      INSERT INTO audit_logs
      (id, actor_id, actor_role, action, entity_type, entity_id, detail_json, prev_hash, entry_hash, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      crypto.randomUUID(),
      actor.id,
      actor.role,
      action,
      entityType,
      entityId,
      detailJson,
      prevHash,
      entryHash,
      createdAt,
    );
  }

  function mapWorkOrderRow(
    row: Record<string, unknown>,
    includeEvidenceDataUrl = false,
    preloadedEvidence?: FieldEvidenceRecord[],
  ): WorkOrderRecord {
    const woId = String(row.id);
    let evidence: FieldEvidenceRecord[];
    if (preloadedEvidence) {
      evidence = preloadedEvidence;
    } else {
      const evRows = db
        .prepare(
          'SELECT * FROM field_evidence WHERE work_order_id = ? ORDER BY created_at ASC',
        )
        .all(woId) as Array<Record<string, unknown>>;

      evidence = evRows.map((ev) => ({
        id: String(ev.id),
        workOrderId: woId,
        uploadedBy: String(ev.uploaded_by),
        kind: ev.kind as EvidenceKind,
        captureMode: ev.capture_mode as CaptureMode,
        mimeType: String(ev.mime_type),
        sha256: String(ev.sha256),
        capturedLat:
          typeof ev.captured_lat === 'number' ? ev.captured_lat : null,
        capturedLng:
          typeof ev.captured_lng === 'number' ? ev.captured_lng : null,
        watermark: String(ev.watermark),
        createdAt: String(ev.created_at),
        dataUrl: includeEvidenceDataUrl
          ? readEvidenceAsDataUrl(
              config.evidenceDir,
              String(ev.file_path),
              String(ev.mime_type),
            )
          : undefined,
      }));
    }

    return {
      id: woId,
      ticketNumber: String(row.ticket_number),
      workflowType: row.workflow_type as WorkflowType,
      status: row.status as WorkOrderStatus,
      priority: row.priority as WorkOrderPriority,
      subscriberId: String(row.subscriber_id),
      subscriberName: String(row.subscriber_name ?? ''),
      subscriberAccount: String(row.subscriber_account ?? ''),
      subscriberPhone: String(row.subscriber_phone ?? ''),
      subscriberPlan: String(row.subscriber_plan ?? ''),
      coordsVerified: Boolean(row.coords_verified),
      assignedTechId: row.assigned_tech_id
        ? String(row.assigned_tech_id)
        : null,
      assignedTechName: row.assigned_tech_name
        ? String(row.assigned_tech_name)
        : null,
      sourceChannel: row.source_channel as
        | 'EXCEL_BATCH'
        | 'DIGITAL_INTAKE'
        | 'SEED',
      summaryTitle: String(row.summary_title),
      issueDescription: String(row.issue_description),
      targetLat: Number(row.target_lat),
      targetLng: Number(row.target_lng),
      targetMunicipality: String(row.target_municipality),
      targetBarangay: String(row.target_barangay),
      targetAddress: String(row.target_address),
      oldAddress: row.old_address ? String(row.old_address) : null,
      oldLat: typeof row.old_lat === 'number' ? row.old_lat : null,
      oldLng: typeof row.old_lng === 'number' ? row.old_lng : null,
      oldNapBoxId: row.old_nap_box_id ? String(row.old_nap_box_id) : null,
      oldPortNumber:
        typeof row.old_port_number === 'number' ? row.old_port_number : null,
      assignedNapBoxId: row.assigned_nap_box_id
        ? String(row.assigned_nap_box_id)
        : null,
      assignedPortNumber:
        typeof row.assigned_port_number === 'number'
          ? row.assigned_port_number
          : null,
      fiberTag: row.fiber_tag ? String(row.fiber_tag) : null,
      onuSerial: row.onu_serial ? String(row.onu_serial) : null,
      opticalRxDbm:
        typeof row.optical_rx_dbm === 'number' ? row.optical_rx_dbm : null,
      opticalSignalBand: row.optical_signal_band
        ? (String(row.optical_signal_band) as OpticalSignalBand)
        : null,
      supervisorReviewRequired: Boolean(row.supervisor_review_required),
      supervisorReviewedAt: row.supervisor_reviewed_at
        ? String(row.supervisor_reviewed_at)
        : null,
      supervisorReviewedBy: row.supervisor_reviewed_by
        ? String(row.supervisor_reviewed_by)
        : null,
      exceptionReasonCode: row.exception_reason_code
        ? String(row.exception_reason_code)
        : null,
      exceptionNotes: row.exception_notes ? String(row.exception_notes) : null,
      resolutionNotes: row.resolution_notes
        ? String(row.resolution_notes)
        : null,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      startedAt: row.started_at ? String(row.started_at) : null,
      completedAt: row.completed_at ? String(row.completed_at) : null,
      evidence,
    };
  }

  const WORK_ORDER_SELECT = `
    SELECT w.*,
           s.full_name AS subscriber_name,
           s.account_number AS subscriber_account,
           s.phone AS subscriber_phone,
           s.plan_name AS subscriber_plan,
           s.coords_verified AS coords_verified,
           u.full_name AS assigned_tech_name
    FROM work_orders w
    JOIN subscribers s ON s.id = w.subscriber_id
    LEFT JOIN users u ON u.id = w.assigned_tech_id
  `;

  function getWorkOrderById(
    id: string,
    includeEvidenceDataUrl = true,
  ): WorkOrderRecord | null {
    const row = db
      .prepare(`${WORK_ORDER_SELECT} WHERE w.id = ?`)
      .get(id) as Record<string, unknown> | undefined;
    return row ? mapWorkOrderRow(row, includeEvidenceDataUrl) : null;
  }

  function ensureSeeded(): void {
    const row = db.prepare('SELECT COUNT(*) AS cnt FROM users').get() as {
      cnt: number;
    };
    if (row.cnt === 0) {
      seedCaviteBaseline(db);
    }
  }

  return {
    ensureSeeded,

    seedDemoData() {
      return seedCaviteBaseline(db);
    },

    resetDemoData(actor: AuthenticatedUser) {
      if (actor.role !== 'ADMINISTRATOR') {
        throw new HttpError(403, 'Only ADMINISTRATOR can reset demo baseline.');
      }
      const summary = seedCaviteBaseline(db);
      wfmEventBus.publish('DEMO_RESET', 'Cavite baseline reset by Administrator');
      return summary;
    },

    authenticateCredentials(
      email: string,
      password: string,
    ): AuthenticatedUser | null {
      const row = db
        .prepare(
          'SELECT id, employee_code, email, full_name, role, password_hash, active, session_version FROM users WHERE LOWER(email) = LOWER(?)',
        )
        .get(email.trim()) as Record<string, unknown> | undefined;

      if (!row || !row.active) return null;
      if (!verifyPassword(password, String(row.password_hash))) return null;

      const user: AuthenticatedUser = {
        id: String(row.id),
        employeeCode: String(row.employee_code),
        email: String(row.email),
        fullName: String(row.full_name),
        role: row.role as Role,
        sessionVersion: Number(row.session_version ?? 1),
      };

      return user;
    },

    recordLoginSuccess(user: AuthenticatedUser): void {
      if (user.role === 'TECHNICIAN') {
        db.prepare(
          'UPDATE technician_profiles SET session_active = 1, last_gps_at = COALESCE(last_gps_at, ?) WHERE user_id = ?',
        ).run(new Date().toISOString(), user.id);
      }

      appendAudit(user, 'USER_LOGIN', 'User', user.id, { email: user.email });
      wfmEventBus.publish('SESSION_CHANGED', `${user.fullName} signed in`, user.id);
    },

    invalidateUserSessions(userId: string): void {
      db.prepare(
        'UPDATE users SET session_version = session_version + 1 WHERE id = ?',
      ).run(userId);
    },

    getUserByEmail(email: string): AuthenticatedUser | null {
      const row = db
        .prepare(
          'SELECT id, employee_code, email, full_name, role, session_version FROM users WHERE LOWER(email) = LOWER(?) AND active = 1',
        )
        .get(email.trim()) as Record<string, unknown> | undefined;
      if (!row) return null;
      return {
        id: String(row.id),
        employeeCode: String(row.employee_code),
        email: String(row.email),
        fullName: String(row.full_name),
        role: row.role as Role,
        sessionVersion: Number(row.session_version ?? 1),
      };
    },

    getUserById(id: string): AuthenticatedUser | null {
      const row = db
        .prepare(
          'SELECT id, employee_code, email, full_name, role, session_version FROM users WHERE id = ? AND active = 1',
        )
        .get(id) as Record<string, unknown> | undefined;
      if (!row) return null;
      return {
        id: String(row.id),
        employeeCode: String(row.employee_code),
        email: String(row.email),
        fullName: String(row.full_name),
        role: row.role as Role,
        sessionVersion: Number(row.session_version ?? 1),
      };
    },

    listDemoUsers(): AuthenticatedUser[] {
      const rows = db
        .prepare(
          'SELECT id, employee_code, email, full_name, role FROM users WHERE active = 1 ORDER BY role, employee_code',
        )
        .all() as Array<Record<string, unknown>>;
      return rows.map((r) => ({
        id: String(r.id),
        employeeCode: String(r.employee_code),
        email: String(r.email),
        fullName: String(r.full_name),
        role: r.role as Role,
      }));
    },

    setTechnicianSession(userId: string, active: boolean): void {
      db.prepare(
        'UPDATE technician_profiles SET session_active = ? WHERE user_id = ?',
      ).run(active ? 1 : 0, userId);
      wfmEventBus.publish(
        'SESSION_CHANGED',
        `Technician ${userId} session ${active ? 'started' : 'ended'}`,
        userId,
      );
    },

    listTechnicians(nowMs?: number): TechnicianTelemetryView[] {
      const rows = db
        .prepare(`
          SELECT u.id AS user_id, u.employee_code, u.full_name,
                 tp.vehicle_type, tp.home_barangay, tp.phone, tp.session_active,
                 tp.last_lat, tp.last_lng, tp.last_gps_at, tp.last_speed_kmh,
                 (SELECT COUNT(*) FROM work_orders w
                  WHERE w.assigned_tech_id = u.id AND w.status IN ('ASSIGNED', 'WORKING')) AS active_job_count
          FROM users u
          JOIN technician_profiles tp ON tp.user_id = u.id
          WHERE u.active = 1
          ORDER BY u.employee_code ASC
        `)
        .all() as Array<Record<string, unknown>>;

      return rows.map((r) => {
        const sessionActive = Boolean(r.session_active);
        const lastGpsAt = r.last_gps_at ? String(r.last_gps_at) : null;
        return {
          userId: String(r.user_id),
          employeeCode: String(r.employee_code),
          fullName: String(r.full_name),
          vehicleType: r.vehicle_type as VehicleType,
          homeBarangay: String(r.home_barangay),
          phone: String(r.phone),
          sessionActive,
          lastLat: typeof r.last_lat === 'number' ? r.last_lat : null,
          lastLng: typeof r.last_lng === 'number' ? r.last_lng : null,
          lastGpsAt,
          lastSpeedKmh:
            typeof r.last_speed_kmh === 'number' ? r.last_speed_kmh : null,
          gpsFreshness: computeGpsFreshness({
            sessionActive,
            lastGpsAt,
            nowMs,
          }),
          activeJobCount: Number(r.active_job_count ?? 0),
        };
      });
    },

    recordTechnicianGps(
      actor: AuthenticatedUser,
      input: { lat: number; lng: number; speedKmh?: number },
    ): TechnicianTelemetryView {
      if (actor.role !== 'TECHNICIAN') {
        throw new HttpError(403, 'Only TECHNICIAN accounts report field GPS.');
      }
      if (!isInsideCavite(input.lat, input.lng)) {
        throw new HttpError(400, 'GPS ping falls outside Cavite province bounds.');
      }
      const tp = db
        .prepare(
          'SELECT session_active FROM technician_profiles WHERE user_id = ?',
        )
        .get(actor.id) as { session_active?: number } | undefined;

      if (!tp || !tp.session_active) {
        throw new HttpError(
          403,
          'Technician session is logged out; GPS tracking is halted.',
        );
      }

      const nowIso = new Date().toISOString();
      db.prepare(`
        UPDATE technician_profiles
        SET last_lat = ?, last_lng = ?, last_gps_at = ?, last_speed_kmh = ?
        WHERE user_id = ?
      `).run(input.lat, input.lng, nowIso, input.speedKmh ?? 0, actor.id);

      wfmEventBus.publish(
        'TECHNICIAN_GPS',
        `${actor.fullName} telemetry updated`,
        actor.id,
      );

      return this.listTechnicians().find((t) => t.userId === actor.id)!;
    },

    listNapBoxes(): NapBoxRecord[] {
      const boxes = db
        .prepare('SELECT * FROM nap_boxes ORDER BY code ASC')
        .all() as Array<Record<string, unknown>>;
      const allPorts = db
        .prepare(
          'SELECT * FROM nap_ports ORDER BY nap_box_id ASC, port_number ASC',
        )
        .all() as Array<Record<string, unknown>>;

      const portsByNap = new Map<string, NapPortRecord[]>();
      for (const p of allPorts) {
        const boxId = String(p.nap_box_id);
        const list = portsByNap.get(boxId) ?? [];
        list.push({
          napBoxId: boxId,
          portNumber: Number(p.port_number),
          status: p.status as NapPortStatus,
          subscriberId: p.subscriber_id ? String(p.subscriber_id) : null,
          fiberTag: p.fiber_tag ? String(p.fiber_tag) : null,
          lockedByWoId: p.locked_by_wo_id ? String(p.locked_by_wo_id) : null,
          updatedAt: String(p.updated_at),
        });
        portsByNap.set(boxId, list);
      }

      return boxes.map((b) => {
        const id = String(b.id);
        return {
          id,
          code: String(b.code),
          municipality: String(b.municipality),
          barangay: String(b.barangay),
          lat: Number(b.lat),
          lng: Number(b.lng),
          totalPorts: Number(b.total_ports),
          oltCode: String(b.olt_code),
          coordsVerified: Boolean(b.coords_verified),
          ports: portsByNap.get(id) ?? [],
        };
      });
    },

    getNapBoxById(napBoxId: string): NapBoxRecord | undefined {
      return this.listNapBoxes().find((n) => n.id === napBoxId);
    },

    getSubscriberById(subscriberId: string): SubscriberRecord | null {
      const r = db
        .prepare('SELECT * FROM subscribers WHERE id = ?')
        .get(subscriberId) as Record<string, unknown> | undefined;
      if (!r) return null;
      return {
        id: String(r.id),
        accountNumber: String(r.account_number),
        fullName: String(r.full_name),
        phone: String(r.phone),
        municipality: String(r.municipality),
        barangay: String(r.barangay),
        streetAddress: String(r.street_address),
        planName: String(r.plan_name),
        lat: typeof r.lat === 'number' ? r.lat : null,
        lng: typeof r.lng === 'number' ? r.lng : null,
        coordsVerified: Boolean(r.coords_verified),
        activeNapBoxId: r.active_nap_box_id ? String(r.active_nap_box_id) : null,
        activePortNumber:
          typeof r.active_port_number === 'number' ? r.active_port_number : null,
        onuSerial: r.onu_serial ? String(r.onu_serial) : null,
        fiberTag: r.fiber_tag ? String(r.fiber_tag) : null,
        lastOpticalDbm:
          typeof r.last_optical_dbm === 'number' ? r.last_optical_dbm : null,
      };
    },

    listWorkOrders(filter: {
      role: Role;
      userId: string;
      includeEvidenceDataUrl?: boolean;
    }): WorkOrderRecord[] {
      const rows =
        filter.role === 'TECHNICIAN'
          ? (db
              .prepare(
                `${WORK_ORDER_SELECT} WHERE w.assigned_tech_id = ? ORDER BY w.updated_at DESC`,
              )
              .all(filter.userId) as Array<Record<string, unknown>>)
          : (db
              .prepare(`${WORK_ORDER_SELECT} ORDER BY w.created_at DESC`)
              .all() as Array<Record<string, unknown>>);

      if (rows.length === 0) return [];

      const woIds = rows.map((r) => String(r.id));
      const placeholders = woIds.map(() => '?').join(',');
      const evRows = db
        .prepare(
          `SELECT * FROM field_evidence WHERE work_order_id IN (${placeholders}) ORDER BY created_at ASC`,
        )
        .all(...woIds) as Array<Record<string, unknown>>;

      const evidenceMap = new Map<string, FieldEvidenceRecord[]>();
      for (const ev of evRows) {
        const woId = String(ev.work_order_id);
        const list = evidenceMap.get(woId) ?? [];
        list.push({
          id: String(ev.id),
          workOrderId: woId,
          uploadedBy: String(ev.uploaded_by),
          kind: ev.kind as EvidenceKind,
          captureMode: ev.capture_mode as CaptureMode,
          mimeType: String(ev.mime_type),
          sha256: String(ev.sha256),
          capturedLat:
            typeof ev.captured_lat === 'number' ? ev.captured_lat : null,
          capturedLng:
            typeof ev.captured_lng === 'number' ? ev.captured_lng : null,
          watermark: String(ev.watermark),
          createdAt: String(ev.created_at),
          dataUrl: filter.includeEvidenceDataUrl
            ? readEvidenceAsDataUrl(
                config.evidenceDir,
                String(ev.file_path),
                String(ev.mime_type),
              )
            : undefined,
        });
        evidenceMap.set(woId, list);
      }

      return rows.map((r) =>
        mapWorkOrderRow(
          r,
          Boolean(filter.includeEvidenceDataUrl),
          evidenceMap.get(String(r.id)) ?? [],
        ),
      );
    },

    getWorkOrderForActor(
      actor: AuthenticatedUser,
      workOrderId: string,
    ): WorkOrderRecord {
      const wo = getWorkOrderById(workOrderId, true);
      if (!wo) {
        throw new HttpError(404, `Work order ${workOrderId} not found.`);
      }
      if (actor.role === 'TECHNICIAN' && wo.assignedTechId !== actor.id) {
        throw new HttpError(
          403,
          'Forbidden: technicians may only inspect their own assigned work orders.',
        );
      }
      return wo;
    },

    assignWorkOrder(
      actor: AuthenticatedUser,
      workOrderId: string,
      techUserId: string,
      notes?: string,
    ): WorkOrderRecord {
      return runInTransaction(db, () => {
        const wo = getWorkOrderById(workOrderId, false);
        if (!wo) throw new HttpError(404, 'Work order not found.');

        const techRow = db
          .prepare(
            "SELECT id, full_name FROM users WHERE id = ? AND role = 'TECHNICIAN' AND active = 1",
          )
          .get(techUserId) as { id: string; full_name: string } | undefined;
        if (!techRow) {
          throw new HttpError(400, 'Selected technician is invalid or inactive.');
        }

        const check = validateWorkOrderTransition({
          currentStatus: wo.status,
          nextStatus: 'ASSIGNED',
          actorRole: actor.role,
          assignedTechId: techUserId,
        });
        if (!check.ok) {
          throw new HttpError(409, check.error ?? 'Invalid work-order assignment.');
        }

        const nowIso = new Date().toISOString();
        db.prepare(`
          UPDATE work_orders
          SET status = 'ASSIGNED',
              assigned_tech_id = ?,
              resolution_notes = COALESCE(?, resolution_notes),
              updated_at = ?
          WHERE id = ?
        `).run(techUserId, notes ?? null, nowIso, workOrderId);

        appendAudit(actor, 'WORK_ORDER_ASSIGNED', 'WorkOrder', workOrderId, {
          ticketNumber: wo.ticketNumber,
          previousStatus: wo.status,
          assignedTechId: techUserId,
          assignedTechName: techRow.full_name,
        });

        wfmEventBus.publish(
          'WORK_ORDER_UPDATED',
          `${wo.ticketNumber} assigned to ${techRow.full_name}`,
          workOrderId,
        );
        return getWorkOrderById(workOrderId, true)!;
      });
    },

    cancelWorkOrder(
      actor: AuthenticatedUser,
      workOrderId: string,
      reason: string,
    ): WorkOrderRecord {
      return runInTransaction(db, () => {
        const wo = getWorkOrderById(workOrderId, false);
        if (!wo) throw new HttpError(404, 'Work order not found.');

        const check = validateWorkOrderTransition({
          currentStatus: wo.status,
          nextStatus: 'CANCELLED',
          actorRole: actor.role,
        });
        if (!check.ok) {
          throw new HttpError(403, check.error ?? 'Cannot cancel work order.');
        }

        const nowIso = new Date().toISOString();
        db.prepare(`
          UPDATE work_orders
          SET status = 'CANCELLED', exception_notes = ?, updated_at = ?
          WHERE id = ?
        `).run(reason.trim() || 'Cancelled by controller', nowIso, workOrderId);

        // If a TRANSFER order is cancelled, restore old port from LOCKED_TRANSFER back to OCCUPIED for old site!
        if (
          wo.workflowType === 'TRANSFER' &&
          wo.oldNapBoxId &&
          wo.oldPortNumber
        ) {
          db.prepare(`
            UPDATE nap_ports
            SET status = 'OCCUPIED', locked_by_wo_id = NULL, updated_at = ?
            WHERE nap_box_id = ? AND port_number = ? AND locked_by_wo_id = ?
          `).run(nowIso, wo.oldNapBoxId, wo.oldPortNumber, workOrderId);
        }

        appendAudit(actor, 'WORK_ORDER_CANCELLED', 'WorkOrder', workOrderId, {
          ticketNumber: wo.ticketNumber,
          reason,
        });
        wfmEventBus.publish(
          'WORK_ORDER_UPDATED',
          `${wo.ticketNumber} cancelled`,
          workOrderId,
        );
        return getWorkOrderById(workOrderId, true)!;
      });
    },

    startWorkOrder(
      actor: AuthenticatedUser,
      workOrderId: string,
      idempotencyKey: string,
    ): { workOrder: WorkOrderRecord; replayed: boolean } {
      if (!idempotencyKey?.trim()) {
        throw new HttpError(400, 'idempotencyKey is required.');
      }

      return runInTransaction(db, () => {
        const cached = db
          .prepare(
            'SELECT actor_user_id, endpoint, work_order_id, response_json FROM sync_receipts WHERE idempotency_key = ?',
          )
          .get(idempotencyKey) as
          | {
              actor_user_id: string;
              endpoint: string;
              work_order_id: string;
              response_json: string;
            }
          | undefined;

        if (cached) {
          if (
            cached.actor_user_id !== actor.id ||
            cached.endpoint !== 'START_WORK' ||
            cached.work_order_id !== workOrderId
          ) {
            throw new HttpError(
              409,
              'Idempotency key was previously used for a different operation, actor, or work order.',
            );
          }
          return {
            workOrder: JSON.parse(cached.response_json) as WorkOrderRecord,
            replayed: true,
          };
        }

        const wo = getWorkOrderById(workOrderId, false);
        if (!wo) throw new HttpError(404, 'Work order not found.');
        if (actor.role === 'TECHNICIAN' && wo.assignedTechId !== actor.id) {
          throw new HttpError(403, 'Work order is not assigned to this technician.');
        }

        const check = validateWorkOrderTransition({
          currentStatus: wo.status,
          nextStatus: 'WORKING',
          actorRole: actor.role,
          assignedTechId: wo.assignedTechId,
        });
        if (!check.ok) {
          throw new HttpError(409, check.error ?? 'Conflict starting work order.');
        }

        const nowIso = new Date().toISOString();
        db.prepare(`
          UPDATE work_orders
          SET status = 'WORKING', started_at = COALESCE(started_at, ?), updated_at = ?
          WHERE id = ?
        `).run(nowIso, nowIso, workOrderId);

        appendAudit(actor, 'WORK_ORDER_STARTED', 'WorkOrder', workOrderId, {
          ticketNumber: wo.ticketNumber,
        });

        const updated = getWorkOrderById(workOrderId, true)!;
        db.prepare(`
          INSERT INTO sync_receipts
          (idempotency_key, actor_user_id, endpoint, work_order_id, response_status, response_json, created_at)
          VALUES (?, ?, 'START_WORK', ?, 200, ?, ?)
        `).run(
          idempotencyKey,
          actor.id,
          workOrderId,
          JSON.stringify(updated),
          nowIso,
        );

        wfmEventBus.publish(
          'WORK_ORDER_UPDATED',
          `${wo.ticketNumber} is now WORKING`,
          workOrderId,
        );
        return { workOrder: updated, replayed: false };
      });
    },

    submitFieldOutcome(
      actor: AuthenticatedUser,
      input: SubmitFieldOutcomeInput,
    ): { workOrder: WorkOrderRecord; replayed: boolean; discrepancyCreated: boolean } {
      if (!input.idempotencyKey?.trim()) {
        throw new HttpError(400, 'idempotencyKey is required for field sync.');
      }
      if ((input.evidenceItems ?? []).length > 6) {
        throw new HttpError(400, 'Exceeded maximum evidence items limit of 6.');
      }

      return runInTransaction(db, () => {
        const cached = db
          .prepare(
            'SELECT actor_user_id, endpoint, work_order_id, response_json FROM sync_receipts WHERE idempotency_key = ?',
          )
          .get(input.idempotencyKey) as
          | {
              actor_user_id: string;
              endpoint: string;
              work_order_id: string;
              response_json: string;
            }
          | undefined;

        if (cached) {
          if (
            cached.actor_user_id !== actor.id ||
            cached.endpoint !== 'SUBMIT_OUTCOME' ||
            cached.work_order_id !== input.workOrderId
          ) {
            throw new HttpError(
              409,
              'Idempotency key was previously used for a different operation, actor, or work order.',
            );
          }
          const parsed = JSON.parse(cached.response_json) as {
            workOrder: WorkOrderRecord;
            discrepancyCreated: boolean;
          };
          return {
            workOrder: parsed.workOrder,
            discrepancyCreated: parsed.discrepancyCreated,
            replayed: true,
          };
        }

        const wo = getWorkOrderById(input.workOrderId, false);
        if (!wo) throw new HttpError(404, 'Work order not found.');
        if (actor.role === 'TECHNICIAN' && wo.assignedTechId !== actor.id) {
          throw new HttpError(403, 'Work order is assigned to another technician.');
        }

        const transitionCheck = validateWorkOrderTransition({
          currentStatus: wo.status,
          nextStatus: input.outcomeStatus,
          actorRole: actor.role,
          assignedTechId: wo.assignedTechId,
          exceptionReasonCode: input.exceptionReasonCode,
        });
        if (!transitionCheck.ok) {
          throw new HttpError(
            409,
            `Sync conflict: ${transitionCheck.error ?? 'Work order state already changed.'}`,
          );
        }

        const items = input.evidenceItems ?? [];
        const hasCameraProof = items.some((e) => e.kind.startsWith('CAMERA_'));
        const hasSignatureOrHardcopy = items.some(
          (e) =>
            e.kind === 'SUBSCRIBER_SIGNATURE' || e.kind === 'SIGNED_HARDCOPY',
        );

        const targetNapId = input.selectedNapBoxId ?? wo.assignedNapBoxId;
        const targetPortNo = input.selectedPortNumber ?? wo.assignedPortNumber;

        const completionCheck = validateCompletionRequirements({
          workflowType: wo.workflowType,
          outcomeStatus: input.outcomeStatus,
          opticalRxDbm: input.opticalRxDbm,
          hasCameraProof,
          hasSignatureOrHardcopy,
          selectedNapBoxId: targetNapId,
          selectedPortNumber: targetPortNo,
          fiberTag: input.fiberTag ?? wo.fiberTag,
          onuSerial: input.onuSerial ?? wo.onuSerial,
          oldNapBoxId: wo.oldNapBoxId,
          oldPortNumber: wo.oldPortNumber,
        });

        if (!completionCheck.ok) {
          throw new HttpError(
            422,
            completionCheck.error ?? 'Field validation failed.',
          );
        }

        const nowIso = new Date().toISOString();

        // Validate & allocate NAP port on COMPLETED
        if (
          input.outcomeStatus === 'COMPLETED' &&
          targetNapId &&
          targetPortNo
        ) {
          const napBox = this.getNapBoxById(targetNapId);
          if (!napBox) {
            throw new HttpError(400, `NAP box ${targetNapId} does not exist.`);
          }
          const alloc = planNapPortAllocation({
            workflowType: wo.workflowType,
            targetPorts: napBox.ports,
            selectedPortNumber: targetPortNo,
            subscriberId: wo.subscriberId,
          });
          if (!alloc.ok) {
            throw new HttpError(409, alloc.error ?? 'NAP port unavailable.');
          }

          db.prepare(`
            UPDATE nap_ports
            SET status = 'OCCUPIED', subscriber_id = ?, fiber_tag = ?, locked_by_wo_id = NULL, updated_at = ?
            WHERE nap_box_id = ? AND port_number = ?
          `).run(
            wo.subscriberId,
            input.fiberTag ?? wo.fiberTag ?? `${napBox.code}-P${String(targetPortNo).padStart(2, '0')}`,
            nowIso,
            targetNapId,
            targetPortNo,
          );
        }

        // Release old TRANSFER port ONLY when completionCheck.releaseOldTransferPort === true
        if (
          completionCheck.releaseOldTransferPort &&
          wo.oldNapBoxId &&
          wo.oldPortNumber
        ) {
          db.prepare(`
            UPDATE nap_ports
            SET status = 'FREE', subscriber_id = NULL, fiber_tag = NULL, locked_by_wo_id = NULL, updated_at = ?
            WHERE nap_box_id = ? AND port_number = ?
          `).run(nowIso, wo.oldNapBoxId, wo.oldPortNumber);
        }

        // Evaluate GPS coordinate integrity against subscriber record ONLY on COMPLETED
        let discrepancyCreated = false;
        const sub = this.getSubscriberById(wo.subscriberId)!;
        if (
          input.outcomeStatus === 'COMPLETED' &&
          typeof input.capturedLat === 'number' &&
          typeof input.capturedLng === 'number'
        ) {
          const recordedLat =
            wo.workflowType === 'TRANSFER' ? wo.targetLat : sub.lat;
          const recordedLng =
            wo.workflowType === 'TRANSFER' ? wo.targetLng : sub.lng;
          const coordsVerified = sub.coordsVerified;

          const gpsEval = evaluateSubscriberCoordinateCapture({
            recordedLat,
            recordedLng,
            coordsVerified,
            capturedLat: input.capturedLat,
            capturedLng: input.capturedLng,
          });

          if (gpsEval.action === 'REJECT_OUT_OF_BOUNDS') {
            throw new HttpError(
              400,
              'Captured field coordinates are outside Cavite bounds.',
            );
          }
          if (gpsEval.action === 'SET_INITIAL_VERIFIED') {
            db.prepare(`
              UPDATE subscribers SET lat = ?, lng = ?, coords_verified = 1 WHERE id = ?
            `).run(input.capturedLat, input.capturedLng, sub.id);
          } else if (
            gpsEval.createDiscrepancy &&
            recordedLat !== null &&
            recordedLng !== null
          ) {
            discrepancyCreated = true;
            db.prepare(`
              INSERT INTO location_discrepancies
              (id, work_order_id, subscriber_id, captured_by_id, recorded_lat, recorded_lng, captured_lat, captured_lng, distance_meters, status, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)
            `).run(
              crypto.randomUUID(),
              wo.id,
              sub.id,
              actor.id,
              sub.lat,
              sub.lng,
              input.capturedLat,
              input.capturedLng,
              gpsEval.distanceMeters,
              nowIso,
            );
          }
        }

        // Persist watermarked camera/signature evidence files
        for (const ev of items) {
          const saved = persistEvidenceDataUrl(config.evidenceDir, {
            kind: ev.kind,
            captureMode: ev.captureMode,
            dataUrl: ev.dataUrl,
          });

          db.prepare(`
            INSERT INTO field_evidence
            (id, work_order_id, uploaded_by, kind, capture_mode, file_path, mime_type, sha256, captured_lat, captured_lng, watermark, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            saved.id,
            wo.id,
            actor.id,
            ev.kind,
            ev.captureMode,
            saved.fileName,
            saved.mimeType,
            saved.sha256,
            input.capturedLat ?? null,
            input.capturedLng ?? null,
            ev.watermark.slice(0, 280),
            nowIso,
          );
        }

        // Update Subscriber technical inventory on COMPLETED
        if (input.outcomeStatus === 'COMPLETED') {
          db.prepare(`
            UPDATE subscribers
            SET active_nap_box_id = COALESCE(?, active_nap_box_id),
                active_port_number = COALESCE(?, active_port_number),
                fiber_tag = COALESCE(?, fiber_tag),
                onu_serial = COALESCE(?, onu_serial),
                last_optical_dbm = COALESCE(?, last_optical_dbm)
            WHERE id = ?
          `).run(
            targetNapId ?? null,
            targetPortNo ?? null,
            input.fiberTag ?? null,
            input.onuSerial ?? null,
            input.opticalRxDbm ?? null,
            sub.id,
          );
        }

        const reviewFlag =
          completionCheck.supervisorReviewRequired || discrepancyCreated
            ? 1
            : 0;

        db.prepare(`
          UPDATE work_orders
          SET status = ?,
              assigned_nap_box_id = COALESCE(?, assigned_nap_box_id),
              assigned_port_number = COALESCE(?, assigned_port_number),
              fiber_tag = COALESCE(?, fiber_tag),
              onu_serial = COALESCE(?, onu_serial),
              optical_rx_dbm = COALESCE(?, optical_rx_dbm),
              optical_signal_band = COALESCE(?, optical_signal_band),
              supervisor_review_required = ?,
              exception_reason_code = COALESCE(?, exception_reason_code),
              exception_notes = COALESCE(?, exception_notes),
              updated_at = ?,
              completed_at = CASE WHEN ? = 'COMPLETED' THEN ? ELSE completed_at END
          WHERE id = ?
        `).run(
          input.outcomeStatus,
          targetNapId ?? null,
          targetPortNo ?? null,
          input.fiberTag ?? null,
          input.onuSerial ?? null,
          input.opticalRxDbm ?? null,
          completionCheck.opticalEvaluation?.band ?? null,
          reviewFlag,
          input.exceptionReasonCode ?? null,
          input.exceptionNotes ?? null,
          nowIso,
          input.outcomeStatus,
          nowIso,
          wo.id,
        );

        // Enqueue gated IntegrationOutbox records (never execute live external billing/OLT writes!)
        if (input.outcomeStatus === 'COMPLETED') {
          const insertOutbox = db.prepare(`
            INSERT INTO integration_outbox
            (id, work_order_id, target_system, event_type, payload_json, gate_status, created_at)
            VALUES (?, ?, ?, ?, ?, 'GATED_DRY_RUN', ?)
          `);

          insertOutbox.run(
            crypto.randomUUID(),
            wo.id,
            'OLT_PROVISIONING',
            `${wo.workflowType}_PON_SYNC`,
            JSON.stringify({
              ticketNumber: wo.ticketNumber,
              napBoxId: targetNapId,
              portNumber: targetPortNo,
              onuSerial: input.onuSerial ?? wo.onuSerial,
              opticalRxDbm: input.opticalRxDbm,
              liveExecutionBlocked: true,
            }),
            nowIso,
          );

          insertOutbox.run(
            crypto.randomUUID(),
            wo.id,
            'CRM_BILLING',
            `${wo.workflowType}_COMPLETION_HANDOVER`,
            JSON.stringify({
              ticketNumber: wo.ticketNumber,
              subscriberAccount: sub.accountNumber,
              completedAt: nowIso,
              liveExecutionBlocked: true,
            }),
            nowIso,
          );
        }

        appendAudit(
          actor,
          `WORK_ORDER_${input.outcomeStatus}`,
          'WorkOrder',
          wo.id,
          {
            ticketNumber: wo.ticketNumber,
            opticalRxDbm: input.opticalRxDbm ?? null,
            napBoxId: targetNapId ?? null,
            portNumber: targetPortNo ?? null,
            discrepancyCreated,
            evidenceCount: items.length,
          },
        );

        const updatedWo = getWorkOrderById(wo.id, true)!;
        const receiptPayload = {
          workOrder: updatedWo,
          discrepancyCreated,
        };

        db.prepare(`
          INSERT INTO sync_receipts
          (idempotency_key, actor_user_id, endpoint, work_order_id, response_status, response_json, created_at)
          VALUES (?, ?, 'SUBMIT_OUTCOME', ?, 200, ?, ?)
        `).run(
          input.idempotencyKey,
          actor.id,
          wo.id,
          JSON.stringify(receiptPayload),
          nowIso,
        );

        wfmEventBus.publish(
          'WORK_ORDER_UPDATED',
          `${wo.ticketNumber} marked ${input.outcomeStatus} by ${actor.fullName}`,
          wo.id,
        );
        if (discrepancyCreated) {
          wfmEventBus.publish(
            'DISCREPANCY_UPDATED',
            `GPS mismatch (>30m) flagged on ${wo.ticketNumber}`,
            wo.id,
          );
        }

        return {
          workOrder: updatedWo,
          discrepancyCreated,
          replayed: false,
        };
      });
    },

    resolveFbIssue(
      actor: AuthenticatedUser,
      workOrderId: string,
      input: { resolutionNotes: string; reassignTechId?: string },
    ): WorkOrderRecord {
      return runInTransaction(db, () => {
        const wo = getWorkOrderById(workOrderId, false);
        if (!wo) throw new HttpError(404, 'Work order not found.');

        if (input.reassignTechId) {
          const tech = db
            .prepare(
              "SELECT id FROM users WHERE id = ? AND role = 'TECHNICIAN' AND active = 1",
            )
            .get(input.reassignTechId);
          if (!tech) {
            throw new HttpError(400, 'Assigned technician not found or inactive.');
          }
        }

        const nextTechId = input.reassignTechId ?? wo.assignedTechId;
        const check = validateWorkOrderTransition({
          currentStatus: wo.status,
          nextStatus: 'ASSIGNED',
          actorRole: actor.role,
          assignedTechId: nextTechId,
        });
        if (!check.ok) {
          throw new HttpError(403, check.error ?? 'Cannot resolve FB_ISSUE.');
        }
        if (!input.resolutionNotes?.trim()) {
          throw new HttpError(400, 'Supervisor resolution notes are required.');
        }

        const nowIso = new Date().toISOString();
        db.prepare(`
          UPDATE work_orders
          SET status = 'ASSIGNED',
              assigned_tech_id = ?,
              resolution_notes = ?,
              supervisor_reviewed_at = ?,
              supervisor_reviewed_by = ?,
              updated_at = ?
          WHERE id = ?
        `).run(
          nextTechId,
          input.resolutionNotes.trim(),
          nowIso,
          actor.id,
          nowIso,
          workOrderId,
        );

        appendAudit(actor, 'FB_ISSUE_RESOLVED', 'WorkOrder', workOrderId, {
          ticketNumber: wo.ticketNumber,
          reassignTechId: nextTechId,
          resolutionNotes: input.resolutionNotes.trim(),
        });

        wfmEventBus.publish(
          'WORK_ORDER_UPDATED',
          `FB-ISSUE on ${wo.ticketNumber} resolved & returned for completion`,
          workOrderId,
        );
        return getWorkOrderById(workOrderId, true)!;
      });
    },

    approveSupervisorReview(
      actor: AuthenticatedUser,
      workOrderId: string,
      notes: string,
    ): WorkOrderRecord {
      if (actor.role !== 'SUPERVISOR' && actor.role !== 'ADMINISTRATOR') {
        throw new HttpError(403, 'Supervisor or Administrator role required.');
      }
      return runInTransaction(db, () => {
        const wo = getWorkOrderById(workOrderId, false);
        if (!wo) throw new HttpError(404, 'Work order not found.');
        if (wo.status !== 'COMPLETED') {
          throw new HttpError(
            409,
            'Supervisor review can only be approved on completed work orders.',
          );
        }
        if (!wo.supervisorReviewRequired) {
          throw new HttpError(
            409,
            'Supervisor review is not required on this work order.',
          );
        }

        const nowIso = new Date().toISOString();
        db.prepare(`
          UPDATE work_orders
          SET supervisor_review_required = 0,
              supervisor_reviewed_at = ?,
              supervisor_reviewed_by = ?,
              resolution_notes = COALESCE(?, resolution_notes),
              updated_at = ?
          WHERE id = ?
        `).run(nowIso, actor.id, notes.trim() || null, nowIso, workOrderId);

        appendAudit(
          actor,
          'SUPERVISOR_EVIDENCE_APPROVED',
          'WorkOrder',
          workOrderId,
          { ticketNumber: wo.ticketNumber, notes },
        );
        wfmEventBus.publish(
          'WORK_ORDER_UPDATED',
          `${wo.ticketNumber} evidence approved by ${actor.fullName}`,
          workOrderId,
        );
        return getWorkOrderById(workOrderId, true)!;
      });
    },

    listDiscrepancies(statusFilter?: DiscrepancyStatus): LocationDiscrepancyRecord[] {
      const sql = `
        SELECT d.*, w.ticket_number, s.full_name AS subscriber_name, u.full_name AS captured_by_name
        FROM location_discrepancies d
        JOIN work_orders w ON w.id = d.work_order_id
        JOIN subscribers s ON s.id = d.subscriber_id
        JOIN users u ON u.id = d.captured_by_id
        ${statusFilter ? 'WHERE d.status = ?' : ''}
        ORDER BY d.created_at DESC
      `;
      const rows = (
        statusFilter ? db.prepare(sql).all(statusFilter) : db.prepare(sql).all()
      ) as Array<Record<string, unknown>>;

      return rows.map((r) => ({
        id: String(r.id),
        workOrderId: String(r.work_order_id),
        ticketNumber: String(r.ticket_number),
        subscriberId: String(r.subscriber_id),
        subscriberName: String(r.subscriber_name),
        capturedById: String(r.captured_by_id),
        capturedByName: String(r.captured_by_name),
        recordedLat: Number(r.recorded_lat),
        recordedLng: Number(r.recorded_lng),
        capturedLat: Number(r.captured_lat),
        capturedLng: Number(r.captured_lng),
        distanceMeters: Number(r.distance_meters),
        status: r.status as DiscrepancyStatus,
        reviewedById: r.reviewed_by_id ? String(r.reviewed_by_id) : null,
        reviewNotes: r.review_notes ? String(r.review_notes) : null,
        createdAt: String(r.created_at),
        reviewedAt: r.reviewed_at ? String(r.reviewed_at) : null,
      }));
    },

    resolveDiscrepancy(
      actor: AuthenticatedUser,
      discrepancyId: string,
      input: { decision: 'APPROVED' | 'REJECTED'; reviewNotes: string },
    ): LocationDiscrepancyRecord {
      if (actor.role !== 'SUPERVISOR' && actor.role !== 'ADMINISTRATOR') {
        throw new HttpError(403, 'Only SUPERVISOR or ADMINISTRATOR may resolve GPS discrepancies.');
      }
      return runInTransaction(db, () => {
        const row = db
          .prepare('SELECT * FROM location_discrepancies WHERE id = ?')
          .get(discrepancyId) as Record<string, unknown> | undefined;
        if (!row) throw new HttpError(404, 'Discrepancy record not found.');
        if (row.status !== 'PENDING') {
          throw new HttpError(409, 'Discrepancy has already been resolved.');
        }

        const nowIso = new Date().toISOString();
        db.prepare(`
          UPDATE location_discrepancies
          SET status = ?, reviewed_by_id = ?, review_notes = ?, reviewed_at = ?
          WHERE id = ?
        `).run(
          input.decision,
          actor.id,
          input.reviewNotes.trim() || null,
          nowIso,
          discrepancyId,
        );

        if (input.decision === 'APPROVED') {
          db.prepare(`
            UPDATE subscribers
            SET lat = ?, lng = ?, coords_verified = 1
            WHERE id = ?
          `).run(
            Number(row.captured_lat),
            Number(row.captured_lng),
            String(row.subscriber_id),
          );

          db.prepare(`
            UPDATE work_orders
            SET target_lat = ?, target_lng = ?, updated_at = ?
            WHERE id = ?
          `).run(
            Number(row.captured_lat),
            Number(row.captured_lng),
            nowIso,
            String(row.work_order_id),
          );
        }

        appendAudit(
          actor,
          `GPS_DISCREPANCY_${input.decision}`,
          'LocationDiscrepancy',
          discrepancyId,
          {
            subscriberId: String(row.subscriber_id),
            distanceMeters: Number(row.distance_meters),
            reviewNotes: input.reviewNotes,
          },
        );

        wfmEventBus.publish(
          'DISCREPANCY_UPDATED',
          `GPS discrepancy ${input.decision.toLowerCase()} by ${actor.fullName}`,
          discrepancyId,
        );

        return this.listDiscrepancies().find((d) => d.id === discrepancyId)!;
      });
    },

    importValidatedBatch(
      actor: AuthenticatedUser,
      rows: ValidatedDispatchRow[],
      sourceChannel: 'EXCEL_BATCH' | 'DIGITAL_INTAKE' = 'EXCEL_BATCH',
    ): WorkOrderRecord[] {
      if (actor.role !== 'JOB_CONTROLLER' && actor.role !== 'ADMINISTRATOR') {
        throw new HttpError(403, 'Only JOB_CONTROLLER or ADMINISTRATOR can import work orders.');
      }
      if (rows.length === 0) {
        throw new HttpError(400, 'No valid dispatch rows provided.');
      }

      return runInTransaction(db, () => {
        const createdIds: string[] = [];
        const nowIso = new Date().toISOString();

        for (const r of rows) {
          let sub = db
            .prepare(
              'SELECT id FROM subscribers WHERE account_number = ?',
            )
            .get(r.accountNumber) as { id: string } | undefined;

          if (!sub) {
            const subId = `sub-${crypto.randomUUID().slice(0, 8)}`;
            db.prepare(`
              INSERT INTO subscribers
              (id, account_number, full_name, phone, municipality, barangay, street_address, plan_name, lat, lng, coords_verified)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
            `).run(
              subId,
              r.accountNumber,
              r.subscriberName,
              r.phone,
              r.municipality,
              r.barangay,
              r.streetAddress,
              r.planName,
              r.lat,
              r.lng,
            );
            sub = { id: subId };
          }

          const seqNum = (
            db.prepare('SELECT COUNT(*) AS cnt FROM work_orders').get() as {
              cnt: number;
            }
          ).cnt + 1001;

          const woId = `wo-${crypto.randomUUID().slice(0, 8)}`;
          const ticketNumber = `FB-WO-2026-${seqNum}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

          let oldNapBoxId: string | null = null;
          let oldPortNumber: number | null = null;

          if (r.workflowType === 'TRANSFER' && sub) {
            const subRecord = db
              .prepare(
                'SELECT active_nap_box_id, active_port_number FROM subscribers WHERE id = ?',
              )
              .get(sub.id) as
              | { active_nap_box_id?: string; active_port_number?: number }
              | undefined;

            if (subRecord?.active_nap_box_id && subRecord?.active_port_number) {
              oldNapBoxId = subRecord.active_nap_box_id;
              oldPortNumber = subRecord.active_port_number;
              db.prepare(`
                UPDATE nap_ports
                SET status = 'LOCKED_TRANSFER', locked_by_wo_id = ?, updated_at = ?
                WHERE nap_box_id = ? AND port_number = ?
              `).run(woId, nowIso, oldNapBoxId, oldPortNumber);
            }
          }

          db.prepare(`
            INSERT INTO work_orders (
              id, ticket_number, workflow_type, status, priority, subscriber_id, assigned_tech_id,
              source_channel, summary_title, issue_description, target_lat, target_lng,
              target_municipality, target_barangay, target_address, old_nap_box_id, old_port_number, supervisor_review_required, created_at, updated_at
            ) VALUES (?, ?, ?, 'UNASSIGNED', ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
          `).run(
            woId,
            ticketNumber,
            r.workflowType,
            r.priority,
            sub.id,
            sourceChannel,
            `${r.workflowType.replace('_', ' ')} — ${r.planName}`,
            r.issueDescription,
            r.lat,
            r.lng,
            r.municipality,
            r.barangay,
            r.streetAddress,
            oldNapBoxId,
            oldPortNumber,
            nowIso,
            nowIso,
          );

          createdIds.push(woId);
        }

        appendAudit(
          actor,
          sourceChannel === 'EXCEL_BATCH'
            ? 'EXCEL_BATCH_IMPORTED'
            : 'DIGITAL_INTAKE_CREATED',
          'WorkOrderBatch',
          createdIds[0],
          { count: createdIds.length, ticketIds: createdIds },
        );

        wfmEventBus.publish(
          'BATCH_IMPORTED',
          `${createdIds.length} Cavite work order(s) imported via ${sourceChannel}`,
        );

        return createdIds.map((id) => getWorkOrderById(id, false)!);
      });
    },

    listIntegrationOutbox(): IntegrationOutboxRecord[] {
      const rows = db
        .prepare(`
          SELECT o.*, w.ticket_number
          FROM integration_outbox o
          JOIN work_orders w ON w.id = o.work_order_id
          ORDER BY o.created_at DESC
        `)
        .all() as Array<Record<string, unknown>>;

      return rows.map((r) => ({
        id: String(r.id),
        workOrderId: String(r.work_order_id),
        ticketNumber: String(r.ticket_number),
        targetSystem: r.target_system as
          | 'CRM_BILLING'
          | 'OLT_PROVISIONING'
          | 'NAP_INVENTORY',
        eventType: String(r.event_type),
        payloadJson: String(r.payload_json),
        gateStatus: 'GATED_DRY_RUN',
        createdAt: String(r.created_at),
      }));
    },

    listAuditLogs(): AuditLogRecord[] {
      const rows = db
        .prepare('SELECT * FROM audit_logs ORDER BY seq ASC')
        .all() as Array<Record<string, unknown>>;
      return rows.map((r) => ({
        seq: Number(r.seq),
        id: String(r.id),
        actorId: String(r.actor_id),
        actorRole: r.actor_role as Role,
        action: String(r.action),
        entityType: String(r.entity_type),
        entityId: String(r.entity_id),
        detailJson: String(r.detail_json),
        prevHash: String(r.prev_hash),
        entryHash: String(r.entry_hash),
        createdAt: String(r.created_at),
      }));
    },

    close() {
      db.close();
    },
  };
}

export type WfmRepository = ReturnType<typeof createWfmRepository>;

const globalForRepo = globalThis as unknown as {
  __fiberblazeRepo?: WfmRepository;
};

export function getWfmRepository(): WfmRepository {
  if (!globalForRepo.__fiberblazeRepo) {
    const dbPath =
      process.env.FIBERBLAZE_DB_PATH ??
      path.resolve(process.cwd(), 'data', 'fiberblaze-wfm.db');
    const evidenceDir =
      process.env.FIBERBLAZE_EVIDENCE_DIR ??
      path.resolve(process.cwd(), 'storage', 'evidence');

    const repo = createWfmRepository({ dbPath, evidenceDir });
    repo.ensureSeeded();
    globalForRepo.__fiberblazeRepo = repo;
  }
  return globalForRepo.__fiberblazeRepo;
}
