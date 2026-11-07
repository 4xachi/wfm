import { describe, expect, it } from 'vitest';
import { rankTechnicianSuggestions } from '@/domain/dispatchRecommender';
import { computeAuditEntryHash, verifyAuditChain } from '@/domain/auditChain';

describe('Street-ETA Technician Recommender & Immutable Audit Hash Chain', () => {
  it('ranks LIVE nearby technicians with suitable vehicle and lower queue load above STALE/overloaded ones, excluding OFFLINE technicians', () => {
    const ranked = rankTechnicianSuggestions({
      workflowType: 'NEW_INSTALL',
      candidates: [
        {
          userId: 'tech-offline',
          fullName: 'Offline Tech',
          employeeCode: 'FB-T09',
          vehicleType: 'l300_van',
          gpsFreshness: 'OFFLINE',
          activeJobCount: 0,
          streetEtaSeconds: 180,
          streetDistanceMeters: 1200,
        },
        {
          userId: 'tech-busy-rider',
          fullName: 'Busy Rider',
          employeeCode: 'FB-T02',
          vehicleType: 'motorbike',
          gpsFreshness: 'LIVE',
          activeJobCount: 4,
          streetEtaSeconds: 420,
          streetDistanceMeters: 3100,
        },
        {
          userId: 'tech-van-near',
          fullName: 'Imus L300 Install Team',
          employeeCode: 'FB-T01',
          vehicleType: 'l300_van',
          gpsFreshness: 'LIVE',
          activeJobCount: 1,
          streetEtaSeconds: 480,
          streetDistanceMeters: 3400,
        },
      ],
    });

    expect(ranked.map((r) => r.userId)).toEqual([
      'tech-van-near',
      'tech-busy-rider',
    ]);
    expect(ranked[0].recommendationReason).toMatch(/L300|ETA/i);
  });

  it('detects any tampering in SHA-256 hash-chained audit log entries', () => {
    const e1Hash = computeAuditEntryHash({
      prevHash: 'GENESIS',
      actorId: 'u-1',
      actorRole: 'JOB_CONTROLLER',
      action: 'WORK_ORDER_DISPATCHED',
      entityType: 'WorkOrder',
      entityId: 'wo-1',
      detailJson: '{"tech":"tech-1"}',
      createdAt: '2026-11-07T09:00:00.000Z',
    });

    const e2Hash = computeAuditEntryHash({
      prevHash: e1Hash,
      actorId: 'tech-1',
      actorRole: 'TECHNICIAN',
      action: 'WORK_ORDER_STARTED',
      entityType: 'WorkOrder',
      entityId: 'wo-1',
      detailJson: '{}',
      createdAt: '2026-11-07T09:15:00.000Z',
    });

    const chain = [
      {
        seq: 1,
        id: 'a-1',
        actorId: 'u-1',
        actorRole: 'JOB_CONTROLLER' as const,
        action: 'WORK_ORDER_DISPATCHED',
        entityType: 'WorkOrder',
        entityId: 'wo-1',
        detailJson: '{"tech":"tech-1"}',
        prevHash: 'GENESIS',
        entryHash: e1Hash,
        createdAt: '2026-11-07T09:00:00.000Z',
      },
      {
        seq: 2,
        id: 'a-2',
        actorId: 'tech-1',
        actorRole: 'TECHNICIAN' as const,
        action: 'WORK_ORDER_STARTED',
        entityType: 'WorkOrder',
        entityId: 'wo-1',
        detailJson: '{}',
        prevHash: e1Hash,
        entryHash: e2Hash,
        createdAt: '2026-11-07T09:15:00.000Z',
      },
    ];

    expect(verifyAuditChain(chain).valid).toBe(true);

    const tampered = [
      chain[0],
      { ...chain[1], detailJson: '{"tampered":true}' },
    ];
    const verifyBroken = verifyAuditChain(tampered);
    expect(verifyBroken.valid).toBe(false);
    expect(verifyBroken.brokenAtSeq).toBe(2);
  });
});
