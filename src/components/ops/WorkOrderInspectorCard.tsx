'use client';

import React, { useEffect, useState } from 'react';
import {
  AlertOctagon,
  ArrowUpRight,
  Ban,
  CalendarClock,
  CheckCircle2,
  MapPin,
  Navigation,
  Phone,
  Truck,
  UserCheck,
} from 'lucide-react';
import { surfaceFetchJson } from '@/client/apiClient';
import type { RankedTechnicianSuggestion } from '@/domain/dispatchRecommender';
import type {
  NapBoxRecord,
  Role,
  WorkOrderRecord,
} from '@/domain/types';
import {
  formatCoords,
  formatDistance,
  formatEtaSeconds,
  getGpsHonestyBadge,
  getOpticalBandStyle,
  getPriorityBadge,
  getWorkOrderStatusBadge,
  type OpsStatusBanner,
  type OpsTabId,
} from './opsHelpers';

interface WorkOrderInspectorCardProps {
  workOrder: WorkOrderRecord | null;
  napBoxes: NapBoxRecord[];
  actorRole: Role;
  onRefresh: () => Promise<void>;
  onBanner: (banner: OpsStatusBanner) => void;
  onNavigateTab: (tab: OpsTabId) => void;
}

export function WorkOrderInspectorCard({
  workOrder,
  napBoxes,
  actorRole,
  onRefresh,
  onBanner,
  onNavigateTab,
}: WorkOrderInspectorCardProps) {
  const [suggestions, setSuggestions] = useState<RankedTechnicianSuggestion[]>(
    [],
  );
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [assignNotes, setAssignNotes] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [showCancelForm, setShowCancelForm] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const canDispatchOrCancel =
    actorRole === 'JOB_CONTROLLER' || actorRole === 'ADMINISTRATOR';

  useEffect(() => {
    setAssignNotes('');
    setCancelReason('');
    setShowCancelForm(false);

    if (!workOrder) {
      setSuggestions([]);
      return;
    }

    let cancelled = false;
    setLoadingSuggestions(true);
    surfaceFetchJson<{
      workOrderId: string;
      suggestions: RankedTechnicianSuggestion[];
    }>(
      'ops',
      `/api/dispatch/suggestions?workOrderId=${encodeURIComponent(workOrder.id)}`,
    )
      .then((res) => {
        if (!cancelled) setSuggestions(res.suggestions);
      })
      .catch(() => {
        if (!cancelled) setSuggestions([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingSuggestions(false);
      });

    return () => {
      cancelled = true;
    };
  }, [workOrder?.id, workOrder?.status]);

  if (!workOrder) {
    return (
      <div
        className="rounded-xl border p-5 flex flex-col items-center justify-center text-center min-h-72"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-subtle)',
          color: 'var(--text-muted)',
        }}
      >
        <MapPin className="h-6 w-6 mb-2" aria-hidden="true" />
        <p className="text-sm font-medium">
          Select a Cavite work order from the dispatch table or 3D map to inspect telemetry and technician street-ETA routing.
        </p>
      </div>
    );
  }

  const stBadge = getWorkOrderStatusBadge(workOrder.status);
  const prBadge = getPriorityBadge(workOrder.priority);
  const optBadge = getOpticalBandStyle(workOrder.opticalSignalBand);
  const assignedNap = napBoxes.find((n) => n.id === workOrder.assignedNapBoxId);
  const oldNap = napBoxes.find((n) => n.id === workOrder.oldNapBoxId);

  const canAssignTicket =
    canDispatchOrCancel &&
    (workOrder.status === 'UNASSIGNED' ||
      workOrder.status === 'ASSIGNED' ||
      workOrder.status === 'CUST_ISSUE');

  const canCancelTicket =
    canDispatchOrCancel &&
    workOrder.status !== 'COMPLETED' &&
    workOrder.status !== 'CANCELLED';

  const topSuggestion = suggestions[0] ?? null;

  async function handleAssignTech(techUserId: string, techName: string) {
    if (!workOrder) return;
    setBusyAction(`assign-${techUserId}`);
    try {
      await surfaceFetchJson('ops', '/api/work-orders/assign', {
        method: 'POST',
        body: JSON.stringify({
          workOrderId: workOrder.id,
          techUserId,
          notes:
            assignNotes.trim() ||
            (workOrder.status === 'CUST_ISSUE'
              ? 'Rescheduled dispatch window confirmed with subscriber.'
              : undefined),
        }),
      });
      onBanner({
        tone: 'ok',
        message: `${workOrder.ticketNumber} assigned to ${techName}.`,
      });
      setAssignNotes('');
      await onRefresh();
    } catch (err) {
      onBanner({
        tone: 'fault',
        message: err instanceof Error ? err.message : 'Assignment failed.',
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleCancelOrder(e: React.FormEvent) {
    e.preventDefault();
    if (!workOrder) return;
    setBusyAction('cancel');
    try {
      await surfaceFetchJson('ops', '/api/work-orders/cancel', {
        method: 'POST',
        body: JSON.stringify({
          workOrderId: workOrder.id,
          reason: cancelReason.trim() || 'Cancelled by NOC Job Controller',
        }),
      });
      onBanner({
        tone: 'warn',
        message: `${workOrder.ticketNumber} cancelled and logged in SHA-256 audit chain.`,
      });
      setShowCancelForm(false);
      await onRefresh();
    } catch (err) {
      onBanner({
        tone: 'fault',
        message: err instanceof Error ? err.message : 'Cancellation failed.',
      });
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <aside
      aria-label="Selected Work Order Inspector"
      className="rounded-xl border p-4 space-y-3.5"
      style={{
        backgroundColor: 'var(--bg-surface)',
        borderColor: 'var(--border-subtle)',
      }}
    >
      {/* Header */}
      <div
        className="flex flex-wrap items-start justify-between gap-2 border-b pb-3"
        style={{ borderColor: 'var(--border-subtle)' }}
      >
        <div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono-tabular text-sm font-bold">
              {workOrder.ticketNumber}
            </span>
            <span
              className="rounded border px-1.5 py-0.5 text-[11px] font-semibold"
              style={{
                backgroundColor: stBadge.bg,
                borderColor: stBadge.border,
                color: stBadge.color,
              }}
            >
              {stBadge.label}
            </span>
            <span
              className="rounded border px-1.5 py-0.5 text-[11px] font-semibold"
              style={{
                backgroundColor: prBadge.bg,
                borderColor: prBadge.border,
                color: prBadge.color,
              }}
            >
              {workOrder.priority}
            </span>
            <span
              className="font-mono-tabular rounded border px-1.5 py-0.5 text-[11px]"
              style={{
                backgroundColor: 'var(--bg-elevated)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-secondary)',
              }}
            >
              {workOrder.workflowType}
            </span>
          </div>
          <h3 className="mt-1 text-sm font-semibold">
            {workOrder.summaryTitle}
          </h3>
        </div>
        {(workOrder.status === 'FB_ISSUE' ||
          workOrder.supervisorReviewRequired) && (
          <button
            type="button"
            onClick={() => onNavigateTab('governance')}
            className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold"
            style={{
              backgroundColor: 'var(--status-fault-soft)',
              borderColor: 'var(--status-fault)',
              color: 'var(--status-fault)',
            }}
          >
            <span>Open NetOps Desk</span>
            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Subscriber & Optical Grid */}
      <div
        className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 rounded-lg border p-3 text-xs"
        style={{
          backgroundColor: 'var(--bg-elevated)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        <div>
          <div style={{ color: 'var(--text-muted)' }}>Subscriber</div>
          <div className="font-semibold">{workOrder.subscriberName}</div>
          <div
            className="font-mono-tabular mt-0.5"
            style={{ color: 'var(--text-secondary)' }}
          >
            {workOrder.subscriberAccount} • {workOrder.subscriberPlan}
          </div>
          <div
            className="font-mono-tabular mt-0.5 inline-flex items-center gap-1"
            style={{ color: 'var(--text-muted)' }}
          >
            <Phone className="h-3 w-3" aria-hidden="true" />
            {workOrder.subscriberPhone}
          </div>
        </div>
        <div>
          <div style={{ color: 'var(--text-muted)' }}>
            Cavite Target Pin{' '}
            <span
              style={{
                color: workOrder.coordsVerified
                  ? 'var(--status-ok)'
                  : 'var(--status-warn)',
              }}
            >
              ({workOrder.coordsVerified ? 'Verified' : 'Unverified'})
            </span>
          </div>
          <div className="font-medium">
            {workOrder.targetMunicipality} • {workOrder.targetBarangay}
          </div>
          <div className="truncate" style={{ color: 'var(--text-secondary)' }}>
            {workOrder.targetAddress}
          </div>
          <div
            className="font-mono-tabular mt-0.5"
            style={{ color: 'var(--status-info)' }}
          >
            {formatCoords(workOrder.targetLat, workOrder.targetLng)}
          </div>
        </div>
      </div>

      <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
        {workOrder.issueDescription}
      </p>

      {/* NAP / Optical / Transfer Lock Strip */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span
          className="font-mono-tabular rounded border px-2 py-1"
          style={{
            backgroundColor: 'var(--bg-elevated)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          NAP: {assignedNap?.code ?? workOrder.assignedNapBoxId ?? 'Auto'}{' '}
          {workOrder.assignedPortNumber
            ? `• P${String(workOrder.assignedPortNumber).padStart(2, '0')}`
            : ''}
        </span>
        {workOrder.opticalRxDbm !== null && (
          <span
            className="font-mono-tabular rounded border px-2 py-1 font-semibold"
            style={{
              backgroundColor: optBadge.bg,
              borderColor: optBadge.border,
              color: optBadge.color,
            }}
          >
            Rx {workOrder.opticalRxDbm.toFixed(1)} dBm
          </span>
        )}
        {workOrder.workflowType === 'TRANSFER' && workOrder.oldPortNumber && (
          <span
            className="font-mono-tabular rounded border px-2 py-1"
            style={{
              backgroundColor: 'var(--status-warn-soft)',
              borderColor: 'var(--status-warn)',
              color: 'var(--status-warn)',
            }}
          >
            LOCKED OLD: {oldNap?.code ?? workOrder.oldNapBoxId} P
            {String(workOrder.oldPortNumber).padStart(2, '0')}
          </span>
        )}
      </div>

      {/* CUST_ISSUE / Exception Callout */}
      {(workOrder.exceptionReasonCode || workOrder.exceptionNotes) && (
        <div
          className="rounded-lg border p-2.5 text-xs"
          style={{
            backgroundColor:
              workOrder.status === 'FB_ISSUE'
                ? 'var(--status-fault-soft)'
                : 'var(--status-warn-soft)',
            borderColor:
              workOrder.status === 'FB_ISSUE'
                ? 'var(--status-fault)'
                : 'var(--status-warn)',
          }}
        >
          <div className="flex items-center gap-1.5 font-semibold">
            {workOrder.status === 'CUST_ISSUE' ? (
              <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <AlertOctagon className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            <span className="font-mono-tabular">
              {workOrder.exceptionReasonCode ?? 'FIELD_EXCEPTION'}
            </span>
          </div>
          {workOrder.exceptionNotes && (
            <p className="mt-1" style={{ color: 'var(--text-primary)' }}>
              {workOrder.exceptionNotes}
            </p>
          )}
        </div>
      )}

      {/* Street-ETA Technician Suggestions */}
      <div
        className="rounded-lg border p-3 space-y-2.5"
        style={{
          backgroundColor: 'var(--bg-elevated)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold">
            <Navigation
              className="h-3.5 w-3.5"
              style={{ color: 'var(--accent-blaze)' }}
              aria-hidden="true"
            />
            {workOrder.status === 'CUST_ISSUE'
              ? 'Reschedule & Technician ETA'
              : 'Recommended Technicians by ETA'}
          </span>
          <span
            className="font-mono-tabular text-[11px]"
            style={{ color: 'var(--text-muted)' }}
          >
            {workOrder.assignedTechName
              ? `Current: ${workOrder.assignedTechName}`
              : 'Unassigned'}
          </span>
        </div>

        {canAssignTicket && (
          <div>
            <label
              htmlFor="ops-assign-notes"
              className="block text-[11px] font-medium mb-1"
              style={{ color: 'var(--text-secondary)' }}
            >
              {workOrder.status === 'CUST_ISSUE'
                ? 'Confirmed Reschedule Window / Dispatch Notes'
                : 'Dispatch Instructions (Optional)'}
            </label>
            <input
              id="ops-assign-notes"
              type="text"
              value={assignNotes}
              onChange={(e) => setAssignNotes(e.target.value)}
              placeholder={
                workOrder.status === 'CUST_ISSUE'
                  ? 'e.g. Confirmed Saturday 09:00 AM window with homeowner'
                  : 'e.g. Bring 150m drop cable & SC/APC fast connectors'
              }
              className="w-full rounded-lg border px-2.5 py-1.5 text-xs min-h-9"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
            />
          </div>
        )}

        {canAssignTicket && topSuggestion && (
          <button
            type="button"
            disabled={busyAction !== null}
            onClick={() =>
              void handleAssignTech(
                topSuggestion.userId,
                topSuggestion.fullName,
              )
            }
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold min-h-10 transition-opacity"
            style={{
              backgroundColor: 'var(--accent-blaze)',
              color: 'var(--accent-blaze-ink)',
            }}
          >
            <UserCheck className="h-3.5 w-3.5" aria-hidden="true" />
            <span>
              {workOrder.status === 'CUST_ISSUE'
                ? `Reschedule & Assign (${topSuggestion.fullName}, ${formatEtaSeconds(topSuggestion.streetEtaSeconds)})`
                : `Assign Closest Technician (${topSuggestion.fullName}, ${formatEtaSeconds(topSuggestion.streetEtaSeconds)})`}
            </span>
          </button>
        )}

        {!canDispatchOrCancel && (
          <div
            className="rounded border px-2.5 py-1.5 text-[11px]"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-muted)',
            }}
          >
            Read-only for {actorRole}: JOB_CONTROLLER or ADMINISTRATOR required for ticket dispatch and cancellation.
          </div>
        )}

        {loadingSuggestions ? (
          <div className="text-xs py-2" style={{ color: 'var(--text-muted)' }}>
            Calculating Cavite arterial & subdivision ETA…
          </div>
        ) : suggestions.length === 0 ? (
          <div className="text-xs py-2" style={{ color: 'var(--text-muted)' }}>
            No online technicians with active Cavite GPS fix.
          </div>
        ) : (
          <div className="space-y-1.5">
            {suggestions.map((sug, idx) => {
              const gpsMeta = getGpsHonestyBadge(sug.gpsFreshness, null);
              const isAssigned = workOrder.assignedTechId === sug.userId;
              return (
                <div
                  key={sug.userId}
                  className="flex items-center justify-between gap-2 rounded-lg border p-2 text-xs"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor:
                      idx === 0
                        ? 'var(--accent-blaze)'
                        : 'var(--border-subtle)',
                  }}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-semibold truncate">
                        #{idx + 1} {sug.fullName}
                      </span>
                      <span
                        className="font-mono-tabular text-[10px] rounded border px-1 py-0.2"
                        style={{
                          backgroundColor: gpsMeta.bg,
                          borderColor: gpsMeta.border,
                          color: gpsMeta.color,
                        }}
                      >
                        {sug.gpsFreshness === 'LIVE'
                          ? 'LIVE'
                          : 'STALE / LAST KNOWN'}
                      </span>
                      {isAssigned && (
                        <span
                          className="inline-flex items-center gap-0.5 text-[10px] font-semibold"
                          style={{ color: 'var(--status-ok)' }}
                        >
                          <CheckCircle2
                            className="h-3 w-3"
                            aria-hidden="true"
                          />
                          Current
                        </span>
                      )}
                    </div>
                    <div
                      className="font-mono-tabular text-[11px] mt-0.5 flex flex-wrap items-center gap-2"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      <span style={{ color: 'var(--text-primary)' }}>
                        ETA {formatEtaSeconds(sug.streetEtaSeconds)}
                      </span>
                      <span>{formatDistance(sug.streetDistanceMeters)}</span>
                      <span className="inline-flex items-center gap-1">
                        <Truck className="h-3 w-3" aria-hidden="true" />
                        {sug.vehicleType === 'l300_van' ? 'L300 Van' : '2-Wheeler'}
                      </span>
                      <span>{sug.activeJobCount} active</span>
                    </div>
                  </div>
                  {canAssignTicket && (
                    <button
                      type="button"
                      disabled={busyAction !== null}
                      onClick={() =>
                        void handleAssignTech(sug.userId, sug.fullName)
                      }
                      className="shrink-0 inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold"
                      style={{
                        backgroundColor: 'var(--bg-elevated)',
                        borderColor: 'var(--border-strong)',
                        color: 'var(--text-primary)',
                      }}
                    >
                      <UserCheck className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>
                        {workOrder.status === 'CUST_ISSUE'
                          ? 'Reschedule'
                          : 'Assign'}
                      </span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Controller / Admin Cancel Work Order */}
      {canCancelTicket && (
        <div
          className="border-t pt-3"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          {!showCancelForm ? (
            <button
              type="button"
              onClick={() => setShowCancelForm(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold"
              style={{
                backgroundColor: 'var(--status-fault-soft)',
                borderColor: 'var(--status-fault)',
                color: 'var(--status-fault)',
              }}
            >
              <Ban className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Cancel Work Order</span>
            </button>
          ) : (
            <form onSubmit={handleCancelOrder} className="space-y-2">
              <label
                htmlFor="ops-cancel-reason"
                className="block text-xs font-medium"
                style={{ color: 'var(--text-secondary)' }}
              >
                Cancellation Reason (Restores LOCKED_TRANSFER ports if applicable)
              </label>
              <input
                id="ops-cancel-reason"
                type="text"
                required
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="e.g. Duplicate intake or subscriber withdrew request"
                className="w-full rounded-lg border px-2.5 py-1.5 text-xs min-h-9"
                style={{
                  backgroundColor: 'var(--bg-elevated)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              />
              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  disabled={busyAction !== null}
                  className="rounded-lg border px-3 py-1.5 text-xs font-semibold"
                  style={{
                    backgroundColor: 'var(--status-fault)',
                    borderColor: 'var(--status-fault)',
                    color: '#ffffff',
                  }}
                >
                  Confirm Cancellation
                </button>
                <button
                  type="button"
                  onClick={() => setShowCancelForm(false)}
                  className="rounded-lg border px-3 py-1.5 text-xs font-medium"
                  style={{
                    backgroundColor: 'var(--bg-elevated)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  Abort
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </aside>
  );
}
