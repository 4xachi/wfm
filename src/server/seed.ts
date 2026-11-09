import crypto from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { computeAuditEntryHash } from '@/domain/auditChain';
import { hashPassword } from './auth';
import { runInTransaction } from './db';

export const DEMO_DEFAULT_PASSWORD = 'FiberBlaze2026!';

export function seedCaviteBaseline(db: DatabaseSync): {
  usersCount: number;
  napBoxesCount: number;
  workOrdersCount: number;
} {
  const now = new Date();
  const isoNow = now.toISOString();
  const iso2MinAgo = new Date(now.getTime() - 2 * 60 * 1000).toISOString();
  const iso18MinAgo = new Date(now.getTime() - 18 * 60 * 1000).toISOString();
  const iso2HrAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();
  const pwHash = hashPassword(DEMO_DEFAULT_PASSWORD);

  return runInTransaction(db, () => {
    db.exec(`
      DELETE FROM audit_logs;
      DELETE FROM integration_outbox;
      DELETE FROM sync_receipts;
      DELETE FROM field_evidence;
      DELETE FROM location_discrepancies;
      DELETE FROM work_orders;
      DELETE FROM nap_ports;
      DELETE FROM nap_boxes;
      DELETE FROM subscribers;
      DELETE FROM technician_profiles;
      DELETE FROM users;
    `);

    const insertUser = db.prepare(`
      INSERT INTO users (id, employee_code, email, full_name, role, password_hash, active, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?)
    `);

    const users = [
      ['u-ctrl-1', 'FB-JC01', 'controller@fiberblaze.ph', 'Camille Reyes', 'JOB_CONTROLLER'],
      ['u-sup-1', 'FB-SUP01', 'supervisor@fiberblaze.ph', 'Engr. Paolo Bautista', 'SUPERVISOR'],
      ['u-admin-1', 'FB-ADM01', 'admin@fiberblaze.ph', 'Rafael Mendoza', 'ADMINISTRATOR'],
      ['u-tech-1', 'FB-T01', 'mateo@fiberblaze.ph', 'Mateo Villanueva', 'TECHNICIAN'],
      ['u-tech-2', 'FB-T02', 'jessa@fiberblaze.ph', 'Jessa Pangilinan', 'TECHNICIAN'],
      ['u-tech-3', 'FB-T03', 'carlo@fiberblaze.ph', 'Carlo Dimaano', 'TECHNICIAN'],
      ['u-tech-4', 'FB-T04', 'arnel@fiberblaze.ph', 'Arnel Tolentino', 'TECHNICIAN'],
    ] as const;

    for (const [id, code, email, name, role] of users) {
      insertUser.run(id, code, email, name, role, pwHash, isoNow);
    }

    const insertTech = db.prepare(`
      INSERT INTO technician_profiles
      (user_id, vehicle_type, home_barangay, phone, session_active, last_lat, last_lng, last_gps_at, last_speed_kmh)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // Mateo: LIVE in Imus (L300 Splice Van)
    insertTech.run('u-tech-1', 'l300_van', 'Imus • Nueno Ave', '0917-501-1101', 1, 14.42703, 120.93787, iso2MinAgo, 28);
    // Jessa: LIVE in Bacoor (2-Wheeler Troubleshooter)
    insertTech.run('u-tech-2', 'motorbike', 'Bacoor • SM Bacoor Hub', '0917-502-2202', 1, 14.4449, 120.9522, iso2MinAgo, 34);
    // Carlo: STALE (18 min old -> LAST KNOWN, never fake LIVE) in Dasmariñas
    insertTech.run('u-tech-3', 'l300_van', 'Dasmariñas • Pala-Pala', '0917-503-3303', 1, 14.3036, 120.9562, iso18MinAgo, 0);
    // Arnel: OFFLINE (session_active = 0 -> logged out) in Gen. Trias
    insertTech.run('u-tech-4', 'motorbike', 'Gen. Trias • Manggahan', '0917-504-4404', 0, 14.3278, 120.9035, iso2HrAgo, 0);

    const insertNap = db.prepare(`
      INSERT INTO nap_boxes (id, code, municipality, barangay, lat, lng, total_ports, olt_code, coords_verified)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
    `);
    const insertPort = db.prepare(`
      INSERT INTO nap_ports (nap_box_id, port_number, status, subscriber_id, fiber_tag, locked_by_wo_id, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const napBoxes = [
      { id: 'nap-bcr-042', code: 'NAP-BCR-042', muni: 'Bacoor', brgy: 'Habay I', lat: 14.4426, lng: 120.9488, total: 8, olt: 'OLT-BACOOR-01' },
      { id: 'nap-ims-118', code: 'NAP-IMS-118', muni: 'Imus', brgy: 'Tanzang Luma II', lat: 14.4294, lng: 120.9367, total: 16, olt: 'OLT-IMUS-01' },
      { id: 'nap-ims-204', code: 'NAP-IMS-204', muni: 'Imus', brgy: 'Anabu I-C', lat: 14.3992, lng: 120.9412, total: 8, olt: 'OLT-IMUS-02' },
      { id: 'nap-dsm-309', code: 'NAP-DSM-309', muni: 'Dasmariñas', brgy: 'Salitran II', lat: 14.3458, lng: 120.9388, total: 16, olt: 'OLT-DASMA-01' },
      { id: 'nap-gtr-415', code: 'NAP-GTR-415', muni: 'General Trias', brgy: 'San Francisco', lat: 14.3152, lng: 120.9071, total: 8, olt: 'OLT-GENTRI-01' },
    ];

    for (const nap of napBoxes) {
      insertNap.run(nap.id, nap.code, nap.muni, nap.brgy, nap.lat, nap.lng, nap.total, nap.olt);
      for (let p = 1; p <= nap.total; p++) {
        let status = 'FREE';
        let subId: string | null = null;
        let tag: string | null = null;
        let lockedWo: string | null = null;

        if (p === 1) {
          status = 'OCCUPIED';
          subId = 'sub-legacy-p1';
          tag = `${nap.code}-P01`;
        } else if (nap.id === 'nap-bcr-042' && p === 2) {
          status = 'LOCKED_TRANSFER';
          subId = 'sub-003';
          tag = 'NAP-BCR-042-P02';
          lockedWo = 'wo-1003';
        } else if (nap.id === 'nap-ims-118' && p === 2) {
          status = 'OCCUPIED';
          subId = 'sub-002';
          tag = 'NAP-IMS-118-P02';
        } else if (nap.id === 'nap-ims-118' && p === 3) {
          status = 'OCCUPIED';
          subId = 'sub-007';
          tag = 'NAP-IMS-118-P03';
        } else if (p === nap.total) {
          status = 'FAULTY';
        }

        insertPort.run(nap.id, p, status, subId, tag, lockedWo, isoNow);
      }
    }

    const insertSub = db.prepare(`
      INSERT INTO subscribers
      (id, account_number, full_name, phone, municipality, barangay, street_address, plan_name, lat, lng, coords_verified, active_nap_box_id, active_port_number, onu_serial, fiber_tag, last_optical_dbm)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const subscribers = [
      ['sub-001', 'FB-CAV-1001', 'Lorenzo Mercado', '0917-801-1001', 'Imus', 'Tanzang Luma II', 'Blk 2 Lot 8 Gen. Castañeda St', 'Blaze Fiber 400 Mbps', null, null, 0, null, null, null, null, null],
      ['sub-002', 'FB-CAV-1002', 'Maricel Soriano-Lim', '0917-802-1002', 'Imus', 'Tanzang Luma II', '44 Captain Bella St, Poblacion', 'Blaze Fiber 300 Mbps', 14.4302, 120.9361, 1, 'nap-ims-118', 2, 'HWTC48575443', 'NAP-IMS-118-P02', -19.6],
      ['sub-003', 'FB-CAV-1003', 'Engr. Noel Macapagal', '0918-803-1003', 'Imus', 'Anabu I-C', 'Unit 12 Aguinaldo Commercial Strip', 'Blaze Biz 600 Mbps', 14.3996, 120.9416, 1, 'nap-bcr-042', 2, 'ZTEGD4A11290', 'NAP-BCR-042-P02', -20.1],
      ['sub-004', 'FB-CAV-1004', 'beatriz Alcaraz', '0919-804-1004', 'Dasmariñas', 'Salitran II', '19 Golden City Subd Phase 1', 'Blaze Fiber 300 Mbps', 14.3464, 120.9394, 1, 'nap-dsm-309', 1, 'HWTC77129834', 'NAP-DSM-309-P01', -24.2],
      ['sub-005', 'FB-CAV-1005', 'Roderick Magno', '0920-805-1005', 'General Trias', 'San Francisco', 'Blk 11 Lot 4 Sunny Brooke 2', 'Blaze Fiber 200 Mbps', 14.3156, 120.9076, 1, null, null, null, null, null],
      ['sub-006', 'FB-CAV-1006', 'Teresita Dimaculangan', '0917-806-1006', 'Bacoor', 'Molino IV', '88 Daang Hari Corner Avenida', 'Blaze Fiber 500 Mbps', 14.3842, 120.9804, 1, 'nap-bcr-042', 1, 'HWTC66102938', 'NAP-BCR-042-P01', -21.0],
      ['sub-007', 'FB-CAV-1007', 'Jericho Evangelista', '0917-807-1007', 'Imus', 'Tanzang Luma I', '15 Palico IV Access Rd', 'Blaze Fiber 300 Mbps', 14.4281, 120.9378, 1, 'nap-ims-118', 3, 'ZTEGC0091823', 'NAP-IMS-118-P03', -26.1],
    ] as const;

    for (const s of subscribers) {
      insertSub.run(...s);
    }

    const insertWo = db.prepare(`
      INSERT INTO work_orders (
        id, ticket_number, workflow_type, status, priority, subscriber_id, assigned_tech_id, source_channel,
        summary_title, issue_description, target_lat, target_lng, target_municipality, target_barangay, target_address,
        old_address, old_lat, old_lng, old_nap_box_id, old_port_number,
        assigned_nap_box_id, assigned_port_number, fiber_tag, onu_serial, optical_rx_dbm, optical_signal_band,
        supervisor_review_required, exception_reason_code, exception_notes, created_at, updated_at, started_at, completed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // 1. NEW_INSTALL assigned to Mateo (unverified subscriber pin -> field GPS capture + NAP port + camera + sig)
    insertWo.run(
      'wo-1001', 'FB-WO-2026-1001', 'NEW_INSTALL', 'ASSIGNED', 'HIGH', 'sub-001', 'u-tech-1', 'DIGITAL_INTAKE',
      'New FTTH Installation — Blaze 400M', 'New residential fiber drop near Imus Cathedral / NAP-IMS-118. Verify exact house gate pin.',
      14.4296, 120.9371, 'Imus', 'Tanzang Luma II', 'Blk 2 Lot 8 Gen. Castañeda St',
      null, null, null, null, null,
      'nap-ims-118', null, null, null, null, null,
      0, null, null, iso2HrAgo, isoNow, null, null,
    );

    // 2. REPAIR assigned to Mateo (verified pin -> reuse unless >30m mismatch)
    insertWo.run(
      'wo-1002', 'FB-WO-2026-1002', 'REPAIR', 'ASSIGNED', 'URGENT', 'sub-002', 'u-tech-1', 'SEED',
      'Red LOS Blinking — Fiber Drop Check', 'Subscriber reports sudden loss of signal since 07:30 AM. Inspect patch cord & NAP-IMS-118 P02.',
      14.4302, 120.9361, 'Imus', 'Tanzang Luma II', '44 Captain Bella St, Poblacion',
      null, null, null, null, null,
      'nap-ims-118', 2, 'NAP-IMS-118-P02', 'HWTC48575443', null, null,
      0, null, null, iso2HrAgo, isoNow, null, null,
    );

    // 3. TRANSFER assigned to Jessa (Old site NAP-BCR-042 Port 2 is LOCKED_TRANSFER!)
    insertWo.run(
      'wo-1003', 'FB-WO-2026-1003', 'TRANSFER', 'ASSIGNED', 'HIGH', 'sub-003', 'u-tech-2', 'SEED',
      'Site Relocation — Habay I to Anabu I-C', 'Relocate SME subscriber circuit. Do NOT release NAP-BCR-042 Port 2 until Anabu cutover passes.',
      14.3996, 120.9416, 'Imus', 'Anabu I-C', 'Unit 12 Aguinaldo Commercial Strip',
      '104 Tirona Hwy, Habay I, Bacoor', 14.4428, 120.9491, 'nap-bcr-042', 2,
      'nap-ims-204', null, null, 'ZTEGD4A11290', null, null,
      0, null, null, iso2HrAgo, isoNow, null, null,
    );

    // 4. UNASSIGNED repair in Dasmariñas -> ready for 1-click Street-ETA Technician Suggestion!
    insertWo.run(
      'wo-1004', 'FB-WO-2026-1004', 'REPAIR', 'UNASSIGNED', 'HIGH', 'sub-004', null, 'EXCEL_BATCH',
      'High Optical Attenuation Warning', 'PON monitoring flagged degraded -25.8 dBm signal at Salitran II.',
      14.3464, 120.9394, 'Dasmariñas', 'Salitran II', '19 Golden City Subd Phase 1',
      null, null, null, null, null,
      'nap-dsm-309', 1, 'NAP-DSM-309-P01', 'HWTC77129834', null, null,
      0, null, null, iso2HrAgo, isoNow, null, null,
    );

    // 5. FB_ISSUE in Supervisor NetOps Queue
    insertWo.run(
      'wo-1005', 'FB-WO-2026-1005', 'NEW_INSTALL', 'FB_ISSUE', 'HIGH', 'sub-005', 'u-tech-3', 'EXCEL_BATCH',
      'New FTTH Install — Feeder Low Light Escalation', 'Distribution NAP-GTR-415 measured -30.4 dBm across all spare ports.',
      14.3156, 120.9076, 'General Trias', 'San Francisco', 'Blk 11 Lot 4 Sunny Brooke 2',
      null, null, null, null, null,
      'nap-gtr-415', 2, null, null, -30.4, 'FAIL_OUT_OF_RANGE',
      1, 'FEEDER_SPLICE_LOSS', 'Measured -30.4 dBm on NAP-GTR-415 spare port 2; requires feeder trunk splice inspection.', iso2HrAgo, isoNow, iso2HrAgo, null,
    );

    // 6. CUST_ISSUE in Job Controller Reschedule Queue
    insertWo.run(
      'wo-1006', 'FB-WO-2026-1006', 'REPAIR', 'CUST_ISSUE', 'NORMAL', 'sub-006', 'u-tech-2', 'EXCEL_BATCH',
      'Intermittent Wi-Fi / Patch Inspection', 'Homeowner out of town; subdivision guard requested Saturday morning reschedule.',
      14.3842, 120.9804, 'Bacoor', 'Molino IV', '88 Daang Hari Corner Avenida',
      null, null, null, null, null,
      'nap-bcr-042', 1, 'NAP-BCR-042-P01', 'HWTC66102938', null, null,
      0, 'SUBSCRIBER_UNAVAILABLE', 'No adult representative on site; call subscriber to confirm new window.', iso2HrAgo, isoNow, iso2HrAgo, null,
    );

    // 7. COMPLETED with Marginal Signal (-26.1 dBm) + PENDING 64m GPS Mismatch Discrepancy for Supervisor Demo!
    insertWo.run(
      'wo-1007', 'FB-WO-2026-1007', 'REPAIR', 'COMPLETED', 'NORMAL', 'sub-007', 'u-tech-1', 'SEED',
      'Cleaned SC/APC Connector — Marginal Signal Flag', 'Replaced bent indoor patch cord; signal improved to -26.1 dBm (marginal band).',
      14.4281, 120.9378, 'Imus', 'Tanzang Luma I', '15 Palico IV Access Rd',
      null, null, null, null, null,
      'nap-ims-118', 3, 'NAP-IMS-118-P03', 'ZTEGC0091823', -26.1, 'MARGINAL_WARNING',
      1, null, null, iso2HrAgo, isoNow, iso2HrAgo, isoNow,
    );

    db.prepare(`
      INSERT INTO location_discrepancies
      (id, work_order_id, subscriber_id, captured_by_id, recorded_lat, recorded_lng, captured_lat, captured_lng, distance_meters, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)
    `).run(
      'disc-1001',
      'wo-1007',
      'sub-007',
      'u-tech-1',
      14.4281,
      120.9378,
      14.42865,
      120.93802,
      65.5,
      isoNow,
    );

    db.prepare(`
      INSERT INTO integration_outbox
      (id, work_order_id, target_system, event_type, payload_json, gate_status, created_at)
      VALUES (?, ?, 'CRM_BILLING', 'REPAIR_TICKET_CLOSED_DRY_RUN', ?, 'GATED_DRY_RUN', ?)
    `).run(
      'out-1001',
      'wo-1007',
      JSON.stringify({
        ticketNumber: 'FB-WO-2026-1007',
        accountNumber: 'FB-CAV-1007',
        opticalRxDbm: -26.1,
        executionBlockedByPolicy: true,
      }),
      isoNow,
    );

    const genesisDetail = JSON.stringify({
      seededWorkOrders: 7,
      seededNapBoxes: 5,
      region: 'Cavite, Philippines',
    });
    const entryHash = computeAuditEntryHash({
      prevHash: 'GENESIS',
      actorId: 'u-admin-1',
      actorRole: 'ADMINISTRATOR',
      action: 'SYSTEM_BASELINE_SEEDED',
      entityType: 'System',
      entityId: 'cavite-baseline',
      detailJson: genesisDetail,
      createdAt: isoNow,
    });

    db.prepare(`
      INSERT INTO audit_logs
      (id, actor_id, actor_role, action, entity_type, entity_id, detail_json, prev_hash, entry_hash, created_at)
      VALUES (?, 'u-admin-1', 'ADMINISTRATOR', 'SYSTEM_BASELINE_SEEDED', 'System', 'cavite-baseline', ?, 'GENESIS', ?, ?)
    `).run(crypto.randomUUID(), genesisDetail, entryHash, isoNow);

    return {
      usersCount: users.length,
      napBoxesCount: napBoxes.length,
      workOrdersCount: 7,
    };
  });
}
