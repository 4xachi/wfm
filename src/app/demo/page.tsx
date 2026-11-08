'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ExternalLink,
  PlayCircle,
  Radio,
  RotateCcw,
  ShieldAlert,
  Smartphone,
  Sparkles,
} from 'lucide-react';
import { surfaceFetchJson } from '@/client/apiClient';
import { setSimulatedDeadZone } from '@/client/offlineQueue';
import { OpsPortalShell } from '@/components/ops/OpsPortalShell';
import { TechMobileCockpit } from '@/components/tech/TechMobileCockpit';

const DEMO_PW = 'FiberBlaze2026!';

export default function SplitScreenDemoPage() {
  const [opsRevision, setOpsRevision] = useState(1);
  const [techRevision, setTechRevision] = useState(1);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [statusNote, setStatusNote] = useState<string | null>(null);

  async function autoSignInBothPanes(
    opsEmail = 'controller@fiberblaze.ph',
    techEmail = 'mateo@fiberblaze.ph',
  ) {
    setBusyAction('signin');
    setStatusNote(null);
    try {
      setSimulatedDeadZone(false);
      await Promise.all([
        surfaceFetchJson('ops', '/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email: opsEmail, password: DEMO_PW }),
        }),
        surfaceFetchJson('tech', '/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email: techEmail, password: DEMO_PW }),
        }),
      ]);
      setOpsRevision((r) => r + 1);
      setTechRevision((r) => r + 1);
      setStatusNote(
        `Synchronized dual sessions active: Left (${opsEmail}) + Right (${techEmail}).`,
      );
    } catch (err) {
      setStatusNote(
        err instanceof Error ? err.message : 'Dual sign-in failed.',
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function switchLeftToSupervisor() {
    setBusyAction('supervisor');
    setStatusNote(null);
    try {
      await surfaceFetchJson('ops', '/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: 'supervisor@fiberblaze.ph',
          password: DEMO_PW,
        }),
      });
      setOpsRevision((r) => r + 1);
      setStatusNote(
        'Left NOC pane switched to Engr. Clarisse Mendoza (SUPERVISOR) for NetOps & >30m GPS Diff governance.',
      );
    } catch (err) {
      setStatusNote(
        err instanceof Error ? err.message : 'Supervisor switch failed.',
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function resetFullDemoEnvironment() {
    setBusyAction('reset');
    setStatusNote(null);
    try {
      setSimulatedDeadZone(false);
      await surfaceFetchJson('ops', '/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: 'admin@fiberblaze.ph',
          password: DEMO_PW,
        }),
      });
      await surfaceFetchJson('ops', '/api/admin/reset', {
        method: 'POST',
        body: '{}',
      });
      await Promise.all([
        surfaceFetchJson('ops', '/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({
            email: 'controller@fiberblaze.ph',
            password: DEMO_PW,
          }),
        }),
        surfaceFetchJson('tech', '/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({
            email: 'mateo@fiberblaze.ph',
            password: DEMO_PW,
          }),
        }),
      ]);
      setOpsRevision((r) => r + 1);
      setTechRevision((r) => r + 1);
      setStatusNote(
        'Cavite baseline database, NAP port locks, GPS discrepancies, and audit chain reset to pristine rehearsal state.',
      );
    } catch (err) {
      setStatusNote(err instanceof Error ? err.message : 'Demo reset failed.');
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <div
      data-theme="noc-dark"
      className="min-h-screen flex flex-col"
      style={{
        backgroundColor: 'var(--bg-canvas)',
        color: 'var(--text-primary)',
      }}
    >
      {/* Top Executive Presenter Control Bar */}
      <header
        className="border-b px-4 py-2.5 shrink-0"
        style={{
          backgroundColor: '#070a0e',
          borderColor: 'var(--border-subtle)',
        }}
      >
        <div className="mx-auto max-w-[1920px] flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium min-h-9"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-secondary)',
              }}
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Launchpad</span>
            </Link>
            <div className="flex items-center gap-2">
              <span
                className="flex h-7 w-7 items-center justify-center rounded-md"
                style={{
                  backgroundColor: 'var(--accent-blaze)',
                  color: 'var(--accent-blaze-ink)',
                }}
              >
                <Radio className="h-4 w-4" aria-hidden="true" />
              </span>
              <div>
                <div className="text-sm font-bold tracking-tight">
                  Unified Cavite Operations &amp; Field Cockpit
                </div>
                <div
                  className="font-mono-tabular text-[11px]"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Cavite Operations Center &amp; Field Cockpit • Live Telemetry Stream
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={busyAction !== null}
              onClick={() => void autoSignInBothPanes()}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold min-h-9"
              style={{
                backgroundColor: 'var(--accent-blaze)',
                color: 'var(--accent-blaze-ink)',
              }}
            >
              <PlayCircle className="h-4 w-4" aria-hidden="true" />
              <span>
                {busyAction === 'signin'
                  ? 'Connecting…'
                  : 'Quick Connect Panes'}
              </span>
            </button>

            <button
              type="button"
              disabled={busyAction !== null}
              onClick={() => void switchLeftToSupervisor()}
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold min-h-9"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
            >
              <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Switch to Supervisor</span>
            </button>

            <button
              type="button"
              disabled={busyAction !== null}
              onClick={() => void resetFullDemoEnvironment()}
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold min-h-9"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-secondary)',
              }}
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>
                {busyAction === 'reset' ? 'Resetting…' : 'Reset Cavite Baseline'}
              </span>
            </button>

            <Link
              href="/ops"
              target="_blank"
              className="hidden xl:inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium min-h-9"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-muted)',
              }}
            >
              <span>/ops</span>
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </Link>

            <Link
              href="/tech"
              target="_blank"
              className="hidden xl:inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium min-h-9"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-muted)',
              }}
            >
              <span>/tech</span>
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </Link>
          </div>
        </div>

        {statusNote && (
          <div
            role="status"
            className="mx-auto max-w-[1920px] mt-2 rounded-lg border px-3 py-1.5 text-xs flex items-center gap-2"
            style={{
              backgroundColor: 'var(--status-ok-soft)',
              borderColor: 'var(--status-ok)',
              color: 'var(--text-primary)',
            }}
          >
            <Sparkles
              className="h-3.5 w-3.5 shrink-0"
              style={{ color: 'var(--status-ok)' }}
              aria-hidden="true"
            />
            <span>{statusNote}</span>
          </div>
        )}
      </header>

      {/* Dual Synchronized Operational Surfaces */}
      <div className="mx-auto w-full max-w-[1920px] flex-1 grid grid-cols-1 lg:grid-cols-12 gap-3 p-3">
        {/* Left Pane: Operations Management NOC Portal */}
        <section
          aria-label="Operations NOC Surface"
          className="lg:col-span-7 xl:col-span-8 rounded-2xl border overflow-hidden flex flex-col lg:h-[calc(100vh-148px)]"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <div className="flex-1 overflow-y-auto">
            <OpsPortalShell
              key={`ops-pane-${opsRevision}`}
              embeddedInSplitScreen
            />
          </div>
        </section>

        {/* Right Pane: Field Technician Mobile Device Viewport */}
        <section
          aria-label="Field Technician Mobile Surface"
          className="lg:col-span-5 xl:col-span-4 rounded-2xl border overflow-hidden flex flex-col lg:h-[calc(100vh-148px)]"
          style={{
            backgroundColor: '#090d12',
            borderColor: 'var(--border-strong)',
          }}
        >
          <div
            className="px-3.5 py-1.5 border-b flex items-center justify-between text-[11px] shrink-0"
            style={{
              backgroundColor: '#0f172a',
              borderColor: 'var(--border-subtle)',
              color: '#cbd5e1',
            }}
          >
            <span className="inline-flex items-center gap-1.5 font-semibold">
              <Smartphone
                className="h-3.5 w-3.5 text-orange-400"
                aria-hidden="true"
              />
              Field Handset Viewport (PWA + IndexedDB Queue)
            </span>
            <span className="font-mono-tabular text-[10px] text-slate-400">
              Cavite Field Unit
            </span>
          </div>
          <div className="flex-1 min-h-[680px] lg:min-h-0 overflow-hidden">
            <TechMobileCockpit
              key={`tech-pane-${techRevision}`}
              embeddedInSplitScreen
            />
          </div>
        </section>
      </div>
    </div>
  );
}
