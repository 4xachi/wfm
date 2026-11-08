'use client';

import React, { useState } from 'react';
import {
  FilePlus2,
  RefreshCw,
  Send,
} from 'lucide-react';
import { surfaceFetchJson } from '@/client/apiClient';
import {
  validateMappedDispatchRows,
  type DispatchColumnMapping,
} from '@/domain/excelImport';
import type {
  Role,
  WorkOrderPriority,
  WorkOrderRecord,
  WorkflowType,
} from '@/domain/types';
import {
  CAVITE_BARANGAY_PRESETS,
  type OpsStatusBanner,
  type OpsTabId,
} from './opsHelpers';

interface DigitalIntakeFormCardProps {
  actorRole: Role;
  onRefresh: () => Promise<void>;
  onBanner: (banner: OpsStatusBanner) => void;
  onCreatedWorkOrder: (wo: WorkOrderRecord) => void;
  onNavigateTab: (tab: OpsTabId) => void;
}

const IDENTITY_MAPPING: DispatchColumnMapping = {
  accountNumber: 'accountNumber',
  subscriberName: 'subscriberName',
  phone: 'phone',
  workflowType: 'workflowType',
  priority: 'priority',
  municipality: 'municipality',
  barangay: 'barangay',
  streetAddress: 'streetAddress',
  lat: 'lat',
  lng: 'lng',
  planName: 'planName',
  issueDescription: 'issueDescription',
};

function generateAccountCode(): string {
  const num = Math.floor(9000 + Math.random() * 900);
  return `FB-CAV-${num}`;
}

export function DigitalIntakeFormCard({
  actorRole,
  onRefresh,
  onBanner,
  onCreatedWorkOrder,
  onNavigateTab,
}: DigitalIntakeFormCardProps) {
  const defaultPreset = CAVITE_BARANGAY_PRESETS[0];
  const [workflowType, setWorkflowType] = useState<WorkflowType>('NEW_INSTALL');
  const [priority, setPriority] = useState<WorkOrderPriority>('HIGH');
  const [accountNumber, setAccountNumber] = useState('FB-CAV-9104');
  const [subscriberName, setSubscriberName] = useState('');
  const [phone, setPhone] = useState('09178881234');
  const [planName, setPlanName] = useState('Blaze Fiber 500 Mbps');
  const [presetIdx, setPresetIdx] = useState(0);
  const [municipality, setMunicipality] = useState(defaultPreset.municipality);
  const [barangay, setBarangay] = useState(defaultPreset.barangay);
  const [streetAddress, setStreetAddress] = useState(
    defaultPreset.defaultStreet,
  );
  const [lat, setLat] = useState(String(defaultPreset.lat));
  const [lng, setLng] = useState(String(defaultPreset.lng));
  const [issueDescription, setIssueDescription] = useState(
    'Paperless subscriber application — verify house gate pin and NAP port.',
  );
  const [validationError, setValidationError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const canCommit =
    actorRole === 'JOB_CONTROLLER' || actorRole === 'ADMINISTRATOR';

  function handlePresetChange(index: number) {
    const chosen = CAVITE_BARANGAY_PRESETS[index];
    if (!chosen) return;
    setPresetIdx(index);
    setMunicipality(chosen.municipality);
    setBarangay(chosen.barangay);
    setStreetAddress(chosen.defaultStreet);
    setLat(String(chosen.lat));
    setLng(String(chosen.lng));
    setValidationError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setValidationError(null);

    const row: Record<string, string> = {
      accountNumber,
      subscriberName,
      phone,
      workflowType,
      priority,
      municipality,
      barangay,
      streetAddress,
      lat,
      lng,
      planName,
      issueDescription,
    };

    const { validRows, invalidRows } = validateMappedDispatchRows(
      [row],
      IDENTITY_MAPPING,
    );

    if (validRows.length === 0) {
      setValidationError(
        invalidRows[0]?.errors.join(' ') || 'Invalid Cavite intake fields.',
      );
      return;
    }

    setSubmitting(true);
    try {
      const res = await surfaceFetchJson<{
        createdCount: number;
        workOrders: WorkOrderRecord[];
      }>('ops', '/api/import/commit', {
        method: 'POST',
        body: JSON.stringify({
          rows: [row],
          mapping: IDENTITY_MAPPING,
          sourceChannel: 'DIGITAL_INTAKE',
        }),
      });

      const createdWo = res.workOrders[0];
      onBanner({
        tone: 'ok',
        message: `Digital intake ticket ${createdWo?.ticketNumber ?? ''} created in Cavite dispatch queue.`,
      });
      setSubscriberName('');
      setAccountNumber(generateAccountCode());
      await onRefresh();
      if (createdWo) {
        onCreatedWorkOrder(createdWo);
        onNavigateTab('fleet');
      }
    } catch (err) {
      setValidationError(
        err instanceof Error ? err.message : 'Digital intake submission failed.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section
      aria-label="Paperless Digital Subscriber Application Form"
      className="rounded-xl border p-4 space-y-3.5"
      style={{
        backgroundColor: 'var(--bg-surface)',
        borderColor: 'var(--border-subtle)',
      }}
    >
      <div
        className="flex items-center justify-between gap-2 border-b pb-3"
        style={{ borderColor: 'var(--border-subtle)' }}
      >
        <div className="flex items-center gap-2">
          <FilePlus2
            className="h-4 w-4"
            style={{ color: 'var(--accent-blaze)' }}
            aria-hidden="true"
          />
          <div>
            <h2 className="text-sm font-semibold">
              New Dispatch Ticket
            </h2>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Create a single walk-in or phone service request
            </p>
          </div>
        </div>
      </div>

      {validationError && (
        <div
          role="alert"
          className="rounded-lg border px-3 py-2 text-xs"
          style={{
            backgroundColor: 'var(--status-fault-soft)',
            borderColor: 'var(--status-fault)',
            color: 'var(--text-primary)',
          }}
        >
          {validationError}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3 text-xs">
        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <label
              htmlFor="di-workflow"
              className="block font-medium mb-1"
              style={{ color: 'var(--text-secondary)' }}
            >
              Service Order Type
            </label>
            <select
              id="di-workflow"
              value={workflowType}
              onChange={(e) => setWorkflowType(e.target.value as WorkflowType)}
              className="w-full rounded-lg border px-2.5 py-2 min-h-10"
              style={{
                backgroundColor: 'var(--bg-elevated)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
            >
              <option value="NEW_INSTALL">NEW_INSTALL</option>
              <option value="REPAIR">REPAIR</option>
              <option value="TRANSFER">TRANSFER</option>
            </select>
          </div>
          <div>
            <label
              htmlFor="di-priority"
              className="block font-medium mb-1"
              style={{ color: 'var(--text-secondary)' }}
            >
              SLA Priority
            </label>
            <select
              id="di-priority"
              value={priority}
              onChange={(e) =>
                setPriority(e.target.value as WorkOrderPriority)
              }
              className="w-full rounded-lg border px-2.5 py-2 min-h-10"
              style={{
                backgroundColor: 'var(--bg-elevated)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
            >
              <option value="NORMAL">NORMAL</option>
              <option value="HIGH">HIGH</option>
              <option value="URGENT">URGENT</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <div>
            <label
              htmlFor="di-acct"
              className="block font-medium mb-1"
              style={{ color: 'var(--text-secondary)' }}
            >
              Account Number
            </label>
            <div className="flex gap-1.5">
              <input
                id="di-acct"
                type="text"
                required
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
                className="font-mono-tabular flex-1 rounded-lg border px-2.5 py-2 min-h-10"
                style={{
                  backgroundColor: 'var(--bg-elevated)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              />
              <button
                type="button"
                aria-label="Generate new Cavite account number"
                onClick={() => setAccountNumber(generateAccountCode())}
                className="rounded-lg border px-2.5 min-h-10"
                style={{
                  backgroundColor: 'var(--bg-elevated)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-secondary)',
                }}
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>

          <div>
            <label
              htmlFor="di-phone"
              className="block font-medium mb-1"
              style={{ color: 'var(--text-secondary)' }}
            >
              Subscriber Mobile
            </label>
            <input
              id="di-phone"
              type="tel"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="font-mono-tabular w-full rounded-lg border px-2.5 py-2 min-h-10"
              style={{
                backgroundColor: 'var(--bg-elevated)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <div>
            <label
              htmlFor="di-name"
              className="block font-medium mb-1"
              style={{ color: 'var(--text-secondary)' }}
            >
              Subscriber Full Name
            </label>
            <input
              id="di-name"
              type="text"
              required
              placeholder="e.g. Carmela De Guzman"
              value={subscriberName}
              onChange={(e) => setSubscriberName(e.target.value)}
              className="w-full rounded-lg border px-2.5 py-2 min-h-10"
              style={{
                backgroundColor: 'var(--bg-elevated)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
            />
          </div>

          <div>
            <label
              htmlFor="di-plan"
              className="block font-medium mb-1"
              style={{ color: 'var(--text-secondary)' }}
            >
              Subscribed Fiber Plan
            </label>
            <select
              id="di-plan"
              value={planName}
              onChange={(e) => setPlanName(e.target.value)}
              className="w-full rounded-lg border px-2.5 py-2 min-h-10"
              style={{
                backgroundColor: 'var(--bg-elevated)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
            >
              <option value="Blaze Fiber 200 Mbps">Blaze Fiber 200 Mbps</option>
              <option value="Blaze Fiber 300 Mbps">Blaze Fiber 300 Mbps</option>
              <option value="Blaze Fiber 500 Mbps">Blaze Fiber 500 Mbps</option>
              <option value="Blaze Biz 800 Mbps">Blaze Biz 800 Mbps</option>
            </select>
          </div>
        </div>

        <div>
          <label
            htmlFor="di-preset"
            className="block font-medium mb-1"
            style={{ color: 'var(--text-secondary)' }}
          >
            Cavite Municipality & Barangay Preset
          </label>
          <select
            id="di-preset"
            value={presetIdx}
            onChange={(e) => handlePresetChange(Number(e.target.value))}
            className="w-full rounded-lg border px-2.5 py-2 min-h-10"
            style={{
              backgroundColor: 'var(--bg-elevated)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-primary)',
            }}
          >
            {CAVITE_BARANGAY_PRESETS.map((p, i) => (
              <option key={`${p.municipality}-${p.barangay}`} value={i}>
                {p.municipality} — Brgy. {p.barangay} ({p.lat.toFixed(4)},{' '}
                {p.lng.toFixed(4)})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="di-street"
            className="block font-medium mb-1"
            style={{ color: 'var(--text-secondary)' }}
          >
            House / Lot / Subdivision Street Address
          </label>
          <input
            id="di-street"
            type="text"
            required
            value={streetAddress}
            onChange={(e) => setStreetAddress(e.target.value)}
            className="w-full rounded-lg border px-2.5 py-2 min-h-10"
            style={{
              backgroundColor: 'var(--bg-elevated)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-primary)',
            }}
          />
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <label
              htmlFor="di-lat"
              className="block font-medium mb-1"
              style={{ color: 'var(--text-secondary)' }}
            >
              Latitude (14.05–14.50)
            </label>
            <input
              id="di-lat"
              type="text"
              required
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              className="font-mono-tabular w-full rounded-lg border px-2.5 py-2 min-h-10"
              style={{
                backgroundColor: 'var(--bg-elevated)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
            />
          </div>
          <div>
            <label
              htmlFor="di-lng"
              className="block font-medium mb-1"
              style={{ color: 'var(--text-secondary)' }}
            >
              Longitude (120.58–121.08)
            </label>
            <input
              id="di-lng"
              type="text"
              required
              value={lng}
              onChange={(e) => setLng(e.target.value)}
              className="font-mono-tabular w-full rounded-lg border px-2.5 py-2 min-h-10"
              style={{
                backgroundColor: 'var(--bg-elevated)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
            />
          </div>
        </div>

        <div>
          <label
            htmlFor="di-concern"
            className="block font-medium mb-1"
            style={{ color: 'var(--text-secondary)' }}
          >
            Field Dispatch Instructions / Concern
          </label>
          <textarea
            id="di-concern"
            rows={2}
            value={issueDescription}
            onChange={(e) => setIssueDescription(e.target.value)}
            className="w-full rounded-lg border px-2.5 py-2"
            style={{
              backgroundColor: 'var(--bg-elevated)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-primary)',
            }}
          />
        </div>

        <button
          type="submit"
          disabled={!canCommit || submitting}
          className="w-full inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-xs font-semibold min-h-11"
          style={{
            backgroundColor: 'var(--accent-blaze)',
            color: 'var(--accent-blaze-ink)',
          }}
        >
          <Send className="h-3.5 w-3.5" aria-hidden="true" />
          <span>
            {!canCommit
              ? `Requires Controller or Admin (${actorRole})`
              : submitting
              ? 'Creating Ticket…'
              : 'Create Dispatch Ticket'}
          </span>
        </button>
      </form>
    </section>
  );
}
