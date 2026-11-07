'use client';

import React, { useMemo, useState } from 'react';
import {
  AlertOctagon,
  Camera,
  CheckCircle2,
  Compass,
  FileSignature,
  Lock,
  ShieldAlert,
  Wrench,
  XCircle,
} from 'lucide-react';
import { surfaceFetchJson } from '@/client/apiClient';
import { CaviteMapStage } from '@/components/map/CaviteMapStage';
import type {
  LocationDiscrepancyRecord,
  NapBoxRecord,
  Role,
  TechnicianTelemetryView,
  WorkOrderRecord,
} from '@/domain/types';
import {
  formatCoords,
  getOpticalBandStyle,
  type OpsStatusBanner,
} from './opsHelpers';

interface SupervisorGovernanceDeskProps {
  workOrders: WorkOrderRecord[];
  discrepancies: LocationDiscrepancyRecord[];
  napBoxes: NapBoxRecord[];
  technicians: TechnicianTelemetryView[];
  actorRole: Role;
  onRefresh: () => Promise<void>;
  onBanner: (banner: OpsStatusBanner) => void;
}

export function SupervisorGovernanceDesk({
  workOrders,
  discrepancies,
  napBoxes,
  technicians,
  actorRole,
  onRefresh,
  onBanner,
}: SupervisorGovernanceDeskProps) {
  const canGovern =
    actorRole === 'SUPERVISOR' || actorRole === 'ADMINISTRATOR';

  // 1. FB-ISSUE NetOps Escalations
  const fbIssues = useMemo(
    () => workOrders.filter((w) => w.status === 'FB_ISSUE'),
    [workOrders],
  );
  const [selectedFbId, setSelectedFbId] = useState<string | null>(null);
  const [fbResolutionNotes, setFbResolutionNotes] = useState(
    'Feeder trunk splice re-terminated at cabinet; spare port optical budget restored to -19.8 dBm.',
  );
  const [reassignTechId, setReassignTechId] = useState<string>('');

  // 2. >30m GPS Discrepancies
  const pendingDiscrepancies = useMemo(
    () => discrepancies.filter((d) => d.status === 'PENDING'),
    [discrepancies],
  );
  const [selectedDiscId, setSelectedDiscId] = useState<string | null>(null);
  const [discNotes, setDiscNotes] = useState('');

  // 3. Marginal Signal (-25.1 to -27.9 dBm) & Evidence Verification
  const reviewQueue = useMemo(
    () =>
      workOrders.filter(
        (w) => w.supervisorReviewRequired && w.status !== 'FB_ISSUE',
      ),
    [workOrders],
  );
  const [selectedReviewId, setSelectedReviewId] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState(
    'Verified optical meter proof and subscriber signature; marginal budget within Cavite drop tolerance.',
  );
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const activeFbWo =
    fbIssues.find((w) => w.id === selectedFbId) ?? fbIssues[0] ?? null;

  const activeDiscrepancy =
    discrepancies.find((d) => d.id === selectedDiscId) ??
    pendingDiscrepancies[0] ??
    discrepancies[0] ??
    null;

  const activeReviewWo =
    reviewQueue.find((w) => w.id === selectedReviewId) ??
    reviewQueue[0] ??
    null;

  async function handleResolveFbIssue(e: React.FormEvent) {
    e.preventDefault();
    if (!activeFbWo) return;
    setBusyKey('fb-resolve');
    try {
      const targetTech =
        reassignTechId || activeFbWo.assignedTechId || technicians[0]?.userId;
      await surfaceFetchJson('ops', '/api/work-orders/resolve-fb-issue', {
        method: 'POST',
        body: JSON.stringify({
          workOrderId: activeFbWo.id,
          resolutionNotes: fbResolutionNotes,
          reassignTechId: targetTech,
        }),
      });
      onBanner({
        tone: 'ok',
        message: `FB-ISSUE resolved on ${activeFbWo.ticketNumber} and returned to ASSIGNED for field completion.`,
      });
      await onRefresh();
    } catch (err) {
      onBanner({
        tone: 'fault',
        message:
          err instanceof Error ? err.message : 'Failed to resolve FB-ISSUE.',
      });
    } finally {
      setBusyKey(null);
    }
  }

  async function handleResolveDiscrepancy(decision: 'APPROVED' | 'REJECTED') {
    if (!activeDiscrepancy) return;
    setBusyKey(`disc-${decision}`);
    try {
      await surfaceFetchJson('ops', '/api/discrepancies/resolve', {
        method: 'POST',
        body: JSON.stringify({
          discrepancyId: activeDiscrepancy.id,
          decision,
          reviewNotes:
            discNotes.trim() ||
            (decision === 'APPROVED'
              ? 'Approved field-captured house gate pin after 3D street verification.'
              : 'Rejected drift; retained trusted subscriber coordinates.'),
        }),
      });
      onBanner({
        tone: decision === 'APPROVED' ? 'ok' : 'warn',
        message: `GPS discrepancy (${activeDiscrepancy.distanceMeters.toFixed(1)} m) ${decision.toLowerCase()} for ${activeDiscrepancy.ticketNumber}.`,
      });
      setDiscNotes('');
      await onRefresh();
    } catch (err) {
      onBanner({
        tone: 'fault',
        message:
          err instanceof Error ? err.message : 'Failed to resolve GPS diff.',
      });
    } finally {
      setBusyKey(null);
    }
  }

  async function handleApproveFieldProof() {
    if (!activeReviewWo) return;
    setBusyKey('approve-proof');
    try {
      await surfaceFetchJson('ops', '/api/work-orders/approve-review', {
        method: 'POST',
        body: JSON.stringify({
          workOrderId: activeReviewWo.id,
          notes: reviewNotes,
        }),
      });
      onBanner({
        tone: 'ok',
        message: `Field evidence & optical proof approved for ${activeReviewWo.ticketNumber}.`,
      });
      await onRefresh();
    } catch (err) {
      onBanner({
        tone: 'fault',
        message:
          err instanceof Error ? err.message : 'Evidence approval failed.',
      });
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div className="space-y-4">
      {!canGovern && (
        <div
          role="status"
          className="flex items-center gap-2.5 rounded-xl border p-3.5 text-xs"
          style={{
            backgroundColor: 'var(--status-warn-soft)',
            borderColor: 'var(--status-warn)',
            color: 'var(--text-primary)',
          }}
        >
          <Lock
            className="h-4 w-4 shrink-0"
            style={{ color: 'var(--status-warn)' }}
            aria-hidden="true"
          />
          <span>
            Read-Only Governance View: You are signed in as{' '}
            <strong className="font-mono-tabular">{actorRole}</strong>. Switch to{' '}
            <strong className="font-mono-tabular">SUPERVISOR</strong> or{' '}
            <strong className="font-mono-tabular">ADMINISTRATOR</strong> in the top bar to resolve FB-ISSUE escalations, approve &gt;30m GPS coordinate diffs, and sign off marginal optical dBm proof.
          </span>
        </div>
      )}

      {/* SECTION 1: FB-ISSUE NetOps Escalations Queue */}
      <section
        aria-label="FB-ISSUE NetOps Escalations Queue"
        className="rounded-xl border p-4 space-y-3"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        <div
          className="flex items-center justify-between gap-2 border-b pb-3"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <div className="flex items-center gap-2">
            <AlertOctagon
              className="h-4 w-4"
              style={{ color: 'var(--status-fault)' }}
              aria-hidden="true"
            />
            <div>
              <h2 className="text-sm font-semibold">
                FB-ISSUE NetOps Escalations Queue
              </h2>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Outside-plant feeder attenuation, damaged NAP ports, and trunk faults
              </p>
            </div>
          </div>
          <span
            className="font-mono-tabular rounded border px-2 py-0.5 text-xs font-semibold"
            style={{
              backgroundColor: 'var(--status-fault-soft)',
              borderColor: 'var(--status-fault)',
              color: 'var(--status-fault)',
            }}
          >
            {fbIssues.length} OPEN
          </span>
        </div>

        {fbIssues.length === 0 ? (
          <div className="text-xs py-4" style={{ color: 'var(--text-muted)' }}>
            Zero active FB-ISSUE outside-plant escalations in Cavite.
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 text-xs">
            <div className="lg:col-span-5 space-y-2">
              {fbIssues.map((wo) => {
                const selected = activeFbWo?.id === wo.id;
                return (
                  <button
                    key={wo.id}
                    type="button"
                    onClick={() => {
                      setSelectedFbId(wo.id);
                      setReassignTechId(wo.assignedTechId ?? '');
                    }}
                    className="w-full text-left rounded-lg border p-3 transition-colors"
                    style={{
                      backgroundColor: selected
                        ? 'var(--status-fault-soft)'
                        : 'var(--bg-elevated)',
                      borderColor: selected
                        ? 'var(--status-fault)'
                        : 'var(--border-subtle)',
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono-tabular font-bold">
                        {wo.ticketNumber}
                      </span>
                      {wo.opticalRxDbm !== null && (
                        <span
                          className="font-mono-tabular font-semibold"
                          style={{ color: 'var(--status-fault)' }}
                        >
                          {wo.opticalRxDbm.toFixed(1)} dBm
                        </span>
                      )}
                    </div>
                    <div className="font-medium mt-1">{wo.subscriberName}</div>
                    <div
                      className="font-mono-tabular text-[11px] mt-0.5"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {wo.exceptionReasonCode ?? 'PLANT_FAULT'} •{' '}
                      {wo.targetMunicipality} ({wo.targetBarangay})
                    </div>
                  </button>
                );
              })}
            </div>

            {activeFbWo && (
              <form
                onSubmit={handleResolveFbIssue}
                className="lg:col-span-7 rounded-lg border p-3.5 space-y-3"
                style={{
                  backgroundColor: 'var(--bg-elevated)',
                  borderColor: 'var(--border-subtle)',
                }}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-mono-tabular font-bold text-sm">
                      {activeFbWo.ticketNumber}
                    </span>
                    <span
                      className="ml-2 font-mono-tabular text-[11px]"
                      style={{ color: 'var(--status-fault)' }}
                    >
                      {activeFbWo.exceptionReasonCode}
                    </span>
                  </div>
                  <span className="font-mono-tabular text-[11px]">
                    NAP: {activeFbWo.assignedNapBoxId ?? '—'}{' '}
                    {activeFbWo.assignedPortNumber
                      ? `P${String(activeFbWo.assignedPortNumber).padStart(2, '0')}`
                      : ''}
                  </span>
                </div>

                <p style={{ color: 'var(--text-secondary)' }}>
                  {activeFbWo.exceptionNotes || activeFbWo.issueDescription}
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label
                      htmlFor="fb-reassign-tech"
                      className="block font-medium mb-1"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      Return to Technician
                    </label>
                    <select
                      id="fb-reassign-tech"
                      value={reassignTechId || activeFbWo.assignedTechId || ''}
                      onChange={(e) => setReassignTechId(e.target.value)}
                      className="w-full rounded-lg border px-2.5 py-2 min-h-9"
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        borderColor: 'var(--border-subtle)',
                        color: 'var(--text-primary)',
                      }}
                    >
                      {technicians.map((t) => (
                        <option key={t.userId} value={t.userId}>
                          {t.fullName} ({t.employeeCode} • {t.gpsFreshness})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="fb-optical-band"
                      className="block font-medium mb-1"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      Reported Optical Telemetry
                    </label>
                    <div
                      id="fb-optical-band"
                      className="font-mono-tabular rounded-lg border px-2.5 py-2 min-h-9 flex items-center"
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        borderColor: 'var(--border-subtle)',
                        color: 'var(--status-fault)',
                      }}
                    >
                      {activeFbWo.opticalRxDbm !== null
                        ? `${activeFbWo.opticalRxDbm.toFixed(1)} dBm (${activeFbWo.opticalSignalBand ?? 'FAIL'})`
                        : 'No optical reading attached'}
                    </div>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="fb-res-notes"
                    className="block font-medium mb-1"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    Outside-Plant Engineering Resolution Notes
                  </label>
                  <textarea
                    id="fb-res-notes"
                    rows={2}
                    required
                    value={fbResolutionNotes}
                    onChange={(e) => setFbResolutionNotes(e.target.value)}
                    className="w-full rounded-lg border px-2.5 py-2"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--text-primary)',
                    }}
                  />
                </div>

                <button
                  type="submit"
                  disabled={!canGovern || busyKey !== null}
                  className="inline-flex items-center gap-2 rounded-lg px-4 py-2 font-semibold min-h-10"
                  style={{
                    backgroundColor: 'var(--accent-blaze)',
                    color: 'var(--accent-blaze-ink)',
                  }}
                >
                  <Wrench className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Resolve & Return for Completion</span>
                </button>
              </form>
            )}
          </div>
        )}
      </section>

      {/* SECTION 2: 3D GPS Coordinate Mismatch Diff (>30m) */}
      <section
        aria-label="3D GPS Coordinate Mismatch Diff"
        className="rounded-xl border p-4 space-y-3"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        <div
          className="flex items-center justify-between gap-2 border-b pb-3"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <div className="flex items-center gap-2">
            <Compass
              className="h-4 w-4"
              style={{ color: 'var(--status-warn)' }}
              aria-hidden="true"
            />
            <div>
              <h2 className="text-sm font-semibold">
                3D GPS Coordinate Mismatch Diff (&gt;30m Threshold)
              </h2>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Trusted subscriber pin is retained until a Supervisor approves field-captured coordinates
              </p>
            </div>
          </div>
          <span
            className="font-mono-tabular rounded border px-2 py-0.5 text-xs font-semibold"
            style={{
              backgroundColor: 'var(--status-warn-soft)',
              borderColor: 'var(--status-warn)',
              color: 'var(--status-warn)',
            }}
          >
            {pendingDiscrepancies.length} PENDING
          </span>
        </div>

        {discrepancies.length === 0 ? (
          <div className="text-xs py-4" style={{ color: 'var(--text-muted)' }}>
            {canGovern
              ? 'No >30m subscriber coordinate discrepancies recorded.'
              : 'Sign in as SUPERVISOR or ADMINISTRATOR to load GPS coordinate diffs.'}
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start text-xs">
            <div className="xl:col-span-5 space-y-2.5">
              {discrepancies.map((d) => {
                const isSelected = activeDiscrepancy?.id === d.id;
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setSelectedDiscId(d.id)}
                    className="w-full text-left rounded-lg border p-3 transition-colors"
                    style={{
                      backgroundColor: isSelected
                        ? 'var(--accent-blaze-soft)'
                        : 'var(--bg-elevated)',
                      borderColor: isSelected
                        ? 'var(--accent-blaze)'
                        : 'var(--border-subtle)',
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono-tabular font-bold">
                        {d.ticketNumber}
                      </span>
                      <span
                        className="font-mono-tabular rounded border px-1.5 py-0.5 text-[10px] font-semibold"
                        style={{
                          backgroundColor:
                            d.status === 'PENDING'
                              ? 'var(--status-warn-soft)'
                              : 'var(--bg-surface)',
                          borderColor:
                            d.status === 'PENDING'
                              ? 'var(--status-warn)'
                              : 'var(--border-subtle)',
                          color:
                            d.status === 'PENDING'
                              ? 'var(--status-warn)'
                              : 'var(--text-secondary)',
                        }}
                      >
                        {d.status} • {d.distanceMeters.toFixed(1)} m
                      </span>
                    </div>
                    <div className="mt-1 font-medium">
                      {d.subscriberName} (Captured by {d.capturedByName})
                    </div>
                  </button>
                );
              })}

              {activeDiscrepancy && (
                <div
                  className="rounded-lg border p-3 space-y-2.5"
                  style={{
                    backgroundColor: 'var(--bg-elevated)',
                    borderColor: 'var(--border-subtle)',
                  }}
                >
                  <div className="grid grid-cols-2 gap-2">
                    <div
                      className="rounded border p-2"
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        borderColor: 'var(--border-subtle)',
                      }}
                    >
                      <div style={{ color: 'var(--text-muted)' }}>
                        Recorded Pin (Trusted)
                      </div>
                      <div
                        className="font-mono-tabular font-semibold mt-0.5"
                        style={{ color: 'var(--status-info)' }}
                      >
                        {formatCoords(
                          activeDiscrepancy.recordedLat,
                          activeDiscrepancy.recordedLng,
                        )}
                      </div>
                    </div>
                    <div
                      className="rounded border p-2"
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        borderColor: 'var(--border-subtle)',
                      }}
                    >
                      <div style={{ color: 'var(--text-muted)' }}>
                        Field Captured Pin
                      </div>
                      <div
                        className="font-mono-tabular font-semibold mt-0.5"
                        style={{ color: 'var(--accent-blaze)' }}
                      >
                        {formatCoords(
                          activeDiscrepancy.capturedLat,
                          activeDiscrepancy.capturedLng,
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="font-mono-tabular flex items-center justify-between">
                    <span>Measured Spatial Drift:</span>
                    <strong style={{ color: 'var(--status-warn)' }}>
                      {activeDiscrepancy.distanceMeters.toFixed(1)} m (&gt;30m gate)
                    </strong>
                  </div>

                  {activeDiscrepancy.status === 'PENDING' && (
                    <>
                      <div>
                        <label
                          htmlFor="disc-review-notes"
                          className="block font-medium mb-1"
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          Supervisor Coordinate Decision Notes
                        </label>
                        <input
                          id="disc-review-notes"
                          type="text"
                          value={discNotes}
                          onChange={(e) => setDiscNotes(e.target.value)}
                          placeholder="e.g. Confirmed drop enters corner gate on Access Rd"
                          className="w-full rounded-lg border px-2.5 py-1.5 min-h-9"
                          style={{
                            backgroundColor: 'var(--bg-surface)',
                            borderColor: 'var(--border-subtle)',
                            color: 'var(--text-primary)',
                          }}
                        />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={!canGovern || busyKey !== null}
                          onClick={() =>
                            void handleResolveDiscrepancy('APPROVED')
                          }
                          className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 font-semibold min-h-10"
                          style={{
                            backgroundColor: 'var(--status-ok)',
                            color: '#ffffff',
                          }}
                        >
                          <CheckCircle2
                            className="h-3.5 w-3.5"
                            aria-hidden="true"
                          />
                          <span>Approve New Coordinates</span>
                        </button>
                        <button
                          type="button"
                          disabled={!canGovern || busyKey !== null}
                          onClick={() =>
                            void handleResolveDiscrepancy('REJECTED')
                          }
                          className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 font-semibold min-h-10"
                          style={{
                            backgroundColor: 'var(--status-fault-soft)',
                            borderColor: 'var(--status-fault)',
                            color: 'var(--status-fault)',
                          }}
                        >
                          <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Reject & Retain Trusted Pin</span>
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="xl:col-span-7">
              <CaviteMapStage
                mode="supervisor-diff"
                selectedDiscrepancy={activeDiscrepancy}
                napBoxes={napBoxes}
                compactHeight
              />
            </div>
          </div>
        )}
      </section>

      {/* SECTION 3: Evidence & Marginal Signal (-25.1 to -27.9 dBm) Verification */}
      <section
        aria-label="Evidence and Marginal Optical Signal Verification"
        className="rounded-xl border p-4 space-y-3"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        <div
          className="flex items-center justify-between gap-2 border-b pb-3"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <div className="flex items-center gap-2">
            <ShieldAlert
              className="h-4 w-4"
              style={{ color: 'var(--accent-blaze)' }}
              aria-hidden="true"
            />
            <div>
              <h2 className="text-sm font-semibold">
                Evidence & Marginal Signal (-25.1 to -27.9 dBm) Verification
              </h2>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Inspect watermarked camera proof, SHA-256 digests, and subscriber signatures
              </p>
            </div>
          </div>
          <span
            className="font-mono-tabular rounded border px-2 py-0.5 text-xs font-semibold"
            style={{
              backgroundColor: 'var(--accent-blaze-soft)',
              borderColor: 'var(--accent-blaze)',
              color: 'var(--accent-blaze)',
            }}
          >
            {reviewQueue.length} AWAITING SIGN-OFF
          </span>
        </div>

        {reviewQueue.length === 0 ? (
          <div className="text-xs py-4" style={{ color: 'var(--text-muted)' }}>
            All marginal optical readings and field proof packages have been verified.
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 text-xs">
            <div className="lg:col-span-4 space-y-2">
              {reviewQueue.map((wo) => {
                const selected = activeReviewWo?.id === wo.id;
                const opt = getOpticalBandStyle(wo.opticalSignalBand);
                return (
                  <button
                    key={wo.id}
                    type="button"
                    onClick={() => setSelectedReviewId(wo.id)}
                    className="w-full text-left rounded-lg border p-3"
                    style={{
                      backgroundColor: selected
                        ? 'var(--accent-blaze-soft)'
                        : 'var(--bg-elevated)',
                      borderColor: selected
                        ? 'var(--accent-blaze)'
                        : 'var(--border-subtle)',
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono-tabular font-bold">
                        {wo.ticketNumber}
                      </span>
                      {wo.opticalRxDbm !== null && (
                        <span
                          className="font-mono-tabular rounded border px-1.5 py-0.5 text-[10px] font-semibold"
                          style={{
                            backgroundColor: opt.bg,
                            borderColor: opt.border,
                            color: opt.color,
                          }}
                        >
                          {wo.opticalRxDbm.toFixed(1)} dBm
                        </span>
                      )}
                    </div>
                    <div className="mt-1 font-medium">{wo.subscriberName}</div>
                    <div
                      className="font-mono-tabular text-[11px] mt-0.5"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {wo.evidence.length} proof item(s) • {wo.assignedTechName}
                    </div>
                  </button>
                );
              })}
            </div>

            {activeReviewWo && (
              <div
                className="lg:col-span-8 rounded-lg border p-3.5 space-y-3"
                style={{
                  backgroundColor: 'var(--bg-elevated)',
                  borderColor: 'var(--border-subtle)',
                }}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-mono-tabular font-bold text-sm">
                      {activeReviewWo.ticketNumber}
                    </span>
                    <span
                      className="ml-2"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      {activeReviewWo.summaryTitle}
                    </span>
                  </div>
                  {activeReviewWo.opticalRxDbm !== null && (
                    <span
                      className="font-mono-tabular rounded border px-2 py-0.5 font-semibold"
                      style={{
                        backgroundColor: 'var(--status-warn-soft)',
                        borderColor: 'var(--status-warn)',
                        color: 'var(--status-warn)',
                      }}
                    >
                      Rx {activeReviewWo.opticalRxDbm.toFixed(1)} dBm (
                      {activeReviewWo.opticalSignalBand})
                    </span>
                  )}
                </div>

                <div
                  className="font-mono-tabular text-[11px]"
                  style={{ color: 'var(--text-muted)' }}
                >
                  ONU: {activeReviewWo.onuSerial ?? '—'} • Fiber Tag:{' '}
                  {activeReviewWo.fiberTag ?? '—'} • Pin:{' '}
                  {formatCoords(
                    activeReviewWo.targetLat,
                    activeReviewWo.targetLng,
                  )}
                </div>

                {activeReviewWo.evidence.length === 0 ? (
                  <div
                    className="rounded border p-3"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--text-muted)',
                    }}
                  >
                    Seeded marginal-signal baseline record (no binary camera frames attached yet; field completions attach WebRTC camera photos + signature pad SVG/PNG with SHA-256 hashes).
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {activeReviewWo.evidence.map((ev) => {
                      const isSig =
                        ev.kind === 'SUBSCRIBER_SIGNATURE' ||
                        ev.kind === 'SIGNED_HARDCOPY';
                      return (
                        <div
                          key={ev.id}
                          className="rounded-lg border p-2.5 space-y-2"
                          style={{
                            backgroundColor: 'var(--bg-surface)',
                            borderColor: 'var(--border-subtle)',
                          }}
                        >
                          <div className="flex items-center justify-between gap-1.5">
                            <span className="inline-flex items-center gap-1 font-semibold">
                              {isSig ? (
                                <FileSignature
                                  className="h-3.5 w-3.5"
                                  aria-hidden="true"
                                />
                              ) : (
                                <Camera
                                  className="h-3.5 w-3.5"
                                  aria-hidden="true"
                                />
                              )}
                              {ev.kind}
                            </span>
                            <span
                              className="font-mono-tabular text-[10px]"
                              style={{ color: 'var(--text-muted)' }}
                            >
                              {ev.captureMode}
                            </span>
                          </div>
                          {ev.dataUrl && (
                            <img
                              src={ev.dataUrl}
                              alt={`${ev.kind} watermarked proof for ${activeReviewWo.ticketNumber}`}
                              className="w-full h-32 object-cover rounded border"
                              style={{ borderColor: 'var(--border-subtle)' }}
                            />
                          )}
                          <div
                            className="font-mono-tabular text-[10px] truncate"
                            style={{ color: 'var(--text-secondary)' }}
                            title={ev.watermark}
                          >
                            WM: {ev.watermark}
                          </div>
                          <div
                            className="font-mono-tabular text-[10px] break-all"
                            style={{ color: 'var(--status-info)' }}
                          >
                            SHA-256: {ev.sha256}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div>
                  <label
                    htmlFor="sup-proof-notes"
                    className="block font-medium mb-1"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    Supervisor Verification Sign-Off Notes
                  </label>
                  <input
                    id="sup-proof-notes"
                    type="text"
                    value={reviewNotes}
                    onChange={(e) => setReviewNotes(e.target.value)}
                    className="w-full rounded-lg border px-2.5 py-2 min-h-9"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--text-primary)',
                    }}
                  />
                </div>

                <button
                  type="button"
                  disabled={!canGovern || busyKey !== null}
                  onClick={() => void handleApproveFieldProof()}
                  className="inline-flex items-center gap-2 rounded-lg px-4 py-2 font-semibold min-h-10"
                  style={{
                    backgroundColor: 'var(--status-ok)',
                    color: '#ffffff',
                  }}
                >
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  <span>Approve Field Proof</span>
                </button>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
