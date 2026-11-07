import type { Role, WorkOrderStatus } from './types';

const ALLOWED_TRANSITIONS: Record<
  WorkOrderStatus,
  Partial<Record<WorkOrderStatus, Role[]>>
> = {
  UNASSIGNED: {
    ASSIGNED: ['JOB_CONTROLLER', 'ADMINISTRATOR'],
    CANCELLED: ['JOB_CONTROLLER', 'ADMINISTRATOR'],
  },
  ASSIGNED: {
    ASSIGNED: ['JOB_CONTROLLER', 'ADMINISTRATOR'], // Reassignment
    WORKING: ['TECHNICIAN', 'ADMINISTRATOR'],
    CANCELLED: ['JOB_CONTROLLER', 'ADMINISTRATOR'],
  },
  WORKING: {
    COMPLETED: ['TECHNICIAN', 'ADMINISTRATOR'],
    FB_ISSUE: ['TECHNICIAN', 'SUPERVISOR', 'ADMINISTRATOR'],
    CUST_ISSUE: ['TECHNICIAN', 'JOB_CONTROLLER', 'ADMINISTRATOR'],
    CANCELLED: ['JOB_CONTROLLER', 'ADMINISTRATOR'],
  },
  FB_ISSUE: {
    ASSIGNED: ['SUPERVISOR', 'ADMINISTRATOR'],
    CANCELLED: ['JOB_CONTROLLER', 'ADMINISTRATOR'],
  },
  CUST_ISSUE: {
    ASSIGNED: ['JOB_CONTROLLER', 'ADMINISTRATOR'],
    CANCELLED: ['JOB_CONTROLLER', 'ADMINISTRATOR'],
  },
  COMPLETED: {},
  CANCELLED: {},
};

export function canTransitionWorkOrder(
  currentStatus: WorkOrderStatus,
  nextStatus: WorkOrderStatus,
  actorRole: Role,
): boolean {
  const allowedRoles = ALLOWED_TRANSITIONS[currentStatus]?.[nextStatus];
  return Boolean(allowedRoles?.includes(actorRole));
}

export interface TransitionValidationInput {
  currentStatus: WorkOrderStatus;
  nextStatus: WorkOrderStatus;
  actorRole: Role;
  assignedTechId?: string | null;
  exceptionReasonCode?: string | null;
}

export interface TransitionValidationResult {
  ok: boolean;
  error?: string;
}

export function validateWorkOrderTransition(
  input: TransitionValidationInput,
): TransitionValidationResult {
  const {
    currentStatus,
    nextStatus,
    actorRole,
    assignedTechId,
    exceptionReasonCode,
  } = input;

  if (!canTransitionWorkOrder(currentStatus, nextStatus, actorRole)) {
    return {
      ok: false,
      error: `Role ${actorRole} cannot transition work order from ${currentStatus} to ${nextStatus}.`,
    };
  }

  if (nextStatus === 'ASSIGNED' && !assignedTechId?.trim()) {
    return {
      ok: false,
      error: 'A target technician must be selected when assigning a work order.',
    };
  }

  if (
    (nextStatus === 'FB_ISSUE' || nextStatus === 'CUST_ISSUE') &&
    !exceptionReasonCode?.trim()
  ) {
    return {
      ok: false,
      error: `An exception reason code is required when reporting ${nextStatus}.`,
    };
  }

  return { ok: true };
}
