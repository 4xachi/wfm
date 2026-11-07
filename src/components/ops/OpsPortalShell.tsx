'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  Info,
  LogOut,
  Map as MapIcon,
  Moon,
  Radio,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  SplitSquareHorizontal,
  Sun,
  X,
} from 'lucide-react';
import { surfaceFetchJson } from '@/client/apiClient';
import { LoginPersonaScreen } from '@/components/shared/LoginPersonaScreen';
import type { AuthenticatedUser } from '@/domain/types';
import { AuditAndOutboxPanel } from './AuditAndOutboxPanel';
import { ExcelDispatchWizard } from './ExcelDispatchWizard';
import { OpsFleetDispatchTab } from './OpsFleetDispatchTab';
import { SupervisorGovernanceDesk } from './SupervisorGovernanceDesk';
import type {
  OpsBootstrapPayload,
  OpsStatusBanner,
  OpsTabId,
} from './opsHelpers';

const DEMO_DEFAULT_PW = 'FiberBlaze2026!';

export function OpsPortalShell({
  embeddedInSplitScreen = false,
}: {
  embeddedInSplitScreen?: boolean;
}) {
  const [theme, setTheme] = useState<'noc-dark' | 'noc-light'>('noc-dark');
  const [authChecked, setAuthChecked] = useState(false);
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [demoPersonas, setDemoPersonas] = useState<AuthenticatedUser[]>([]);
  const [bootstrap, setBootstrap] = useState<OpsBootstrapPayload | null>(null);
  const [activeTab, setActiveTab] = useState<OpsTabId>('fleet');
  const [selectedWorkOrderId, setSelectedWorkOrderId] = useState<string | null>(
    null,
  );
  const [banner, setBanner] = useState<OpsStatusBanner | null>(null);
  const [sseLive, setSseLive] = useState(false);
  const [switchingRole, setSwitchingRole] = useState(false);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Apply theme to document when standalone, always apply to shell container
  useEffect(() => {
    if (!embeddedInSplitScreen && typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', theme);
    }
  }, [theme, embeddedInSplitScreen]);

  // Auto-clear status banner after 6.5s
  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), 6500);
    return () => clearTimeout(t);
  }, [banner]);

  const refreshBootstrap = useCallback(async () => {
    try {
      const data = await surfaceFetchJson<OpsBootstrapPayload>(
        'ops',
        '/api/bootstrap',
      );
      setBootstrap(data);
      setUser(data.user);
      setSelectedWorkOrderId((prev) => {
        if (prev && data.workOrders.some((w) => w.id === prev)) return prev;
        const unassigned = data.workOrders.find(
          (w) => w.status === 'UNASSIGNED',
        );
        return unassigned?.id ?? data.workOrders[0]?.id ?? null;
      });
    } catch {
      // Session expired or unauthorized
      setUser(null);
      setBootstrap(null);
    }
  }, []);

  // Initial session check
  useEffect(() => {
    let cancelled = false;
    surfaceFetchJson<{
      user: AuthenticatedUser | null;
      demoPersonas: AuthenticatedUser[];
    }>('ops', '/api/auth/session')
      .then(async (session) => {
        if (cancelled) return;
        setDemoPersonas(session.demoPersonas);
        if (session.user && session.user.role !== 'TECHNICIAN') {
          setUser(session.user);
          await refreshBootstrap();
        } else {
          setUser(null);
        }
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setAuthChecked(true);
      });

    return () => {
      cancelled = true;
    };
  }, [refreshBootstrap]);

  // Live SSE stream subscription
  useEffect(() => {
    if (!user || user.role === 'TECHNICIAN') {
      setSseLive(false);
      return;
    }

    const es = new EventSource('/api/events?surface=ops');
    es.onopen = () => setSseLive(true);
    es.onmessage = (evt) => {
      setSseLive(true);
      try {
        const parsed = JSON.parse(evt.data) as { type?: string };
        if (parsed.type === 'CONNECTED') return;
      } catch {
        // Refresh anyway
      }
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = setTimeout(() => {
        void refreshBootstrap();
      }, 300);
    };
    es.onerror = () => setSseLive(false);

    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      es.close();
      setSseLive(false);
    };
  }, [user?.id, user?.role, refreshBootstrap]);

  async function handleRoleSwitch(targetEmail: string) {
    if (!targetEmail || targetEmail === user?.email) return;
    setSwitchingRole(true);
    try {
      const res = await surfaceFetchJson<{ user: AuthenticatedUser }>(
        'ops',
        '/api/auth/login',
        {
          method: 'POST',
          body: JSON.stringify({
            email: targetEmail,
            password: DEMO_DEFAULT_PW,
          }),
        },
      );
      setUser(res.user);
      await refreshBootstrap();
      setBanner({
        tone: 'info',
        message: `Switched NOC session to ${res.user.fullName} (${res.user.role}).`,
      });
    } catch (err) {
      setBanner({
        tone: 'fault',
        message: err instanceof Error ? err.message : 'Role switch failed.',
      });
    } finally {
      setSwitchingRole(false);
    }
  }

  async function handleLogout() {
    try {
      await surfaceFetchJson('ops', '/api/auth/logout', {
        method: 'POST',
        body: '{}',
      });
    } finally {
      setUser(null);
      setBootstrap(null);
      setBanner(null);
    }
  }

  const opsPersonas = demoPersonas.filter((p) => p.role !== 'TECHNICIAN');

  if (!authChecked) {
    return (
      <div
        data-theme={theme}
        className="min-h-screen flex items-center justify-center p-6 text-sm"
        style={{
          backgroundColor: 'var(--bg-canvas)',
          color: 'var(--text-secondary)',
        }}
      >
        Initializing FiberBlaze Cavite NOC Command Surface…
      </div>
    );
  }

  if (!user || user.role === 'TECHNICIAN' || !bootstrap) {
    return (
      <div data-theme={theme}>
        <LoginPersonaScreen
          surface="ops"
          demoPersonas={demoPersonas}
          embeddedInSplitScreen={embeddedInSplitScreen}
          onAuthenticated={async (authedUser) => {
            setUser(authedUser);
            await refreshBootstrap();
          }}
        />
      </div>
    );
  }

  const { kpis } = bootstrap;
  const governanceBadgeCount =
    kpis.fbIssueCount + kpis.pendingGpsDiffCount + kpis.pendingReviewCount;

  const tabs: Array<{
    id: OpsTabId;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: number;
  }> = [
    {
      id: 'fleet',
      label: 'Fleet & Dispatch',
      icon: MapIcon,
      badge: kpis.unassignedCount + kpis.custIssueCount,
    },
    {
      id: 'intake',
      label: 'Excel & Digital Intake',
      icon: FileSpreadsheet,
    },
    {
      id: 'governance',
      label: 'Supervisor Review & NetOps',
      icon: ShieldAlert,
      badge: governanceBadgeCount,
    },
    {
      id: 'audit',
      label: 'Audit & Integration Gate',
      icon: ShieldCheck,
      badge: bootstrap.outbox.length,
    },
  ];

  return (
    <div
      data-theme={theme}
      className={embeddedInSplitScreen ? 'w-full' : 'min-h-screen w-full'}
      style={{
        backgroundColor: 'var(--bg-canvas)',
        color: 'var(--text-primary)',
      }}
    >
      {/* Top Precision NOC Command Bar */}
      <header
        className="sticky top-0 z-30 border-b px-4 py-2.5"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-lg shrink-0"
              style={{
                backgroundColor: 'var(--accent-blaze)',
                color: 'var(--accent-blaze-ink)',
              }}
            >
              <Radio className="h-4 w-4" aria-hidden="true" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-bold tracking-tight">
                  FiberBlaze Cavite NOC
                </h1>
                <span
                  className="font-mono-tabular inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-semibold"
                  style={{
                    backgroundColor: sseLive
                      ? 'var(--status-ok-soft)'
                      : 'var(--bg-elevated)',
                    borderColor: sseLive
                      ? 'var(--status-ok)'
                      : 'var(--border-subtle)',
                    color: sseLive ? 'var(--status-ok)' : 'var(--text-muted)',
                  }}
                >
                  <Activity className="h-3 w-3" aria-hidden="true" />
                  {sseLive ? 'SSE LIVE' : 'SYNCING'}
                </span>
              </div>
              <div
                className="font-mono-tabular text-[11px]"
                style={{ color: 'var(--text-muted)' }}
              >
                {user.fullName} • {user.employeeCode} • {user.role}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {!embeddedInSplitScreen && (
              <nav
                aria-label="Cross-Surface Links"
                className="hidden md:flex items-center gap-1.5 mr-1"
              >
                <Link
                  href="/"
                  className="rounded-lg border px-2.5 py-1.5 text-xs font-medium"
                  style={{
                    backgroundColor: 'var(--bg-elevated)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  Gateway
                </Link>
                <Link
                  href="/tech"
                  className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium"
                  style={{
                    backgroundColor: 'var(--bg-elevated)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  <Smartphone className="h-3.5 w-3.5" aria-hidden="true" />
                  Field Mobile
                </Link>
                <Link
                  href="/demo"
                  className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold"
                  style={{
                    backgroundColor: 'var(--accent-blaze-soft)',
                    borderColor: 'var(--accent-blaze)',
                    color: 'var(--accent-blaze)',
                  }}
                >
                  <SplitSquareHorizontal
                    className="h-3.5 w-3.5"
                    aria-hidden="true"
                  />
                  Split Rehearsal
                </Link>
              </nav>
            )}

            {/* Quick Role Switcher */}
            {opsPersonas.length > 0 && (
              <select
                aria-label="Switch NOC Role Persona"
                disabled={switchingRole}
                value={user.email}
                onChange={(e) => void handleRoleSwitch(e.target.value)}
                className="font-mono-tabular rounded-lg border px-2.5 py-1.5 text-xs min-h-9"
                style={{
                  backgroundColor: 'var(--bg-elevated)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              >
                {opsPersonas.map((p) => (
                  <option key={p.id} value={p.email}>
                    {p.role}: {p.fullName}
                  </option>
                ))}
              </select>
            )}

            {/* Projector Light / Dark NOC Toggle */}
            <button
              type="button"
              onClick={() =>
                setTheme((prev) =>
                  prev === 'noc-dark' ? 'noc-light' : 'noc-dark',
                )
              }
              aria-label={
                theme === 'noc-dark'
                  ? 'Switch to Projector Daylight Mode'
                  : 'Switch to Carbon Dark NOC Mode'
              }
              className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium min-h-9"
              style={{
                backgroundColor: 'var(--bg-elevated)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
            >
              {theme === 'noc-dark' ? (
                <>
                  <Sun className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Projector Light</span>
                </>
              ) : (
                <>
                  <Moon className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Carbon Dark</span>
                </>
              )}
            </button>

            <button
              type="button"
              aria-label="Refresh Cavite telemetry"
              onClick={() => void refreshBootstrap()}
              className="rounded-lg border p-2 min-h-9"
              style={{
                backgroundColor: 'var(--bg-elevated)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-secondary)',
              }}
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            </button>

            <button
              type="button"
              onClick={() => void handleLogout()}
              className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium min-h-9"
              style={{
                backgroundColor: 'var(--bg-elevated)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-secondary)',
              }}
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>

        {/* KPI Telemetry Strip */}
        <div
          className="mt-2.5 pt-2.5 border-t grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 text-xs"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          {[
            { label: 'Total Tickets', val: kpis.totalOrders, color: 'var(--text-primary)' },
            { label: 'Unassigned', val: kpis.unassignedCount, color: 'var(--accent-blaze)' },
            { label: 'Active Field', val: kpis.activeFieldCount, color: 'var(--status-info)' },
            { label: 'Completed', val: kpis.completedCount, color: 'var(--status-ok)' },
            { label: 'Live GPS Techs', val: `${kpis.liveTechCount}/${bootstrap.technicians.length}`, color: 'var(--status-ok)' },
            { label: 'FB-ISSUE Plant', val: kpis.fbIssueCount, color: 'var(--status-fault)' },
            { label: 'CUST-ISSUE', val: kpis.custIssueCount, color: 'var(--status-warn)' },
            { label: 'Gov Reviews', val: kpis.pendingReviewCount + kpis.pendingGpsDiffCount, color: 'var(--status-warn)' },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-lg border px-2.5 py-1.5 flex items-center justify-between gap-1"
              style={{
                backgroundColor: 'var(--bg-elevated)',
                borderColor: 'var(--border-subtle)',
              }}
            >
              <span
                className="text-[11px] truncate"
                style={{ color: 'var(--text-muted)' }}
              >
                {item.label}
              </span>
              <span
                className="font-mono-tabular font-bold text-xs"
                style={{ color: item.color }}
              >
                {item.val}
              </span>
            </div>
          ))}
        </div>

        {/* Role-Aware Navigation Tabs */}
        <div
          role="tablist"
          aria-label="Operations NOC Sections"
          className="mt-2.5 flex flex-wrap gap-1.5"
        >
          {tabs.map((t) => {
            const Icon = t.icon;
            const selected = activeTab === t.id;
            return (
              <button
                key={t.id}
                role="tab"
                type="button"
                aria-selected={selected}
                onClick={() => setActiveTab(t.id)}
                className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold min-h-9 transition-colors"
                style={{
                  backgroundColor: selected
                    ? 'var(--accent-blaze)'
                    : 'var(--bg-elevated)',
                  borderColor: selected
                    ? 'var(--accent-blaze)'
                    : 'var(--border-subtle)',
                  color: selected
                    ? 'var(--accent-blaze-ink)'
                    : 'var(--text-secondary)',
                }}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{t.label}</span>
                {typeof t.badge === 'number' && t.badge > 0 && (
                  <span
                    className="font-mono-tabular rounded px-1.5 py-0.2 text-[10px] font-bold"
                    style={{
                      backgroundColor: selected
                        ? 'rgba(9, 13, 18, 0.2)'
                        : 'var(--bg-surface)',
                      color: selected
                        ? 'var(--accent-blaze-ink)'
                        : 'var(--text-primary)',
                    }}
                  >
                    {t.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </header>

      {/* Status Feedback Banner */}
      {banner && (
        <div className="px-4 pt-3">
          <div
            role="status"
            aria-live="polite"
            className="flex items-center justify-between gap-2 rounded-lg border px-3.5 py-2 text-xs"
            style={{
              backgroundColor:
                banner.tone === 'ok'
                  ? 'var(--status-ok-soft)'
                  : banner.tone === 'fault'
                  ? 'var(--status-fault-soft)'
                  : banner.tone === 'warn'
                  ? 'var(--status-warn-soft)'
                  : 'var(--status-info-soft)',
              borderColor:
                banner.tone === 'ok'
                  ? 'var(--status-ok)'
                  : banner.tone === 'fault'
                  ? 'var(--status-fault)'
                  : banner.tone === 'warn'
                  ? 'var(--status-warn)'
                  : 'var(--status-info)',
            }}
          >
            <div className="flex items-center gap-2">
              {banner.tone === 'ok' ? (
                <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
              ) : banner.tone === 'fault' ? (
                <AlertOctagon className="h-4 w-4 shrink-0" aria-hidden="true" />
              ) : banner.tone === 'warn' ? (
                <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
              ) : (
                <Info className="h-4 w-4 shrink-0" aria-hidden="true" />
              )}
              <span className="font-medium">{banner.message}</span>
            </div>
            <button
              type="button"
              aria-label="Dismiss notification"
              onClick={() => setBanner(null)}
              className="p-1 rounded"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      {/* Active Tab Content */}
      <main className="p-4">
        {activeTab === 'fleet' && (
          <OpsFleetDispatchTab
            workOrders={bootstrap.workOrders}
            napBoxes={bootstrap.napBoxes}
            technicians={bootstrap.technicians}
            actorRole={user.role}
            embeddedInSplitScreen={embeddedInSplitScreen}
            selectedWorkOrderId={selectedWorkOrderId}
            onSelectWorkOrderId={setSelectedWorkOrderId}
            onRefresh={refreshBootstrap}
            onBanner={setBanner}
            onNavigateTab={setActiveTab}
          />
        )}

        {activeTab === 'intake' && (
          <ExcelDispatchWizard
            actorRole={user.role}
            embeddedInSplitScreen={embeddedInSplitScreen}
            onRefresh={refreshBootstrap}
            onBanner={setBanner}
            onSelectWorkOrderId={setSelectedWorkOrderId}
            onNavigateTab={setActiveTab}
          />
        )}

        {activeTab === 'governance' && (
          <SupervisorGovernanceDesk
            workOrders={bootstrap.workOrders}
            discrepancies={bootstrap.discrepancies}
            napBoxes={bootstrap.napBoxes}
            technicians={bootstrap.technicians}
            actorRole={user.role}
            onRefresh={refreshBootstrap}
            onBanner={setBanner}
          />
        )}

        {activeTab === 'audit' && (
          <AuditAndOutboxPanel
            auditLogs={bootstrap.auditLogs}
            auditIntegrity={bootstrap.auditIntegrity}
            outbox={bootstrap.outbox}
            kpis={bootstrap.kpis}
            actorRole={user.role}
            onRefresh={refreshBootstrap}
            onBanner={setBanner}
          />
        )}
      </main>
    </div>
  );
}
