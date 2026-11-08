'use client';

import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CloudOff,
  CloudUpload,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Trash2,
  Wifi,
} from 'lucide-react';
import { surfaceFetchJson } from '@/client/apiClient';
import {
  clearSyncedMutations,
  flushOfflineMutations,
  setSimulatedDeadZone,
  type QueuedFieldMutation,
} from '@/client/offlineQueue';
import type { OnlineSyncReceipt } from './techTypes';

interface OfflineSyncDrawerProps {
  deadZone: boolean;
  queuedMutations: QueuedFieldMutation[];
  onlineReceipts: OnlineSyncReceipt[];
  onQueueChanged: () => Promise<void>;
  onReplayConfirmed: (idempotencyKey: string, note: string) => void;
}

export function OfflineSyncDrawer({
  deadZone,
  queuedMutations,
  onlineReceipts,
  onQueueChanged,
  onReplayConfirmed,
}: OfflineSyncDrawerProps) {
  const [flushing, setFlushing] = useState(false);
  const [replayingKey, setReplayingKey] = useState<string | null>(null);
  const [bannerMsg, setBannerMsg] = useState<{
    tone: 'ok' | 'warn' | 'fault';
    text: string;
  } | null>(null);

  const pendingCount = queuedMutations.filter(
    (m) => m.status === 'QUEUED',
  ).length;
  const syncedIdbCount = queuedMutations.filter(
    (m) => m.status === 'SYNCED',
  ).length;

  async function handleReconnectAndFlush() {
    setFlushing(true);
    setBannerMsg(null);
    try {
      if (deadZone) {
        setSimulatedDeadZone(false);
      }
      const res = await flushOfflineMutations();
      await onQueueChanged();
      setBannerMsg({
        tone: res.conflictCount > 0 ? 'warn' : 'ok',
        text: `Queue flushed: ${res.syncedCount} synced, ${res.replayedCount} idempotent replays, ${res.conflictCount} conflicts.`,
      });
    } catch (err) {
      setBannerMsg({
        tone: 'fault',
        text:
          err instanceof Error
            ? err.message
            : 'Unable to flush offline mutations.',
      });
    } finally {
      setFlushing(false);
    }
  }

  async function handleClearHistory() {
    setBannerMsg(null);
    await clearSyncedMutations();
    await onQueueChanged();
    setBannerMsg({
      tone: 'ok',
      text: 'Cleared synced IndexedDB mutation history.',
    });
  }

  async function handleReplayTest(item: {
    idempotencyKey: string;
    endpoint: '/api/work-orders/start' | '/api/work-orders/outcome';
    payload: Record<string, unknown>;
    ticketNumber: string;
  }) {
    if (deadZone) {
      setBannerMsg({
        tone: 'warn',
        text: 'Disable Dead-Zone Offline Mode first to test live server idempotent replay.',
      });
      return;
    }

    setReplayingKey(item.idempotencyKey);
    setBannerMsg(null);
    try {
      const res = await surfaceFetchJson<{ replayed?: boolean }>(
        'tech',
        item.endpoint,
        {
          method: 'POST',
          body: JSON.stringify({
            ...item.payload,
            idempotencyKey: item.idempotencyKey,
          }),
        },
      );
      const note = res.replayed
        ? `Idempotent replay verified for ${item.ticketNumber} (replayed=true, 0 duplicates)`
        : `Server acknowledged ${item.ticketNumber}`;
      onReplayConfirmed(item.idempotencyKey, note);
      setBannerMsg({ tone: 'ok', text: note });
    } catch (err) {
      setBannerMsg({
        tone: 'fault',
        text:
          err instanceof Error
            ? err.message
            : 'Replay verification request failed.',
      });
    } finally {
      setReplayingKey(null);
    }
  }

  // Filter out onlineReceipts whose idempotencyKey is already in IndexedDB queuedMutations
  const idbKeys = new Set(queuedMutations.map((q) => q.idempotencyKey));
  const extraOnlineReceipts = onlineReceipts.filter(
    (r) => !idbKeys.has(r.idempotencyKey),
  );

  return (
    <div className="space-y-3.5">
      {/* Connectivity & Sync Engine Summary */}
      <section
        className="rounded-xl border p-4 space-y-3"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {deadZone ? (
              <CloudOff
                className="h-5 w-5"
                style={{ color: 'var(--status-warn)' }}
                aria-hidden="true"
              />
            ) : (
              <Wifi
                className="h-5 w-5"
                style={{ color: 'var(--status-ok)' }}
                aria-hidden="true"
              />
            )}
            <div>
              <h2 className="text-sm font-bold">
                Offline Sync Queue
              </h2>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Field updates saved offline and synced in order when connectivity returns.
              </p>
            </div>
          </div>

          <span
            className="font-mono-tabular rounded border px-2.5 py-1 text-xs font-bold"
            style={{
              backgroundColor:
                pendingCount > 0
                  ? 'var(--status-warn-soft)'
                  : 'var(--status-ok-soft)',
              borderColor:
                pendingCount > 0 ? 'var(--status-warn)' : 'var(--status-ok)',
              color:
                pendingCount > 0 ? 'var(--status-warn)' : 'var(--status-ok)',
            }}
          >
            {pendingCount} QUEUED
          </span>
        </div>

        {bannerMsg && (
          <div
            role="status"
            className="rounded-lg border px-3 py-2.5 text-xs font-semibold flex items-center gap-2"
            style={{
              backgroundColor:
                bannerMsg.tone === 'ok'
                  ? 'var(--status-ok-soft)'
                  : bannerMsg.tone === 'warn'
                    ? 'var(--status-warn-soft)'
                    : 'var(--status-fault-soft)',
              borderColor:
                bannerMsg.tone === 'ok'
                  ? 'var(--status-ok)'
                  : bannerMsg.tone === 'warn'
                    ? 'var(--status-warn)'
                    : 'var(--status-fault)',
              color: 'var(--text-primary)',
            }}
          >
            {bannerMsg.tone === 'ok' ? (
              <CheckCircle2
                className="h-4 w-4 shrink-0"
                style={{ color: 'var(--status-ok)' }}
                aria-hidden="true"
              />
            ) : (
              <AlertTriangle
                className="h-4 w-4 shrink-0"
                style={{ color: 'var(--status-warn)' }}
                aria-hidden="true"
              />
            )}
            <span>{bannerMsg.text}</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button
            type="button"
            disabled={flushing || (pendingCount === 0 && !deadZone)}
            onClick={() => void handleReconnectAndFlush()}
            className="min-h-12 inline-flex items-center justify-center gap-2 rounded-lg px-4 text-xs font-bold transition-opacity"
            style={{
              backgroundColor: 'var(--accent-blaze)',
              color: 'var(--accent-blaze-ink)',
            }}
          >
            {flushing ? (
              <RefreshCw
                className="h-4 w-4 animate-spin"
                aria-hidden="true"
              />
            ) : (
              <CloudUpload className="h-4 w-4" aria-hidden="true" />
            )}
            <span>
              {flushing
                ? 'Flushing IndexedDB Queue…'
                : deadZone
                  ? `Reconnect & Flush Queue (${pendingCount})`
                  : `Flush Queued Mutations (${pendingCount})`}
            </span>
          </button>

          <button
            type="button"
            disabled={syncedIdbCount === 0}
            onClick={() => void handleClearHistory()}
            className="min-h-12 inline-flex items-center justify-center gap-2 rounded-lg border px-4 text-xs font-semibold"
            style={{
              backgroundColor: 'var(--bg-elevated)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-secondary)',
            }}
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            <span>Clear Synced History ({syncedIdbCount})</span>
          </button>
        </div>
      </section>

      {/* IndexedDB Queued / Synced / Conflict Records */}
      <section className="space-y-2.5" aria-label="IndexedDB mutation records">
        {queuedMutations.length === 0 && extraOnlineReceipts.length === 0 ? (
          <div
            className="rounded-xl border p-6 text-center"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-subtle)',
            }}
          >
            <ShieldCheck
              className="mx-auto h-7 w-7 mb-2"
              style={{ color: 'var(--status-ok)' }}
              aria-hidden="true"
            />
            <p className="text-sm font-semibold">
              IndexedDB Offline Queue is clean
            </p>
            <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
              Toggle &ldquo;Dead-Zone Offline&rdquo; in the top bar and start or
              complete a job to inspect queued idempotent mutations here.
            </p>
          </div>
        ) : (
          <>
            {queuedMutations.map((item) => {
              const badgeColor =
                item.status === 'SYNCED'
                  ? 'var(--status-ok)'
                  : item.status === 'CONFLICT'
                    ? 'var(--status-fault)'
                    : 'var(--status-warn)';
              const badgeBg =
                item.status === 'SYNCED'
                  ? 'var(--status-ok-soft)'
                  : item.status === 'CONFLICT'
                    ? 'var(--status-fault-soft)'
                    : 'var(--status-warn-soft)';

              return (
                <article
                  key={item.idempotencyKey}
                  className="rounded-xl border p-3.5 space-y-2"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--border-subtle)',
                  }}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono-tabular text-xs font-bold">
                        {item.ticketNumber}
                      </span>
                      <span className="text-xs font-semibold">
                        {item.summary}
                      </span>
                    </div>
                    <span
                      className="font-mono-tabular rounded border px-2 py-0.5 text-[11px] font-bold"
                      style={{
                        backgroundColor: badgeBg,
                        borderColor: badgeColor,
                        color: badgeColor,
                      }}
                    >
                      {item.status}
                    </span>
                  </div>

                  <div
                    className="rounded-lg border p-2 text-[11px] font-mono-tabular space-y-1 break-all"
                    style={{
                      backgroundColor: 'var(--bg-elevated)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    <div>idempotencyKey: {item.idempotencyKey}</div>
                    <div>
                      POST {item.endpoint} • attempts: {item.attempts}
                    </div>
                    {item.lastResultNote && (
                      <div className="font-semibold" style={{ color: badgeColor }}>
                        {item.lastResultNote}
                      </div>
                    )}
                  </div>

                  {item.status === 'SYNCED' && (
                    <button
                      type="button"
                      disabled={replayingKey === item.idempotencyKey}
                      onClick={() => void handleReplayTest(item)}
                      className="w-full min-h-12 inline-flex items-center justify-center gap-2 rounded-lg border px-3 text-xs font-semibold"
                      style={{
                        backgroundColor: 'var(--bg-elevated)',
                        borderColor: 'var(--border-strong)',
                        color: 'var(--text-primary)',
                      }}
                    >
                      <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>
                        {replayingKey === item.idempotencyKey
                          ? 'Replaying Key…'
                          : 'Test Idempotent Replay (Same UUID)'}
                      </span>
                    </button>
                  )}
                </article>
              );
            })}

            {/* Direct Online Sync Receipts for Live Idempotency Replay Demos */}
            {extraOnlineReceipts.map((rec) => (
              <article
                key={rec.idempotencyKey}
                className="rounded-xl border p-3.5 space-y-2"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-subtle)',
                }}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono-tabular text-xs font-bold">
                      {rec.ticketNumber}
                    </span>
                    <span className="text-xs font-semibold">{rec.summary}</span>
                  </div>
                  <span
                    className="font-mono-tabular rounded border px-2 py-0.5 text-[11px] font-bold"
                    style={{
                      backgroundColor: 'var(--status-ok-soft)',
                      borderColor: 'var(--status-ok)',
                      color: 'var(--status-ok)',
                    }}
                  >
                    {rec.replayed ? 'REPLAYED (0 DUP)' : 'ONLINE SYNCED'}
                  </span>
                </div>

                <div
                  className="rounded-lg border p-2 text-[11px] font-mono-tabular space-y-1 break-all"
                  style={{
                    backgroundColor: 'var(--bg-elevated)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  <div>idempotencyKey: {rec.idempotencyKey}</div>
                  <div>POST {rec.endpoint}</div>
                  <div
                    className="font-semibold"
                    style={{ color: 'var(--status-ok)' }}
                  >
                    {rec.note}
                  </div>
                </div>

                <button
                  type="button"
                  disabled={replayingKey === rec.idempotencyKey}
                  onClick={() => void handleReplayTest(rec)}
                  className="w-full min-h-12 inline-flex items-center justify-center gap-2 rounded-lg border px-3 text-xs font-semibold"
                  style={{
                    backgroundColor: 'var(--bg-elevated)',
                    borderColor: 'var(--border-strong)',
                    color: 'var(--text-primary)',
                  }}
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>
                    {replayingKey === rec.idempotencyKey
                      ? 'Replaying Key…'
                      : 'Test Idempotent Replay (Same UUID)'}
                  </span>
                </button>
              </article>
            ))}
          </>
        )}
      </section>
    </div>
  );
}
