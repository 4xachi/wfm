'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  Eraser,
  FileSignature,
  PenTool,
  Trash2,
} from 'lucide-react';
import { drawTelemetryStamp } from '@/client/watermark';
import type { DraftEvidenceItem } from './techTypes';

interface SubscriberSignaturePadProps {
  ticketNumber: string;
  subscriberName: string;
  subscriberAccount: string;
  techCode: string;
  capturedLat: number | null;
  capturedLng: number | null;
  opticalDbm: number;
  napCode: string | null;
  portNumber: number | null;
  requiredForWorkflow: boolean;
  hasHardcopyFallback: boolean;
  existingSignature: DraftEvidenceItem | null;
  disabled?: boolean;
  onSaveSignature: (item: DraftEvidenceItem) => void;
  onDeleteSignature: (id: string) => void;
}

const PAD_WIDTH = 640;
const PAD_HEIGHT = 210;

export function SubscriberSignaturePad({
  ticketNumber,
  subscriberName,
  subscriberAccount,
  techCode,
  capturedLat,
  capturedLng,
  opticalDbm,
  napCode,
  portNumber,
  requiredForWorkflow,
  hasHardcopyFallback,
  existingSignature,
  disabled = false,
  onSaveSignature,
  onDeleteSignature,
}: SubscriberSignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

  const [hasStrokes, setHasStrokes] = useState(false);

  function resetCanvasSurface() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, PAD_WIDTH, PAD_HEIGHT);

    // Baseline guide
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(28, PAD_HEIGHT - 38);
    ctx.lineTo(PAD_WIDTH - 28, PAD_HEIGHT - 38);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#64748b';
    ctx.font = '600 11px monospace';
    ctx.fillText(
      `SIGN ABOVE: ${subscriberName.toUpperCase()} (${subscriberAccount})`,
      28,
      PAD_HEIGHT - 16,
    );
    setHasStrokes(false);
  }

  useEffect(() => {
    if (!existingSignature && !disabled) {
      resetCanvasSurface();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingSignature, subscriberName, subscriberAccount, disabled]);

  function getCanvasCoords(
    e: React.PointerEvent<HTMLCanvasElement>,
  ): { x: number; y: number } {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = PAD_WIDTH / Math.max(1, rect.width);
    const scaleY = PAD_HEIGHT / Math.max(1, rect.height);
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (disabled) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    const pt = getCanvasCoords(e);
    lastPointRef.current = pt;

    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 1.4, 0, Math.PI * 2);
      ctx.fill();
      setHasStrokes(true);
    }
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current || disabled) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx || !lastPointRef.current) return;

    const pt = getCanvasCoords(e);
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2.8;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y);
    ctx.lineTo(pt.x, pt.y);
    ctx.stroke();

    lastPointRef.current = pt;
    if (!hasStrokes) setHasStrokes(true);
  }

  function handlePointerUp() {
    drawingRef.current = false;
    lastPointRef.current = null;
  }

  function stampWatermarkedSignature() {
    const padCanvas = canvasRef.current;
    if (!padCanvas || !hasStrokes) return;

    const outWidth = 720;
    const outHeight = 340;
    const out = document.createElement('canvas');
    out.width = outWidth;
    out.height = outHeight;
    const ctx = out.getContext('2d')!;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, outWidth, outHeight);

    ctx.fillStyle = '#0f172a';
    ctx.font = '700 15px sans-serif';
    ctx.fillText(
      'FIBERBLAZE CAVITE — SUBSCRIBER DIGITAL SERVICE ACCEPTANCE',
      20,
      30,
    );
    ctx.fillStyle = '#475569';
    ctx.font = '500 12px monospace';
    ctx.fillText(
      `Subscriber: ${subscriberName} (${subscriberAccount}) • Ticket: ${ticketNumber}`,
      20,
      50,
    );

    ctx.drawImage(padCanvas, 20, 62, outWidth - 40, 208);

    const watermark = drawTelemetryStamp(ctx, outWidth, outHeight, {
      ticketNumber,
      techCode,
      lat: capturedLat,
      lng: capturedLng,
      opticalDbm,
      napCode,
      portNumber,
      modeLabel: 'SIGNATURE_PAD',
    });
    onSaveSignature({
      id: crypto.randomUUID(),
      kind: 'SUBSCRIBER_SIGNATURE',
      captureMode: 'SIGNATURE_PAD',
      dataUrl: out.toDataURL('image/png'),
      watermark,
      createdAt: new Date().toISOString(),
    });
  }

  const satisfied = Boolean(existingSignature || hasHardcopyFallback);

  return (
    <section
      className="rounded-xl border p-4 space-y-3"
      style={{
        backgroundColor: 'var(--bg-surface)',
        borderColor: 'var(--border-subtle)',
      }}
      aria-labelledby="sig-pad-heading"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 id="sig-pad-heading" className="text-sm font-bold">
            Subscriber Digital Acceptance Signature
          </h3>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {requiredForWorkflow
              ? 'Mandatory on NEW_INSTALL & TRANSFER unless Beta Signed Hard-Copy was captured.'
              : 'Optional customer sign-off for service repair acknowledgement.'}
          </p>
        </div>

        <span
          className="font-mono-tabular rounded border px-2 py-1 text-xs font-semibold"
          style={{
            backgroundColor: satisfied
              ? 'var(--status-ok-soft)'
              : requiredForWorkflow
                ? 'var(--status-warn-soft)'
                : 'var(--bg-elevated)',
            borderColor: satisfied
              ? 'var(--status-ok)'
              : requiredForWorkflow
                ? 'var(--status-warn)'
                : 'var(--border-subtle)',
            color: satisfied
              ? 'var(--status-ok)'
              : requiredForWorkflow
                ? 'var(--status-warn)'
                : 'var(--text-secondary)',
          }}
        >
          {existingSignature
            ? 'DIGITAL SIGNED'
            : hasHardcopyFallback
              ? 'HARD-COPY ATTACHED'
              : requiredForWorkflow
                ? 'REQUIRED'
                : 'OPTIONAL'}
        </span>
      </div>

      {existingSignature ? (
        <div
          className="rounded-lg border overflow-hidden"
          style={{
            backgroundColor: 'var(--bg-elevated)',
            borderColor: 'var(--status-ok)',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={existingSignature.dataUrl}
            alt={`Watermarked subscriber signature for ${ticketNumber}`}
            className="w-full h-40 object-contain bg-white"
          />
          <div className="p-2.5 flex items-center justify-between gap-2">
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold" style={{ color: 'var(--status-ok)' }}>
              <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Watermarked SUBSCRIBER_SIGNATURE PNG attached</span>
            </div>
            {!disabled && (
              <button
                type="button"
                onClick={() => onDeleteSignature(existingSignature.id)}
                className="min-h-12 inline-flex items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold"
                style={{
                  backgroundColor: 'var(--status-fault-soft)',
                  borderColor: 'var(--status-fault)',
                  color: 'var(--status-fault)',
                }}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                <span>Re-Sign</span>
              </button>
            )}
          </div>
        </div>
      ) : hasHardcopyFallback ? (
        <div
          className="flex items-center gap-2 rounded-lg border px-3 py-3 text-xs"
          style={{
            backgroundColor: 'var(--status-ok-soft)',
            borderColor: 'var(--status-ok)',
            color: 'var(--text-primary)',
          }}
        >
          <FileSignature
            className="h-4 w-4 shrink-0"
            style={{ color: 'var(--status-ok)' }}
            aria-hidden="true"
          />
          <span>
            <strong>Acceptance Satisfied:</strong> Signed Beta Hard-Copy Service
            Order frame is attached above. You may still capture a digital
            signature if needed.
          </span>
        </div>
      ) : null}

      {!existingSignature && !disabled && (
        <div className="space-y-2.5">
          <div
            className="overflow-hidden rounded-lg border-2 bg-white"
            style={{ borderColor: 'var(--border-strong)' }}
          >
            <canvas
              ref={canvasRef}
              width={PAD_WIDTH}
              height={PAD_HEIGHT}
              aria-label={`Signature pad for subscriber ${subscriberName}`}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              className="w-full h-40 block cursor-crosshair select-none"
              style={{ touchAction: 'none' }}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={resetCanvasSurface}
              className="min-h-12 inline-flex items-center justify-center gap-2 rounded-lg border px-3 text-xs font-semibold"
              style={{
                backgroundColor: 'var(--bg-elevated)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-secondary)',
              }}
            >
              <Eraser className="h-4 w-4" aria-hidden="true" />
              <span>Clear Pad</span>
            </button>

            <button
              type="button"
              disabled={!hasStrokes}
              onClick={stampWatermarkedSignature}
              className="min-h-12 inline-flex items-center justify-center gap-2 rounded-lg px-3 text-xs font-semibold transition-opacity"
              style={{
                backgroundColor: 'var(--accent-blaze)',
                color: 'var(--accent-blaze-ink)',
              }}
            >
              <PenTool className="h-4 w-4" aria-hidden="true" />
              <span>Stamp &amp; Save Signature</span>
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
