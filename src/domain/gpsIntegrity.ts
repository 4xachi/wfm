import {
  CAVITE_LIMITS,
  GPS_INTEGRITY_THRESHOLDS,
  type GpsFreshness,
} from './types';

const EARTH_RADIUS_M = 6_371_000;

export function distanceMetersBetween(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function isInsideCavite(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= CAVITE_LIMITS.minLat &&
    lat <= CAVITE_LIMITS.maxLat &&
    lng >= CAVITE_LIMITS.minLng &&
    lng <= CAVITE_LIMITS.maxLng
  );
}

export function computeGpsFreshness(input: {
  sessionActive: boolean;
  lastGpsAt: string | null;
  nowMs?: number;
}): GpsFreshness {
  if (!input.sessionActive || !input.lastGpsAt) {
    return 'OFFLINE';
  }
  const parsed = Date.parse(input.lastGpsAt);
  if (!Number.isFinite(parsed)) {
    return 'OFFLINE';
  }
  const now = input.nowMs ?? Date.now();
  const ageMs = Math.max(0, now - parsed);
  return ageMs <= GPS_INTEGRITY_THRESHOLDS.staleThresholdMs ? 'LIVE' : 'STALE';
}

export type CoordinateCaptureAction =
  | 'SET_INITIAL_VERIFIED'
  | 'REUSE_VERIFIED'
  | 'FLAG_DISCREPANCY_KEEP_TRUSTED'
  | 'REJECT_OUT_OF_BOUNDS';

export interface CoordinateCaptureEvaluation {
  action: CoordinateCaptureAction;
  createDiscrepancy: boolean;
  distanceMeters: number;
}

export function evaluateSubscriberCoordinateCapture(input: {
  recordedLat: number | null;
  recordedLng: number | null;
  coordsVerified: boolean;
  capturedLat: number;
  capturedLng: number;
}): CoordinateCaptureEvaluation {
  if (!isInsideCavite(input.capturedLat, input.capturedLng)) {
    return {
      action: 'REJECT_OUT_OF_BOUNDS',
      createDiscrepancy: false,
      distanceMeters: 0,
    };
  }

  if (
    !input.coordsVerified ||
    input.recordedLat === null ||
    input.recordedLng === null
  ) {
    return {
      action: 'SET_INITIAL_VERIFIED',
      createDiscrepancy: false,
      distanceMeters: 0,
    };
  }

  const dist = distanceMetersBetween(
    input.recordedLat,
    input.recordedLng,
    input.capturedLat,
    input.capturedLng,
  );

  if (dist > GPS_INTEGRITY_THRESHOLDS.mismatchMeters) {
    return {
      action: 'FLAG_DISCREPANCY_KEEP_TRUSTED',
      createDiscrepancy: true,
      distanceMeters: Math.round(dist * 10) / 10,
    };
  }

  return {
    action: 'REUSE_VERIFIED',
    createDiscrepancy: false,
    distanceMeters: Math.round(dist * 10) / 10,
  };
}
