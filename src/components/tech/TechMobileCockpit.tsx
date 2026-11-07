'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  CloudOff,
  MapPin,
  Navigation,
  RefreshCw,
  Wrench,
} from 'lucide-react';
import { surfaceFetchJson } from '@/client/apiClient';
import {
  enqueueFieldMutation,
  isDeadZoneActive,
  listQueuedMutations,
  setSimulatedDeadZone,
  subscribeOfflineState,
  type QueuedFieldMutation,
} from '@/client/offlineQueue';
import { CaviteMapStage } from '@/components/map/CaviteMapStage';
import { LoginPersonaScreen } from '@/components/shared/LoginPersonaScreen';
import type {
  AuthenticatedUser,
  NapBoxRecord,
  TechnicianTelemetryView,
  VehicleType,
  WorkOrderRecord,
  WorkOrderStatus,
} from '@/domain/types';
import { OfflineSyncDrawer } from './OfflineSyncDrawer';
import { TechAssignedQueueTab } from './TechAssignedQueueTab';
import { TechGuidedExecuteTab } from './TechGuidedExecuteTab';
import { TechTopStatusBar } from './TechTopStatusBar';
import type {
  FieldTheme,
  OnlineSyncReceipt,
  SubmitOutcomePayload,
  TechBootstrapResponse,
  TechTabId,
} from './techTypes';

export function TechMobileCockpit({
  embeddedInSplitScreen = false,
}: {
  embeddedInSplitScreen?: boolean;
}) {
  const [theme, setTheme] = useState<FieldTheme>('field-light');
  const [activeTab, setActiveTab] = useState<TechTabId>('assigned');

  const [sessionLoading, setSessionLoading] = useState(true);
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [demoPersonas, setDemoPersonas] = useState<AuthenticatedUser[]>([]);
  const [logoutBanner, setLogoutBanner] = useState<string | null>(null);

  const [workOrders, setWorkOrders] = useState<WorkOrderRecord[]>([]);
  const [napBoxes, setNapBoxes] = useState<NapBoxRecord[]>([]);
  const [techProfile, setTechProfile] =
    useState<TechnicianTelemetryView | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  const [techPos, setTechPos] = useState<{ lat: number; lng: number } | null>(
    null,
  );
  const [mapCapturedPin, setMapCapturedPin] = useState<{
    lat: number;
    lng: number;
  } | null>(null);

  const [deadZone, setDeadZone] = useState<boolean>(false);
  const [queuedMutations, setQueuedMutations] = useState<QueuedFieldMutation[]>(
    [],
  );
  const [onlineReceipts, setOnlineReceipts] = useState<OnlineSyncReceipt[]>([]);
  const [toastBanner, setToastBanner] = useState<{
    tone: 'ok' | 'warn';
    message: string;
  } | null>(null);

  const [startingJobId, setStartingJobId] = useState<string | null>(null);
  const [submittingOutcome, setSubmittingOutcome] = useState(false);

  const refreshQueueList = useCallback(async () => {
    const list = await listQueuedMutations();
    setQueuedMutations(list);
  }, []);

  const refreshBootstrap = useCallback(async () => {
    if (isDeadZoneActive()) return;
    try {
      const data = await surfaceFetchJson<TechBootstrapResponse>(
        'tech',
        '/api/bootstrap?surface=tech',
      );
      setUser(data.user);
      setWorkOrders(data.workOrders);
      setNapBoxes(data.napBoxes);
      const ownTech = data.technicians[0] ?? null;
      setTechProfile(ownTech);
      if (ownTech?.lastLat !== null && ownTech?.lastLng !== null && ownTech) {
        setTechPos((prev) =>
          prev ?? { lat: ownTech.lastLat!, lng: ownTech.lastLng! },
        );
      }
      setSelectedJobId((prev) => {
        if (prev && data.workOrders.some((w) => w.id === prev)) return prev;
        const firstActive =
          data.workOrders.find((w) => w.status === 'WORKING') ??
          data.workOrders.find((w) => w.status === 'ASSIGNED') ??
          data.workOrders[0];
        return firstActive?.id ?? null;
      });
    } catch {
      // Preserve local view during dead-zone transitions
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    setDeadZone(isDeadZoneActive());
    void refreshQueueList();

    surfaceFetchJson<{
      user: AuthenticatedUser | null;
      demoPersonas: AuthenticatedUser[];
    }>('tech', '/api/auth/session?surface=tech')
      .then((res) => {
        if (!mounted) return;
        setDemoPersonas(res.demoPersonas);
        setUser(res.user);
        if (res.user) void refreshBootstrap();
      })
      .catch(() => {})
      .finally(() => {
        if (mounted) setSessionLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [refreshBootstrap, refreshQueueList]);

  useEffect(() => {
    return subscribeOfflineState(() => {
      const offline = isDeadZoneActive();
      setDeadZone(offline);
      void refreshQueueList();
      if (!offline && user) void refreshBootstrap();
    });
  }, [refreshBootstrap, refreshQueueList, user]);

  useEffect(() => {
    if (!user || deadZone || typeof EventSource === 'undefined') return;
    const es = new EventSource('/api/events?surface=tech', {
      withCredentials: true,
    });
    es.onmessage = (evt) => {
      try {
        const parsed = JSON.parse(evt.data) as { type?: string };
        if (parsed.type && parsed.type !== 'CONNECTED') void refreshBootstrap();
      } catch {
        void refreshBootstrap();
      }
    };
    return () => es.close();
  }, [user, deadZone, refreshBootstrap]);

  const effectiveWorkOrders = useMemo(() => {
    const chronological = [...queuedMutations]
      .filter((m) => m.status === 'QUEUED')
      .sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));
    if (chronological.length === 0) return workOrders;

    return workOrders.map((wo) => {
      let updated: WorkOrderRecord = wo;
      for (const mut of chronological) {
        if (mut.workOrderId !== wo.id) continue;
        if (mut.endpoint === '/api/work-orders/start') {
          updated = { ...updated, status: 'WORKING' };
        } else if (mut.endpoint === '/api/work-orders/outcome') {
          const nextStatus =
            (mut.payload.outcomeStatus as WorkOrderStatus) ?? updated.status;
          updated = {
            ...updated,
            status: nextStatus,
            opticalRxDbm:
              typeof mut.payload.opticalRxDbm === 'number'
                ? mut.payload.opticalRxDbm
                : updated.opticalRxDbm,
          };
        }
      }
      return updated;
    });
  }, [workOrders, queuedMutations]);

  const queuedWorkOrderIds = useMemo(
    () =>
      new Set(
        queuedMutations
          .filter((m) => m.status === 'QUEUED')
          .map((m) => m.workOrderId),
      ),
    [queuedMutations],
  );

  const pendingSyncCount = useMemo(
    () => queuedMutations.filter((m) => m.status === 'QUEUED').length,
    [queuedMutations],
  );

  const activeJob = useMemo(
    () =>
      effectiveWorkOrders.find((w) => w.id === selectedJobId) ??
      effectiveWorkOrders[0] ??
      null,
    [effectiveWorkOrders, selectedJobId],
  );

  const techVehicle: VehicleType = techProfile?.vehicleType ?? 'l300_van';

  async function handleLogout() {
    try {
      await surfaceFetchJson<{ ok: boolean; gpsTrackingHalted: boolean }>(
        'tech',
        '/api/auth/logout',
        { method: 'POST', body: JSON.stringify({}) },
      );
    } catch {
      // Clear local session regardless
    }
    setUser(null);
    setWorkOrders([]);
    setTechProfile(null);
    setLogoutBanner(
      'Signed out cleanly — Technician GPS telemetry tracking is now HALTED on the FiberBlaze server.',
    );
  }

  const handleTelemetryPing = useCallback(
    (coords: { lat: number; lng: number; speedKmh: number }) => {
      setTechPos({ lat: coords.lat, lng: coords.lng });
      if (!user || isDeadZoneActive()) return;
      void surfaceFetchJson('tech', '/api/telemetry/gps', {
        method: 'POST',
        body: JSON.stringify(coords),
      }).catch(() => {});
    },
    [user],
  );

  const handleFieldPinCaptured = useCallback(
    (coords: { lat: number; lng: number }) => {
      setMapCapturedPin(coords);
      setToastBanner({
        tone: 'ok',
        message: `Field GPS pin captured (${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}). Ready in Execute tab.`,
      });
    },
    [],
  );

  async function handleStartJob(wo: WorkOrderRecord) {
    const idempotencyKey = crypto.randomUUID();
    setStartingJobId(wo.id);
    setSelectedJobId(wo.id);

    const enqueueOfflineStart = async () => {
      await enqueueFieldMutation({
        idempotencyKey,
        endpoint: '/api/work-orders/start',
        workOrderId: wo.id,
        ticketNumber: wo.ticketNumber,
        summary: 'START_WORK -> WORKING',
        payload: { workOrderId: wo.id },
      });
      await refreshQueueList();
      setToastBanner({
        tone: 'warn',
        message: `Dead-Zone Offline: ${wo.ticketNumber} optimistically set to WORKING and stored in IndexedDB Offline Queue.`,
      });
      setActiveTab('execute');
    };

    try {
      if (isDeadZoneActive()) {
        await enqueueOfflineStart();
        return;
      }

      const res = await surfaceFetchJson<{
        workOrder: WorkOrderRecord;
        replayed: boolean;
      }>('tech', '/api/work-orders/start', {
        method: 'POST',
        body: JSON.stringify({ workOrderId: wo.id, idempotencyKey }),
      });

      setOnlineReceipts((prev) => [
        {
          idempotencyKey,
          endpoint: '/api/work-orders/start',
          workOrderId: wo.id,
          ticketNumber: wo.ticketNumber,
          summary: 'START_WORK -> WORKING',
          payload: { workOrderId: wo.id },
          syncedAt: new Date().toISOString(),
          replayed: res.replayed,
          note: 'Synced live to FiberBlaze WFM core',
        },
        ...prev,
      ]);
      await refreshBootstrap();
      setToastBanner({
        tone: 'ok',
        message: `${wo.ticketNumber} started (WORKING). Guided FTTH checklist unlocked.`,
      });
      setActiveTab('execute');
    } catch (err) {
      if (err instanceof TypeError) {
        await enqueueOfflineStart();
      } else {
        setToastBanner({
          tone: 'warn',
          message:
            err instanceof Error ? err.message : 'Unable to start work order.',
        });
      }
    } finally {
      setStartingJobId(null);
    }
  }

  async function handleSubmitOutcome(
    wo: WorkOrderRecord,
    payloadWithoutKey: Omit<SubmitOutcomePayload, 'idempotencyKey'>,
  ) {
    const idempotencyKey = crypto.randomUUID();
    setSubmittingOutcome(true);
    const recordPayload: Record<string, unknown> = { ...payloadWithoutKey };

    const enqueueOfflineOutcome = async () => {
      await enqueueFieldMutation({
        idempotencyKey,
        endpoint: '/api/work-orders/outcome',
        workOrderId: wo.id,
        ticketNumber: wo.ticketNumber,
        summary: `OUTCOME -> ${payloadWithoutKey.outcomeStatus}`,
        payload: recordPayload,
      });
      await refreshQueueList();
      setToastBanner({
        tone: 'warn',
        message: `Stored in IndexedDB Offline Queue (${wo.ticketNumber} -> ${payloadWithoutKey.outcomeStatus}). Flush in Sync tab when back online.`,
      });
      setActiveTab('sync');
    };

    try {
      if (isDeadZoneActive()) {
        await enqueueOfflineOutcome();
        return;
      }

      const res = await surfaceFetchJson<{
        workOrder: WorkOrderRecord;
        replayed: boolean;
        discrepancyCreated: boolean;
      }>('tech', '/api/work-orders/outcome', {
        method: 'POST',
        body: JSON.stringify({ ...payloadWithoutKey, idempotencyKey }),
      });

      setOnlineReceipts((prev) => [
        {
          idempotencyKey,
          endpoint: '/api/work-orders/outcome',
          workOrderId: wo.id,
          ticketNumber: wo.ticketNumber,
          summary: `OUTCOME -> ${payloadWithoutKey.outcomeStatus}`,
          payload: recordPayload,
          syncedAt: new Date().toISOString(),
          replayed: res.replayed,
          note: res.discrepancyCreated
            ? 'Synced + >30m GPS discrepancy queued for Supervisor'
            : 'Synced cleanly to FiberBlaze WFM core',
        },
        ...prev,
      ]);
      await refreshBootstrap();
      setToastBanner({
        tone: 'ok',
        message: res.discrepancyCreated
          ? `${wo.ticketNumber} recorded (${payloadWithoutKey.outcomeStatus}) + >30m GPS discrepancy flagged for Supervisor.`
          : `${wo.ticketNumber} closed out cleanly (${payloadWithoutKey.outcomeStatus}).`,
      });
      setActiveTab('assigned');
    } catch (err) {
      if (err instanceof TypeError) {
        await enqueueOfflineOutcome();
      } else {
        throw err;
      }
    } finally {
      setSubmittingOutcome(false);
    }
  }

  if (sessionLoading) {
    return (
      <div
        data-theme={theme}
        className="min-h-64 w-full flex items-center justify-center p-6 text-sm font-semibold"
        style={{
          backgroundColor: 'var(--bg-canvas)',
          color: 'var(--text-secondary)',
        }}
      >
        Loading Cavite Field Technician Cockpit…
      </div>
    );
  }

  if (!user) {
    return (
      <div
        data-theme={theme}
        className="w-full"
        style={{
          backgroundColor: 'var(--bg-canvas)',
          color: 'var(--text-primary)',
        }}
      >
        {logoutBanner && (
          <div role="status" className="mx-auto max-w-2xl pt-3 px-4">
            <div
              className="flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-xs font-semibold"
              style={{
                backgroundColor: 'var(--status-ok-soft)',
                borderColor: 'var(--status-ok)',
                color: 'var(--text-primary)',
              }}
            >
              <CheckCircle2
                className="h-4 w-4 shrink-0"
                style={{ color: 'var(--status-ok)' }}
                aria-hidden="true"
              />
              <span>{logoutBanner}</span>
            </div>
          </div>
        )}
        <LoginPersonaScreen
          surface="tech"
          demoPersonas={demoPersonas}
          embeddedInSplitScreen={embeddedInSplitScreen}
          onAuthenticated={(authedUser) => {
            setLogoutBanner(null);
            setUser(authedUser);
            void refreshBootstrap();
          }}
        />
      </div>
    );
  }

  const activeJobCount = effectiveWorkOrders.filter(
    (w) => w.status === 'ASSIGNED' || w.status === 'WORKING',
  ).length;

  return (
    <div
      data-theme={theme}
      className={
        embeddedInSplitScreen
          ? 'h-full w-full flex flex-col overflow-hidden'
          : 'min-h-dvh w-full sm:py-4 sm:px-3'
      }
      style={{
        backgroundColor: 'var(--bg-canvas)',
        color: 'var(--text-primary)',
      }}
    >
      <div
        className={
          embeddedInSplitScreen
            ? 'h-full w-full flex flex-col overflow-hidden'
            : 'mx-auto w-full max-w-xl min-h-dvh sm:min-h-[820px] sm:rounded-2xl sm:border sm:shadow-xl flex flex-col overflow-hidden'
        }
        style={{
          backgroundColor: 'var(--bg-canvas)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        <TechTopStatusBar
          user={user}
          vehicleType={techVehicle}
          theme={theme}
          deadZone={deadZone}
          pendingSyncCount={pendingSyncCount}
          onToggleTheme={() =>
            setTheme((t) => (t === 'field-light' ? 'field-dark' : 'field-light'))
          }
          onToggleDeadZone={() => setSimulatedDeadZone(!deadZone)}
          onOpenSyncTab={() => setActiveTab('sync')}
          onLogout={() => void handleLogout()}
        />

        {toastBanner && (
          <div
            role="status"
            className="mx-3 mt-2.5 rounded-xl border px-3.5 py-2.5 text-xs font-semibold flex items-center justify-between gap-2 shrink-0"
            style={{
              backgroundColor:
                toastBanner.tone === 'warn'
                  ? 'var(--status-warn-soft)'
                  : 'var(--status-ok-soft)',
              borderColor:
                toastBanner.tone === 'warn'
                  ? 'var(--status-warn)'
                  : 'var(--status-ok)',
              color: 'var(--text-primary)',
            }}
          >
            <div className="flex items-center gap-2">
              {toastBanner.tone === 'warn' ? (
                <CloudOff
                  className="h-4 w-4 shrink-0"
                  style={{ color: 'var(--status-warn)' }}
                  aria-hidden="true"
                />
              ) : (
                <CheckCircle2
                  className="h-4 w-4 shrink-0"
                  style={{ color: 'var(--status-ok)' }}
                  aria-hidden="true"
                />
              )}
              <span>{toastBanner.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setToastBanner(null)}
              className="min-h-12 px-2 text-xs font-bold underline shrink-0"
              style={{ color: 'var(--text-secondary)' }}
            >
              Dismiss
            </button>
          </div>
        )}

        <main
          className="flex-1 overflow-y-auto overscroll-contain p-3"
          style={{ touchAction: 'manipulation' }}
        >
          {activeTab === 'assigned' && (
            <TechAssignedQueueTab
              workOrders={effectiveWorkOrders}
              napBoxes={napBoxes}
              activeJobId={activeJob?.id ?? null}
              queuedWorkOrderIds={queuedWorkOrderIds}
              startingJobId={startingJobId}
              onSelectNavigate={(wo) => {
                setSelectedJobId(wo.id);
                setActiveTab('nav');
              }}
              onStartJob={(wo) => void handleStartJob(wo)}
              onOpenExecute={(wo) => {
                setSelectedJobId(wo.id);
                setActiveTab('execute');
              }}
            />
          )}

          {activeTab === 'nav' && (
            <div className="space-y-3">
              <CaviteMapStage
                mode="tech-navigation"
                selectedWorkOrder={activeJob}
                napBoxes={napBoxes}
                activeTechPosition={techPos}
                vehicleProfile={techVehicle}
                offlineMode={deadZone}
                onTelemetryPing={handleTelemetryPing}
                onFieldPinCaptured={handleFieldPinCaptured}
                compactHeight={embeddedInSplitScreen}
              />

              {activeJob && (
                <div
                  className="rounded-xl border p-3.5 space-y-2.5"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--border-subtle)',
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono-tabular text-xs font-bold">
                      {activeJob.ticketNumber} • {activeJob.workflowType}
                    </span>
                    <span
                      className="font-mono-tabular text-xs"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {activeJob.targetLat.toFixed(4)},{' '}
                      {activeJob.targetLng.toFixed(4)}
                    </span>
                  </div>
                  <div className="flex items-start gap-1.5 text-xs font-semibold">
                    <MapPin
                      className="h-4 w-4 mt-0.5 shrink-0"
                      style={{ color: 'var(--accent-blaze)' }}
                      aria-hidden="true"
                    />
                    <span>
                      {activeJob.subscriberName} — {activeJob.targetAddress},
                      Brgy. {activeJob.targetBarangay},{' '}
                      {activeJob.targetMunicipality}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('execute')}
                    className="w-full min-h-12 inline-flex items-center justify-center gap-2 rounded-lg px-4 text-xs font-bold"
                    style={{
                      backgroundColor: 'var(--accent-blaze)',
                      color: 'var(--accent-blaze-ink)',
                    }}
                  >
                    <span>Proceed to Field Execution</span>
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              )}
            </div>
          )}

          {activeTab === 'execute' && (
            <TechGuidedExecuteTab
              activeJob={activeJob}
              napBoxes={napBoxes}
              techEmployeeCode={user.employeeCode}
              activeTechPosition={techPos}
              externalCapturedPin={mapCapturedPin}
              isStartingJob={startingJobId === activeJob?.id}
              isSubmittingOutcome={submittingOutcome}
              onStartJob={(wo) => void handleStartJob(wo)}
              onSubmitOutcome={handleSubmitOutcome}
            />
          )}

          {activeTab === 'sync' && (
            <OfflineSyncDrawer
              deadZone={deadZone}
              queuedMutations={queuedMutations}
              onlineReceipts={onlineReceipts}
              onQueueChanged={async () => {
                await refreshQueueList();
                await refreshBootstrap();
              }}
              onReplayConfirmed={(key, note) => {
                setOnlineReceipts((prev) =>
                  prev.map((r) =>
                    r.idempotencyKey === key
                      ? { ...r, replayed: true, note }
                      : r,
                  ),
                );
              }}
            />
          )}
        </main>

        <nav
          aria-label="Technician cockpit navigation"
          className="min-h-14 border-t px-2 py-1.5 grid grid-cols-4 gap-2 shrink-0"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          {(
            [
              {
                id: 'assigned',
                label: `Assigned (${activeJobCount})`,
                icon: ClipboardList,
              },
              { id: 'nav', label: '3D Nav', icon: Navigation },
              { id: 'execute', label: 'Execute', icon: Wrench },
              {
                id: 'sync',
                label:
                  pendingSyncCount > 0 ? `Sync (${pendingSyncCount})` : 'Sync',
                icon: RefreshCw,
              },
            ] as const
          ).map((item) => {
            const Icon = item.icon;
            const selected = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                aria-current={selected ? 'page' : undefined}
                onClick={() => setActiveTab(item.id)}
                className="min-h-12 flex flex-col items-center justify-center gap-1 rounded-lg px-1.5 text-[11px] font-bold transition-colors font-mono-tabular"
                style={{
                  backgroundColor: selected
                    ? 'var(--accent-blaze)'
                    : 'var(--bg-elevated)',
                  color: selected
                    ? 'var(--accent-blaze-ink)'
                    : 'var(--text-secondary)',
                }}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                <span className="truncate max-w-full">{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
