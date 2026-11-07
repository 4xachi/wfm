'use client';

import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  CloudOff,
  MapPin,
  Navigation,
  Play,
  ShieldCheck,
  Wrench,
} from 'lucide-react';
import type {
  NapBoxRecord,
  WorkOrderPriority,
  WorkOrderRecord,
  WorkOrderStatus,
  WorkflowType,
} from '@/domain/types';

interface TechAssignedQueueTabProps {
  workOrders: WorkOrderRecord[];
  napBoxes: NapBoxRecord[];
  activeJobId: string | null;
  queuedWorkOrderIds: Set<string>;
  startingJobId: string | null;
  onSelectNavigate: (wo: WorkOrderRecord) => void;
  onStartJob: (wo: WorkOrderRecord) => void;
  onOpenExecute: (wo: WorkOrderRecord) => void;
}

type QueueFilter = 'ALL' | 'ACTIVE' | 'CLOSED';

function workflowBadgeStyle(wf: WorkflowType): {
  label: string;
  bg: string;
  border: string;
  color: string;
} {
  if (wf === 'REPAIR') {
    return {
      label: 'REPAIR',
      bg: 'var(--status-fault-soft)',
      border: 'var(--status-fault)',
      color: 'var(--status-fault)',
    };
  }
  if (wf === 'TRANSFER') {
    return {
      label: 'TRANSFER',
      bg: 'var(--status-warn-soft)',
      border: 'var(--status-warn)',
      color: 'var(--status-warn)',
    };
  }
  return {
    label: 'NEW_INSTALL',
    bg: 'var(--status-info-soft)',
    border: 'var(--status-info)',
    color: 'var(--status-info)',
  };
}

function priorityBadgeStyle(priority: WorkOrderPriority): {
  bg: string;
  border: string;
  color: string;
} {
  if (priority === 'URGENT') {
    return {
      bg: 'var(--status-fault-soft)',
      border: 'var(--status-fault)',
      color: 'var(--status-fault)',
    };
  }
  if (priority === 'HIGH') {
    return {
      bg: 'var(--accent-blaze-soft)',
      border: 'var(--accent-blaze)',
      color: 'var(--accent-blaze)',
    };
  }
  return {
    bg: 'var(--bg-elevated)',
    border: 'var(--border-subtle)',
    color: 'var(--text-secondary)',
  };
}

function statusMeta(status: WorkOrderStatus): {
  label: string;
  color: string;
  bg: string;
} {
  switch (status) {
    case 'WORKING':
      return {
        label: 'WORKING',
        color: 'var(--accent-blaze)',
        bg: 'var(--accent-blaze-soft)',
      };
    case 'COMPLETED':
      return {
        label: 'COMPLETED',
        color: 'var(--status-ok)',
        bg: 'var(--status-ok-soft)',
      };
    case 'FB_ISSUE':
    case 'CUST_ISSUE':
      return {
        label: status,
        color: 'var(--status-fault)',
        bg: 'var(--status-fault-soft)',
      };
    default:
      return {
        label: status,
        color: 'var(--status-info)',
        bg: 'var(--status-info-soft)',
      };
  }
}

export function TechAssignedQueueTab({
  workOrders,
  napBoxes,
  activeJobId,
  queuedWorkOrderIds,
  startingJobId,
  onSelectNavigate,
  onStartJob,
  onOpenExecute,
}: TechAssignedQueueTabProps) {
  const [filter, setFilter] = useState<QueueFilter>('ALL');

  const napMap = new Map(napBoxes.map((n) => [n.id, n]));

  const filtered = workOrders.filter((wo) => {
    const isActive = wo.status === 'ASSIGNED' || wo.status === 'WORKING';
    if (filter === 'ACTIVE') return isActive;
    if (filter === 'CLOSED') return !isActive;
    return true;
  });

  const activeCount = workOrders.filter(
    (w) => w.status === 'ASSIGNED' || w.status === 'WORKING',
  ).length;
  const closedCount = workOrders.length - activeCount;

  return (
    <div className="space-y-3">
      {/* Filter Pills */}
      <div
        className="grid grid-cols-3 gap-2 rounded-xl border p-1.5"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-subtle)',
        }}
        role="group"
        aria-label="Filter assigned field work orders"
      >
        {(
          [
            { id: 'ALL', label: `All (${workOrders.length})` },
            { id: 'ACTIVE', label: `Active (${activeCount})` },
            { id: 'CLOSED', label: `Closed (${closedCount})` },
          ] as const
        ).map((tab) => {
          const selected = filter === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              aria-pressed={selected}
              onClick={() => setFilter(tab.id)}
              className="min-h-12 rounded-lg px-3 text-xs font-semibold transition-colors font-mono-tabular"
              style={{
                backgroundColor: selected
                  ? 'var(--accent-blaze)'
                  : 'var(--bg-elevated)',
                color: selected
                  ? 'var(--accent-blaze-ink)'
                  : 'var(--text-secondary)',
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <div
          className="rounded-xl border p-6 text-center"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <CheckCircle2
            className="mx-auto h-8 w-8 mb-2"
            style={{ color: 'var(--status-ok)' }}
            aria-hidden="true"
          />
          <p className="text-sm font-semibold">No work orders match this filter</p>
          <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
            Assigned Cavite dispatches appear immediately via real-time SSE sync.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((wo) => {
            const wf = workflowBadgeStyle(wo.workflowType);
            const prio = priorityBadgeStyle(wo.priority);
            const st = statusMeta(wo.status);
            const isSelected = wo.id === activeJobId;
            const isQueuedOffline = queuedWorkOrderIds.has(wo.id);
            const nap = wo.assignedNapBoxId
              ? napMap.get(wo.assignedNapBoxId)
              : undefined;
            const isStarting = startingJobId === wo.id;

            return (
              <article
                key={wo.id}
                className="rounded-xl border p-4 transition-colors"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: isSelected
                    ? 'var(--accent-blaze)'
                    : 'var(--border-subtle)',
                  boxShadow: isSelected
                    ? '0 0 0 1px var(--accent-blaze)'
                    : undefined,
                }}
              >
                {/* Top row: Ticket + Workflow + Priority + Status */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-mono-tabular text-xs font-bold">
                      {wo.ticketNumber}
                    </span>
                    <span
                      className="rounded border px-2 py-0.5 text-[11px] font-bold tracking-wide"
                      style={{
                        backgroundColor: wf.bg,
                        borderColor: wf.border,
                        color: wf.color,
                      }}
                    >
                      {wf.label}
                    </span>
                    <span
                      className="rounded border px-2 py-0.5 text-[11px] font-semibold"
                      style={{
                        backgroundColor: prio.bg,
                        borderColor: prio.border,
                        color: prio.color,
                      }}
                    >
                      {wo.priority}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {isQueuedOffline && (
                      <span
                        className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] font-bold"
                        style={{
                          backgroundColor: 'var(--status-warn-soft)',
                          borderColor: 'var(--status-warn)',
                          color: 'var(--status-warn)',
                        }}
                      >
                        <CloudOff className="h-3 w-3" aria-hidden="true" />
                        QUEUED OFFLINE
                      </span>
                    )}
                    <span
                      className="rounded px-2 py-0.5 text-[11px] font-bold font-mono-tabular"
                      style={{ backgroundColor: st.bg, color: st.color }}
                    >
                      {st.label}
                    </span>
                  </div>
                </div>

                {/* Title & Subscriber */}
                <h2 className="mt-2 text-base font-semibold leading-snug">
                  {wo.summaryTitle}
                </h2>
                <p
                  className="mt-1 text-xs leading-relaxed"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {wo.issueDescription}
                </p>

                {/* Address & Coordinate Trust Strip */}
                <div
                  className="mt-3 rounded-lg border p-2.5 space-y-1.5 text-xs"
                  style={{
                    backgroundColor: 'var(--bg-elevated)',
                    borderColor: 'var(--border-subtle)',
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{wo.subscriberName}</span>
                    <span
                      className="font-mono-tabular"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {wo.subscriberAccount} • {wo.subscriberPlan}
                    </span>
                  </div>
                  <div
                    className="flex items-start gap-1.5"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    <MapPin
                      className="h-3.5 w-3.5 mt-0.5 shrink-0"
                      style={{ color: 'var(--accent-blaze)' }}
                      aria-hidden="true"
                    />
                    <span>
                      {wo.targetAddress}, Brgy. {wo.targetBarangay},{' '}
                      {wo.targetMunicipality}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    {wo.coordsVerified ? (
                      <span
                        className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-semibold"
                        style={{
                          backgroundColor: 'var(--status-ok-soft)',
                          color: 'var(--status-ok)',
                        }}
                      >
                        <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                        TRUSTED VERIFIED PIN
                      </span>
                    ) : (
                      <span
                        className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-semibold"
                        style={{
                          backgroundColor: 'var(--status-warn-soft)',
                          color: 'var(--status-warn)',
                        }}
                      >
                        <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                        UNVERIFIED (CAPTURE GPS)
                      </span>
                    )}

                    <span
                      className="font-mono-tabular text-[11px]"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {nap
                        ? `${nap.code}${
                            wo.assignedPortNumber
                              ? ` • P${String(wo.assignedPortNumber).padStart(2, '0')}`
                              : ''
                          }`
                        : `${wo.targetLat.toFixed(4)}, ${wo.targetLng.toFixed(4)}`}
                    </span>
                  </div>
                </div>

                {/* Action CTAs: min-h-12 & gap-2 */}
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => onSelectNavigate(wo)}
                    className="min-h-12 inline-flex items-center justify-center gap-2 rounded-lg border px-3 text-xs font-semibold transition-colors"
                    style={{
                      backgroundColor: 'var(--bg-elevated)',
                      borderColor: 'var(--border-strong)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    <Navigation className="h-4 w-4" aria-hidden="true" />
                    <span>3D Navigate</span>
                  </button>

                  {wo.status === 'ASSIGNED' ? (
                    <button
                      type="button"
                      disabled={isStarting}
                      onClick={() => onStartJob(wo)}
                      className="min-h-12 inline-flex items-center justify-center gap-2 rounded-lg px-3 text-xs font-semibold transition-opacity"
                      style={{
                        backgroundColor: 'var(--accent-blaze)',
                        color: 'var(--accent-blaze-ink)',
                      }}
                    >
                      <Play className="h-4 w-4" aria-hidden="true" />
                      <span>
                        {isStarting ? 'Starting…' : 'Start Job (WORKING)'}
                      </span>
                    </button>
                  ) : wo.status === 'WORKING' ? (
                    <button
                      type="button"
                      onClick={() => onOpenExecute(wo)}
                      className="min-h-12 inline-flex items-center justify-center gap-2 rounded-lg px-3 text-xs font-semibold transition-opacity"
                      style={{
                        backgroundColor: 'var(--accent-blaze)',
                        color: 'var(--accent-blaze-ink)',
                      }}
                    >
                      <Wrench className="h-4 w-4" aria-hidden="true" />
                      <span>Execute FTTH</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onOpenExecute(wo)}
                      className="min-h-12 inline-flex items-center justify-center gap-2 rounded-lg border px-3 text-xs font-semibold transition-colors"
                      style={{
                        backgroundColor: 'var(--bg-elevated)',
                        borderColor: 'var(--border-subtle)',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      <Clock className="h-4 w-4" aria-hidden="true" />
                      <span>Inspect Record</span>
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
