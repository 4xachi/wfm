import {
  OPTICAL_THRESHOLDS_DBM,
  type NapPortRecord,
  type OpticalSignalBand,
  type WorkOrderStatus,
  type WorkflowType,
} from './types';

export interface OpticalSignalEvaluation {
  band: OpticalSignalBand;
  canComplete: boolean;
  supervisorReviewRequired: boolean;
}

export function classifyOpticalSignal(rxDbm: number): OpticalSignalEvaluation {
  if (!Number.isFinite(rxDbm)) {
    return {
      band: 'FAIL_OUT_OF_RANGE',
      canComplete: false,
      supervisorReviewRequired: true,
    };
  }

  if (
    rxDbm <= OPTICAL_THRESHOLDS_DBM.maxPassDbm &&
    rxDbm >= OPTICAL_THRESHOLDS_DBM.minPassDbm
  ) {
    return {
      band: 'PASS',
      canComplete: true,
      supervisorReviewRequired: false,
    };
  }

  if (
    rxDbm < OPTICAL_THRESHOLDS_DBM.minPassDbm &&
    rxDbm >= OPTICAL_THRESHOLDS_DBM.minMarginalDbm
  ) {
    return {
      band: 'MARGINAL_WARNING',
      canComplete: true,
      supervisorReviewRequired: true,
    };
  }

  return {
    band: 'FAIL_OUT_OF_RANGE',
    canComplete: false,
    supervisorReviewRequired: true,
  };
}

export interface NapPortAllocationInput {
  workflowType: WorkflowType;
  targetPorts: NapPortRecord[];
  selectedPortNumber: number;
  subscriberId: string;
}

export function planNapPortAllocation(
  input: NapPortAllocationInput,
): { ok: boolean; error?: string } {
  const port = input.targetPorts.find(
    (p) => p.portNumber === input.selectedPortNumber,
  );
  if (!port) {
    return {
      ok: false,
      error: `NAP port ${input.selectedPortNumber} does not exist on selected NAP box.`,
    };
  }

  // On REPAIR, reusing the subscriber's own existing OCCUPIED port is valid
  if (
    input.workflowType === 'REPAIR' &&
    port.status === 'OCCUPIED' &&
    port.subscriberId === input.subscriberId
  ) {
    return { ok: true };
  }

  if (port.status !== 'FREE') {
    return {
      ok: false,
      error: `NAP port ${input.selectedPortNumber} is currently ${port.status} and cannot be assigned.`,
    };
  }

  return { ok: true };
}

export interface CompletionValidationInput {
  workflowType: WorkflowType;
  outcomeStatus: Extract<
    WorkOrderStatus,
    'COMPLETED' | 'FB_ISSUE' | 'CUST_ISSUE'
  >;
  opticalRxDbm?: number | null;
  hasCameraProof: boolean;
  hasSignatureOrHardcopy: boolean;
  selectedNapBoxId?: string | null;
  selectedPortNumber?: number | null;
  fiberTag?: string | null;
  onuSerial?: string | null;
  oldNapBoxId?: string | null;
  oldPortNumber?: number | null;
}

export interface CompletionValidationResult {
  ok: boolean;
  error?: string;
  opticalEvaluation?: OpticalSignalEvaluation;
  releaseOldTransferPort: boolean;
  supervisorReviewRequired: boolean;
}

export function validateCompletionRequirements(
  input: CompletionValidationInput,
): CompletionValidationResult {
  // Exception close-outs (FB_ISSUE / CUST_ISSUE) never release old TRANSFER ports prematurely
  if (input.outcomeStatus !== 'COMPLETED') {
    if (!input.hasCameraProof && input.outcomeStatus === 'FB_ISSUE') {
      return {
        ok: false,
        error: 'Camera evidence is mandatory when reporting an FB_ISSUE.',
        releaseOldTransferPort: false,
        supervisorReviewRequired: true,
      };
    }

    const opticalEval =
      typeof input.opticalRxDbm === 'number'
        ? classifyOpticalSignal(input.opticalRxDbm)
        : undefined;

    return {
      ok: true,
      opticalEvaluation: opticalEval,
      releaseOldTransferPort: false,
      supervisorReviewRequired: input.outcomeStatus === 'FB_ISSUE',
    };
  }

  if (!input.hasCameraProof) {
    return {
      ok: false,
      error: 'Mandatory camera-captured field photo evidence is missing.',
      releaseOldTransferPort: false,
      supervisorReviewRequired: false,
    };
  }

  if (typeof input.opticalRxDbm !== 'number') {
    return {
      ok: false,
      error: 'Post-work GPON optical Rx power reading (dBm) is required.',
      releaseOldTransferPort: false,
      supervisorReviewRequired: false,
    };
  }

  const opticalEval = classifyOpticalSignal(input.opticalRxDbm);
  if (!opticalEval.canComplete) {
    return {
      ok: false,
      error: `Optical signal ${input.opticalRxDbm.toFixed(1)} dBm is out of GPON pass thresholds (-8.0 to -27.9 dBm). Escalate as FB_ISSUE.`,
      opticalEvaluation: opticalEval,
      releaseOldTransferPort: false,
      supervisorReviewRequired: true,
    };
  }

  if (
    input.workflowType === 'NEW_INSTALL' ||
    input.workflowType === 'TRANSFER'
  ) {
    if (!input.selectedNapBoxId || !input.selectedPortNumber) {
      return {
        ok: false,
        error: 'Assigned NAP box and port number are required for installation/transfer.',
        releaseOldTransferPort: false,
        supervisorReviewRequired: false,
      };
    }
    if (!input.fiberTag?.trim() || !input.onuSerial?.trim()) {
      return {
        ok: false,
        error: 'Fiber drop tag and ONU/modem serial number are required.',
        releaseOldTransferPort: false,
        supervisorReviewRequired: false,
      };
    }
    if (!input.hasSignatureOrHardcopy) {
      return {
        ok: false,
        error: 'Subscriber digital signature or signed hard-copy work order proof is required.',
        releaseOldTransferPort: false,
        supervisorReviewRequired: false,
      };
    }
  }

  return {
    ok: true,
    opticalEvaluation: opticalEval,
    releaseOldTransferPort:
      input.workflowType === 'TRANSFER' &&
      Boolean(input.oldNapBoxId && input.oldPortNumber),
    supervisorReviewRequired: opticalEval.supervisorReviewRequired,
  };
}
