'use client';

import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Box,
  CheckCircle2,
  Lock,
  Network,
  X,
} from 'lucide-react';
import type { NapBoxRecord } from '@/domain/types';
import { formatCoords, getNapPortStyle } from './opsHelpers';

interface NapOccupancyPanelProps {
  napBoxes: NapBoxRecord[];
  highlightedNapBoxId?: string | null;
}

export function NapOccupancyPanel({
  napBoxes,
  highlightedNapBoxId,
}: NapOccupancyPanelProps) {
  const [inspectedNapId, setInspectedNapId] = useState<string | null>(null);

  const activeNap =
    napBoxes.find((b) => b.id === inspectedNapId) ?? null;

  useEffect(() => {
    if (!activeNap) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setInspectedNapId(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeNap]);

  return (
    <section
      aria-label="Cavite NAP Split-Box Occupancy Strip"
      className="rounded-xl border p-3.5"
      style={{
        backgroundColor: 'var(--bg-surface)',
        borderColor: 'var(--border-subtle)',
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
        <div className="flex items-center gap-2">
          <Network
            className="h-4 w-4"
            style={{ color: 'var(--status-info)' }}
            aria-hidden="true"
          />
          <h2 className="text-sm font-semibold">
            NAP Box Port Occupancy
          </h2>
          <span
            className="text-xs"
            style={{ color: 'var(--text-muted)' }}
          >
            Click a box to view port assignments
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[11px]" style={{ color: 'var(--text-muted)' }}>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: 'var(--status-ok)' }} />
            FREE
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: 'var(--status-info)' }} />
            OCCUPIED
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: 'var(--status-warn)' }} />
            LOCKED_TRANSFER
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: 'var(--status-fault)' }} />
            FAULTY
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
        {napBoxes.map((box) => {
          const freeCount = box.ports.filter((p) => p.status === 'FREE').length;
          const lockedCount = box.ports.filter(
            (p) => p.status === 'LOCKED_TRANSFER',
          ).length;
          const faultyCount = box.ports.filter(
            (p) => p.status === 'FAULTY',
          ).length;
          const isHighlighted = highlightedNapBoxId === box.id;

          return (
            <button
              key={box.id}
              type="button"
              onClick={() => setInspectedNapId(box.id)}
              className="text-left rounded-lg border p-2.5 transition-colors"
              style={{
                backgroundColor: isHighlighted
                  ? 'var(--accent-blaze-soft)'
                  : 'var(--bg-elevated)',
                borderColor: isHighlighted
                  ? 'var(--accent-blaze)'
                  : 'var(--border-subtle)',
              }}
            >
              <div className="flex items-center justify-between gap-1.5">
                <span className="font-mono-tabular text-xs font-semibold">
                  {box.code}
                </span>
                <span
                  className="font-mono-tabular rounded px-1.5 py-0.5 text-[11px] font-semibold border"
                  style={{
                    backgroundColor:
                      freeCount > 0
                        ? 'var(--status-ok-soft)'
                        : 'var(--status-fault-soft)',
                    borderColor:
                      freeCount > 0
                        ? 'var(--status-ok)'
                        : 'var(--status-fault)',
                    color:
                      freeCount > 0
                        ? 'var(--status-ok)'
                        : 'var(--status-fault)',
                  }}
                >
                  {freeCount}/{box.totalPorts} FREE
                </span>
              </div>
              <div
                className="mt-1 text-xs truncate"
                style={{ color: 'var(--text-secondary)' }}
              >
                {box.municipality} • {box.barangay}
              </div>
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <span
                  className="font-mono-tabular text-[11px]"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {box.oltCode}
                </span>
                <div className="flex items-center gap-1.5">
                  {lockedCount > 0 && (
                    <span
                      className="font-mono-tabular inline-flex items-center gap-0.5 text-[11px]"
                      style={{ color: 'var(--status-warn)' }}
                      title="Port locked for active TRANSFER order"
                    >
                      <Lock className="h-3 w-3" aria-hidden="true" />
                      {lockedCount}
                    </span>
                  )}
                  {faultyCount > 0 && (
                    <span
                      className="font-mono-tabular inline-flex items-center gap-0.5 text-[11px]"
                      style={{ color: 'var(--status-fault)' }}
                      title="Faulty optical port"
                    >
                      <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                      {faultyCount}
                    </span>
                  )}
                </div>
              </div>
              {/* Micro port strip */}
              <div className="mt-2 grid grid-cols-8 gap-0.5" aria-hidden="true">
                {box.ports.map((p) => {
                  const ps = getNapPortStyle(p.status);
                  return (
                    <span
                      key={p.portNumber}
                      className="h-1.5 rounded-xs"
                      style={{ backgroundColor: ps.color }}
                    />
                  );
                })}
              </div>
            </button>
          );
        })}
      </div>

      {activeNap && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="nap-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(9, 13, 18, 0.76)' }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setInspectedNapId(null);
          }}
        >
          <div
            className="w-full max-w-3xl rounded-xl border p-5 max-h-[88vh] overflow-y-auto"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-strong)',
              color: 'var(--text-primary)',
            }}
          >
            <div
              className="flex items-start justify-between gap-3 border-b pb-3.5"
              style={{ borderColor: 'var(--border-subtle)' }}
            >
              <div>
                <div className="flex items-center gap-2">
                  <Box
                    className="h-4 w-4"
                    style={{ color: 'var(--accent-blaze)' }}
                    aria-hidden="true"
                  />
                  <h3
                    id="nap-modal-title"
                    className="font-mono-tabular text-base font-semibold"
                  >
                    {activeNap.code} ({activeNap.totalPorts}-Port Splitter)
                  </h3>
                  <span
                    className="font-mono-tabular rounded border px-2 py-0.5 text-xs"
                    style={{
                      backgroundColor: 'var(--bg-elevated)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    {activeNap.oltCode}
                  </span>
                </div>
                <p
                  className="mt-1 text-xs"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {activeNap.municipality} • {activeNap.barangay} •{' '}
                  <span className="font-mono-tabular">
                    {formatCoords(activeNap.lat, activeNap.lng)}
                  </span>
                </p>
              </div>
              <button
                type="button"
                aria-label="Close NAP port inspector"
                onClick={() => setInspectedNapId(null)}
                className="rounded-lg border p-2 transition-colors"
                style={{
                  backgroundColor: 'var(--bg-elevated)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-secondary)',
                }}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {activeNap.ports.map((port) => {
                const st = getNapPortStyle(port.status);
                return (
                  <div
                    key={port.portNumber}
                    className="rounded-lg border p-2.5"
                    style={{
                      backgroundColor: st.bg,
                      borderColor: st.border,
                    }}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-mono-tabular text-xs font-bold">
                        P{String(port.portNumber).padStart(2, '0')}
                      </span>
                      <span
                        className="font-mono-tabular text-[10px] font-semibold uppercase"
                        style={{ color: st.color }}
                      >
                        {st.shortLabel}
                      </span>
                    </div>
                    <div
                      className="mt-1.5 font-mono-tabular text-[11px] truncate"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      {port.fiberTag ?? 'Unpatched'}
                    </div>
                    <div
                      className="mt-0.5 font-mono-tabular text-[11px] truncate"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {port.lockedByWoId
                        ? `Hold: ${port.lockedByWoId}`
                        : port.subscriberId
                        ? `Sub: ${port.subscriberId}`
                        : port.status === 'FREE'
                        ? 'Spare Ready'
                        : 'Damaged Ferrule'}
                    </div>
                  </div>
                );
              })}
            </div>

            <div
              className="mt-4 flex items-center justify-between gap-2 border-t pt-3 text-xs"
              style={{
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-muted)',
              }}
            >
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2
                  className="h-3.5 w-3.5"
                  style={{ color: 'var(--status-ok)' }}
                  aria-hidden="true"
                />
                LOCKED_TRANSFER ports remain protected until destination cutover completes.
              </span>
              <button
                type="button"
                onClick={() => setInspectedNapId(null)}
                className="rounded-lg border px-3 py-1.5 font-medium"
                style={{
                  backgroundColor: 'var(--bg-elevated)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              >
                Close Matrix
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
