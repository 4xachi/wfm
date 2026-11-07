import { describe, expect, it } from 'vitest';
import {
  canTransitionWorkOrder,
  validateWorkOrderTransition,
} from '@/domain/workOrderLifecycle';

describe('Work-Order Lifecycle State Machine & Role Guards', () => {
  it('allows JOB_CONTROLLER to dispatch UNASSIGNED -> ASSIGNED with a technician', () => {
    const res = validateWorkOrderTransition({
      currentStatus: 'UNASSIGNED',
      nextStatus: 'ASSIGNED',
      actorRole: 'JOB_CONTROLLER',
      assignedTechId: 'tech-01',
    });
    expect(res.ok).toBe(true);
  });

  it('rejects UNASSIGNED -> ASSIGNED when assignedTechId is missing', () => {
    const res = validateWorkOrderTransition({
      currentStatus: 'UNASSIGNED',
      nextStatus: 'ASSIGNED',
      actorRole: 'JOB_CONTROLLER',
      assignedTechId: null,
    });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/technician/i);
  });

  it('allows TECHNICIAN to transition ASSIGNED -> WORKING -> COMPLETED', () => {
    expect(
      canTransitionWorkOrder('ASSIGNED', 'WORKING', 'TECHNICIAN'),
    ).toBe(true);
    expect(
      canTransitionWorkOrder('WORKING', 'COMPLETED', 'TECHNICIAN'),
    ).toBe(true);
  });

  it('forbids TECHNICIAN from skipping WORKING directly from ASSIGNED -> COMPLETED', () => {
    const res = validateWorkOrderTransition({
      currentStatus: 'ASSIGNED',
      nextStatus: 'COMPLETED',
      actorRole: 'TECHNICIAN',
      assignedTechId: 'tech-01',
    });
    expect(res.ok).toBe(false);
  });

  it('requires exceptionReasonCode when TECHNICIAN moves WORKING -> FB_ISSUE or CUST_ISSUE', () => {
    const missingReason = validateWorkOrderTransition({
      currentStatus: 'WORKING',
      nextStatus: 'FB_ISSUE',
      actorRole: 'TECHNICIAN',
      assignedTechId: 'tech-01',
      exceptionReasonCode: '',
    });
    expect(missingReason.ok).toBe(false);

    const validFbIssue = validateWorkOrderTransition({
      currentStatus: 'WORKING',
      nextStatus: 'FB_ISSUE',
      actorRole: 'TECHNICIAN',
      assignedTechId: 'tech-01',
      exceptionReasonCode: 'NAP_PORT_FULL',
    });
    expect(validFbIssue.ok).toBe(true);

    const validCustIssue = validateWorkOrderTransition({
      currentStatus: 'WORKING',
      nextStatus: 'CUST_ISSUE',
      actorRole: 'TECHNICIAN',
      assignedTechId: 'tech-01',
      exceptionReasonCode: 'SUBSCRIBER_UNAVAILABLE',
    });
    expect(validCustIssue.ok).toBe(true);
  });

  it('restricts FB_ISSUE -> ASSIGNED resolution to SUPERVISOR or ADMINISTRATOR', () => {
    expect(
      canTransitionWorkOrder('FB_ISSUE', 'ASSIGNED', 'TECHNICIAN'),
    ).toBe(false);
    expect(
      canTransitionWorkOrder('FB_ISSUE', 'ASSIGNED', 'JOB_CONTROLLER'),
    ).toBe(false);
    expect(
      canTransitionWorkOrder('FB_ISSUE', 'ASSIGNED', 'SUPERVISOR'),
    ).toBe(true);
  });

  it('allows JOB_CONTROLLER or ADMINISTRATOR to reschedule CUST_ISSUE -> ASSIGNED', () => {
    expect(
      canTransitionWorkOrder('CUST_ISSUE', 'ASSIGNED', 'TECHNICIAN'),
    ).toBe(false);
    expect(
      canTransitionWorkOrder('CUST_ISSUE', 'ASSIGNED', 'JOB_CONTROLLER'),
    ).toBe(true);
  });

  it('restricts CANCELLED strictly to JOB_CONTROLLER and ADMINISTRATOR, and blocks cancelling COMPLETED orders', () => {
    expect(
      canTransitionWorkOrder('ASSIGNED', 'CANCELLED', 'TECHNICIAN'),
    ).toBe(false);
    expect(
      canTransitionWorkOrder('ASSIGNED', 'CANCELLED', 'SUPERVISOR'),
    ).toBe(false);
    expect(
      canTransitionWorkOrder('ASSIGNED', 'CANCELLED', 'JOB_CONTROLLER'),
    ).toBe(true);
    expect(
      canTransitionWorkOrder('COMPLETED', 'CANCELLED', 'ADMINISTRATOR'),
    ).toBe(false);
  });
});
