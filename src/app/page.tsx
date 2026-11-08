import Link from 'next/link';
import {
  Radio,
  Columns2,
  Monitor,
  Smartphone,
  ShieldCheck,
  ArrowUpRight,
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
                  FiberBlaze
                </span>
                <span
                  className="rounded px-2 py-0.5 text-xs font-semibold"
                  style={{
                    backgroundColor: 'var(--accent-blaze-soft)',
                    color: 'var(--accent-blaze)',
                  }}
                >
                  Cavite WFM
                </span>
              </div>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Field Service &amp; Dispatch Operations
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
              Audit Ledger:{' '}
              {auditCheck.valid
                ? `Verified (${auditCheck.checkedCount} entries)`
                : 'Alert'}
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
                label: 'Work Orders',
                value: String(orders.length),
                sub: `${orders.filter((o) => o.status === 'UNASSIGNED').length} unassigned`,
              },
              {
                label: 'Active Fleet GPS',
                value: `${techs.filter((t) => t.gpsFreshness === 'LIVE').length} / ${techs.length}`,
                sub: `${techs.filter((t) => t.gpsFreshness === 'STALE').length} last-known, ${techs.filter((t) => t.gpsFreshness === 'OFFLINE').length} offline`,
              },
              {
                label: 'NAP Boxes',
                value: String(naps.length),
                sub: `${totalPorts} total GPON ports`,
              },
              {
                label: 'Transfer Port Holds',
                value: String(lockedTransferPorts),
                sub: 'Protected until cutover',
              },
              {
                label: 'Plant / Customer Holds',
                value: `${orders.filter((o) => o.status === 'FB_ISSUE').length} / ${orders.filter((o) => o.status === 'CUST_ISSUE').length}`,
                sub: 'NetOps vs reschedule',
              },
              {
                label: 'Location Reviews',
                value: String(discrepancies.length),
                sub: '>30m pin offset',
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
          <div className="mb-4">
            <h1 className="text-xl font-bold tracking-tight">
              Workspaces
            </h1>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              Open the combined dispatch and field view or launch each console separately.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Split-Screen View */}
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
                    className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold"
                    style={{
                      backgroundColor: 'var(--accent-blaze)',
                      color: 'var(--accent-blaze-ink)',
                    }}
                  >
                    <Columns2 className="h-3.5 w-3.5" aria-hidden="true" />
                    Dual Workspace
                  </span>
                  <ArrowUpRight
                    className="h-5 w-5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                    style={{ color: 'var(--accent-blaze)' }}
                    aria-hidden="true"
                  />
                </div>
                <h2 className="mt-4 text-lg font-bold">
                  Combined NOC &amp; Field View
                </h2>
                <p
                  className="mt-2 text-sm leading-relaxed"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Run the desktop dispatch console on the left and the field
                  technician handset on the right to see ticket assignments,
                  3D street routing, and field close-out sync in real time.
                </p>
              </div>
              <div
                className="mt-6 flex items-center justify-between border-t pt-3.5 text-xs font-semibold"
                style={{
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--accent-blaze)',
                }}
              >
                <span>Open Dual View</span>
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
                    Operations Console
                  </span>
                  <ArrowUpRight
                    className="h-5 w-5"
                    style={{ color: 'var(--text-muted)' }}
                    aria-hidden="true"
                  />
                </div>
                <h2 className="mt-4 text-lg font-bold">
                  NOC Dispatch &amp; Supervision
                </h2>
                <p
                  className="mt-2 text-sm leading-relaxed"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Import daily dispatch sheets, assign technicians by street
                  ETA, inspect NAP splitter port occupancy, and resolve plant
                  escalations or GPS pin discrepancies.
                </p>
              </div>
              <div
                className="mt-6 flex items-center justify-between border-t pt-3.5 text-xs font-semibold"
                style={{
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--status-info)',
                }}
              >
                <span>Open Operations Console</span>
                <span className="font-mono-tabular">/ops</span>
              </div>
            </Link>

            {/* Field Technician Mobile App */}
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
                    Field Handset
                  </span>
                  <ArrowUpRight
                    className="h-5 w-5"
                    style={{ color: 'var(--text-muted)' }}
                    aria-hidden="true"
                  />
                </div>
                <h2 className="mt-4 text-lg font-bold">
                  Technician Mobile App
                </h2>
                <p
                  className="mt-2 text-sm leading-relaxed"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Turn-by-turn 3D Cavite navigation, NAP port selection, GPON
                  optical signal verification, camera and signature proof, and
                  offline queue sync.
                </p>
              </div>
              <div
                className="mt-6 flex items-center justify-between border-t pt-3.5 text-xs font-semibold"
                style={{
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--status-ok)',
                }}
              >
                <span>Open Technician App</span>
                <span className="font-mono-tabular">/tech</span>
              </div>
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
