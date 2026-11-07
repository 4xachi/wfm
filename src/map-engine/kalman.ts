import { bearingDegrees, lerpAngle, type LatLng } from './geo';

const DEG_TO_RAD = Math.PI / 180;
const METERS_PER_DEG_LAT = 111132.92;
const METERS_PER_DEG_LNG_EQUATOR = 111412.84;

export interface GpsKalmanState extends LatLng {
  vx: number;
  vy: number;
  speedMps: number;
  bearing: number;
  kalmanGain: number;
}

export interface GpsKalmanPrediction extends LatLng {
  bearing: number;
}

/**
 * 2D Kinematic Constant-Velocity GPS Kalman Filter + Dead-Reckoning Predictor.
 * State vector in local Cavite tangent-plane meters: [x, y, vx, vy].
 * Dampens urban/subdivision multipath GPS jitter for FiberBlaze FTTH field vehicles.
 */
export class GpsKalmanFilter2D {
  private readonly sigmaAccel: number;
  private initialized = false;
  private refLat = 0;
  private refLng = 0;
  private cosLat = 1;
  private x = 0;
  private y = 0;
  private vx = 0;
  private vy = 0;
  private varPos = 25;
  private varVel = 9;
  private lastTimestampMs = 0;
  private bearing = 0;

  constructor(processNoiseAccel = 2.4) {
    this.sigmaAccel = processNoiseAccel;
  }

  reset(lat: number, lng: number, bearing = 0, timestampMs = Date.now()): void {
    this.initialized = true;
    this.refLat = lat;
    this.refLng = lng;
    this.cosLat = Math.max(0.05, Math.cos(lat * DEG_TO_RAD));
    this.x = 0;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    this.varPos = 16;
    this.varVel = 6;
    this.lastTimestampMs = timestampMs;
    this.bearing = bearing;
  }

  private toMeters(lat: number, lng: number): { x: number; y: number } {
    return {
      x: (lng - this.refLng) * METERS_PER_DEG_LNG_EQUATOR * this.cosLat,
      y: (lat - this.refLat) * METERS_PER_DEG_LAT,
    };
  }

  private toLatLng(x: number, y: number): LatLng {
    return {
      lat: this.refLat + y / METERS_PER_DEG_LAT,
      lng: this.refLng + x / (METERS_PER_DEG_LNG_EQUATOR * this.cosLat),
    };
  }

  process(
    lat: number,
    lng: number,
    accuracyMeters = 10,
    timestampMs = Date.now(),
    observedSpeedMps: number | null = null
  ): GpsKalmanState {
    if (!this.initialized) {
      this.reset(lat, lng, 0, timestampMs);
      return {
        lat,
        lng,
        vx: 0,
        vy: 0,
        speedMps: 0,
        bearing: this.bearing,
        kalmanGain: 1,
      };
    }

    const dt = Math.max(0.05, Math.min(10, (timestampMs - this.lastTimestampMs) / 1000));
    this.lastTimestampMs = timestampMs;

    // 1. Predict step: x_pred = x + vx * dt
    const predX = this.x + this.vx * dt;
    const predY = this.y + this.vy * dt;
    const qPos = 0.5 * this.sigmaAccel * dt * dt;
    const qVel = this.sigmaAccel * dt;
    const predVarPos = this.varPos + this.varVel * dt * dt + qPos * qPos;
    const predVarVel = this.varVel + qVel * qVel;

    // 2. Measurement update step
    const meas = this.toMeters(lat, lng);
    const residX = meas.x - predX;
    const residY = meas.y - predY;

    const rMeas = Math.max(9, accuracyMeters * accuracyMeters);
    const kalmanGainPos = predVarPos / (predVarPos + rMeas);
    const kalmanGainVel = Math.min(0.65, predVarVel / (predVarVel + rMeas));

    const prevLatLng = this.toLatLng(this.x, this.y);

    this.x = predX + kalmanGainPos * residX;
    this.y = predY + kalmanGainPos * residY;
    this.vx = this.vx + (kalmanGainVel * residX) / dt;
    this.vy = this.vy + (kalmanGainVel * residY) / dt;

    this.varPos = (1 - kalmanGainPos) * predVarPos;
    this.varVel = (1 - kalmanGainVel) * predVarVel;

    const currentLatLng = this.toLatLng(this.x, this.y);
    const estSpeed =
      observedSpeedMps !== null ? observedSpeedMps : Math.hypot(this.vx, this.vy);
    if (Math.hypot(this.vx, this.vy) > 0.4) {
      const moveBrg = bearingDegrees(prevLatLng, currentLatLng);
      this.bearing = lerpAngle(this.bearing, moveBrg, 0.55);
    }

    return {
      lat: currentLatLng.lat,
      lng: currentLatLng.lng,
      vx: this.vx,
      vy: this.vy,
      speedMps: estSpeed,
      bearing: this.bearing,
      kalmanGain: kalmanGainPos,
    };
  }

  predict(dtSeconds = 0.016): GpsKalmanPrediction {
    if (!this.initialized) {
      return { lat: 0, lng: 0, bearing: 0 };
    }
    const clampedDt = Math.max(0, Math.min(2.0, dtSeconds));
    const nextX = this.x + this.vx * clampedDt;
    const nextY = this.y + this.vy * clampedDt;
    const pt = this.toLatLng(nextX, nextY);
    return {
      lat: pt.lat,
      lng: pt.lng,
      bearing: this.bearing,
    };
  }
}

export { GpsKalmanFilter2D as GpsKalmanFilter };
