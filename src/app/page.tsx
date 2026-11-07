import Link from 'next/link';
import {
  Radio,
  Columns2,
  Monitor,
  Smartphone,
  ShieldCheck,
  Navigation,
  FileSpreadsheet,
  WifiOff,
  CheckCircle2,
  ArrowUpRight,
  GitBranch,
  Lock,
} from 'lucide-react';
import { verifyAuditChain } from '@/domain/auditChain';
import { getWfmRepository } from '@/server/repository';

export const dynamic = 'force-dynamic';

export default function ExecutiveLaunchpadPage() {
  const repo = getWfmRepository();
  const orders = repo.listWorkOrders({
    role: 'ADMINISTRATOR',
    userId: 'u-admin-1',
  });
  const naps = repo.listNapBoxes();
  const techs = repo.listTechnicians();
  const discrepancies = repo.listDiscrepancies('PENDING');
  const auditCheck = verifyAuditChain(repo.listAuditLogs());

  const totalPorts = naps.reduce((acc, n) => acc + n.totalPorts, 0);
  const lockedTransferPorts = naps.reduce(
    (acc, n) =>
      acc + n.ports.filter((p) => p.status === 'LOCKED_TRANSFER').length,
    0,
  );

  return (
    <main
      className="min-h-screen"
      style={{
        backgroundColor: 'var(--bg-canvas)',
        color: 'var(--text-primary)',
      }}
    >
      <header
        className="border-b px-6 py-4"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-lg"
              style={{
                backgroundColor: 'var(--accent-blaze)',
                color: 'var(--accent-blaze-ink)',
              }}
            >
              <Radio className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-bold tracking-tight">
                  FIBERBLAZE
                </span>
                <span
                  className="rounded px-2 py-0.5 text-xs font-semibold"
                  style={{
                    backgroundColor: 'var(--accent-blaze-soft)',
                    color: 'var(--accent-blaze)',
                  }}
                >
                  CAVITE WFM PLATFORM
                </span>
              </div>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Unified Dispatch • 3D Cavite Navigation • FTTH Field Verification • Offline Idempotent Sync
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 text-xs font-mono-tabular">
            <span
              className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5"
              style={{
                backgroundColor: 'var(--status-ok-soft)',
                borderColor: 'var(--status-ok)',
                color: 'var(--status-ok)',
              }}
            >
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              SHA-256 AUDIT CHAIN:{' '}
              {auditCheck.valid
                ? `VERIFIED (${auditCheck.checkedCount})`
                : 'ALERT'}
            </span>
            <span
              className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5"
              style={{
                backgroundColor: 'var(--bg-elevated)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-secondary)',
              }}
            >
              <Lock className="h-3.5 w-3.5" aria-hidden="true" />
              EXTERNAL CRM/OLT: GATED DRY-RUN
            </span>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 py-8 space-y-8">
        {/* Live Operational Pulse */}
        <section aria-label="Live Cavite Network Snapshot">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              {
                label: 'Cavite Work Orders',
                value: String(orders.length),
                sub: `${orders.filter((o) => o.status === 'UNASSIGNED').length} unassigned`,
              },
              {
                label: 'Active Fleet GPS',
                value: `${techs.filter((t) => t.gpsFreshness === 'LIVE').length} / ${techs.length}`,
                sub: `${techs.filter((t) => t.gpsFreshness === 'STALE').length} last-known • ${techs.filter((t) => t.gpsFreshness === 'OFFLINE').length} logged out`,
              },
              {
                label: 'Monitored NAP Boxes',
                value: String(naps.length),
                sub: `${totalPorts} total GPON ports`,
              },
              {
                label: 'Transfer Port-Locks',
                value: String(lockedTransferPorts),
                sub: 'Protected until cutover',
              },
              {
                label: 'FB / Cust Exceptions',
                value: `${orders.filter((o) => o.status === 'FB_ISSUE').length} / ${orders.filter((o) => o.status === 'CUST_ISSUE').length}`,
                sub: 'NetOps vs Reschedule',
              },
              {
                label: 'Pending GPS Diffs',
                value: String(discrepancies.length),
                sub: '>30m supervisor review',
              },
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded-xl border p-4"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-subtle)',
                }}
              >
                <div
                  className="text-xs font-medium"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {stat.label}
                </div>
                <div className="mt-1.5 text-2xl font-bold font-mono-tabular">
                  {stat.value}
                </div>
                <div
                  className="mt-1 text-xs"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {stat.sub}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Primary Launchers */}
        <section aria-label="Operating Workspaces">
          <div className="mb-3 flex items-center justify-between">
            <h1 className="text-xl font-bold tracking-tight">
              Select Operating Surface
            </h1>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Scoped JWT cookies keep Operations and Field Technician sessions isolated
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Split-Screen Demo Theater */}
            <Link
              href="/demo"
              className="group relative flex flex-col justify-between rounded-xl border-2 p-6 transition-colors"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--accent-blaze)',
              }}
            >
              <div>
                <div className="flex items-center justify-between">
                  <span
                    className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-bold"
                    style={{
                      backgroundColor: 'var(--accent-blaze)',
                      color: 'var(--accent-blaze-ink)',
                    }}
                  >
                    <Columns2 className="h-3.5 w-3.5" aria-hidden="true" />
                    RECOMMENDED FOR PRESENTATION
                  </span>
                  <ArrowUpRight
                    className="h-5 w-5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                    style={{ color: 'var(--accent-blaze)' }}
                    aria-hidden="true"
                  />
                </div>
                <h2 className="mt-4 text-lg font-bold">
                  Split-Screen Executive Demo Theater
                </h2>
                <p
                  className="mt-2 text-sm leading-relaxed"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Operate the Desktop NOC Dispatch Portal on the left and the
                  Field Technician Mobile PWA on the right simultaneously—watch
                  Excel dispatch, 3D Cavite street routing, dead-zone offline
                  capture, and live SSE sync side-by-side.
                </p>
              </div>
              <div
                className="mt-6 flex items-center justify-between border-t pt-3.5 text-xs font-semibold"
                style={{
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--accent-blaze)',
                }}
              >
                <span>Launch Synchronized Dual Cockpit</span>
                <span className="font-mono-tabular">/demo</span>
              </div>
            </Link>

            {/* Operations Management Portal */}
            <Link
              href="/ops"
              className="group flex flex-col justify-between rounded-xl border p-6 transition-colors"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-subtle)',
              }}
            >
              <div>
                <div className="flex items-center justify-between">
                  <span
                    className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold"
                    style={{
                      backgroundColor: 'var(--bg-elevated)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--status-info)',
                    }}
                  >
                    <Monitor className="h-3.5 w-3.5" aria-hidden="true" />
                    DESKTOP NOC PORTAL
                  </span>
                  <ArrowUpRight
                    className="h-5 w-5"
                    style={{ color: 'var(--text-muted)' }}
                    aria-hidden="true"
                  />
                </div>
                <h2 className="mt-4 text-lg font-bold">
                  Operations Management Portal
                </h2>
                <p
                  className="mt-2 text-sm leading-relaxed"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Role-gated workspace for <strong>Job Controllers</strong>{' '}
                  (5-step Excel Wizard, Digital Intake, Street-ETA Dispatch),{' '}
                  <strong>Supervisors</strong> (FB-ISSUE NetOps, 3D GPS Pin Diff,
                  Optical Proof Review), and <strong>Administrators</strong>.
                </p>
              </div>
              <div
                className="mt-6 flex items-center justify-between border-t pt-3.5 text-xs font-semibold"
                style={{
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--status-info)',
                }}
              >
                <span>Open Management Command Center</span>
                <span className="font-mono-tabular">/ops</span>
              </div>
            </Link>

            {/* Field Technician Mobile PWA */}
            <Link
              href="/tech"
              className="group flex flex-col justify-between rounded-xl border p-6 transition-colors"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-subtle)',
              }}
            >
              <div>
                <div className="flex items-center justify-between">
                  <span
                    className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold"
                    style={{
                      backgroundColor: 'var(--bg-elevated)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--status-ok)',
                    }}
                  >
                    <Smartphone className="h-3.5 w-3.5" aria-hidden="true" />
                    FIELD MOBILE PWA
                  </span>
                  <ArrowUpRight
                    className="h-5 w-5"
                    style={{ color: 'var(--text-muted)' }}
                    aria-hidden="true"
                  />
                </div>
                <h2 className="mt-4 text-lg font-bold">
                  Field Technician Mobile Cockpit
                </h2>
                <p
                  className="mt-2 text-sm leading-relaxed"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  High-contrast outdoor/night mobile cockpit with 3D Gimbal
                  Cavite street navigation, 8/16-port NAP selector, GPON{' '}
                  <code>dBm</code> guardrails, camera-only watermarked evidence,
                  signature pad, and IndexedDB dead-zone queue.
                </p>
              </div>
              <div
                className="mt-6 flex items-center justify-between border-t pt-3.5 text-xs font-semibold"
                style={{
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--status-ok)',
                }}
              >
                <span>Open Technician Field App</span>
                <span className="font-mono-tabular">/tech</span>
              </div>
            </Link>
          </div>
        </section>

        {/* Blueprint Verification Matrix */}
        <section
          aria-label="Blueprint Architecture Guarantees"
          className="rounded-xl border p-6"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <h2 className="text-sm font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
            FiberBlaze November 2026 Blueprint — Implemented Operational Safeguards
          </h2>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
            {[
              {
                icon: Navigation,
                title: 'Cavite 3D Street & HMM Navigation',
                detail:
                  'OpenFreeMap 3D extruded buildings, Valhalla + FOSSGIS OSRM routing with local Cavite corridor fallback, road-block detours, and Viterbi snap-to-road.',
              },
              {
                icon: GitBranch,
                title: 'Repair, Install & Transfer Locks',
                detail:
                  'GPON optical pass (-8 to -25 dBm) & marginal (-25.1 to -27.9 dBm) checks; Transfer keeps old NAP port LOCKED_TRANSFER until new site cutover validates.',
              },
              {
                icon: FileSpreadsheet,
                title: 'Excel-to-Paperless Bridge',
                detail:
                  'OOXML .xlsx & CSV upload → column auto-map → Cavite bounds & formula-injection check → preview → dispatch, plus Beta signed hard-copy support.',
              },
              {
                icon: WifiOff,
                title: 'Dead-Zone Queue & GPS Integrity',
                detail:
                  'IndexedDB offline queue with deterministic idempotency keys, >30m verified pin discrepancy diff, last-known GPS honesty, and logout GPS cutoff.',
              },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.title}
                  className="rounded-lg border p-4"
                  style={{
                    backgroundColor: 'var(--bg-elevated)',
                    borderColor: 'var(--border-subtle)',
                  }}
                >
                  <div className="flex items-center gap-2 font-semibold text-sm">
                    <Icon
                      className="h-4 w-4 shrink-0"
                      style={{ color: 'var(--accent-blaze)' }}
                      aria-hidden="true"
                    />
                    <span>{item.title}</span>
                  </div>
                  <p
                    className="mt-2 leading-relaxed"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {item.detail}
                  </p>
                  <div
                    className="mt-2.5 inline-flex items-center gap-1 font-mono-tabular text-[11px]"
                    style={{ color: 'var(--status-ok)' }}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>TDD VERIFIED</span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}
