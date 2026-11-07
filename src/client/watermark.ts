export type SimulatedFeedPreset =
  | 'OPTICAL_METER'
  | 'NAP_SPLITTER_TAG'
  | 'ONU_MODEM'
  | 'SIGNED_HARDCOPY';

export interface WatermarkMeta {
  ticketNumber: string;
  techCode: string;
  lat: number | null;
  lng: number | null;
  opticalDbm?: number | null;
  napCode?: string | null;
  portNumber?: number | null;
  modeLabel: string;
}

export function drawTelemetryStamp(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  meta: WatermarkMeta,
): string {
  const iso = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  const coords =
    meta.lat !== null && meta.lng !== null
      ? `${meta.lat.toFixed(5)}, ${meta.lng.toFixed(5)}`
      : 'GPS UNLOCKED';
  const rxPart =
    typeof meta.opticalDbm === 'number'
      ? `RX ${meta.opticalDbm.toFixed(1)} dBm`
      : 'RX N/A';
  const napPart = meta.napCode
    ? `${meta.napCode}${meta.portNumber ? ` P${String(meta.portNumber).padStart(2, '0')}` : ''}`
    : 'NAP N/A';

  const line1 = `FIBERBLAZE WFM • ${meta.ticketNumber} • TECH ${meta.techCode} • ${meta.modeLabel}`;
  const line2 = `${iso} • CAVITE (${coords}) • ${napPart} • ${rxPart}`;

  ctx.fillStyle = 'rgba(9, 13, 18, 0.86)';
  ctx.fillRect(0, height - 58, width, 58);
  ctx.fillStyle = '#f97316';
  ctx.fillRect(0, height - 58, width, 2.5);

  ctx.font = '600 13px monospace';
  ctx.fillStyle = '#f8fafc';
  ctx.fillText(line1, 14, height - 34);

  ctx.font = '500 12px monospace';
  ctx.fillStyle = '#38bdf8';
  ctx.fillText(line2, 14, height - 14);

  return `${line1} | ${line2}`;
}

export function captureVideoFrameWithWatermark(
  video: HTMLVideoElement,
  meta: WatermarkMeta,
): { dataUrl: string; watermark: string } {
  const width = 720;
  const height = 480;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#0b0f14';
  ctx.fillRect(0, 0, width, height);

  if (video.videoWidth > 0 && video.videoHeight > 0) {
    ctx.drawImage(video, 0, 0, width, height - 58);
  }

  const watermark = drawTelemetryStamp(ctx, width, height, meta);
  return {
    dataUrl: canvas.toDataURL('image/jpeg', 0.86),
    watermark,
  };
}

export function renderSimulatedFtthFrame(
  preset: SimulatedFeedPreset,
  meta: WatermarkMeta,
): { dataUrl: string; watermark: string } {
  const width = 720;
  const height = 480;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  // Background diagnostic grid
  ctx.fillStyle = preset === 'SIGNED_HARDCOPY' ? '#e2e8f0' : '#111827';
  ctx.fillRect(0, 0, width, height);

  if (preset !== 'SIGNED_HARDCOPY') {
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.1)';
    ctx.lineWidth = 1;
    for (let x = 0; x < width; x += 28) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height - 58);
      ctx.stroke();
    }
    for (let y = 0; y < height - 58; y += 28) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
  }

  // Top badge clearly identifying simulated diagnostic feed (honest UX)
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(16, 16, 300, 28);
  ctx.strokeStyle = '#f59e0b';
  ctx.strokeRect(16, 16, 300, 28);
  ctx.fillStyle = '#fbbf24';
  ctx.font = '600 12px monospace';
  ctx.fillText('[SIMULATED FTTH DIAGNOSTIC FEED]', 26, 34);

  const dbm = typeof meta.opticalDbm === 'number' ? meta.opticalDbm : -18.8;

  if (preset === 'OPTICAL_METER') {
    // Ruggedized Handheld GPON Optical Power Meter
    ctx.fillStyle = '#f97316';
    ctx.beginPath();
    ctx.roundRect(220, 56, 280, 336, 22);
    ctx.fill();

    ctx.fillStyle = '#1f2937';
    ctx.beginPath();
    ctx.roundRect(238, 74, 244, 300, 14);
    ctx.fill();

    // Backlit LCD Screen
    ctx.fillStyle = dbm < -27.9 ? '#7f1d1d' : '#a7f3d0';
    ctx.fillRect(258, 98, 204, 134);

    ctx.fillStyle = dbm < -27.9 ? '#fecaca' : '#064e3b';
    ctx.font = '600 14px monospace';
    ctx.fillText('GPON PON METER • 1490 nm', 268, 122);
    ctx.font = '700 40px monospace';
    ctx.fillText(`${dbm.toFixed(1)} dBm`, 268, 176);
    ctx.font = '600 13px monospace';
    const statusTxt =
      dbm >= -25.0 && dbm <= -8.0
        ? 'SIGNAL: OPTIMAL PASS'
        : dbm >= -27.9
          ? 'SIGNAL: MARGINAL WARN'
          : 'SIGNAL: FAIL / LOS';
    ctx.fillText(statusTxt, 268, 212);

    // Physical buttons
    ['λ 1490nm', 'dBm/dB', 'REF', 'HOLD'].forEach((lbl, idx) => {
      const bx = 262 + idx * 50;
      ctx.fillStyle = '#374151';
      ctx.fillRect(bx, 260, 42, 30);
      ctx.fillStyle = '#e5e7eb';
      ctx.font = '600 10px sans-serif';
      ctx.fillText(lbl, bx + 4, 279);
    });
  } else if (preset === 'NAP_SPLITTER_TAG') {
    // Pole-mounted IP65 FiberBlaze NAP Enclosure & Port Tag
    ctx.fillStyle = '#334155';
    ctx.beginPath();
    ctx.roundRect(140, 66, 440, 310, 14);
    ctx.fill();
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(166, 88, 388, 52);
    ctx.fillStyle = '#f8fafc';
    ctx.font = '700 20px monospace';
    ctx.fillText(
      `FIBERBLAZE ${meta.napCode ?? 'NAP-IMS-118'} SPLITTER`,
      182,
      120,
    );

    const activePort = meta.portNumber ?? 4;
    for (let p = 1; p <= 8; p++) {
      const px = 176 + (p - 1) * 46;
      ctx.fillStyle = p === activePort ? '#10b981' : '#1e293b';
      ctx.fillRect(px, 168, 36, 56);
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(px, 168, 36, 56);
      ctx.fillStyle = '#ffffff';
      ctx.font = '700 12px monospace';
      ctx.fillText(`P${p}`, px + 9, 200);
    }

    // Yellow UV-resistant Subscriber Fiber Tag Flag
    ctx.fillStyle = '#facc15';
    ctx.fillRect(210, 266, 300, 68);
    ctx.fillStyle = '#0f172a';
    ctx.font = '700 16px monospace';
    ctx.fillText(
      `DROP TAG: ${meta.napCode ?? 'NAP-IMS'}-P0${activePort}`,
      226,
      295,
    );
    ctx.font = '600 13px monospace';
    ctx.fillText(`TICKET: ${meta.ticketNumber}`, 226, 319);
  } else if (preset === 'ONU_MODEM') {
    // Subscriber Dual-Band GPON ONU Terminal
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    ctx.roundRect(150, 145, 420, 165, 16);
    ctx.fill();

    // Dual antennas
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(190, 62, 16, 86);
    ctx.fillRect(514, 62, 16, 86);

    ctx.fillStyle = '#0f172a';
    ctx.font = '700 18px sans-serif';
    ctx.fillText('FIBERBLAZE GPON DUAL-BAND Wi-Fi 6 ONU', 180, 190);

    const leds = [
      { name: 'PWR', color: '#10b981' },
      { name: 'PON', color: dbm < -27.9 ? '#475569' : '#10b981' },
      { name: 'LOS', color: dbm < -27.9 ? '#ef4444' : '#cbd5e1' },
      { name: 'LAN1', color: '#10b981' },
      { name: 'WLAN', color: '#10b981' },
    ];
    leds.forEach((led, idx) => {
      const lx = 195 + idx * 72;
      ctx.beginPath();
      ctx.arc(lx, 245, 9, 0, Math.PI * 2);
      ctx.fillStyle = led.color;
      ctx.fill();
      ctx.fillStyle = '#334155';
      ctx.font = '600 12px monospace';
      ctx.fillText(led.name, lx - 14, 276);
    });
  } else {
    // Signed Beta Hard-Copy Service Order
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(130, 56, 460, 344);
    ctx.strokeStyle = '#94a3b8';
    ctx.strokeRect(130, 56, 460, 344);

    ctx.fillStyle = '#0f172a';
    ctx.font = '700 18px sans-serif';
    ctx.fillText('FIBERBLAZE CAVITE — BETA HARD-COPY JOB ORDER', 152, 92);
    ctx.font = '500 13px monospace';
    ctx.fillText(`Work Order : ${meta.ticketNumber}`, 152, 126);
    ctx.fillText(`NAP / Port : ${meta.napCode ?? 'VERIFIED'} / P${meta.portNumber ?? 1}`, 152, 150);
    ctx.fillText(`Optical Rx : ${dbm.toFixed(1)} dBm`, 152, 174);
    ctx.fillText('Subscriber acknowledges service acceptance & ONU handover.', 152, 212);

    // Cursive ink signature stroke
    ctx.strokeStyle = '#1d4ed8';
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(180, 320);
    ctx.bezierCurveTo(215, 275, 250, 340, 290, 295);
    ctx.bezierCurveTo(325, 265, 355, 330, 420, 302);
    ctx.stroke();

    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(160, 336);
    ctx.lineTo(480, 336);
    ctx.stroke();
    ctx.fillStyle = '#475569';
    ctx.font = '600 11px sans-serif';
    ctx.fillText('SUBSCRIBER SIGNATURE OVER PRINTED NAME (BETA ACCEPTED)', 160, 356);
  }

  const watermark = drawTelemetryStamp(ctx, width, height, meta);
  return {
    dataUrl: canvas.toDataURL('image/png'),
    watermark,
  };
}
