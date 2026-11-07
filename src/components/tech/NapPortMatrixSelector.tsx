'use client';

import React from 'react';
import {
  AlertOctagon,
  Cable,
  Check,
  Cpu,
  Lock,
  ScanLine,
  Slash,
} from 'lucide-react';
import { planNapPortAllocation } from '@/domain/opticalAndNap';
import type {
  NapBoxRecord,
  NapPortRecord,
  WorkflowType,
} from '@/domain/types';

interface NapPortMatrixSelectorProps {
  workflowType: WorkflowType;
  subscriberId: string;
  napBoxes: NapBoxRecord[];
  selectedNapBoxId: string;
  selectedPortNumber: number | null;
  fiberTag: string;
  onuSerial: string;
  disabled?: boolean;
  onSelectNapBox: (napBoxId: string) => void;
  onSelectPort: (portNumber: number) => void;
  onChangeFiberTag: (tag: string) => void;
  onChangeOnuSerial: (serial: string) => void;
}

export function NapPortMatrixSelector({
  workflowType,
  subscriberId,
  napBoxes,
  selectedNapBoxId,
  selectedPortNumber,
  fiberTag,
  onuSerial,
  disabled = false,
  onSelectNapBox,
  onSelectPort,
  onChangeFiberTag,
  onChangeOnuSerial,
}: NapPortMatrixSelectorProps) {
  const activeNap =
    napBoxes.find((n) => n.id === selectedNapBoxId) ?? napBoxes[0] ?? null;

  function isPortSelectable(port: NapPortRecord): boolean {
    if (disabled || !activeNap) return false;
    return planNapPortAllocation({
      workflowType,
      targetPorts: activeNap.ports,
      selectedPortNumber: port.portNumber,
      subscriberId,
    }).ok;
  }

  function handleScanAutofill() {
    if (!activeNap || disabled) return;

    let portToUse = selectedPortNumber;
    if (!portToUse) {
      const candidate = activeNap.ports.find((p) => isPortSelectable(p));
      if (candidate) {
        portToUse = candidate.portNumber;
        onSelectPort(candidate.portNumber);
      }
    }

    const paddedPort = String(portToUse ?? 1).padStart(2, '0');
    const generatedTag = `${activeNap.code}-P${paddedPort}`;
    onChangeFiberTag(generatedTag);

    if (!onuSerial.trim()) {
      const numericSuffix = subscriberId.replace(/\D/g, '').padStart(3, '0');
      onChangeOnuSerial(`HWTC26${numericSuffix}88A${paddedPort}`);
    }
  }

  const freeCount = activeNap
    ? activeNap.ports.filter((p) => p.status === 'FREE').length
    : 0;

  return (
    <section
      className="rounded-xl border p-4 space-y-3.5"
      style={{
        backgroundColor: 'var(--bg-surface)',
        borderColor: 'var(--border-subtle)',
      }}
      aria-labelledby="nap-matrix-heading"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 id="nap-matrix-heading" className="text-sm font-bold">
            NAP Splitter Port Matrix &amp; CPE Inventory
          </h3>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {workflowType === 'REPAIR'
              ? 'Verify active subscriber port or swap onto a FREE splitter port.'
              : 'Allocate a FREE splitter port and tag subscriber drop & GPON ONU.'}
          </p>
        </div>
        {activeNap && (
          <span
            className="font-mono-tabular rounded border px-2 py-1 text-xs font-semibold"
            style={{
              backgroundColor: 'var(--status-ok-soft)',
              borderColor: 'var(--status-ok)',
              color: 'var(--status-ok)',
            }}
          >
            {freeCount}/{activeNap.totalPorts} FREE
          </span>
        )}
      </div>

      {/* NAP Box Selector */}
      <div>
        <label
          htmlFor="tech-nap-select"
          className="block text-xs font-semibold mb-1.5"
          style={{ color: 'var(--text-secondary)' }}
        >
          Distribution NAP Enclosure (OLT Feeder)
        </label>
        <select
          id="tech-nap-select"
          disabled={disabled}
          value={activeNap?.id ?? ''}
          onChange={(e) => onSelectNapBox(e.target.value)}
          className="w-full min-h-12 rounded-lg border px-3 text-sm font-semibold font-mono-tabular"
          style={{
            backgroundColor: 'var(--bg-elevated)',
            borderColor: 'var(--border-strong)',
            color: 'var(--text-primary)',
          }}
        >
          {napBoxes.map((nap) => {
            const avail = nap.ports.filter((p) => p.status === 'FREE').length;
            return (
              <option key={nap.id} value={nap.id}>
                {nap.code} • {nap.municipality} ({nap.barangay}) • {avail}/
                {nap.totalPorts} FREE • {nap.oltCode}
              </option>
            );
          })}
        </select>
      </div>

      {/* Legend */}
      <div
        className="flex flex-wrap items-center gap-3 text-[11px] font-semibold"
        style={{ color: 'var(--text-secondary)' }}
      >
        <span className="inline-flex items-center gap-1">
          <span
            className="inline-block h-2.5 w-2.5 rounded-sm"
            style={{ backgroundColor: 'var(--status-ok)' }}
          />
          FREE
        </span>
        <span className="inline-flex items-center gap-1">
          <span
            className="inline-block h-2.5 w-2.5 rounded-sm"
            style={{ backgroundColor: 'var(--border-strong)' }}
          />
          OCCUPIED
        </span>
        <span className="inline-flex items-center gap-1">
          <span
            className="inline-block h-2.5 w-2.5 rounded-sm"
            style={{ backgroundColor: 'var(--status-warn)' }}
          />
          LOCKED_TRANSFER
        </span>
        <span className="inline-flex items-center gap-1">
          <span
            className="inline-block h-2.5 w-2.5 rounded-sm"
            style={{ backgroundColor: 'var(--status-fault)' }}
          />
          FAULTY
        </span>
      </div>

      {/* 8 / 16 Port Grid (min-h-12 touch cells with gap-2) */}
      {activeNap && (
        <div
          className="grid grid-cols-4 gap-2"
          role="group"
          aria-label={`Ports on ${activeNap.code}`}
        >
          {activeNap.ports.map((port) => {
            const selectable = isPortSelectable(port);
            const isChosen = selectedPortNumber === port.portNumber;
            const isOwnRepairPort =
              workflowType === 'REPAIR' &&
              port.status === 'OCCUPIED' &&
              port.subscriberId === subscriberId;

            let bg = 'var(--bg-elevated)';
            let border = 'var(--border-subtle)';
            let color = 'var(--text-muted)';
            let subLabel: string = port.status;

            if (isChosen) {
              bg = 'var(--accent-blaze)';
              border = 'var(--accent-blaze)';
              color = 'var(--accent-blaze-ink)';
              subLabel = isOwnRepairPort ? 'ACTIVE PORT' : 'SELECTED';
            } else if (port.status === 'FREE') {
              bg = 'var(--status-ok-soft)';
              border = 'var(--status-ok)';
              color = 'var(--status-ok)';
              subLabel = 'FREE';
            } else if (isOwnRepairPort) {
              bg = 'var(--status-info-soft)';
              border = 'var(--status-info)';
              color = 'var(--status-info)';
              subLabel = 'OWN PORT';
            } else if (port.status === 'LOCKED_TRANSFER') {
              bg = 'var(--status-warn-soft)';
              border = 'var(--status-warn)';
              color = 'var(--status-warn)';
              subLabel = 'LOCKED';
            } else if (port.status === 'FAULTY') {
              bg = 'var(--status-fault-soft)';
              border = 'var(--status-fault)';
              color = 'var(--status-fault)';
              subLabel = 'FAULTY';
            }

            const portCode = `P${String(port.portNumber).padStart(2, '0')}`;

            return (
              <button
                key={port.portNumber}
                type="button"
                disabled={!selectable}
                aria-pressed={isChosen}
                aria-label={`Port ${portCode} ${port.status}`}
                onClick={() => {
                  onSelectPort(port.portNumber);
                  if (!fiberTag.trim() || fiberTag.startsWith(activeNap.code)) {
                    onChangeFiberTag(`${activeNap.code}-${portCode}`);
                  }
                }}
                className="min-h-12 flex flex-col items-center justify-center rounded-lg border px-1.5 py-1.5 transition-colors font-mono-tabular"
                style={{
                  backgroundColor: bg,
                  borderColor: border,
                  color,
                }}
              >
                <div className="flex items-center gap-1 text-xs font-bold">
                  {isChosen ? (
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : port.status === 'LOCKED_TRANSFER' ? (
                    <Lock className="h-3 w-3" aria-hidden="true" />
                  ) : port.status === 'FAULTY' ? (
                    <AlertOctagon className="h-3 w-3" aria-hidden="true" />
                  ) : !selectable ? (
                    <Slash className="h-3 w-3" aria-hidden="true" />
                  ) : null}
                  <span>{portCode}</span>
                </div>
                <span className="text-[10px] font-semibold tracking-tight leading-none mt-0.5">
                  {subLabel}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Fiber Drop Tag + ONU Serial + 1-Tap Scan/Autofill */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
        <div>
          <label
            htmlFor="tech-fiber-tag"
            className="flex items-center gap-1.5 text-xs font-semibold mb-1"
            style={{ color: 'var(--text-secondary)' }}
          >
            <Cable className="h-3.5 w-3.5" aria-hidden="true" />
            <span>UV Fiber Drop Tag</span>
          </label>
          <input
            id="tech-fiber-tag"
            type="text"
            disabled={disabled}
            placeholder="e.g. NAP-IMS-118-P04"
            value={fiberTag}
            onChange={(e) => onChangeFiberTag(e.target.value)}
            className="w-full min-h-12 rounded-lg border px-3 text-sm font-mono-tabular"
            style={{
              backgroundColor: 'var(--bg-elevated)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-primary)',
            }}
          />
        </div>

        <div>
          <label
            htmlFor="tech-onu-serial"
            className="flex items-center gap-1.5 text-xs font-semibold mb-1"
            style={{ color: 'var(--text-secondary)' }}
          >
            <Cpu className="h-3.5 w-3.5" aria-hidden="true" />
            <span>GPON ONU / Modem Serial</span>
          </label>
          <input
            id="tech-onu-serial"
            type="text"
            disabled={disabled}
            placeholder="e.g. HWTC48575443"
            value={onuSerial}
            onChange={(e) => onChangeOnuSerial(e.target.value)}
            className="w-full min-h-12 rounded-lg border px-3 text-sm font-mono-tabular"
            style={{
              backgroundColor: 'var(--bg-elevated)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-primary)',
            }}
          />
        </div>
      </div>

      {!disabled && (
        <button
          type="button"
          onClick={handleScanAutofill}
          className="w-full min-h-12 inline-flex items-center justify-center gap-2 rounded-lg border px-3 text-xs font-semibold transition-colors"
          style={{
            backgroundColor: 'var(--bg-elevated)',
            borderColor: 'var(--border-strong)',
            color: 'var(--text-primary)',
          }}
        >
          <ScanLine
            className="h-4 w-4"
            style={{ color: 'var(--accent-blaze)' }}
            aria-hidden="true"
          />
          <span>Scan / Autofill ONU &amp; Drop Tag</span>
        </button>
      )}
    </section>
  );
}
