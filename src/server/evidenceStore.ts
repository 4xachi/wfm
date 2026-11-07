import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { CaptureMode, EvidenceKind } from '@/domain/types';
import { HttpError } from './auth';

const MAX_EVIDENCE_BYTES = 4 * 1024 * 1024; // 4 MB limit per image

const ALLOWED_CAPTURE_MODES: Set<CaptureMode> = new Set([
  'WEBRTC_CAMERA',
  'SIMULATED_FTTH_FEED',
  'SIGNATURE_PAD',
  'BETA_HARDCOPY_SCAN',
]);

const ALLOWED_EVIDENCE_KINDS: Set<EvidenceKind> = new Set([
  'CAMERA_NAP',
  'CAMERA_OPTICAL',
  'CAMERA_ONU',
  'SUBSCRIBER_SIGNATURE',
  'SIGNED_HARDCOPY',
]);

const MIME_TO_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

export interface StoredEvidenceFile {
  id: string;
  fileName: string;
  mimeType: string;
  sha256: string;
}

export function persistEvidenceDataUrl(
  evidenceDir: string,
  input: {
    kind: EvidenceKind;
    captureMode: CaptureMode;
    dataUrl: string;
  },
): StoredEvidenceFile {
  if (!ALLOWED_EVIDENCE_KINDS.has(input.kind)) {
    throw new HttpError(400, `Unsupported evidence kind: ${String(input.kind)}`);
  }
  if (!ALLOWED_CAPTURE_MODES.has(input.captureMode)) {
    throw new HttpError(
      400,
      'Gallery uploads are blocked. Use live camera capture, subscriber signature pad, or authorized beta hard-copy capture.',
    );
  }

  // Camera field photos cannot use signature or hardcopy capture mode
  if (
    input.kind.startsWith('CAMERA_') &&
    input.captureMode !== 'WEBRTC_CAMERA' &&
    input.captureMode !== 'SIMULATED_FTTH_FEED'
  ) {
    throw new HttpError(
      400,
      `Evidence ${input.kind} requires live WebRTC camera or simulated FTTH viewfinder.`,
    );
  }

  const match = input.dataUrl.match(
    /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=\s]+)$/,
  );
  if (!match) {
    throw new HttpError(
      400,
      'Invalid evidence image encoding (expected PNG, JPEG, or WebP base64 data URL).',
    );
  }

  const mimeType = match[1];
  const ext = MIME_TO_EXT[mimeType] ?? 'png';
  const buffer = Buffer.from(match[2].replace(/\s+/g, ''), 'base64');

  if (buffer.byteLength === 0 || buffer.byteLength > MAX_EVIDENCE_BYTES) {
    throw new HttpError(
      400,
      `Evidence image size (${buffer.byteLength} bytes) is invalid or exceeds 4 MB limit.`,
    );
  }

  // Verify binary magic bytes to prevent file content spoofing
  if (mimeType === 'image/png') {
    if (
      buffer.byteLength < 8 ||
      buffer[0] !== 0x89 ||
      buffer[1] !== 0x50 ||
      buffer[2] !== 0x4e ||
      buffer[3] !== 0x47
    ) {
      throw new HttpError(400, 'Invalid or corrupted PNG binary header.');
    }
  } else if (mimeType === 'image/jpeg') {
    if (
      buffer.byteLength < 3 ||
      buffer[0] !== 0xff ||
      buffer[1] !== 0xd8 ||
      buffer[2] !== 0xff
    ) {
      throw new HttpError(400, 'Invalid or corrupted JPEG binary header.');
    }
  } else if (mimeType === 'image/webp') {
    if (
      buffer.byteLength < 12 ||
      buffer[0] !== 0x52 ||
      buffer[1] !== 0x49 ||
      buffer[2] !== 0x46 ||
      buffer[3] !== 0x46 ||
      buffer[8] !== 0x57 ||
      buffer[9] !== 0x45 ||
      buffer[10] !== 0x42 ||
      buffer[11] !== 0x50
    ) {
      throw new HttpError(400, 'Invalid or corrupted WebP binary header.');
    }
  }

  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
  const id = crypto.randomUUID();
  const fileName = `${id}.${ext}`;

  fs.mkdirSync(evidenceDir, { recursive: true });
  const targetPath = path.resolve(evidenceDir, fileName);
  const resolvedRoot = path.resolve(evidenceDir);
  if (!targetPath.startsWith(resolvedRoot + path.sep)) {
    throw new HttpError(400, 'Unsafe evidence file destination.');
  }

  fs.writeFileSync(targetPath, buffer);
  return { id, fileName, mimeType, sha256 };
}

export function readEvidenceAsDataUrl(
  evidenceDir: string,
  fileName: string,
  mimeType: string,
): string | undefined {
  if (!/^[0-9a-f-]{36}\.(png|jpg|webp)$/i.test(fileName)) {
    return undefined;
  }
  const resolvedRoot = path.resolve(evidenceDir);
  const targetPath = path.resolve(evidenceDir, fileName);
  if (!targetPath.startsWith(resolvedRoot + path.sep)) {
    return undefined;
  }
  if (!fs.existsSync(targetPath)) {
    return undefined;
  }
  const bytes = fs.readFileSync(targetPath);
  return `data:${mimeType};base64,${bytes.toString('base64')}`;
}
