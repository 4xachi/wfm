'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Crosshair,
  Lock,
  MapPin,
  Play,
  ShieldCheck,
} from 'lucide-react';
import { evaluateSubscriberCoordinateCapture } from '@/domain/gpsIntegrity';
import {
  classifyOpticalSignal,
  validateCompletionRequirements,
} from '@/domain/opticalAndNap';
import type { NapBoxRecord, WorkOrderRecord } from '@/domain/types';
import { CameraEvidenceCapture } from './CameraEvidenceCapture';
import { FieldCloseOutPanel } from './FieldCloseOutPanel';
import { NapPortMatrixSelector } from './NapPortMatrixSelector';
import { OpticalPowerDiagnosticCard } from './OpticalPowerDiagnosticCard';
import { SubscriberSignaturePad } from './SubscriberSignaturePad';
import {
  CUST_ISSUE_REASONS,
  FB_ISSUE_REASONS,
  type DraftEvidenceItem,
  type SubmitOutcomePayload,
} from './techTypes';

interface TechGuidedExecuteTabProps {
  activeJob: WorkOrderRecord | null;
  napBoxes: NapBoxRecord[];
  techEmployeeCode: string;
  activeTechPosition: { lat: number; lng: number } | null;
  externalCapturedPin: { lat: number; lng: number } | null;
  isStartingJob: boolean;
  isSubmittingOutcome: boolean;
  onStartJob: (wo: WorkOrderRecord) => void;
  onSubmitOutcome: (
    wo: WorkOrderRecord,
    payload: Omit<SubmitOutcomePayload, 'idempotencyKey'>,
  ) => Promise<void>;
}

export function TechGuidedExecuteTab({
  activeJob,
  napBoxes,
  techEmployeeCode,
  activeTechPosition,
  externalCapturedPin,
  isStartingJob,
  isSubmittingOutcome,
  onStartJob,
  onSubmitOutcome,
}: TechGuidedExecuteTabProps) {
  const [selectedNapBoxId, setSelectedNapBoxId] = useState('');
  const [selectedPortNumber, setSelectedPortNumber] = useState<number | null>(
    null,
  );
  const [fiberTag, setFiberTag] = useState('');
  const [onuSerial, setOnuSerial] = useState('');
  const [opticalDbm, setOpticalDbm] = useState<number>(-19.4);
  const [capturedPin, setCapturedPin] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [evidenceItems, setEvidenceItems] = useState<DraftEvidenceItem[]>([]);
  const [exceptionKind, setExceptionKind] = useState<'FB_ISSUE' | 'CUST_ISSUE'>(
    'FB_ISSUE',
  );
  const [exceptionReasonCode, setExceptionReasonCode] = useState(
    FB_ISSUE_REASONS[0].code,
  );
  const [exceptionNotes, setExceptionNotes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!activeJob) return;
    setSelectedNapBoxId(activeJob.assignedNapBoxId ?? napBoxes[0]?.id ?? '');
    setSelectedPortNumber(activeJob.assignedPortNumber ?? null);
    setFiberTag(activeJob.fiberTag ?? '');
    setOnuSerial(activeJob.onuSerial ?? '');
    setOpticalDbm(
      typeof activeJob.opticalRxDbm === 'number'
        ? activeJob.opticalRxDbm
        : -19.4,
    );
    setCapturedPin(
      activeJob.coordsVerified
        ? { lat: activeJob.targetLat, lng: activeJob.targetLng }
        : null,
    );
    setEvidenceItems([]);
    setExceptionKind('FB_ISSUE');
    setExceptionReasonCode(FB_ISSUE_REASONS[0].code);
    setExceptionNotes('');
    setFormError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeJob?.id]);

  useEffect(() => {
    if (externalCapturedPin) {
      setCapturedPin(externalCapturedPin);
    }
  }, [externalCapturedPin]);

  const activeNap = useMemo(
    () => napBoxes.find((n) => n.id === selectedNapBoxId) ?? null,
    [napBoxes, selectedNapBoxId],
  );
  const oldNap = useMemo(
    () =>
      activeJob?.oldNapBoxId
        ? napBoxes.find((n) => n.id === activeJob.oldNapBoxId) ?? null
        : null,
    [napBoxes, activeJob?.oldNapBoxId],
  );

  if (!activeJob) {
    return (
      <div
        className="rounded-xl border p-6 text-center"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        <p className="text-sm font-semibold">
          Select an assigned work order from the Assigned Queue to execute.
        </p>
      </div>
    );
  }

  const isClosed =
    activeJob.status === 'COMPLETED' ||
    activeJob.status === 'FB_ISSUE' ||
    activeJob.status === 'CUST_ISSUE' ||
    activeJob.status === 'CANCELLED';
  const needsStart = activeJob.status === 'ASSIGNED';

  const opticalEval = classifyOpticalSignal(opticalDbm);
  const hasCameraProof = evidenceItems.some((e) => e.kind.startsWith('CAMERA_'));
  const existingSignature =
    evidenceItems.find((e) => e.kind === 'SUBSCRIBER_SIGNATURE') ?? null;
  const hasHardcopy = evidenceItems.some((e) => e.kind === 'SIGNED_HARDCOPY');

  const completionCheck = validateCompletionRequirements({
    workflowType: activeJob.workflowType,
    outcomeStatus: 'COMPLETED',
    opticalRxDbm: opticalDbm,
    hasCameraProof,
    hasSignatureOrHardcopy: Boolean(existingSignature || hasHardcopy),
    selectedNapBoxId,
    selectedPortNumber,
    fiberTag,
    onuSerial,
    oldNapBoxId: activeJob.oldNapBoxId,
    oldPortNumber: activeJob.oldPortNumber,
  });

  const gpsPreview = capturedPin
    ? evaluateSubscriberCoordinateCapture({
        recordedLat: activeJob.coordsVerified ? activeJob.targetLat : null,
        recordedLng: activeJob.coordsVerified ? activeJob.targetLng : null,
        coordsVerified: activeJob.coordsVerified,
        capturedLat: capturedPin.lat,
        capturedLng: capturedPin.lng,
      })
    : null;

  function captureCurrentGpsPin() {
    const base = activeTechPosition ?? {
      lat: activeJob!.targetLat,
      lng: activeJob!.targetLng,
    };
    setCapturedPin({
      lat: Number(base.lat.toFixed(6)),
      lng: Number(base.lng.toFixed(6)),
    });
  }

  function captureOffsetDiscrepancyPin() {
    const delta =
      activeJob!.targetLat + 0.000765 <= 14.495 ? 0.000765 : -0.000765;
    setCapturedPin({
      lat: Number((activeJob!.targetLat + delta).toFixed(6)),
      lng: Number(activeJob!.targetLng.toFixed(6)),
    });
  }

  async function handleCloseOut(
    outcomeStatus: 'COMPLETED' | 'FB_ISSUE' | 'CUST_ISSUE',
  ) {
    if (!activeJob) return;
    setFormError(null);

    if (needsStart) {
      setFormError('Tap "Start Job (WORKING)" first before closing out.');
      return;
    }

    if (
      outcomeStatus === 'COMPLETED' &&
      !activeJob.coordsVerified &&
      !capturedPin
    ) {
      setFormError(
        'Subscriber coordinates are unverified. Capture Field GPS Pin before completing.',
      );
      return;
    }

    const check = validateCompletionRequirements({
      workflowType: activeJob.workflowType,
      outcomeStatus,
      opticalRxDbm: opticalDbm,
      hasCameraProof,
      hasSignatureOrHardcopy: Boolean(existingSignature || hasHardcopy),
      selectedNapBoxId,
      selectedPortNumber,
      fiberTag,
      onuSerial,
      oldNapBoxId: activeJob.oldNapBoxId,
      oldPortNumber: activeJob.oldPortNumber,
    });

    if (!check.ok) {
      setFormError(check.error ?? 'Completion validation failed.');
      return;
    }

    if (outcomeStatus !== 'COMPLETED' && !exceptionReasonCode.trim()) {
      setFormError('Select an exception reason code before reporting.');
      return;
    }

    try {
      await onSubmitOutcome(activeJob, {
        workOrderId: activeJob.id,
        outcomeStatus,
        selectedNapBoxId: selectedNapBoxId || null,
        selectedPortNumber,
        fiberTag: fiberTag.trim() || null,
        onuSerial: onuSerial.trim() || null,
        opticalRxDbm: opticalDbm,
        capturedLat: capturedPin?.lat ?? null,
        capturedLng: capturedPin?.lng ?? null,
        exceptionReasonCode:
          outcomeStatus === 'COMPLETED' ? null : exceptionReasonCode,
        exceptionNotes:
          outcomeStatus === 'COMPLETED'
            ? exceptionNotes.trim() || null
            : exceptionNotes.trim() || 'Escalated from Cavite field cockpit.',
        evidenceItems: evidenceItems.map((ev) => ({
          kind: ev.kind,
          captureMode: ev.captureMode,
          dataUrl: ev.dataUrl,
          watermark: ev.watermark,
        })),
      });
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'Failed to submit field outcome.',
      );
    }
  }

  return (
    <div className="space-y-3.5">
      {/* Header Banner */}
      <section
        className="rounded-xl border p-4 space-y-2.5"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="font-mono-tabular text-xs font-bold">
              {activeJob.ticketNumber}
            </span>
            <span
              className="rounded border px-2 py-0.5 text-[11px] font-bold"
              style={{
                backgroundColor: 'var(--accent-blaze-soft)',
                borderColor: 'var(--accent-blaze)',
                color: 'var(--accent-blaze)',
              }}
            >
              {activeJob.workflowType}
            </span>
          </div>
          <span
            className="font-mono-tabular rounded px-2 py-0.5 text-xs font-bold"
            style={{
              backgroundColor: 'var(--bg-elevated)',
              color: 'var(--text-primary)',
            }}
          >
            STATUS: {activeJob.status}
          </span>
        </div>
        <h2 className="text-base font-bold leading-snug">
          {activeJob.summaryTitle}
        </h2>
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          {activeJob.subscriberName} ({activeJob.subscriberAccount}) •{' '}
          {activeJob.targetAddress}, Brgy. {activeJob.targetBarangay},{' '}
          {activeJob.targetMunicipality}
        </p>

        {needsStart && (
          <div
            className="mt-2 rounded-lg border p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
            style={{
              backgroundColor: 'var(--accent-blaze-soft)',
              borderColor: 'var(--accent-blaze)',
            }}
          >
            <span className="text-xs font-semibold">
              Work order is ASSIGNED. Start work to unlock close-out.
            </span>
            <button
              type="button"
              disabled={isStartingJob}
              onClick={() => onStartJob(activeJob)}
              className="min-h-12 inline-flex items-center justify-center gap-2 rounded-lg px-4 text-xs font-bold shrink-0"
              style={{
                backgroundColor: 'var(--accent-blaze)',
                color: 'var(--accent-blaze-ink)',
              }}
            >
              <Play className="h-4 w-4" aria-hidden="true" />
              <span>{isStartingJob ? 'Starting…' : 'Start Job (WORKING)'}</span>
            </button>
          </div>
        )}
      </section>

      {/* TRANSFER Old-Site Port Lock Safeguard Card */}
      {activeJob.workflowType === 'TRANSFER' && (
        <section
          className="rounded-xl border-2 p-4 space-y-2.5"
          style={{
            backgroundColor: 'var(--status-warn-soft)',
            borderColor: 'var(--status-warn)',
          }}
          aria-label="Transfer old site port lock safeguard"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div
              className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide"
              style={{ color: 'var(--status-warn)' }}
            >
              <Lock className="h-4 w-4" aria-hidden="true" />
              <span>Old-Site Port Lock Safeguard</span>
            </div>
            <span
              className="font-mono-tabular rounded border px-2 py-0.5 text-[11px] font-bold"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--status-warn)',
                color: 'var(--status-warn)',
              }}
            >
              LOCKED_TRANSFER — Will Not Release Until New Site Passes
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            <div
              className="rounded-lg border p-2.5"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-subtle)',
              }}
            >
              <div className="font-semibold" style={{ color: 'var(--text-muted)' }}>
                Protected Old Site &amp; NAP:Port
              </div>
              <div className="mt-0.5 font-semibold">
                {activeJob.oldAddress ?? 'Legacy Cavite Site'}
              </div>
              <div
                className="mt-1 font-mono-tabular font-bold"
                style={{ color: 'var(--status-warn)' }}
              >
                {oldNap?.code ?? activeJob.oldNapBoxId ?? 'NAP'} : P
                {String(activeJob.oldPortNumber ?? 0).padStart(2, '0')}
              </div>
            </div>
            <div
              className="rounded-lg border p-2.5"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-subtle)',
              }}
            >
              <div className="font-semibold" style={{ color: 'var(--text-muted)' }}>
                New Relocation Target Site
              </div>
              <div className="mt-0.5 font-semibold">
                {activeJob.targetAddress}, {activeJob.targetBarangay}
              </div>
              <div
                className="mt-1 font-mono-tabular"
                style={{ color: 'var(--status-info)' }}
              >
                {activeJob.targetLat.toFixed(5)}, {activeJob.targetLng.toFixed(5)}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* GPS Coordinate Verification Block */}
      <section
        className="rounded-xl border p-4 space-y-3"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-subtle)',
        }}
        aria-labelledby="gps-verify-heading"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 id="gps-verify-heading" className="text-sm font-bold">
              GPS Coordinate Integrity &amp; Pin Verification
            </h3>
            <p
              className="font-mono-tabular text-xs"
              style={{ color: 'var(--text-muted)' }}
            >
              Recorded Target: {activeJob.targetLat.toFixed(5)},{' '}
              {activeJob.targetLng.toFixed(5)}
            </p>
          </div>
          {activeJob.coordsVerified ? (
            <span
              className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs font-semibold"
              style={{
                backgroundColor: 'var(--status-ok-soft)',
                borderColor: 'var(--status-ok)',
                color: 'var(--status-ok)',
              }}
            >
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              TRUSTED VERIFIED
            </span>
          ) : (
            <span
              className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs font-semibold"
              style={{
                backgroundColor: 'var(--status-warn-soft)',
                borderColor: 'var(--status-warn)',
                color: 'var(--status-warn)',
              }}
            >
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
              UNVERIFIED (Requires Field Capture)
            </span>
          )}
        </div>

        {capturedPin && gpsPreview && (
          <div
            className="rounded-lg border p-2.5 text-xs flex flex-wrap items-center justify-between gap-2"
            style={{
              backgroundColor: gpsPreview.createDiscrepancy
                ? 'var(--status-warn-soft)'
                : 'var(--status-ok-soft)',
              borderColor: gpsPreview.createDiscrepancy
                ? 'var(--status-warn)'
                : 'var(--status-ok)',
            }}
          >
            <span className="font-mono-tabular font-semibold">
              Captured: {capturedPin.lat.toFixed(5)}, {capturedPin.lng.toFixed(5)}
              {activeJob.coordsVerified
                ? ` (${gpsPreview.distanceMeters.toFixed(1)}m delta)`
                : ''}
            </span>
            <span className="font-bold">
              {gpsPreview.action === 'SET_INITIAL_VERIFIED'
                ? 'Sets Initial Trusted Pin'
                : gpsPreview.createDiscrepancy
                  ? '>30m Diff — Flags Supervisor Review'
                  : 'Within 30m — Reuses Trusted Pin'}
            </span>
          </div>
        )}

        {!isClosed && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              type="button"
              onClick={captureCurrentGpsPin}
              className="min-h-12 inline-flex items-center justify-center gap-2 rounded-lg border px-3 text-xs font-semibold"
              style={{
                backgroundColor: 'var(--bg-elevated)',
                borderColor: 'var(--border-strong)',
                color: 'var(--text-primary)',
              }}
            >
              <Crosshair
                className="h-4 w-4"
                style={{ color: 'var(--status-ok)' }}
                aria-hidden="true"
              />
              <span>Capture Current GPS Pin</span>
            </button>

            <button
              type="button"
              onClick={captureOffsetDiscrepancyPin}
              className="min-h-12 inline-flex items-center justify-center gap-2 rounded-lg border px-3 text-xs font-semibold"
              style={{
                backgroundColor: 'var(--status-warn-soft)',
                borderColor: 'var(--status-warn)',
                color: 'var(--status-warn)',
              }}
            >
              <MapPin className="h-4 w-4" aria-hidden="true" />
              <span>+85m Subdivision Entrance Offset</span>
            </button>
          </div>
        )}
      </section>

      <NapPortMatrixSelector
        workflowType={activeJob.workflowType}
        subscriberId={activeJob.subscriberId}
        napBoxes={napBoxes}
        selectedNapBoxId={selectedNapBoxId}
        selectedPortNumber={selectedPortNumber}
        fiberTag={fiberTag}
        onuSerial={onuSerial}
        disabled={isClosed}
        onSelectNapBox={(id) => {
          setSelectedNapBoxId(id);
          setSelectedPortNumber(null);
        }}
        onSelectPort={setSelectedPortNumber}
        onChangeFiberTag={setFiberTag}
        onChangeOnuSerial={setOnuSerial}
      />

      <OpticalPowerDiagnosticCard
        opticalDbm={opticalDbm}
        opticalEval={opticalEval}
        disabled={isClosed}
        onChangeOpticalDbm={setOpticalDbm}
      />

      <CameraEvidenceCapture
        ticketNumber={activeJob.ticketNumber}
        techCode={techEmployeeCode}
        capturedLat={capturedPin?.lat ?? activeJob.targetLat}
        capturedLng={capturedPin?.lng ?? activeJob.targetLng}
        opticalDbm={opticalDbm}
        napCode={activeNap?.code ?? null}
        portNumber={selectedPortNumber}
        evidenceItems={evidenceItems}
        disabled={isClosed}
        onAddEvidence={(item) => setEvidenceItems((prev) => [...prev, item])}
        onDeleteEvidence={(id) =>
          setEvidenceItems((prev) => prev.filter((e) => e.id !== id))
        }
      />

      <SubscriberSignaturePad
        ticketNumber={activeJob.ticketNumber}
        subscriberName={activeJob.subscriberName}
        subscriberAccount={activeJob.subscriberAccount}
        techCode={techEmployeeCode}
        capturedLat={capturedPin?.lat ?? activeJob.targetLat}
        capturedLng={capturedPin?.lng ?? activeJob.targetLng}
        opticalDbm={opticalDbm}
        napCode={activeNap?.code ?? null}
        portNumber={selectedPortNumber}
        requiredForWorkflow={
          activeJob.workflowType === 'NEW_INSTALL' ||
          activeJob.workflowType === 'TRANSFER'
        }
        hasHardcopyFallback={hasHardcopy}
        existingSignature={existingSignature}
        disabled={isClosed}
        onSaveSignature={(sig) =>
          setEvidenceItems((prev) => [
            ...prev.filter((e) => e.kind !== 'SUBSCRIBER_SIGNATURE'),
            sig,
          ])
        }
        onDeleteSignature={(id) =>
          setEvidenceItems((prev) => prev.filter((e) => e.id !== id))
        }
      />

      {!isClosed && (
        <FieldCloseOutPanel
          needsStart={needsStart}
          isSubmittingOutcome={isSubmittingOutcome}
          opticalEval={opticalEval}
          completionCheck={completionCheck}
          formError={formError}
          exceptionKind={exceptionKind}
          exceptionReasonCode={exceptionReasonCode}
          exceptionNotes={exceptionNotes}
          onChangeExceptionKind={(kind) => {
            setExceptionKind(kind);
            setExceptionReasonCode(
              kind === 'FB_ISSUE'
                ? FB_ISSUE_REASONS[0].code
                : CUST_ISSUE_REASONS[0].code,
            );
          }}
          onChangeExceptionReasonCode={setExceptionReasonCode}
          onChangeExceptionNotes={setExceptionNotes}
          onCloseOut={(st) => void handleCloseOut(st)}
        />
      )}
    </div>
  );
}
