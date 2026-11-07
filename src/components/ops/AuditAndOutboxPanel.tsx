'use client';

import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  DatabaseZap,
  Download,
  FileJson,
  Lock,
  RotateCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { surfaceFetchJson } from '@/client/apiClient';
import { sanitizeSpreadsheetCell } from '@/domain/excelImport';
import type {
  AuditLogRecord,
  IntegrationOutboxRecord,
  Role,
} from '@/domain/types';
import {
  formatTimestampCompact,
  type AuditIntegritySummary,
  type OpsKpiSummary,
  type OpsStatusBanner,
} from './opsHelpers';

interface AuditAndOutboxPanelProps {
  auditLogs: AuditLogRecord[];
  auditIntegrity: AuditIntegritySummary;
  outbox: IntegrationOutboxRecord[];
  kpis: OpsKpiSummary;
  actorRole: Role;
  onRefresh: () => Promise<void>;
  onBanner: (banner: OpsStatusBanner) => void;
}

function escapeCsvField(raw: string): string {
  const safe = sanitizeSpreadsheetCell(raw);
  if (/[",\n\r]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

function prettyJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

export function AuditAndOutboxPanel({
  auditLogs,
  auditIntegrity,
  outbox,
  kpis,
  actorRole,
  onRefresh,
  onBanner,
}: AuditAndOutboxPanelProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedOutboxId, setSelectedOutboxId] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);

  const isGovernance =
    actorRole === 'SUPERVISOR' || actorRole === 'ADMINISTRATOR';
  const isAdmin = actorRole === 'ADMINISTRATOR';

  const filteredLogs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return auditLogs;
    return auditLogs.filter(
      (log) =>
        log.action.toLowerCase().includes(q) ||
        log.actorRole.toLowerCase().includes(q) ||
        log.entityType.toLowerCase().includes(q) ||
        log.entityId.toLowerCase().includes(q) ||
        log.entryHash.toLowerCase().includes(q) ||
        log.detailJson.toLowerCase().includes(q),
    );
  }, [auditLogs, searchQuery]);

  const activeOutbox =
    outbox.find((o) => o.id === selectedOutboxId) ?? outbox[0] ?? null;

  function handleExportSanitizedCsv() {
    const lines: string[] = [];
    lines.push(
      ['Section', 'Seq/Metric', 'Timestamp', 'ActorRole', 'Action/Key', 'Entity/Value', 'SHA256_Hash'].join(','),
    );

    const nowIso = new Date().toISOString();
    const kpiEntries: Array<[string, number]> = [
      ['TOTAL_ORDERS', kpis.totalOrders],
      ['UNASSIGNED_COUNT', kpis.unassignedCount],
      ['ACTIVE_FIELD_COUNT', kpis.activeFieldCount],
      ['COMPLETED_COUNT', kpis.completedCount],
      ['FB_ISSUE_COUNT', kpis.fbIssueCount],
      ['CUST_ISSUE_COUNT', kpis.custIssueCount],
      ['PENDING_REVIEW_COUNT', kpis.pendingReviewCount],
      ['PENDING_GPS_DIFF_COUNT', kpis.pendingGpsDiffCount],
      ['LIVE_TECH_COUNT', kpis.liveTechCount],
    ];

    for (const [k, v] of kpiEntries) {
      lines.push(
        [
          'KPI_SUMMARY',
          '-',
          nowIso,
          actorRole,
          k,
          String(v),
          auditIntegrity.valid ? 'CHAIN_VALID' : 'CHAIN_BROKEN',
        ]
          .map(escapeCsvField)
          .join(','),
      );
    }

    for (const entry of filteredLogs) {
      lines.push(
        [
          'AUDIT_LEDGER',
          String(entry.seq),
          entry.createdAt,
          entry.actorRole,
          entry.action,
          `${entry.entityType}:${entry.entityId} ${entry.detailJson}`,
          entry.entryHash,
        ]
          .map(escapeCsvField)
          .join(','),
      );
    }

    const blob = new Blob([lines.join('\n')], {
      type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `FiberBlaze_Cavite_KPI_Audit_${nowIso.slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    onBanner({
      tone: 'ok',
      message: `Exported formula-sanitized CSV (${kpiEntries.length} KPI metrics + ${filteredLogs.length} audit rows).`,
    });
  }

  async function handleAdminReset() {
    setResetting(true);
    try {
      const res = await surfaceFetchJson<{
        ok: boolean;
        summary: {
          usersCount: number;
          napBoxesCount: number;
          workOrdersCount: number;
        };
      }>('ops', '/api/admin/reset', {
        method: 'POST',
        body: '{}',
      });
      onBanner({
        tone: 'ok',
        message: `Cavite demo baseline reset (${res.summary.workOrdersCount} work orders, ${res.summary.napBoxesCount} NAP boxes restored).`,
      });
      await onRefresh();
    } catch (err) {
      onBanner({
        tone: 'fault',
        message: err instanceof Error ? err.message : 'Baseline reset failed.',
      });
    } finally {
      setResetting(false);
    }
  }

  return (
    <div className="space-y-4">
      {!isGovernance && (
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
            Governance Clearance Notice: Signed in as{' '}
            <strong className="font-mono-tabular">{actorRole}</strong>. Switch to{' '}
            <strong className="font-mono-tabular">SUPERVISOR</strong> or{' '}
            <strong className="font-mono-tabular">ADMINISTRATOR</strong> to inspect the full SHA-256 audit ledger and gated CRM/OLT outbox payloads.
          </span>
        </div>
      )}

      {/* Cryptographic SHA-256 Hash-Chain Status Banner + Controls */}
      <section
        aria-label="Cryptographic SHA-256 Hash-Chain Integrity Banner"
        className="rounded-xl border p-4 flex flex-wrap items-center justify-between gap-3"
        style={{
          backgroundColor: auditIntegrity.valid
            ? 'var(--status-ok-soft)'
            : 'var(--status-fault-soft)',
          borderColor: auditIntegrity.valid
            ? 'var(--status-ok)'
            : 'var(--status-fault)',
        }}
      >
        <div className="flex items-center gap-3">
          {auditIntegrity.valid ? (
            <ShieldCheck
              className="h-6 w-6 shrink-0"
              style={{ color: 'var(--status-ok)' }}
              aria-hidden="true"
            />
          ) : (
            <ShieldAlert
              className="h-6 w-6 shrink-0"
              style={{ color: 'var(--status-fault)' }}
              aria-hidden="true"
            />
          )}
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-bold">
                {auditIntegrity.valid
                  ? 'SHA-256 Tamper-Evident Hash Chain: INTACT'
                  : `SHA-256 Hash Chain Broken at Seq #${auditIntegrity.brokenAtSeq}`}
              </h2>
              <span
                className="font-mono-tabular rounded border px-2 py-0.5 text-[11px] font-semibold"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              >
                {auditIntegrity.checkedCount} VERIFIED LINKS
              </span>
            </div>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              Canonical digest over prevHash | actorId | actorRole | action | entity | detailJson | createdAt
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleExportSanitizedCsv}
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold min-h-10"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-strong)',
              color: 'var(--text-primary)',
            }}
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Export Sanitized KPI & Audit CSV</span>
          </button>

          {isAdmin && (
            <button
              type="button"
              disabled={resetting}
              onClick={() => void handleAdminReset()}
              className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold min-h-10"
              style={{
                backgroundColor: 'var(--accent-blaze)',
                color: 'var(--accent-blaze-ink)',
              }}
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>
                {resetting
                  ? 'Resetting Baseline…'
                  : '1-Click Reset Cavite Demo Data'}
              </span>
            </button>
          )}
        </div>
      </section>

      {/* Gated Integration Outbox (GATED_DRY_RUN) */}
      <section
        aria-label="Gated Integration Outbox"
        className="rounded-xl border p-4 space-y-3"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        <div
          className="flex flex-wrap items-center justify-between gap-2 border-b pb-3"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <div className="flex items-center gap-2">
            <DatabaseZap
              className="h-4 w-4"
              style={{ color: 'var(--status-info)' }}
              aria-hidden="true"
            />
            <div>
              <h2 className="text-sm font-semibold">
                Gated External Integration Outbox (Zero Live Writes)
              </h2>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                All OLT provisioning, CRM billing, and inventory handovers stay quarantined in GATED_DRY_RUN
              </p>
            </div>
          </div>
          <span
            className="font-mono-tabular inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-semibold"
            style={{
              backgroundColor: 'var(--status-info-soft)',
              borderColor: 'var(--status-info)',
              color: 'var(--status-info)',
            }}
          >
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
            GATED_DRY_RUN ({outbox.length})
          </span>
        </div>

        {outbox.length === 0 ? (
          <div className="text-xs py-3" style={{ color: 'var(--text-muted)' }}>
            {isGovernance
              ? 'No dry-run integration events queued yet.'
              : 'Sign in as SUPERVISOR or ADMINISTRATOR to inspect dry-run OLT/CRM payloads.'}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 text-xs">
            <div className="lg:col-span-5 space-y-2 max-h-64 overflow-y-auto">
              {outbox.map((item) => {
                const selected = activeOutbox?.id === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedOutboxId(item.id)}
                    className="w-full text-left rounded-lg border p-2.5 transition-colors"
                    style={{
                      backgroundColor: selected
                        ? 'var(--status-info-soft)'
                        : 'var(--bg-elevated)',
                      borderColor: selected
                        ? 'var(--status-info)'
                        : 'var(--border-subtle)',
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono-tabular font-bold">
                        {item.targetSystem}
                      </span>
                      <span
                        className="font-mono-tabular text-[10px] rounded border px-1.5 py-0.5"
                        style={{
                          backgroundColor: 'var(--bg-surface)',
                          borderColor: 'var(--border-subtle)',
                          color: 'var(--status-ok)',
                        }}
                      >
                        {item.gateStatus}
                      </span>
                    </div>
                    <div className="font-mono-tabular mt-1 text-[11px]">
                      {item.eventType} • {item.ticketNumber}
                    </div>
                    <div
                      className="font-mono-tabular text-[10px] mt-0.5"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {formatTimestampCompact(item.createdAt)}
                    </div>
                  </button>
                );
              })}
            </div>

            {activeOutbox && (
              <div
                className="lg:col-span-7 rounded-lg border p-3"
                style={{
                  backgroundColor: 'var(--bg-elevated)',
                  borderColor: 'var(--border-subtle)',
                }}
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="inline-flex items-center gap-1.5 font-mono-tabular font-semibold">
                    <FileJson
                      className="h-3.5 w-3.5"
                      style={{ color: 'var(--accent-blaze)' }}
                      aria-hidden="true"
                    />
                    {activeOutbox.targetSystem} :: {activeOutbox.eventType}
                  </span>
                  <span
                    className="font-mono-tabular text-[11px]"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {activeOutbox.ticketNumber}
                  </span>
                </div>
                <pre
                  className="font-mono-tabular rounded border p-3 text-[11px] overflow-x-auto"
                  style={{
                    backgroundColor: 'var(--bg-canvas)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-primary)',
                  }}
                >
                  {prettyJson(activeOutbox.payloadJson)}
                </pre>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Searchable SHA-256 AuditLog Ledger */}
      <section
        aria-label="Searchable Cryptographic Audit Log Ledger"
        className="rounded-xl border p-4 space-y-3"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">
            Immutable SHA-256 Audit Ledger
          </h2>
          <div className="relative min-w-64">
            <Search
              className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: 'var(--text-muted)' }}
              aria-hidden="true"
            />
            <input
              type="search"
              aria-label="Search audit log actions, actors, entities, or SHA-256 hashes"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter action, role, ticket, or SHA-256…"
              className="w-full rounded-lg border pl-8 pr-3 py-1.5 text-xs min-h-9"
              style={{
                backgroundColor: 'var(--bg-elevated)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
            />
          </div>
        </div>

        <div
          className="overflow-x-auto rounded-lg border max-h-96 overflow-y-auto"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <table className="w-full text-left border-collapse text-xs">
            <thead
              className="sticky top-0 text-[11px] uppercase"
              style={{
                backgroundColor: 'var(--bg-elevated)',
                color: 'var(--text-muted)',
              }}
            >
              <tr>
                <th className="py-2 px-3 border-b" style={{ borderColor: 'var(--border-subtle)' }}>Seq</th>
                <th className="py-2 px-3 border-b" style={{ borderColor: 'var(--border-subtle)' }}>Time</th>
                <th className="py-2 px-3 border-b" style={{ borderColor: 'var(--border-subtle)' }}>Role</th>
                <th className="py-2 px-3 border-b" style={{ borderColor: 'var(--border-subtle)' }}>Action / Detail</th>
                <th className="py-2 px-3 border-b" style={{ borderColor: 'var(--border-subtle)' }}>Prev → Entry SHA-256</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="py-6 text-center"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    No audit entries match current filter or role scope.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((entry) => (
                  <tr
                    key={entry.id}
                    className="border-b h-10"
                    style={{ borderColor: 'var(--border-subtle)' }}
                  >
                    <td className="py-2 px-3 font-mono-tabular font-semibold">
                      #{entry.seq}
                    </td>
                    <td
                      className="py-2 px-3 font-mono-tabular whitespace-nowrap"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {formatTimestampCompact(entry.createdAt)}
                    </td>
                    <td className="py-2 px-3 font-mono-tabular whitespace-nowrap">
                      {entry.actorRole}
                    </td>
                    <td className="py-2 px-3">
                      <div className="font-mono-tabular font-semibold">
                        {entry.action}{' '}
                        <span style={{ color: 'var(--text-muted)' }}>
                          ({entry.entityType}:{entry.entityId})
                        </span>
                      </div>
                      <div
                        className="font-mono-tabular text-[11px] truncate max-w-md"
                        style={{ color: 'var(--text-secondary)' }}
                        title={entry.detailJson}
                      >
                        {entry.detailJson}
                      </div>
                    </td>
                    <td
                      className="py-2 px-3 font-mono-tabular text-[11px] whitespace-nowrap"
                      style={{ color: 'var(--status-info)' }}
                      title={`Prev: ${entry.prevHash}\nEntry: ${entry.entryHash}`}
                    >
                      {entry.prevHash.slice(0, 8)}… →{' '}
                      {entry.entryHash.slice(0, 12)}…
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
