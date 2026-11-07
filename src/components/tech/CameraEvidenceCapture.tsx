'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  Activity,
  Cable,
  Camera,
  Cpu,
  FileSignature,
  ShieldAlert,
  Trash2,
  Video,
  VideoOff,
} from 'lucide-react';
import {
  captureVideoFrameWithWatermark,
  renderSimulatedFtthFrame,
  type SimulatedFeedPreset,
  type WatermarkMeta,
} from '@/client/watermark';
import type { CaptureMode, EvidenceKind } from '@/domain/types';
import type { DraftEvidenceItem } from './techTypes';

interface CameraEvidenceCaptureProps {
  ticketNumber: string;
  techCode: string;
  capturedLat: number | null;
  capturedLng: number | null;
  opticalDbm: number;
  napCode: string | null;
  portNumber: number | null;
  evidenceItems: DraftEvidenceItem[];
  disabled?: boolean;
  onAddEvidence: (item: DraftEvidenceItem) => void;
  onDeleteEvidence: (id: string) => void;
}

const PRESET_DEFINITIONS: Array<{
  preset: SimulatedFeedPreset;
  label: string;
  kind: EvidenceKind;
  captureMode: CaptureMode;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    preset: 'OPTICAL_METER',
    label: 'Optical Meter',
    kind: 'CAMERA_OPTICAL',
    captureMode: 'SIMULATED_FTTH_FEED',
    icon: Activity,
  },
  {
    preset: 'NAP_SPLITTER_TAG',
    label: 'NAP Port Tag',
    kind: 'CAMERA_NAP',
    captureMode: 'SIMULATED_FTTH_FEED',
    icon: Cable,
  },
  {
    preset: 'ONU_MODEM',
    label: 'GPON ONU LEDs',
    kind: 'CAMERA_ONU',
    captureMode: 'SIMULATED_FTTH_FEED',
    icon: Cpu,
  },
  {
    preset: 'SIGNED_HARDCOPY',
    label: 'Beta Signed Hard-Copy',
    kind: 'SIGNED_HARDCOPY',
    captureMode: 'BETA_HARDCOPY_SCAN',
    icon: FileSignature,
  },
];

export function CameraEvidenceCapture({
  ticketNumber,
  techCode,
  capturedLat,
  capturedLng,
  opticalDbm,
  napCode,
  portNumber,
  evidenceItems,
  disabled = false,
  onAddEvidence,
  onDeleteEvidence,
}: CameraEvidenceCaptureProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [streamActive, setStreamActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [liveCameraKind, setLiveCameraKind] =
    useState<Extract<EvidenceKind, 'CAMERA_OPTICAL' | 'CAMERA_NAP' | 'CAMERA_ONU'>>(
      'CAMERA_OPTICAL',
    );

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setStreamActive(false);
  }

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  async function startWebRtcCamera() {
    setCameraError(null);
    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      setCameraError(
        'WebRTC getUserMedia is unavailable on this browser context. Use the 1-tap Simulated FTTH Viewfinder Presets below.',
      );
      return;
    }
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      streamRef.current = mediaStream;
      setStreamActive(true);
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
          void videoRef.current.play().catch(() => {});
        }
      });
    } catch (err) {
      setCameraError(
        err instanceof Error
          ? `Camera permission blocked (${err.message}). Use Simulated FTTH Viewfinder Presets for rehearsal.`
          : 'Unable to open live camera stream.',
      );
    }
  }

  function buildMeta(modeLabel: string): WatermarkMeta {
    return {
      ticketNumber,
      techCode,
      lat: capturedLat,
      lng: capturedLng,
      opticalDbm,
      napCode,
      portNumber,
      modeLabel,
    };
  }

  function handleLiveShutter() {
    if (!videoRef.current || !streamActive) return;
    const { dataUrl, watermark } = captureVideoFrameWithWatermark(
      videoRef.current,
      buildMeta(`WEBRTC_${liveCameraKind}`),
    );
    onAddEvidence({
      id: crypto.randomUUID(),
      kind: liveCameraKind,
      captureMode: 'WEBRTC_CAMERA',
      dataUrl,
      watermark,
      createdAt: new Date().toISOString(),
    });
  }

  function handlePresetCapture(
    preset: SimulatedFeedPreset,
    kind: EvidenceKind,
    captureMode: CaptureMode,
  ) {
    const { dataUrl, watermark } = renderSimulatedFtthFrame(
      preset,
      buildMeta(captureMode),
    );
    onAddEvidence({
      id: crypto.randomUUID(),
      kind,
      captureMode,
      dataUrl,
      watermark,
      createdAt: new Date().toISOString(),
    });
  }

  const cameraPhotos = evidenceItems.filter(
    (e) => e.kind !== 'SUBSCRIBER_SIGNATURE',
  );

  return (
    <section
      className="rounded-xl border p-4 space-y-3.5"
      style={{
        backgroundColor: 'var(--bg-surface)',
        borderColor: 'var(--border-subtle)',
      }}
      aria-labelledby="camera-proof-heading"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 id="camera-proof-heading" className="text-sm font-bold">
            Camera-Only Field Evidence &amp; Telemetry Stamp
          </h3>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Auto-stamps UTC timestamp, Cavite GPS, NAP port, and Rx dBm onto
            every frame.
          </p>
        </div>
        <span
          className="font-mono-tabular rounded border px-2 py-1 text-xs font-semibold"
          style={{
            backgroundColor:
              cameraPhotos.length > 0
                ? 'var(--status-ok-soft)'
                : 'var(--bg-elevated)',
            borderColor:
              cameraPhotos.length > 0
                ? 'var(--status-ok)'
                : 'var(--border-subtle)',
            color:
              cameraPhotos.length > 0
                ? 'var(--status-ok)'
                : 'var(--text-secondary)',
          }}
        >
          {cameraPhotos.length} CAPTURED
        </span>
      </div>

      {/* Anti-spoofing gallery block notice */}
      <div
        className="flex items-start gap-2 rounded-lg border px-3 py-2 text-xs"
        style={{
          backgroundColor: 'var(--status-info-soft)',
          borderColor: 'var(--status-info)',
          color: 'var(--text-primary)',
        }}
      >
        <ShieldAlert
          className="h-4 w-4 mt-0.5 shrink-0"
          style={{ color: 'var(--status-info)' }}
          aria-hidden="true"
        />
        <span>
          <strong>FiberBlaze Security Policy:</strong> Device gallery &amp; file
          uploads are strictly blocked to prevent recycled photo spoofing. Live
          WebRTC camera shutter or audited FTTH diagnostic feeds only.
        </span>
      </div>

      {!disabled && (
        <>
          {/* Live WebRTC Camera Controls */}
          <div className="space-y-2.5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={streamActive ? stopCamera : () => void startWebRtcCamera()}
                className="min-h-12 inline-flex items-center justify-center gap-2 rounded-lg border px-3 text-xs font-semibold transition-colors"
                style={{
                  backgroundColor: streamActive
                    ? 'var(--status-fault-soft)'
                    : 'var(--bg-elevated)',
                  borderColor: streamActive
                    ? 'var(--status-fault)'
                    : 'var(--border-strong)',
                  color: streamActive
                    ? 'var(--status-fault)'
                    : 'var(--text-primary)',
                }}
              >
                {streamActive ? (
                  <>
                    <VideoOff className="h-4 w-4" aria-hidden="true" />
                    <span>Close Live Camera</span>
                  </>
                ) : (
                  <>
                    <Video className="h-4 w-4" aria-hidden="true" />
                    <span>Open Live WebRTC Camera</span>
                  </>
                )}
              </button>

              <select
                aria-label="Live camera evidence subject"
                value={liveCameraKind}
                onChange={(e) =>
                  setLiveCameraKind(
                    e.target.value as
                      | 'CAMERA_OPTICAL'
                      | 'CAMERA_NAP'
                      | 'CAMERA_ONU',
                  )
                }
                className="min-h-12 rounded-lg border px-3 text-xs font-semibold font-mono-tabular"
                style={{
                  backgroundColor: 'var(--bg-elevated)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              >
                <option value="CAMERA_OPTICAL">Subject: Optical Meter (dBm)</option>
                <option value="CAMERA_NAP">Subject: NAP Splitter &amp; Tag</option>
                <option value="CAMERA_ONU">Subject: Subscriber ONU LEDs</option>
              </select>
            </div>

            {cameraError && (
              <div
                role="alert"
                className="rounded-lg border px-3 py-2 text-xs"
                style={{
                  backgroundColor: 'var(--status-warn-soft)',
                  borderColor: 'var(--status-warn)',
                  color: 'var(--text-primary)',
                }}
              >
                {cameraError}
              </div>
            )}

            {streamActive && (
              <div
                className="overflow-hidden rounded-xl border p-2 space-y-2"
                style={{
                  backgroundColor: '#090d12',
                  borderColor: 'var(--accent-blaze)',
                }}
              >
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  className="w-full h-52 rounded-lg object-cover bg-black"
                />
                <button
                  type="button"
                  onClick={handleLiveShutter}
                  className="w-full min-h-12 inline-flex items-center justify-center gap-2 rounded-lg px-4 text-sm font-bold transition-opacity"
                  style={{
                    backgroundColor: 'var(--accent-blaze)',
                    color: 'var(--accent-blaze-ink)',
                  }}
                >
                  <Camera className="h-4 w-4" aria-hidden="true" />
                  <span>Capture Watermarked Frame ({liveCameraKind})</span>
                </button>
              </div>
            )}
          </div>

          {/* 1-Tap Simulated FTTH Viewfinder Presets */}
          <div>
            <div
              className="text-xs font-semibold uppercase tracking-wider mb-2"
              style={{ color: 'var(--text-secondary)' }}
            >
              1-Tap Simulated FTTH Viewfinder Presets
            </div>
            <div className="grid grid-cols-2 gap-2">
              {PRESET_DEFINITIONS.map((p) => {
                const Icon = p.icon;
                return (
                  <button
                    key={p.preset}
                    type="button"
                    onClick={() =>
                      handlePresetCapture(p.preset, p.kind, p.captureMode)
                    }
                    className="min-h-12 inline-flex items-center justify-start gap-2 rounded-lg border px-3 text-left text-xs font-semibold transition-colors"
                    style={{
                      backgroundColor: 'var(--bg-elevated)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    <Icon
                      className="h-4 w-4 shrink-0"
                      aria-hidden="true"
                    />
                    <span>{p.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* Captured Watermarked Evidence Gallery */}
      {cameraPhotos.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
          {cameraPhotos.map((ev) => (
            <div
              key={ev.id}
              className="overflow-hidden rounded-lg border flex flex-col"
              style={{
                backgroundColor: 'var(--bg-elevated)',
                borderColor: 'var(--border-subtle)',
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={ev.dataUrl}
                alt={`${ev.kind} watermarked field evidence for ${ticketNumber}`}
                className="w-full h-36 object-cover bg-slate-950"
              />
              <div className="p-2.5 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-mono-tabular text-xs font-bold truncate">
                    {ev.kind}
                  </div>
                  <div
                    className="font-mono-tabular text-[11px] truncate"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {ev.captureMode}
                  </div>
                </div>
                {!disabled && (
                  <button
                    type="button"
                    aria-label={`Delete ${ev.kind} evidence frame`}
                    onClick={() => onDeleteEvidence(ev.id)}
                    className="min-h-12 min-w-12 inline-flex items-center justify-center rounded-lg border transition-colors shrink-0"
                    style={{
                      backgroundColor: 'var(--status-fault-soft)',
                      borderColor: 'var(--status-fault)',
                      color: 'var(--status-fault)',
                    }}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
