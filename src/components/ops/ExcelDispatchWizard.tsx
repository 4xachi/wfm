'use client';

import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Upload,
} from 'lucide-react';
import { surfaceFetchJson } from '@/client/apiClient';
import {
  autoMapDispatchColumns,
  parseSpreadsheetUpload,
  validateMappedDispatchRows,
  type DispatchColumnMapping,
  type ParsedSpreadsheet,
} from '@/domain/excelImport';
import type { Role, WorkOrderRecord } from '@/domain/types';
import { DigitalIntakeFormCard } from './DigitalIntakeFormCard';
import type { OpsStatusBanner, OpsTabId } from './opsHelpers';

interface ExcelDispatchWizardProps {
  actorRole: Role;
  embeddedInSplitScreen?: boolean;
  onRefresh: () => Promise<void>;
  onBanner: (banner: OpsStatusBanner) => void;
  onSelectWorkOrderId: (id: string) => void;
  onNavigateTab: (tab: OpsTabId) => void;
}

const MAPPING_FIELDS: Array<{
  key: keyof DispatchColumnMapping;
  label: string;
  required: boolean;
}> = [
  { key: 'accountNumber', label: 'Account Number', required: true },
  { key: 'subscriberName', label: 'Subscriber Name', required: true },
  { key: 'phone', label: 'Contact Phone', required: false },
  { key: 'workflowType', label: 'Job Type (Workflow)', required: true },
  { key: 'priority', label: 'Priority / SLA', required: false },
  { key: 'municipality', label: 'Cavite Municipality', required: true },
  { key: 'barangay', label: 'Barangay', required: true },
  { key: 'streetAddress', label: 'Street Address', required: true },
  { key: 'lat', label: 'Latitude', required: true },
  { key: 'lng', label: 'Longitude', required: true },
  { key: 'planName', label: 'Fiber Plan', required: false },
  { key: 'issueDescription', label: 'Concern / Remarks', required: false },
];

const STEPS = [
  { num: 1, label: '1. Upload .xlsx/.csv' },
  { num: 2, label: '2. Column Mapping' },
  { num: 3, label: '3. Validation Summary' },
  { num: 4, label: '4. Batch Preview' },
  { num: 5, label: '5. Commit Batch' },
] as const;

export function ExcelDispatchWizard({
  actorRole,
  embeddedInSplitScreen = false,
  onRefresh,
  onBanner,
  onSelectWorkOrderId,
  onNavigateTab,
}: ExcelDispatchWizardProps) {
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [fileName, setFileName] = useState<string>('');
  const [parsed, setParsed] = useState<ParsedSpreadsheet | null>(null);
  const [mapping, setMapping] = useState<DispatchColumnMapping | null>(null);
  const [busy, setBusy] = useState(false);
  const [commitResult, setCommitResult] = useState<{
    createdCount: number;
    skippedInvalidCount: number;
    workOrders: WorkOrderRecord[];
  } | null>(null);

  const canCommit =
    actorRole === 'JOB_CONTROLLER' || actorRole === 'ADMINISTRATOR';

  const validation = useMemo(() => {
    if (!parsed || !mapping) return { validRows: [], invalidRows: [] };
    return validateMappedDispatchRows(parsed.rows, mapping);
  }, [parsed, mapping]);

  function loadWorkbookBytes(bytes: Uint8Array, name: string) {
    const sheet = parseSpreadsheetUpload(bytes, name);
    if (sheet.headers.length === 0 || sheet.rows.length === 0) {
      throw new Error('Uploaded file contains zero dispatch rows.');
    }
    setFileName(name);
    setParsed(sheet);
    setMapping(autoMapDispatchColumns(sheet.headers));
    setCommitResult(null);
    setStep(2);
  }

  async function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      loadWorkbookBytes(new Uint8Array(buf), file.name);
      onBanner({
        tone: 'info',
        message: `Parsed ${file.name} — review auto-mapped columns in Step 2.`,
      });
    } catch (err) {
      onBanner({
        tone: 'fault',
        message:
          err instanceof Error ? err.message : 'Failed to parse spreadsheet.',
      });
    } finally {
      e.target.value = '';
    }
  }

  async function handleDownloadSampleXlsx(autoLoadIntoWizard: boolean) {
    setBusy(true);
    try {
      const res = await fetch('/api/import/sample-xlsx?surface=ops', {
        headers: { 'X-FB-Surface': 'ops' },
        credentials: 'include',
      });
      if (!res.ok) {
        throw new Error(`Sample download failed (HTTP ${res.status}).`);
      }
      const buf = await res.arrayBuffer();
      const sampleName = 'FiberBlaze_Cavite_Dispatch_Batch_2026-11-07.xlsx';

      if (autoLoadIntoWizard) {
        loadWorkbookBytes(new Uint8Array(buf), sampleName);
        onBanner({
          tone: 'ok',
          message: `Loaded ${sampleName} directly into Step 2 Column Mapping.`,
        });
      } else {
        const blob = new Blob([buf], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = sampleName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        onBanner({
          tone: 'ok',
          message: `Downloaded ${sampleName} — upload it below or click Load Sample Directly.`,
        });
      }
    } catch (err) {
      onBanner({
        tone: 'fault',
        message:
          err instanceof Error ? err.message : 'Unable to fetch sample .xlsx.',
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleCommitBatch() {
    if (!parsed || !mapping) return;
    setBusy(true);
    try {
      const res = await surfaceFetchJson<{
        createdCount: number;
        skippedInvalidCount: number;
        workOrders: WorkOrderRecord[];
      }>('ops', '/api/import/commit', {
        method: 'POST',
        body: JSON.stringify({
          rows: parsed.rows,
          mapping,
          sourceChannel: 'EXCEL_BATCH',
        }),
      });
      setCommitResult(res);
      onBanner({
        tone: 'ok',
        message: `Committed ${res.createdCount} Cavite dispatch ticket(s) (${res.skippedInvalidCount} invalid skipped).`,
      });
      await onRefresh();
    } catch (err) {
      onBanner({
        tone: 'fault',
        message: err instanceof Error ? err.message : 'Batch commit failed.',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={`grid grid-cols-1 ${
        embeddedInSplitScreen ? 'gap-4' : 'xl:grid-cols-12 gap-4'
      } items-start`}
    >
      {/* Left 7 Cols: 5-Step Excel-to-Paperless Wizard */}
      <section
        aria-label="Excel-to-Paperless Dispatch Wizard"
        className={`rounded-xl border p-4 space-y-4 ${
          embeddedInSplitScreen ? '' : 'xl:col-span-7'
        }`}
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
            <FileSpreadsheet
              className="h-4 w-4"
              style={{ color: 'var(--accent-blaze)' }}
              aria-hidden="true"
            />
            <div>
              <h2 className="text-sm font-semibold">
                Batch Ticket Import
              </h2>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Upload daily dispatch sheets (.xlsx or .csv) to create field tickets
              </p>
            </div>
          </div>
          {fileName && (
            <span
              className="font-mono-tabular rounded border px-2 py-0.5 text-[11px]"
              style={{
                backgroundColor: 'var(--bg-elevated)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-secondary)',
              }}
            >
              {fileName}
            </span>
          )}
        </div>

        {/* 5-Step Progress Strip */}
        <ol className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 text-xs">
          {STEPS.map((s) => {
            const isCurrent = step === s.num;
            const isEnabled = s.num === 1 || Boolean(parsed && mapping);
            return (
              <li key={s.num}>
                <button
                  type="button"
                  disabled={!isEnabled}
                  onClick={() =>
                    setStep(s.num as 1 | 2 | 3 | 4 | 5)
                  }
                  className="w-full text-left rounded-lg border px-2.5 py-2 font-medium transition-colors"
                  style={{
                    backgroundColor: isCurrent
                      ? 'var(--accent-blaze)'
                      : 'var(--bg-elevated)',
                    borderColor: isCurrent
                      ? 'var(--accent-blaze)'
                      : 'var(--border-subtle)',
                    color: isCurrent
                      ? 'var(--accent-blaze-ink)'
                      : 'var(--text-secondary)',
                  }}
                >
                  {s.label}
                </button>
              </li>
            );
          })}
        </ol>

        {/* STEP 1: Upload + Sample Download */}
        {step === 1 && (
          <div className="space-y-3">
            <div
              className="rounded-xl border border-dashed p-6 text-center space-y-3"
              style={{
                backgroundColor: 'var(--bg-elevated)',
                borderColor: 'var(--border-strong)',
              }}
            >
              <Upload
                className="h-7 w-7 mx-auto"
                style={{ color: 'var(--accent-blaze)' }}
                aria-hidden="true"
              />
              <div>
                <div className="text-sm font-semibold">
                  Upload Daily Cavite Dispatch Sheet (.xlsx or .csv)
                </div>
                <p
                  className="text-xs mt-1"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Supports .xlsx and .csv files up to 5 MB with automatic Cavite coordinate validation
                </p>
              </div>
              <div>
                <label
                  htmlFor="ops-xlsx-upload"
                  className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-xs font-semibold cursor-pointer min-h-10"
                  style={{
                    backgroundColor: 'var(--accent-blaze)',
                    color: 'var(--accent-blaze-ink)',
                  }}
                >
                  <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Select .xlsx or .csv File</span>
                </label>
                <input
                  id="ops-xlsx-upload"
                  type="file"
                  accept=".xlsx,.csv"
                  onChange={handleFileInput}
                  className="sr-only"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleDownloadSampleXlsx(false)}
                className="inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-xs font-semibold min-h-11"
                style={{
                  backgroundColor: 'var(--bg-elevated)',
                  borderColor: 'var(--border-strong)',
                  color: 'var(--text-primary)',
                }}
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                <span>Download Sample .xlsx</span>
              </button>

              <button
                type="button"
                disabled={busy}
                onClick={() => void handleDownloadSampleXlsx(true)}
                className="inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-xs font-semibold min-h-11"
                style={{
                  backgroundColor: 'var(--status-info-soft)',
                  borderColor: 'var(--status-info)',
                  color: 'var(--status-info)',
                }}
              >
                <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
                <span>Load Sample Batch</span>
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: Editable Column Mapping */}
        {step === 2 && parsed && mapping && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
              {MAPPING_FIELDS.map((field) => {
                const selectedCol = mapping[field.key];
                const sampleVal = selectedCol
                  ? parsed.rows[0]?.[selectedCol] ?? ''
                  : '';
                return (
                  <div
                    key={field.key}
                    className="rounded-lg border p-2.5"
                    style={{
                      backgroundColor: 'var(--bg-elevated)',
                      borderColor: 'var(--border-subtle)',
                    }}
                  >
                    <label
                      htmlFor={`map-${field.key}`}
                      className="block font-semibold mb-1"
                    >
                      {field.label}{' '}
                      {field.required && (
                        <span style={{ color: 'var(--accent-blaze)' }}>*</span>
                      )}
                    </label>
                    <select
                      id={`map-${field.key}`}
                      value={selectedCol}
                      onChange={(e) =>
                        setMapping({ ...mapping, [field.key]: e.target.value })
                      }
                      className="w-full rounded border px-2 py-1.5 min-h-9"
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        borderColor: 'var(--border-subtle)',
                        color: 'var(--text-primary)',
                      }}
                    >
                      <option value="">-- Unmapped --</option>
                      {parsed.headers.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                    <div
                      className="font-mono-tabular text-[11px] mt-1 truncate"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      Row 1: {sampleVal || '—'}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-between pt-2">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-xs font-medium"
                style={{
                  backgroundColor: 'var(--bg-elevated)',
                  borderColor: 'var(--border-subtle)',
                }}
              >
                <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                Back
              </button>
              <button
                type="button"
                onClick={() => setStep(3)}
                className="inline-flex items-center gap-1 rounded-lg px-4 py-2 text-xs font-semibold"
                style={{
                  backgroundColor: 'var(--accent-blaze)',
                  color: 'var(--accent-blaze-ink)',
                }}
              >
                Validate Cavite Bounds
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: Validation Summary */}
        {step === 3 && parsed && (
          <div className="space-y-3 text-xs">
            <div className="grid grid-cols-3 gap-2.5">
              <div
                className="rounded-lg border p-3"
                style={{
                  backgroundColor: 'var(--bg-elevated)',
                  borderColor: 'var(--border-subtle)',
                }}
              >
                <div style={{ color: 'var(--text-muted)' }}>Total Parsed</div>
                <div className="font-mono-tabular text-lg font-bold mt-0.5">
                  {parsed.rows.length}
                </div>
              </div>
              <div
                className="rounded-lg border p-3"
                style={{
                  backgroundColor: 'var(--status-ok-soft)',
                  borderColor: 'var(--status-ok)',
                }}
              >
                <div style={{ color: 'var(--status-ok)' }}>Valid Cavite</div>
                <div
                  className="font-mono-tabular text-lg font-bold mt-0.5"
                  style={{ color: 'var(--status-ok)' }}
                >
                  {validation.validRows.length}
                </div>
              </div>
              <div
                className="rounded-lg border p-3"
                style={{
                  backgroundColor:
                    validation.invalidRows.length > 0
                      ? 'var(--status-fault-soft)'
                      : 'var(--bg-elevated)',
                  borderColor:
                    validation.invalidRows.length > 0
                      ? 'var(--status-fault)'
                      : 'var(--border-subtle)',
                }}
              >
                <div
                  style={{
                    color:
                      validation.invalidRows.length > 0
                        ? 'var(--status-fault)'
                        : 'var(--text-muted)',
                  }}
                >
                  Quarantined
                </div>
                <div className="font-mono-tabular text-lg font-bold mt-0.5">
                  {validation.invalidRows.length}
                </div>
              </div>
            </div>

            {validation.invalidRows.length > 0 && (
              <div
                className="rounded-lg border p-3 space-y-2"
                style={{
                  backgroundColor: 'var(--status-fault-soft)',
                  borderColor: 'var(--status-fault)',
                }}
              >
                <div className="flex items-center gap-1.5 font-semibold">
                  <AlertTriangle
                    className="h-4 w-4"
                    style={{ color: 'var(--status-fault)' }}
                    aria-hidden="true"
                  />
                  <span>
                    Inline Geofence & Schema Rejections (Automatically Skipped)
                  </span>
                </div>
                {validation.invalidRows.map((inv) => (
                  <div
                    key={inv.rowIndex}
                    className="rounded border p-2"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      borderColor: 'var(--border-subtle)',
                    }}
                  >
                    <div className="font-mono-tabular font-semibold">
                      Excel Row #{inv.rowIndex}
                    </div>
                    <ul
                      className="list-disc pl-4 mt-1 space-y-0.5"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      {inv.errors.map((err, i) => (
                        <li key={i}>{err}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-between pt-2">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 font-medium"
                style={{
                  backgroundColor: 'var(--bg-elevated)',
                  borderColor: 'var(--border-subtle)',
                }}
              >
                <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                Adjust Mapping
              </button>
              <button
                type="button"
                disabled={validation.validRows.length === 0}
                onClick={() => setStep(4)}
                className="inline-flex items-center gap-1 rounded-lg px-4 py-2 font-semibold"
                style={{
                  backgroundColor: 'var(--accent-blaze)',
                  color: 'var(--accent-blaze-ink)',
                }}
              >
                Preview {validation.validRows.length} Valid Row(s)
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 4: Batch Preview */}
        {step === 4 && (
          <div className="space-y-3 text-xs">
            <div
              className="overflow-x-auto rounded-lg border max-h-72 overflow-y-auto"
              style={{ borderColor: 'var(--border-subtle)' }}
            >
              <table className="w-full text-left border-collapse">
                <thead
                  className="sticky top-0 text-[11px] uppercase"
                  style={{
                    backgroundColor: 'var(--bg-elevated)',
                    color: 'var(--text-muted)',
                  }}
                >
                  <tr>
                    <th className="py-2 px-2.5 border-b" style={{ borderColor: 'var(--border-subtle)' }}>Row</th>
                    <th className="py-2 px-2.5 border-b" style={{ borderColor: 'var(--border-subtle)' }}>Account / Subscriber</th>
                    <th className="py-2 px-2.5 border-b" style={{ borderColor: 'var(--border-subtle)' }}>Workflow</th>
                    <th className="py-2 px-2.5 border-b" style={{ borderColor: 'var(--border-subtle)' }}>Cavite Pin</th>
                  </tr>
                </thead>
                <tbody>
                  {validation.validRows.map((r) => (
                    <tr
                      key={r.rowIndex}
                      className="border-b"
                      style={{ borderColor: 'var(--border-subtle)' }}
                    >
                      <td className="py-2 px-2.5 font-mono-tabular">
                        #{r.rowIndex}
                      </td>
                      <td className="py-2 px-2.5">
                        <div className="font-semibold">{r.subscriberName}</div>
                        <div
                          className="font-mono-tabular text-[11px]"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          {r.accountNumber} • {r.municipality} ({r.barangay})
                        </div>
                      </td>
                      <td className="py-2 px-2.5 font-mono-tabular">
                        {r.workflowType} • {r.priority}
                      </td>
                      <td
                        className="py-2 px-2.5 font-mono-tabular"
                        style={{ color: 'var(--status-info)' }}
                      >
                        {r.lat.toFixed(4)}, {r.lng.toFixed(4)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-between pt-2">
              <button
                type="button"
                onClick={() => setStep(3)}
                className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 font-medium"
                style={{
                  backgroundColor: 'var(--bg-elevated)',
                  borderColor: 'var(--border-subtle)',
                }}
              >
                <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                Back
              </button>
              <button
                type="button"
                onClick={() => setStep(5)}
                className="inline-flex items-center gap-1 rounded-lg px-4 py-2 font-semibold"
                style={{
                  backgroundColor: 'var(--accent-blaze)',
                  color: 'var(--accent-blaze-ink)',
                }}
              >
                Proceed to Step 5 Commit
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 5: Commit Dispatch Batch */}
        {step === 5 && (
          <div className="space-y-3 text-xs">
            {!commitResult ? (
              <div
                className="rounded-xl border p-4 space-y-3"
                style={{
                  backgroundColor: 'var(--bg-elevated)',
                  borderColor: 'var(--border-subtle)',
                }}
              >
                <div className="text-sm font-semibold">
                  Ready to Commit {validation.validRows.length} Valid Cavite Work Order(s)
                </div>
                <p style={{ color: 'var(--text-secondary)' }}>
                  Each row creates or links a Cavite subscriber record, generates an auditable ticket in UNASSIGNED status, and broadcasts a live SSE update to NOC and Field consoles.
                </p>
                {!canCommit && (
                  <p style={{ color: 'var(--status-warn)' }}>
                    Current role ({actorRole}) is read-only for batch commit; switch to JOB_CONTROLLER or ADMINISTRATOR in the top bar to commit.
                  </p>
                )}
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setStep(4)}
                    className="rounded-lg border px-3 py-2 font-medium"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      borderColor: 'var(--border-subtle)',
                    }}
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    disabled={!canCommit || busy}
                    onClick={() => void handleCommitBatch()}
                    className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 font-semibold min-h-10"
                    style={{
                      backgroundColor: 'var(--accent-blaze)',
                      color: 'var(--accent-blaze-ink)',
                    }}
                  >
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                    <span>
                      {busy
                        ? 'Committing Batch…'
                        : `Commit ${validation.validRows.length} Dispatch Ticket(s)`}
                    </span>
                  </button>
                </div>
              </div>
            ) : (
              <div
                className="rounded-xl border p-4 space-y-3"
                style={{
                  backgroundColor: 'var(--status-ok-soft)',
                  borderColor: 'var(--status-ok)',
                }}
              >
                <div
                  className="flex items-center gap-2 text-sm font-semibold"
                  style={{ color: 'var(--status-ok)' }}
                >
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  <span>
                    Committed {commitResult.createdCount} Paperless Ticket(s) ({commitResult.skippedInvalidCount} invalid quarantined)
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {commitResult.workOrders.map((wo) => (
                    <button
                      key={wo.id}
                      type="button"
                      onClick={() => {
                        onSelectWorkOrderId(wo.id);
                        onNavigateTab('fleet');
                      }}
                      className="font-mono-tabular rounded border px-2 py-1 font-semibold"
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        borderColor: 'var(--border-subtle)',
                        color: 'var(--text-primary)',
                      }}
                    >
                      {wo.ticketNumber} ({wo.targetMunicipality})
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (commitResult.workOrders[0]) {
                        onSelectWorkOrderId(commitResult.workOrders[0].id);
                      }
                      onNavigateTab('fleet');
                    }}
                    className="rounded-lg px-3.5 py-2 font-semibold"
                    style={{
                      backgroundColor: 'var(--accent-blaze)',
                      color: 'var(--accent-blaze-ink)',
                    }}
                  >
                    Assign Imported Tickets in Fleet View
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setParsed(null);
                      setMapping(null);
                      setCommitResult(null);
                      setFileName('');
                      setStep(1);
                    }}
                    className="rounded-lg border px-3 py-2 font-medium"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      borderColor: 'var(--border-subtle)',
                    }}
                  >
                    Import Another File
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Right 5 Cols: Paperless Digital Subscriber Application Form */}
      <div className={embeddedInSplitScreen ? '' : 'xl:col-span-5'}>
        <DigitalIntakeFormCard
          actorRole={actorRole}
          onRefresh={onRefresh}
          onBanner={onBanner}
          onCreatedWorkOrder={(wo) => onSelectWorkOrderId(wo.id)}
          onNavigateTab={onNavigateTab}
        />
      </div>
    </div>
  );
}
