'use client';

import React, { useState } from 'react';
import {
  ShieldCheck,
  Radio,
  Wrench,
  ClipboardList,
  Eye,
  Lock,
  ArrowRight,
  AlertCircle,
} from 'lucide-react';
import type { AuthenticatedUser, Role, SurfaceScope } from '@/domain/types';
import { surfaceFetchJson } from '@/client/apiClient';

const DEMO_DEFAULT_PW = 'FiberBlaze2026!';

interface LoginPersonaScreenProps {
  surface: SurfaceScope;
  demoPersonas: AuthenticatedUser[];
  onAuthenticated: (user: AuthenticatedUser) => void;
  embeddedInSplitScreen?: boolean;
}

const ROLE_META: Record<
  Role,
  { badge: string; desc: string; icon: React.ComponentType<{ className?: string }> }
> = {
  JOB_CONTROLLER: {
    badge: 'Dispatch & Excel Intake',
    desc: 'Import Cavite .xlsx batches, inspect street-ETA suggestions, assign & monitor live fleet.',
    icon: ClipboardList,
  },
  SUPERVISOR: {
    badge: 'NetOps & Evidence Review',
    desc: 'Resolve FB-ISSUE fiber escalations, verify optical dBm proof & approve >30m GPS diffs.',
    icon: Eye,
  },
  ADMINISTRATOR: {
    badge: 'Governance & Gated Outbox',
    desc: 'Inspect SHA-256 audit chain, gated CRM/OLT dry-run queue & 1-click rehearsal reset.',
    icon: ShieldCheck,
  },
  TECHNICIAN: {
    badge: 'Field FTTH & 3D Navigation',
    desc: '3D Cavite gimbal routing, NAP port matrix, camera-only proof, signatures & offline sync.',
    icon: Wrench,
  },
};

export function LoginPersonaScreen({
  surface,
  demoPersonas,
  onAuthenticated,
  embeddedInSplitScreen = false,
}: LoginPersonaScreenProps) {
  const [email, setEmail] = useState(
    surface === 'tech' ? 'mateo@fiberblaze.ph' : 'controller@fiberblaze.ph',
  );
  const [password, setPassword] = useState(DEMO_DEFAULT_PW);
  const [loadingEmail, setLoadingEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const eligiblePersonas = demoPersonas.filter((p) =>
    surface === 'tech'
      ? p.role === 'TECHNICIAN'
      : p.role !== 'TECHNICIAN',
  );

  async function signInWith(targetEmail: string, targetPassword: string) {
    setError(null);
    setLoadingEmail(targetEmail);
    try {
      const res = await surfaceFetchJson<{ user: AuthenticatedUser }>(
        surface,
        '/api/auth/login',
        {
          method: 'POST',
          body: JSON.stringify({ email: targetEmail, password: targetPassword }),
        },
      );
      onAuthenticated(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setLoadingEmail(null);
    }
  }

  return (
    <div
      className={`w-full ${
        embeddedInSplitScreen ? 'p-4' : 'min-h-screen flex items-center justify-center p-6'
      }`}
      style={{ backgroundColor: 'var(--bg-canvas)', color: 'var(--text-primary)' }}
    >
      <div
        className="w-full max-w-2xl rounded-xl border p-6"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        <div className="flex items-center justify-between gap-3 border-b pb-4" style={{ borderColor: 'var(--border-subtle)' }}>
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-lg font-bold"
              style={{
                backgroundColor: 'var(--accent-blaze)',
                color: 'var(--accent-blaze-ink)',
              }}
            >
              <Radio className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <div className="text-xs font-semibold tracking-wider uppercase" style={{ color: 'var(--accent-blaze)' }}>
                FiberBlaze Cavite WFM
              </div>
              <h1 className="text-lg font-semibold">
                {surface === 'tech'
                  ? 'Field Technician Mobile Sign-In'
                  : 'Operations Command Center Sign-In'}
              </h1>
            </div>
          </div>
          <span
            className="font-mono-tabular rounded px-2.5 py-1 text-xs font-medium border"
            style={{
              backgroundColor: 'var(--bg-elevated)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-secondary)',
            }}
          >
            HS256 JWT • {surface.toUpperCase()} SCOPE
          </span>
        </div>

        {error && (
          <div
            role="alert"
            className="mt-4 flex items-center gap-2 rounded-lg border px-3.5 py-2.5 text-sm"
            style={{
              backgroundColor: 'var(--status-fault-soft)',
              borderColor: 'var(--status-fault)',
              color: 'var(--text-primary)',
            }}
          >
            <AlertCircle className="h-4 w-4 shrink-0" style={{ color: 'var(--status-fault)' }} />
            <span>{error}</span>
          </div>
        )}

        <div className="mt-5">
          <div className="text-xs font-semibold uppercase tracking-wider mb-2.5" style={{ color: 'var(--text-muted)' }}>
            1-Click Authenticated Rehearsal Personas
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {eligiblePersonas.map((p) => {
              const meta = ROLE_META[p.role];
              const Icon = meta.icon;
              const busy = loadingEmail === p.email;
              return (
                <button
                  key={p.id}
                  type="button"
                  disabled={loadingEmail !== null}
                  onClick={() => signInWith(p.email, DEMO_DEFAULT_PW)}
                  className="flex flex-col items-start text-left rounded-lg border p-3.5 transition-colors min-h-12"
                  style={{
                    backgroundColor: 'var(--bg-elevated)',
                    borderColor: 'var(--border-subtle)',
                  }}
                >
                  <div className="flex w-full items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold" style={{ color: 'var(--accent-blaze)' }}>
                      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                      {p.role.replace('_', ' ')}
                    </span>
                    <span className="font-mono-tabular text-xs" style={{ color: 'var(--text-muted)' }}>
                      {p.employeeCode}
                    </span>
                  </div>
                  <div className="mt-1 font-semibold text-sm">{p.fullName}</div>
                  <div className="mt-0.5 text-xs line-clamp-2" style={{ color: 'var(--text-muted)' }}>
                    {meta.desc}
                  </div>
                  <div className="mt-2 inline-flex items-center gap-1 text-xs font-medium" style={{ color: 'var(--status-info)' }}>
                    <span>{busy ? 'Signing in…' : `Sign in (${p.email})`}</span>
                    <ArrowRight className="h-3 w-3" aria-hidden="true" />
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <form
          className="mt-5 border-t pt-4 grid grid-cols-1 sm:grid-cols-12 gap-3 items-end"
          style={{ borderColor: 'var(--border-subtle)' }}
          onSubmit={(e) => {
            e.preventDefault();
            void signInWith(email, password);
          }}
        >
          <div className="sm:col-span-5">
            <label htmlFor={`login-email-${surface}`} className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
              Corporate Email
            </label>
            <input
              id={`login-email-${surface}`}
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm min-h-11"
              style={{
                backgroundColor: 'var(--bg-elevated)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
            />
          </div>
          <div className="sm:col-span-4">
            <label htmlFor={`login-pw-${surface}`} className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
              Password
            </label>
            <input
              id={`login-pw-${surface}`}
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm min-h-11"
              style={{
                backgroundColor: 'var(--bg-elevated)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
            />
          </div>
          <div className="sm:col-span-3">
            <button
              type="submit"
              disabled={loadingEmail !== null}
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold min-h-11 transition-opacity"
              style={{
                backgroundColor: 'var(--accent-blaze)',
                color: 'var(--accent-blaze-ink)',
              }}
            >
              <Lock className="h-4 w-4" aria-hidden="true" />
              <span>Sign In</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
