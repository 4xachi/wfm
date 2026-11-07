import { describe, expect, it } from 'vitest';
import {
  computeGpsFreshness,
  evaluateSubscriberCoordinateCapture,
} from '@/domain/gpsIntegrity';

describe('GPS Freshness & 30m Verified Coordinate Safeguards', () => {
  it('never reports logged-out or >5 minute old telemetry as LIVE', () => {
    const now = new Date('2026-11-07T10:30:00.000Z').getTime();

    expect(
      computeGpsFreshness({
        sessionActive: true,
        lastGpsAt: '2026-11-07T10:28:00.000Z',
        nowMs: now,
      }),
    ).toBe('LIVE');

    expect(
      computeGpsFreshness({
        sessionActive: true,
        lastGpsAt: '2026-11-07T10:23:30.000Z',
        nowMs: now,
      }),
    ).toBe('STALE');

    expect(
      computeGpsFreshness({
        sessionActive: false,
        lastGpsAt: '2026-11-07T10:29:55.000Z',
        nowMs: now,
      }),
    ).toBe('OFFLINE');
  });

  it('captures initial coordinates directly when subscriber record is unverified', () => {
    const res = evaluateSubscriberCoordinateCapture({
      recordedLat: null,
      recordedLng: null,
      coordsVerified: false,
      capturedLat: 14.4449,
      capturedLng: 120.9522,
    });
    expect(res.action).toBe('SET_INITIAL_VERIFIED');
    expect(res.createDiscrepancy).toBe(false);
  });

  it('reuses verified coordinates silently when field GPS is within 30m', () => {
    const res = evaluateSubscriberCoordinateCapture({
      recordedLat: 14.4294,
      recordedLng: 120.9367,
      coordsVerified: true,
      capturedLat: 14.4295, // ~11m away
      capturedLng: 120.9367,
    });
    expect(res.action).toBe('REUSE_VERIFIED');
    expect(res.createDiscrepancy).toBe(false);
  });

  it('flags PENDING supervisor discrepancy instead of overwriting when verified pin differs by >30m', () => {
    const res = evaluateSubscriberCoordinateCapture({
      recordedLat: 14.4294,
      recordedLng: 120.9367,
      coordsVerified: true,
      capturedLat: 14.4305, // ~122m away
      capturedLng: 120.9367,
    });
    expect(res.action).toBe('FLAG_DISCREPANCY_KEEP_TRUSTED');
    expect(res.createDiscrepancy).toBe(true);
    expect(res.distanceMeters).toBeGreaterThan(30);
  });

  it('rejects coordinates outside Cavite province operational bounds', () => {
    const res = evaluateSubscriberCoordinateCapture({
      recordedLat: null,
      recordedLng: null,
      coordsVerified: false,
      capturedLat: 14.6507, // Quezon City (outside Cavite)
      capturedLng: 121.0494,
    });
    expect(res.action).toBe('REJECT_OUT_OF_BOUNDS');
  });
});
