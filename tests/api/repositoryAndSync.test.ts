import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createWfmRepository } from '@/server/repository';
import { verifyAuditChain } from '@/domain/auditChain';

describe('Transactional SQLite Repository, Transfer Port-Lock, GPS Diff & Idempotent Sync', () => {
  let tempDir: string;
  let repo: ReturnType<typeof createWfmRepository>;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fb-wfm-test-'));
    repo = createWfmRepository({
      dbPath: path.join(tempDir, 'test.db'),
      evidenceDir: path.join(tempDir, 'evidence'),
    });
    repo.seedDemoData();
  });

  afterEach(() => {
    repo.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('seeds realistic Cavite NAP boxes, subscribers, technicians, and work orders, and supports 1-click reset', () => {
    const naps = repo.listNapBoxes();
    expect(naps.length).toBeGreaterThanOrEqual(4);
    expect(naps.some((n) => n.code.startsWith('NAP-'))).toBe(true);

    const orders = repo.listWorkOrders({ role: 'JOB_CONTROLLER', userId: 'u-ctrl-1' });
    expect(orders.length).toBeGreaterThanOrEqual(5);

    const resetSummary = repo.resetDemoData({
      id: 'u-admin-1',
      employeeCode: 'FB-ADM01',
      email: 'admin@fiberblaze.ph',
      fullName: 'Rafael Mendoza',
      role: 'ADMINISTRATOR',
    });
    expect(resetSummary.workOrdersCount).toBeGreaterThanOrEqual(5);
  });

  it('halts technician GPS ingestion immediately upon logout and marks telemetry OFFLINE', () => {
    const techActor = repo.getUserByEmail('mateo@fiberblaze.ph')!;
    repo.setTechnicianSession(techActor.id, true);

    const updatedLive = repo.recordTechnicianGps(techActor, {
      lat: 14.4294,
      lng: 120.9367,
      speedKmh: 32,
    });
    expect(updatedLive.gpsFreshness).toBe('LIVE');

    repo.setTechnicianSession(techActor.id, false);
    const techsAfterLogout = repo.listTechnicians();
    const mateo = techsAfterLogout.find((t) => t.userId === techActor.id)!;
    expect(mateo.gpsFreshness).toBe('OFFLINE');

    expect(() =>
      repo.recordTechnicianGps(techActor, {
        lat: 14.4301,
        lng: 120.9372,
        speedKmh: 20,
      }),
    ).toThrow(/logged out|session/i);
  });

  it('keeps old NAP port LOCKED_TRANSFER during FB_ISSUE and releases it atomically ONLY upon COMPLETED', () => {
    const tech = repo.getUserByEmail('mateo@fiberblaze.ph')!;
    const supervisor = repo.getUserByEmail('supervisor@fiberblaze.ph')!;

    const transferOrder = repo
      .listWorkOrders({ role: 'ADMINISTRATOR', userId: 'u-admin-1' })
      .find((w) => w.workflowType === 'TRANSFER')!;

    expect(transferOrder).toBeDefined();
    const oldNapId = transferOrder.oldNapBoxId!;
    const oldPortNo = transferOrder.oldPortNumber!;

    // Verify old port starts in LOCKED_TRANSFER
    const oldPortInitial = repo
      .getNapBoxById(oldNapId)!
      .ports.find((p) => p.portNumber === oldPortNo)!;
    expect(oldPortInitial.status).toBe('LOCKED_TRANSFER');

    // Assign & start transfer order as mateo
    repo.assignWorkOrder(
      repo.getUserByEmail('controller@fiberblaze.ph')!,
      transferOrder.id,
      tech.id,
    );
    repo.startWorkOrder(tech, transferOrder.id, 'idem-start-tx-1');

    // Technician files FB_ISSUE -> old port MUST stay LOCKED_TRANSFER!
    repo.submitFieldOutcome(tech, {
      idempotencyKey: 'idem-fb-issue-tx-1',
      workOrderId: transferOrder.id,
      outcomeStatus: 'FB_ISSUE',
      exceptionReasonCode: 'FEEDER_LOW_LIGHT',
      exceptionNotes: 'Feeder splice attenuation at -30.2 dBm',
      opticalRxDbm: -30.2,
      capturedLat: transferOrder.targetLat,
      capturedLng: transferOrder.targetLng,
      evidenceItems: [
        {
          kind: 'CAMERA_OPTICAL',
          captureMode: 'SIMULATED_FTTH_FEED',
          dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          watermark: 'WO TRANSFER | -30.2 dBm',
        },
      ],
    });

    const oldPortDuringIssue = repo
      .getNapBoxById(oldNapId)!
      .ports.find((p) => p.portNumber === oldPortNo)!;
    expect(oldPortDuringIssue.status).toBe('LOCKED_TRANSFER');

    // Supervisor resolves FB_ISSUE -> returns to ASSIGNED
    repo.resolveFbIssue(supervisor, transferOrder.id, {
      resolutionNotes: 'Re-spliced distribution tray at Anabu junction; optical level restored to -18.8 dBm',
      reassignTechId: tech.id,
    });

    // Technician restarts and completes transfer on a FREE port of destination NAP
    repo.startWorkOrder(tech, transferOrder.id, 'idem-restart-tx-2');
    const destNap = repo.listNapBoxes().find((n) => n.id !== oldNapId)!;
    const freePort = destNap.ports.find((p) => p.status === 'FREE')!;

    const completed = repo.submitFieldOutcome(tech, {
      idempotencyKey: 'idem-complete-tx-1',
      workOrderId: transferOrder.id,
      outcomeStatus: 'COMPLETED',
      selectedNapBoxId: destNap.id,
      selectedPortNumber: freePort.portNumber,
      fiberTag: 'FB-TAG-9921',
      onuSerial: 'HWTC99887766',
      opticalRxDbm: -18.8,
      capturedLat: transferOrder.targetLat,
      capturedLng: transferOrder.targetLng,
      evidenceItems: [
        {
          kind: 'CAMERA_NAP',
          captureMode: 'SIMULATED_FTTH_FEED',
          dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          watermark: 'WO TRANSFER | NAP TAG',
        },
        {
          kind: 'SUBSCRIBER_SIGNATURE',
          captureMode: 'SIGNATURE_PAD',
          dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          watermark: 'SIGNED BY SUBSCRIBER',
        },
      ],
    });

    expect(completed.replayed).toBe(false);
    expect(completed.workOrder.status).toBe('COMPLETED');

    // Old port is NOW atomically FREE, and new port is OCCUPIED!
    const oldPortAfterComplete = repo
      .getNapBoxById(oldNapId)!
      .ports.find((p) => p.portNumber === oldPortNo)!;
    const newPortAfterComplete = repo
      .getNapBoxById(destNap.id)!
      .ports.find((p) => p.portNumber === freePort.portNumber)!;

    expect(oldPortAfterComplete.status).toBe('FREE');
    expect(newPortAfterComplete.status).toBe('OCCUPIED');

    // Verify Idempotent Replay of exact same offline sync key!
    const outboxCountBefore = repo.listIntegrationOutbox().length;
    const replayed = repo.submitFieldOutcome(tech, {
      idempotencyKey: 'idem-complete-tx-1',
      workOrderId: transferOrder.id,
      outcomeStatus: 'COMPLETED',
      selectedNapBoxId: destNap.id,
      selectedPortNumber: freePort.portNumber,
      fiberTag: 'FB-TAG-9921',
      onuSerial: 'HWTC99887766',
      opticalRxDbm: -18.8,
      capturedLat: transferOrder.targetLat,
      capturedLng: transferOrder.targetLng,
      evidenceItems: [],
    });
    expect(replayed.replayed).toBe(true);
    expect(repo.listIntegrationOutbox().length).toBe(outboxCountBefore);

    // Verify Conflicting New Submission on already-COMPLETED order throws 409 conflict!
    expect(() =>
      repo.submitFieldOutcome(tech, {
        idempotencyKey: 'idem-different-conflicting-key',
        workOrderId: transferOrder.id,
        outcomeStatus: 'CUST_ISSUE',
        exceptionReasonCode: 'LATE_CONFLICT',
      }),
    ).toThrow(/already|conflict|transition/i);

    // Verify entire AuditLog hash chain is cryptographically intact!
    const auditCheck = verifyAuditChain(repo.listAuditLogs());
    expect(auditCheck.valid).toBe(true);
  });

  it('creates PENDING LocationDiscrepancy instead of overwriting verified subscriber pin when >30m away, until Supervisor approves', () => {
    const tech = repo.getUserByEmail('mateo@fiberblaze.ph')!;
    const supervisor = repo.getUserByEmail('supervisor@fiberblaze.ph')!;
    const repairOrder = repo
      .listWorkOrders({ role: 'ADMINISTRATOR', userId: 'u-admin-1' })
      .find((w) => w.workflowType === 'REPAIR' && w.coordsVerified)!;

    repo.assignWorkOrder(
      repo.getUserByEmail('controller@fiberblaze.ph')!,
      repairOrder.id,
      tech.id,
    );
    repo.startWorkOrder(tech, repairOrder.id, 'idem-start-rep-1');

    const shiftedLat = repairOrder.targetLat + 0.0012; // ~133m north
    repo.submitFieldOutcome(tech, {
      idempotencyKey: 'idem-rep-mismatch-1',
      workOrderId: repairOrder.id,
      outcomeStatus: 'COMPLETED',
      opticalRxDbm: -19.4,
      capturedLat: shiftedLat,
      capturedLng: repairOrder.targetLng,
      evidenceItems: [
        {
          kind: 'CAMERA_OPTICAL',
          captureMode: 'WEBRTC_CAMERA',
          dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          watermark: 'REPAIR -19.4 dBm',
        },
      ],
    });

    const subBeforeApprove = repo.getSubscriberById(repairOrder.subscriberId)!;
    expect(subBeforeApprove.lat).toBeCloseTo(repairOrder.targetLat, 5);

    const discrepancies = repo.listDiscrepancies('PENDING');
    const found = discrepancies.find((d) => d.workOrderId === repairOrder.id)!;
    expect(found).toBeDefined();
    expect(found.distanceMeters).toBeGreaterThan(30);

    // Supervisor approves new field coordinates
    repo.resolveDiscrepancy(supervisor, found.id, {
      decision: 'APPROVED',
      reviewNotes: 'Confirmed subscriber house entrance is on adjacent subdivision block',
    });

    const subAfterApprove = repo.getSubscriberById(repairOrder.subscriberId)!;
    expect(subAfterApprove.lat).toBeCloseTo(shiftedLat, 5);
  });
});
