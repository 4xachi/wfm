'use client';

import React, { useMemo, useState } from 'react';
import {
  Filter,
  Radio,
  Search,
  Truck,
  WifiOff,
  Clock,
} from 'lucide-react';
import { CaviteMapStage } from '@/components/map/CaviteMapStage';
import type {
  NapBoxRecord,
  Role,
  TechnicianTelemetryView,
  WorkOrderPriority,
  WorkOrderRecord,
  WorkOrderStatus,
  WorkflowType,
} from '@/domain/types';
import { NapOccupancyPanel } from './NapOccupancyPanel';
import { WorkOrderInspectorCard } from './WorkOrderInspectorCard';
import {
  formatCoords,
  getGpsHonestyBadge,
  getPriorityBadge,
  getWorkOrderStatusBadge,
  type OpsStatusBanner,
  type OpsTabId,
} from './opsHelpers';

interface OpsFleetDispatchTabProps {
  workOrders: WorkOrderRecord[];
  napBoxes: NapBoxRecord[];
  technicians: TechnicianTelemetryView[];
  actorRole: Role;
  embeddedInSplitScreen?: boolean;
  selectedWorkOrderId: string | null;
  onSelectWorkOrderId: (id: string) => void;
  onRefresh: () => Promise<void>;
  onBanner: (banner: OpsStatusBanner) => void;
  onNavigateTab: (tab: OpsTabId) => void;
}

const STATUS_FILTERS: Array<WorkOrderStatus | 'ALL'> = [
  'ALL',
  'UNASSIGNED',
  'ASSIGNED',
  'WORKING',
  'CUST_ISSUE',
  'FB_ISSUE',
  'COMPLETED',
  'CANCELLED',
];

export function OpsFleetDispatchTab({
  workOrders,
  napBoxes,
  technicians,
  actorRole,
  embeddedInSplitScreen = false,
  selectedWorkOrderId,
  onSelectWorkOrderId,
  onRefresh,
  onBanner,
  onNavigateTab,
}: OpsFleetDispatchTabProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<WorkOrderStatus | 'ALL'>(
    'ALL',
  );
  const [workflowFilter, setWorkflowFilter] = useState<WorkflowType | 'ALL'>(
    'ALL',
  );
  const [priorityFilter, setPriorityFilter] = useState<
    WorkOrderPriority | 'ALL'
  >('ALL');

  const filteredOrders = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return workOrders.filter((wo) => {
      if (statusFilter !== 'ALL' && wo.status !== statusFilter) return false;
      if (workflowFilter !== 'ALL' && wo.workflowType !== workflowFilter)
        return false;
      if (priorityFilter !== 'ALL' && wo.priority !== priorityFilter)
        return false;
      if (!q) return true;
      return (
        wo.ticketNumber.toLowerCase().includes(q) ||
        wo.subscriberName.toLowerCase().includes(q) ||
        wo.subscriberAccount.toLowerCase().includes(q) ||
        wo.targetMunicipality.toLowerCase().includes(q) ||
        wo.targetBarangay.toLowerCase().includes(q) ||
        (wo.assignedTechName?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [workOrders, searchQuery, statusFilter, workflowFilter, priorityFilter]);

  const selectedWorkOrder =
    workOrders.find((w) => w.id === selectedWorkOrderId) ??
    filteredOrders[0] ??
    null;

  return (
    <div className="space-y-4">
      {/* Top Row: 3D Cavite Map Stage + Strict GPS Honesty Technician Roster */}
      <div
        className={`grid grid-cols-1 ${
          embeddedInSplitScreen ? 'gap-3' : 'xl:grid-cols-12 gap-4'
        }`}
      >
        <div className={embeddedInSplitScreen ? '' : 'xl:col-span-8'}>
          <CaviteMapStage
            mode="ops-fleet"
            workOrders={filteredOrders}
            selectedWorkOrder={selectedWorkOrder}
            onSelectWorkOrder={onSelectWorkOrderId}
            napBoxes={napBoxes}
            technicians={technicians}
            compactHeight={embeddedInSplitScreen}
          />
        </div>

        <section
          aria-label="Technician Fleet Roster"
          className={`rounded-xl border p-3.5 flex flex-col ${
            embeddedInSplitScreen ? '' : 'xl:col-span-4'
          }`}
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <div
            className="flex items-center justify-between gap-2 border-b pb-2.5 mb-2.5"
            style={{ borderColor: 'var(--border-subtle)' }}
          >
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider">
                Field Fleet Telemetry Roster
              </h2>
              <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                Live telemetry &amp; last-known GPS coordinates
              </p>
            </div>
            <span
              className="font-mono-tabular rounded border px-2 py-0.5 text-xs font-semibold"
              style={{
                backgroundColor: 'var(--status-ok-soft)',
                borderColor: 'var(--status-ok)',
                color: 'var(--status-ok)',
              }}
            >
              {technicians.filter((t) => t.gpsFreshness === 'LIVE').length}/
              {technicians.length} LIVE
            </span>
          </div>

          <div className="space-y-2 overflow-y-auto max-h-[450px]">
            {technicians.map((tech) => {
              const gps = getGpsHonestyBadge(
                tech.gpsFreshness,
                tech.lastGpsAt,
              );
              const StatusIcon =
                tech.gpsFreshness === 'LIVE'
                  ? Radio
                  : tech.gpsFreshness === 'STALE'
                  ? Clock
                  : WifiOff;

              return (
                <div
                  key={tech.userId}
                  className="rounded-lg border p-2.5 text-xs"
                  style={{
                    backgroundColor: 'var(--bg-elevated)',
                    borderColor: 'var(--border-subtle)',
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <span className="font-semibold">{tech.fullName}</span>
                      <span
                        className="font-mono-tabular ml-1.5 text-[11px]"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        {tech.employeeCode}
                      </span>
                    </div>
                    <span
                      className="font-mono-tabular inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-semibold shrink-0"
                      style={{
                        backgroundColor: gps.bg,
                        borderColor: gps.border,
                        color: gps.color,
                      }}
                    >
                      <StatusIcon className="h-3 w-3" aria-hidden="true" />
                      {gps.label}
                    </span>
                  </div>

                  <div
                    className="mt-1.5 flex flex-wrap items-center justify-between gap-2"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    <span className="inline-flex items-center gap-1">
                      <Truck className="h-3 w-3" aria-hidden="true" />
                      {tech.vehicleType === 'l300_van'
                        ? 'L300 Splice Van'
                        : '2-Wheeler Rapid'}{' '}
                      • {tech.homeBarangay}
                    </span>
                    <span className="font-mono-tabular font-semibold">
                      {tech.activeJobCount} job(s)
                    </span>
                  </div>

                  <div
                    className="mt-1 font-mono-tabular text-[11px] flex items-center justify-between gap-2"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    <span>{formatCoords(tech.lastLat, tech.lastLng)}</span>
                    <span>
                      {tech.gpsFreshness === 'OFFLINE'
                        ? 'Session Logged Out'
                        : tech.lastSpeedKmh !== null
                        ? `${tech.lastSpeedKmh} km/h`
                        : '0 km/h'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {/* NAP Split-Box Occupancy Strip + Port Matrix Modal */}
      <NapOccupancyPanel
        napBoxes={napBoxes}
        highlightedNapBoxId={selectedWorkOrder?.assignedNapBoxId}
      />

      {/* Bottom Row: Filterable Work Orders Table + Selected Ticket Inspector */}
      <div
        className={`grid grid-cols-1 ${
          embeddedInSplitScreen ? 'gap-3' : 'xl:grid-cols-12 gap-4'
        } items-start`}
      >
        <section
          aria-label="Cavite Work Orders Queue"
          className={`rounded-xl border p-3.5 ${
            embeddedInSplitScreen ? '' : 'xl:col-span-7'
          }`}
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          {/* Multi-facet Filter Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div className="relative flex-1 min-w-52">
              <Search
                className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ color: 'var(--text-muted)' }}
                aria-hidden="true"
              />
              <input
                type="search"
                aria-label="Search tickets, subscribers, barangay, or technician"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search ticket #, subscriber, municipality, tech…"
                className="w-full rounded-lg border pl-8 pr-3 py-1.5 text-xs min-h-9"
                style={{
                  backgroundColor: 'var(--bg-elevated)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>

            <div className="flex items-center gap-2">
              <Filter
                className="h-3.5 w-3.5"
                style={{ color: 'var(--text-muted)' }}
                aria-hidden="true"
              />
              <select
                aria-label="Filter by workflow type"
                value={workflowFilter}
                onChange={(e) =>
                  setWorkflowFilter(e.target.value as WorkflowType | 'ALL')
                }
                className="rounded-lg border px-2.5 py-1.5 text-xs min-h-9"
                style={{
                  backgroundColor: 'var(--bg-elevated)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              >
                <option value="ALL">All Workflows</option>
                <option value="NEW_INSTALL">NEW_INSTALL</option>
                <option value="REPAIR">REPAIR</option>
                <option value="TRANSFER">TRANSFER</option>
              </select>

              <select
                aria-label="Filter by priority"
                value={priorityFilter}
                onChange={(e) =>
                  setPriorityFilter(
                    e.target.value as WorkOrderPriority | 'ALL',
                  )
                }
                className="rounded-lg border px-2.5 py-1.5 text-xs min-h-9"
                style={{
                  backgroundColor: 'var(--bg-elevated)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              >
                <option value="ALL">All Priorities</option>
                <option value="URGENT">URGENT</option>
                <option value="HIGH">HIGH</option>
                <option value="NORMAL">NORMAL</option>
              </select>
            </div>
          </div>

          {/* Status Filter Pills */}
          <div className="flex flex-wrap gap-1.5 mb-3">
            {STATUS_FILTERS.map((st) => {
              const active = statusFilter === st;
              const count =
                st === 'ALL'
                  ? workOrders.length
                  : workOrders.filter((w) => w.status === st).length;
              return (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  className="font-mono-tabular rounded-md border px-2 py-1 text-[11px] font-medium transition-colors"
                  style={{
                    backgroundColor: active
                      ? 'var(--accent-blaze)'
                      : 'var(--bg-elevated)',
                    borderColor: active
                      ? 'var(--accent-blaze)'
                      : 'var(--border-subtle)',
                    color: active
                      ? 'var(--accent-blaze-ink)'
                      : 'var(--text-secondary)',
                  }}
                >
                  {st} ({count})
                </button>
              );
            })}
          </div>

          {/* Dense Telecom Work Order Table */}
          <div
            className="overflow-x-auto rounded-lg border max-h-[460px] overflow-y-auto"
            style={{ borderColor: 'var(--border-subtle)' }}
          >
            <table className="w-full text-left border-collapse text-xs">
              <thead
                className="sticky top-0 z-10 text-[11px] uppercase tracking-wider"
                style={{
                  backgroundColor: 'var(--bg-elevated)',
                  color: 'var(--text-muted)',
                }}
              >
                <tr>
                  <th className="py-2.5 px-3 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
                    Ticket
                  </th>
                  <th className="py-2.5 px-3 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
                    Subscriber / Area
                  </th>
                  <th className="py-2.5 px-3 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
                    Type / SLA
                  </th>
                  <th className="py-2.5 px-3 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
                    Status
                  </th>
                  <th className="py-2.5 px-3 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
                    Tech / Rx dBm
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="py-8 text-center"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      No work orders match the active filter criteria.
                    </td>
                  </tr>
                ) : (
                  filteredOrders.map((wo) => {
                    const isSelected = selectedWorkOrder?.id === wo.id;
                    const st = getWorkOrderStatusBadge(wo.status);
                    const pr = getPriorityBadge(wo.priority);

                    return (
                      <tr
                        key={wo.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => onSelectWorkOrderId(wo.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            onSelectWorkOrderId(wo.id);
                          }
                        }}
                        className="border-b transition-colors h-10"
                        style={{
                          borderColor: 'var(--border-subtle)',
                          backgroundColor: isSelected
                            ? 'var(--accent-blaze-soft)'
                            : 'transparent',
                        }}
                      >
                        <td className="py-2 px-3 font-mono-tabular font-semibold whitespace-nowrap">
                          {wo.ticketNumber}
                        </td>
                        <td className="py-2 px-3">
                          <div className="font-medium truncate max-w-44">
                            {wo.subscriberName}
                          </div>
                          <div
                            className="text-[11px] truncate max-w-44"
                            style={{ color: 'var(--text-muted)' }}
                          >
                            {wo.targetMunicipality} • {wo.targetBarangay}
                          </div>
                        </td>
                        <td className="py-2 px-3 whitespace-nowrap">
                          <span className="font-mono-tabular text-[11px]">
                            {wo.workflowType}
                          </span>
                          <span
                            className="ml-1.5 rounded border px-1 py-0.5 text-[10px] font-semibold"
                            style={{
                              backgroundColor: pr.bg,
                              borderColor: pr.border,
                              color: pr.color,
                            }}
                          >
                            {wo.priority}
                          </span>
                        </td>
                        <td className="py-2 px-3 whitespace-nowrap">
                          <span
                            className="rounded border px-1.5 py-0.5 text-[10px] font-semibold"
                            style={{
                              backgroundColor: st.bg,
                              borderColor: st.border,
                              color: st.color,
                            }}
                          >
                            {st.label}
                          </span>
                        </td>
                        <td className="py-2 px-3 whitespace-nowrap">
                          <div className="truncate max-w-36">
                            {wo.assignedTechName ?? (
                              <span style={{ color: 'var(--text-muted)' }}>
                                Unassigned
                              </span>
                            )}
                          </div>
                          {wo.opticalRxDbm !== null && (
                            <div
                              className="font-mono-tabular text-[11px]"
                              style={{ color: 'var(--text-muted)' }}
                            >
                              {wo.opticalRxDbm.toFixed(1)} dBm
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        <div className={embeddedInSplitScreen ? '' : 'xl:col-span-5'}>
          <WorkOrderInspectorCard
            workOrder={selectedWorkOrder}
            napBoxes={napBoxes}
            actorRole={actorRole}
            onRefresh={onRefresh}
            onBanner={onBanner}
            onNavigateTab={onNavigateTab}
          />
        </div>
      </div>
    </div>
  );
}
