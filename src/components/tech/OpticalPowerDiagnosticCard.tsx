'use client';

import React from 'react';
import { Activity } from 'lucide-react';
import type { OpticalSignalEvaluation } from '@/domain/opticalAndNap';

interface OpticalPowerDiagnosticCardProps {
  opticalDbm: number;
  opticalEval: OpticalSignalEvaluation;
  disabled?: boolean;
  onChangeOpticalDbm: (value: number) => void;
}

export function OpticalPowerDiagnosticCard({
  opticalDbm,
  opticalEval,
  disabled = false,
  onChangeOpticalDbm,
}: OpticalPowerDiagnosticCardProps) {
  const bandBg =
    opticalEval.band === 'PASS'
      ? 'var(--status-ok-soft)'
      : opticalEval.band === 'MARGINAL_WARNING'
        ? 'var(--status-warn-soft)'
        : 'var(--status-fault-soft)';

  const bandColor =
    opticalEval.band === 'PASS'
      ? 'var(--status-ok)'
      : opticalEval.band === 'MARGINAL_WARNING'
        ? 'var(--status-warn)'
        : 'var(--status-fault)';

  return (
    <section
      className="rounded-xl border p-4 space-y-3"
      style={{
        backgroundColor: 'var(--bg-surface)',
        borderColor: 'var(--border-subtle)',
      }}
      aria-labelledby="optical-dbm-heading"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3
            id="optical-dbm-heading"
            className="text-sm font-bold flex items-center gap-1.5"
          >
            <Activity className="h-4 w-4" aria-hidden="true" />
            <span>GPON Optical Rx Power Diagnostic (1490nm)</span>
          </h3>
          <p
            className="font-mono-tabular text-xs"
            style={{ color: 'var(--text-muted)' }}
          >
            Pass: -8.0 to -25.0 dBm • Marginal: -25.1 to -27.9 dBm
          </p>
        </div>
        <div className="text-right">
          <div className="font-mono-tabular text-xl font-bold">
            {opticalDbm.toFixed(1)} dBm
          </div>
          <span
            className="inline-block rounded border px-2 py-0.5 text-[11px] font-bold font-mono-tabular"
            style={{
              backgroundColor: bandBg,
              borderColor: bandColor,
              color: bandColor,
            }}
          >
            {opticalEval.band}
          </span>
        </div>
      </div>

      <input
        type="range"
        aria-label="Optical Rx power reading in dBm"
        min={-32.0}
        max={-7.0}
        step={0.1}
        disabled={disabled}
        value={opticalDbm}
        onChange={(e) => onChangeOpticalDbm(Number(e.target.value))}
        className="w-full min-h-12 accent-orange-600 cursor-pointer"
      />

      {!disabled && (
        <div className="grid grid-cols-3 gap-2">
          {(
            [
              { val: -19.2, label: '-19.2 Pass' },
              { val: -26.4, label: '-26.4 Marginal' },
              { val: -30.2, label: '-30.2 LOS Fail' },
            ] as const
          ).map((preset) => (
            <button
              key={preset.val}
              type="button"
              onClick={() => onChangeOpticalDbm(preset.val)}
              className="min-h-12 rounded-lg border px-2 text-xs font-semibold font-mono-tabular"
              style={{
                backgroundColor: 'var(--bg-elevated)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
            >
              {preset.label}
            </button>
          ))}
        </div>
      )}

      {opticalEval.band === 'MARGINAL_WARNING' && (
        <div
          className="rounded-lg border px-3 py-2 text-xs font-medium"
          style={{
            backgroundColor: 'var(--status-warn-soft)',
            borderColor: 'var(--status-warn)',
            color: 'var(--text-primary)',
          }}
        >
          <strong>Marginal Attenuation Warning:</strong> Completion is
          permitted and automatically flags NetOps Supervisor review.
        </div>
      )}

      {opticalEval.band === 'FAIL_OUT_OF_RANGE' && (
        <div
          className="rounded-lg border px-3 py-2 text-xs font-medium"
          style={{
            backgroundColor: 'var(--status-fault-soft)',
            borderColor: 'var(--status-fault)',
            color: 'var(--text-primary)',
          }}
        >
          <strong>Signal Out of GPON Range:</strong> Standard COMPLETED
          close-out is locked. Capture meter proof and escalate as{' '}
          <span className="font-mono-tabular font-bold">FB_ISSUE</span> below.
        </div>
      )}
    </section>
  );
}
