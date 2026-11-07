'use client';

import React from 'react';
import { CheckCircle2, Send, XCircle } from 'lucide-react';
import type {
  CompletionValidationResult,
  OpticalSignalEvaluation,
} from '@/domain/opticalAndNap';
import { CUST_ISSUE_REASONS, FB_ISSUE_REASONS } from './techTypes';

interface FieldCloseOutPanelProps {
  needsStart: boolean;
  isSubmittingOutcome: boolean;
  opticalEval: OpticalSignalEvaluation;
  completionCheck: CompletionValidationResult;
  formError: string | null;
  exceptionKind: 'FB_ISSUE' | 'CUST_ISSUE';
  exceptionReasonCode: string;
  exceptionNotes: string;
  onChangeExceptionKind: (kind: 'FB_ISSUE' | 'CUST_ISSUE') => void;
  onChangeExceptionReasonCode: (code: string) => void;
  onChangeExceptionNotes: (notes: string) => void;
  onCloseOut: (status: 'COMPLETED' | 'FB_ISSUE' | 'CUST_ISSUE') => void;
}

export function FieldCloseOutPanel({
  needsStart,
  isSubmittingOutcome,
  opticalEval,
  completionCheck,
  formError,
  exceptionKind,
  exceptionReasonCode,
  exceptionNotes,
  onChangeExceptionKind,
  onChangeExceptionReasonCode,
  onChangeExceptionNotes,
  onCloseOut,
}: FieldCloseOutPanelProps) {
  const reasonOptions =
    exceptionKind === 'FB_ISSUE' ? FB_ISSUE_REASONS : CUST_ISSUE_REASONS;

  return (
    <section
      className="rounded-xl border p-4 space-y-3.5"
      style={{
        backgroundColor: 'var(--bg-surface)',
        borderColor: 'var(--border-subtle)',
      }}
      aria-labelledby="closeout-heading"
    >
      <h3 id="closeout-heading" className="text-sm font-bold">
        Field Close-Out &amp; Exception Escalation
      </h3>

      {formError && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border px-3 py-2.5 text-xs font-semibold"
          style={{
            backgroundColor: 'var(--status-fault-soft)',
            borderColor: 'var(--status-fault)',
            color: 'var(--text-primary)',
          }}
        >
          <XCircle
            className="h-4 w-4 mt-0.5 shrink-0"
            style={{ color: 'var(--status-fault)' }}
            aria-hidden="true"
          />
          <span>{formError}</span>
        </div>
      )}

      {!completionCheck.ok && (
        <div
          className="rounded-lg border px-3 py-2 text-xs"
          style={{
            backgroundColor: 'var(--bg-elevated)',
            borderColor: 'var(--border-subtle)',
            color: 'var(--text-secondary)',
          }}
        >
          <strong>Completion Gate:</strong> {completionCheck.error}
        </div>
      )}

      <button
        type="button"
        disabled={
          isSubmittingOutcome ||
          needsStart ||
          !opticalEval.canComplete ||
          !completionCheck.ok
        }
        onClick={() => onCloseOut('COMPLETED')}
        className="w-full min-h-12 inline-flex items-center justify-center gap-2 rounded-lg px-4 text-sm font-bold transition-opacity"
        style={{
          backgroundColor: 'var(--status-ok)',
          color: '#ffffff',
        }}
      >
        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
        <span>
          {isSubmittingOutcome
            ? 'Submitting Field Outcome…'
            : 'Submit Completion (COMPLETED)'}
        </span>
      </button>

      <div
        className="border-t pt-3.5 space-y-2.5"
        style={{ borderColor: 'var(--border-subtle)' }}
      >
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            aria-pressed={exceptionKind === 'FB_ISSUE'}
            onClick={() => onChangeExceptionKind('FB_ISSUE')}
            className="min-h-12 rounded-lg border px-3 text-xs font-bold font-mono-tabular"
            style={{
              backgroundColor:
                exceptionKind === 'FB_ISSUE'
                  ? 'var(--status-fault-soft)'
                  : 'var(--bg-elevated)',
              borderColor:
                exceptionKind === 'FB_ISSUE'
                  ? 'var(--status-fault)'
                  : 'var(--border-subtle)',
              color:
                exceptionKind === 'FB_ISSUE'
                  ? 'var(--status-fault)'
                  : 'var(--text-secondary)',
            }}
          >
            Mode: FB_ISSUE (NetOps)
          </button>

          <button
            type="button"
            aria-pressed={exceptionKind === 'CUST_ISSUE'}
            onClick={() => onChangeExceptionKind('CUST_ISSUE')}
            className="min-h-12 rounded-lg border px-3 text-xs font-bold font-mono-tabular"
            style={{
              backgroundColor:
                exceptionKind === 'CUST_ISSUE'
                  ? 'var(--status-warn-soft)'
                  : 'var(--bg-elevated)',
              borderColor:
                exceptionKind === 'CUST_ISSUE'
                  ? 'var(--status-warn)'
                  : 'var(--border-subtle)',
              color:
                exceptionKind === 'CUST_ISSUE'
                  ? 'var(--status-warn)'
                  : 'var(--text-secondary)',
            }}
          >
            Mode: CUST_ISSUE (Reschedule)
          </button>
        </div>

        <div>
          <label
            htmlFor="tech-exception-reason"
            className="block text-xs font-semibold mb-1"
            style={{ color: 'var(--text-secondary)' }}
          >
            Exception Reason Code ({exceptionKind})
          </label>
          <select
            id="tech-exception-reason"
            value={exceptionReasonCode}
            onChange={(e) => onChangeExceptionReasonCode(e.target.value)}
            className="w-full min-h-12 rounded-lg border px-3 text-xs font-semibold font-mono-tabular"
            style={{
              backgroundColor: 'var(--bg-elevated)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-primary)',
            }}
          >
            {reasonOptions.map((r) => (
              <option key={r.code} value={r.code}>
                {r.code} — {r.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="tech-exception-notes"
            className="block text-xs font-semibold mb-1"
            style={{ color: 'var(--text-secondary)' }}
          >
            Field Technician Notes / Resolution Summary
          </label>
          <textarea
            id="tech-exception-notes"
            rows={2}
            placeholder="Record splice loss measurements, NAP pole ID, or subscriber reschedule notes…"
            value={exceptionNotes}
            onChange={(e) => onChangeExceptionNotes(e.target.value)}
            className="w-full rounded-lg border p-2.5 text-xs"
            style={{
              backgroundColor: 'var(--bg-elevated)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-primary)',
            }}
          />
        </div>

        {exceptionKind === 'FB_ISSUE' ? (
          <button
            type="button"
            disabled={isSubmittingOutcome || needsStart}
            onClick={() => onCloseOut('FB_ISSUE')}
            className="w-full min-h-12 inline-flex items-center justify-center gap-2 rounded-lg border px-4 text-xs font-bold"
            style={{
              backgroundColor: 'var(--status-fault)',
              borderColor: 'var(--status-fault)',
              color: '#ffffff',
            }}
          >
            <Send className="h-4 w-4" aria-hidden="true" />
            <span>
              Escalate Network / NAP Issue (FB_ISSUE — Camera Proof Req.)
            </span>
          </button>
        ) : (
          <button
            type="button"
            disabled={isSubmittingOutcome || needsStart}
            onClick={() => onCloseOut('CUST_ISSUE')}
            className="w-full min-h-12 inline-flex items-center justify-center gap-2 rounded-lg border px-4 text-xs font-bold"
            style={{
              backgroundColor: 'var(--status-warn)',
              borderColor: 'var(--status-warn)',
              color: '#ffffff',
            }}
          >
            <Send className="h-4 w-4" aria-hidden="true" />
            <span>Report Subscriber Issue (CUST_ISSUE)</span>
          </button>
        )}
      </div>
    </section>
  );
}
