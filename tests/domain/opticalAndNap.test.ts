import { describe, expect, it } from 'vitest';
import {
  classifyOpticalSignal,
  planNapPortAllocation,
  validateCompletionRequirements,
} from '@/domain/opticalAndNap';
import type { NapPortRecord } from '@/domain/types';

const makePorts = (): NapPortRecord[] => [
  {
    napBoxId: 'nap-1',
    portNumber: 1,
    status: 'OCCUPIED',
    subscriberId: 'sub-existing',
    fiberTag: 'FT-001',
    lockedByWoId: null,
    updatedAt: '2026-11-07T08:00:00Z',
  },
  {
    napBoxId: 'nap-1',
    portNumber: 2,
    status: 'LOCKED_TRANSFER',
    subscriberId: 'sub-transfer',
    fiberTag: 'FT-002',
    lockedByWoId: 'wo-transfer-1',
    updatedAt: '2026-11-07T08:00:00Z',
  },
  {
    napBoxId: 'nap-1',
    portNumber: 3,
    status: 'FAULTY',
    subscriberId: null,
    fiberTag: null,
    lockedByWoId: null,
    updatedAt: '2026-11-07T08:00:00Z',
  },
  {
    napBoxId: 'nap-1',
    portNumber: 4,
    status: 'FREE',
    subscriberId: null,
    fiberTag: null,
    lockedByWoId: null,
    updatedAt: '2026-11-07T08:00:00Z',
  },
];

describe('GPON Optical Power & NAP Port Transfer-Lock Rules', () => {
  it('classifies GPON Rx dBm into PASS, MARGINAL_WARNING, and FAIL_OUT_OF_RANGE', () => {
    expect(classifyOpticalSignal(-18.4)).toEqual({
      band: 'PASS',
      canComplete: true,
      supervisorReviewRequired: false,
    });
    expect(classifyOpticalSignal(-25.0)).toEqual({
      band: 'PASS',
      canComplete: true,
      supervisorReviewRequired: false,
    });
    expect(classifyOpticalSignal(-26.2)).toEqual({
      band: 'MARGINAL_WARNING',
      canComplete: true,
      supervisorReviewRequired: true,
    });
    expect(classifyOpticalSignal(-28.5)).toEqual({
      band: 'FAIL_OUT_OF_RANGE',
      canComplete: false,
      supervisorReviewRequired: true,
    });
    expect(classifyOpticalSignal(-6.5)).toEqual({
      band: 'FAIL_OUT_OF_RANGE',
      canComplete: false,
      supervisorReviewRequired: true,
    });
  });

  it('rejects assigning OCCUPIED, FAULTY, or LOCKED_TRANSFER NAP ports on NEW_INSTALL', () => {
    const ports = makePorts();
    expect(
      planNapPortAllocation({
        workflowType: 'NEW_INSTALL',
        targetPorts: ports,
        selectedPortNumber: 1,
        subscriberId: 'sub-new',
      }).ok,
    ).toBe(false);
    expect(
      planNapPortAllocation({
        workflowType: 'NEW_INSTALL',
        targetPorts: ports,
        selectedPortNumber: 2,
        subscriberId: 'sub-new',
      }).ok,
    ).toBe(false);
    expect(
      planNapPortAllocation({
        workflowType: 'NEW_INSTALL',
        targetPorts: ports,
        selectedPortNumber: 3,
        subscriberId: 'sub-new',
      }).ok,
    ).toBe(false);

    const valid = planNapPortAllocation({
      workflowType: 'NEW_INSTALL',
      targetPorts: ports,
      selectedPortNumber: 4,
      subscriberId: 'sub-new',
    });
    expect(valid.ok).toBe(true);
  });

  it('retains old NAP port in LOCKED_TRANSFER during FB_ISSUE/CUST_ISSUE and releases it ONLY on COMPLETED', () => {
    const onException = validateCompletionRequirements({
      workflowType: 'TRANSFER',
      outcomeStatus: 'FB_ISSUE',
      opticalRxDbm: -31.0,
      hasCameraProof: true,
      hasSignatureOrHardcopy: false,
      selectedNapBoxId: 'nap-2',
      selectedPortNumber: 4,
      fiberTag: 'FT-NEW-04',
      onuSerial: 'ZTEG88990011',
      oldNapBoxId: 'nap-1',
      oldPortNumber: 2,
    });
    expect(onException.ok).toBe(true);
    expect(onException.releaseOldTransferPort).toBe(false);

    const onCompleted = validateCompletionRequirements({
      workflowType: 'TRANSFER',
      outcomeStatus: 'COMPLETED',
      opticalRxDbm: -19.2,
      hasCameraProof: true,
      hasSignatureOrHardcopy: true,
      selectedNapBoxId: 'nap-2',
      selectedPortNumber: 4,
      fiberTag: 'FT-NEW-04',
      onuSerial: 'ZTEG88990011',
      oldNapBoxId: 'nap-1',
      oldPortNumber: 2,
    });
    expect(onCompleted.ok).toBe(true);
    expect(onCompleted.releaseOldTransferPort).toBe(true);
  });

  it('blocks COMPLETED when optical signal is out of range or camera/signature proof is missing on NEW_INSTALL', () => {
    const badSignal = validateCompletionRequirements({
      workflowType: 'NEW_INSTALL',
      outcomeStatus: 'COMPLETED',
      opticalRxDbm: -29.4,
      hasCameraProof: true,
      hasSignatureOrHardcopy: true,
      selectedNapBoxId: 'nap-1',
      selectedPortNumber: 4,
      fiberTag: 'FT-104',
      onuSerial: 'HWTC12345678',
    });
    expect(badSignal.ok).toBe(false);
    expect(badSignal.error).toMatch(/optical|FB_ISSUE/i);

    const missingSig = validateCompletionRequirements({
      workflowType: 'NEW_INSTALL',
      outcomeStatus: 'COMPLETED',
      opticalRxDbm: -19.5,
      hasCameraProof: true,
      hasSignatureOrHardcopy: false,
      selectedNapBoxId: 'nap-1',
      selectedPortNumber: 4,
      fiberTag: 'FT-104',
      onuSerial: 'HWTC12345678',
    });
    expect(missingSig.ok).toBe(false);
    expect(missingSig.error).toMatch(/signature|hard-copy/i);
  });
});
