export type LngLatTuple = [number, number];

export interface LatLng {
  lat: number;
  lng: number;
}

export interface NamedLocation extends LatLng {
  label?: string;
}

export interface CaviteBounds {
  readonly minLng: number;
  readonly minLat: number;
  readonly maxLng: number;
  readonly maxLat: number;
  readonly center: Readonly<LatLng>;
  readonly maxBoundsLngLat: [[number, number], [number, number]];
}

export interface SegmentProjection {
  point: LatLng;
  distanceMeters: number;
  u: number;
  segmentLengthMeters: number;
  bearing: number;
}

export interface DistanceAlongRoutePoint extends LatLng {
  bearing: number;
  segmentIndex: number;
}

export interface LookAheadPoint extends LatLng {
  bearing: number;
}

export interface RouteInterpolationResult {
  point: LatLng;
  lat: number;
  lng: number;
  lookAheadPoint: LookAheadPoint;
  bearing: number;
  anticipatedBearing: number;
  segmentIndex: number;
  traveled: LngLatTuple[] | null;
  remaining: LngLatTuple[] | null;
}

export interface ManeuverStepLike {
  maneuverType?: string;
  maneuverModifier?: string;
  startDistanceMeters?: number;
}

export interface TurnMetrics {
  turnCount: number;
  sharpTurnCount: number;
  geometryCornerCount: number;
  turnPenaltySeconds: number;
}

export type CongestionClass = 'fast' | 'moderate' | 'slow';

export interface SpeedSegmentProperties {
  speedKmh: number;
  congestionClass: CongestionClass;
}

export interface SpeedSegmentFeature {
  type: 'Feature';
  properties: SpeedSegmentProperties;
  geometry: {
    type: 'LineString';
    coordinates: LngLatTuple[];
  };
}

export interface SpeedFeatureCollection {
  type: 'FeatureCollection';
  features: SpeedSegmentFeature[];
}

export interface GpsJitterSample extends LatLng {
  errorMeters: number;
}

export interface PolylineDistanceResult {
  distanceMeters: number;
  segmentIndex: number;
  point: LatLng | null;
}

const EARTH_RADIUS_M = 6371008.8;
const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const METERS_PER_DEG_LAT = 111132.92;
const METERS_PER_DEG_LNG_EQUATOR = 111412.84;

/**
 * Geographic bounding box for Cavite Province, Philippines.
 * Covers Bacoor, Imus, Kawit, Noveleta, Rosario, Cavite City, Tanza, Naic,
 * Ternate, Maragondon, General Trias, Trece Martires, Dasmariñas, Carmona,
 * GMA, Silang, Indang, Amadeo, Mendez, Alfonso, Gen. Emilio Aguinaldo,
 * Magallanes, and Tagaytay City.
 */
export const CAVITE_BOUNDS: CaviteBounds = {
  minLng: 120.58,
  minLat: 14.05,
  maxLng: 121.08,
  maxLat: 14.5,
  center: { lat: 14.3294, lng: 120.9367 },
  maxBoundsLngLat: [
    [120.52, 14.0],
    [121.12, 14.54],
  ],
};

export function isWithinCaviteBounds(point: LatLng): boolean;
export function isWithinCaviteBounds(lat: number, lng: number): boolean;
export function isWithinCaviteBounds(
  ptOrLat: LatLng | number,
  maybeLng?: number
): boolean {
  const lat = typeof ptOrLat === 'object' && ptOrLat !== null ? ptOrLat.lat : ptOrLat;
  const lng = typeof ptOrLat === 'object' && ptOrLat !== null ? ptOrLat.lng : maybeLng;
  if (typeof lat !== 'number' || typeof lng !== 'number') return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  return (
    lat >= CAVITE_BOUNDS.minLat &&
    lat <= CAVITE_BOUNDS.maxLat &&
    lng >= CAVITE_BOUNDS.minLng &&
    lng <= CAVITE_BOUNDS.maxLng
  );
}

export function clampToCaviteBounds<T extends LatLng>(point: T): T;
export function clampToCaviteBounds(lat: number, lng: number): LatLng;
export function clampToCaviteBounds<T extends LatLng>(
  ptOrLat: T | number,
  maybeLng?: number
): T | LatLng {
  const isObj = typeof ptOrLat === 'object' && ptOrLat !== null;
  const rawLat = isObj ? ptOrLat.lat : ptOrLat;
  const rawLng = isObj ? ptOrLat.lng : (maybeLng ?? CAVITE_BOUNDS.center.lng);
  const safeLat = Number.isFinite(rawLat) ? rawLat : CAVITE_BOUNDS.center.lat;
  const safeLng = Number.isFinite(rawLng) ? rawLng : CAVITE_BOUNDS.center.lng;

  const lat = Math.max(CAVITE_BOUNDS.minLat, Math.min(CAVITE_BOUNDS.maxLat, safeLat));
  const lng = Math.max(CAVITE_BOUNDS.minLng, Math.min(CAVITE_BOUNDS.maxLng, safeLng));
  return isObj ? { ...ptOrLat, lat, lng } : { lat, lng };
}

export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = (b.lat - a.lat) * DEG_TO_RAD;
  const dLng = (b.lng - a.lng) * DEG_TO_RAD;
  const lat1 = a.lat * DEG_TO_RAD;
  const lat2 = b.lat * DEG_TO_RAD;
  const sinLat = Math.sin(dLat * 0.5);
  const sinLng = Math.sin(dLng * 0.5);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  return 2 * EARTH_RADIUS_M * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}

export function bearingDegrees(a: LatLng, b: LatLng): number {
  const lat1 = a.lat * DEG_TO_RAD;
  const lat2 = b.lat * DEG_TO_RAD;
  const dLng = (b.lng - a.lng) * DEG_TO_RAD;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (Math.atan2(y, x) * RAD_TO_DEG + 360) % 360;
}

export function angularDifference(fromDeg: number, toDeg: number): number {
  return ((((toDeg - fromDeg) % 360) + 540) % 360) - 180;
}

export function lerpAngle(fromDeg: number, toDeg: number, t: number): number {
  const diff = angularDifference(fromDeg, toDeg);
  return (((fromDeg + diff * t) % 360) + 360) % 360;
}

/**
 * Decodes Valhalla polyline6 (1e-6) or polyline5 (1e-5) into [lng, lat] coordinate pairs.
 */
export function decodePolyline6(str: string, precision = 1e-6): LngLatTuple[] {
  if (!str) return [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  const coordinates: LngLatTuple[] = [];

  while (index < str.length) {
    let shift = 0;
    let result = 0;
    let byte = 0;
    do {
      byte = str.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index <= str.length);
    const dLat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dLat;

    shift = 0;
    result = 0;
    do {
      byte = str.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index <= str.length);
    const dLng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += dLng;

    coordinates.push([lng * precision, lat * precision]);
  }

  return coordinates;
}

export function encodePolyline6(
  coords: readonly LngLatTuple[],
  precision = 1e-6
): string {
  const factor = Math.round(1 / precision);
  let prevLat = 0;
  let prevLng = 0;
  let out = '';

  const encodeSigned = (num: number): void => {
    let s = num < 0 ? ~(num << 1) : num << 1;
    while (s >= 0x20) {
      out += String.fromCharCode((0x20 | (s & 0x1f)) + 63);
      s >>= 5;
    }
    out += String.fromCharCode(s + 63);
  };

  for (const [lng, lat] of coords) {
    const iLat = Math.round(lat * factor);
    const iLng = Math.round(lng * factor);
    encodeSigned(iLat - prevLat);
    encodeSigned(iLng - prevLng);
    prevLat = iLat;
    prevLng = iLng;
  }

  return out;
}

export function projectPointOnSegment(
  p: LatLng,
  a: LatLng,
  b: LatLng
): SegmentProjection {
  const refLatRad = (a.lat + b.lat) * 0.5 * DEG_TO_RAD;
  const cosLat = Math.max(0.01, Math.cos(refLatRad));
  const metersPerDegLng = METERS_PER_DEG_LNG_EQUATOR * cosLat;

  const vx = (b.lng - a.lng) * metersPerDegLng;
  const vy = (b.lat - a.lat) * METERS_PER_DEG_LAT;
  const wx = (p.lng - a.lng) * metersPerDegLng;
  const wy = (p.lat - a.lat) * METERS_PER_DEG_LAT;

  const lenSq = vx * vx + vy * vy;
  if (lenSq < 1e-9) {
    return {
      point: { lat: a.lat, lng: a.lng },
      distanceMeters: Math.hypot(wx, wy),
      u: 0,
      segmentLengthMeters: 0,
      bearing: 0,
    };
  }

  const u = Math.max(0, Math.min(1, (wx * vx + wy * vy) / lenSq));
  const projLat = a.lat + u * (b.lat - a.lat);
  const projLng = a.lng + u * (b.lng - a.lng);
  const dx = wx - u * vx;
  const dy = wy - u * vy;

  return {
    point: { lat: projLat, lng: projLng },
    distanceMeters: Math.hypot(dx, dy),
    u,
    segmentLengthMeters: Math.sqrt(lenSq),
    bearing: bearingDegrees(a, b),
  };
}

export function computeCumulativeDistances(
  coords: readonly LngLatTuple[]
): Float64Array {
  const n = coords.length;
  const cum = new Float64Array(n);
  if (n === 0) return cum;
  cum[0] = 0;
  for (let i = 1; i < n; i++) {
    const prev: LatLng = { lng: coords[i - 1][0], lat: coords[i - 1][1] };
    const curr: LatLng = { lng: coords[i][0], lat: coords[i][1] };
    cum[i] = cum[i - 1] + haversineMeters(prev, curr);
  }
  return cum;
}

export function pointAtDistance(
  coords: readonly LngLatTuple[],
  cumDist: Float64Array,
  targetMeters: number
): DistanceAlongRoutePoint {
  const n = coords.length;
  if (n === 0) return { lat: 0, lng: 0, bearing: 0, segmentIndex: 0 };
  if (n === 1) {
    return { lng: coords[0][0], lat: coords[0][1], bearing: 0, segmentIndex: 0 };
  }

  const total = cumDist[n - 1] ?? 0;
  const clamped = Math.max(0, Math.min(total, targetMeters));

  let lo = 0;
  let hi = n - 2;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (cumDist[mid] <= clamped) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  const idx = lo;

  const segStart = cumDist[idx];
  const segLen = Math.max(1e-6, cumDist[idx + 1] - segStart);
  const u = Math.max(0, Math.min(1, (clamped - segStart) / segLen));
  const a: LatLng = { lng: coords[idx][0], lat: coords[idx][1] };
  const b: LatLng = { lng: coords[idx + 1][0], lat: coords[idx + 1][1] };

  return {
    lat: a.lat + u * (b.lat - a.lat),
    lng: a.lng + u * (b.lng - a.lng),
    bearing: bearingDegrees(a, b),
    segmentIndex: idx,
  };
}

/**
 * Interpolates a technician's position, 3D gimbal look-ahead anchor, heading, and
 * traveled/remaining polyline slices along a Cavite street route.
 */
export function interpolateAlongRoute(
  coords: readonly LngLatTuple[],
  cumDist: Float64Array,
  progressMeters: number,
  includeSlices?: boolean
): RouteInterpolationResult;
export function interpolateAlongRoute(
  coords: readonly LngLatTuple[],
  progressMeters: number,
  includeSlices?: boolean
): RouteInterpolationResult;
export function interpolateAlongRoute(
  coords: readonly LngLatTuple[],
  cumDistOrProgress: Float64Array | number,
  progressOrSlices?: number | boolean,
  maybeIncludeSlices = true
): RouteInterpolationResult {
  const cumDist =
    cumDistOrProgress instanceof Float64Array
      ? cumDistOrProgress
      : computeCumulativeDistances(coords);
  const progressMeters =
    typeof cumDistOrProgress === 'number'
      ? cumDistOrProgress
      : typeof progressOrSlices === 'number'
        ? progressOrSlices
        : 0;
  const includeSlices =
    typeof cumDistOrProgress === 'number'
      ? typeof progressOrSlices === 'boolean'
        ? progressOrSlices
        : true
      : maybeIncludeSlices;

  const n = coords.length;
  if (n === 0) {
    return {
      traveled: [],
      remaining: [],
      point: { lat: 0, lng: 0 },
      lat: 0,
      lng: 0,
      lookAheadPoint: { lat: 0, lng: 0, bearing: 0 },
      bearing: 0,
      anticipatedBearing: 0,
      segmentIndex: 0,
    };
  }
  if (n === 1) {
    const pt: LatLng = { lng: coords[0][0], lat: coords[0][1] };
    const singleTuple: LngLatTuple = [coords[0][0], coords[0][1]];
    return {
      traveled: includeSlices ? [singleTuple, singleTuple] : null,
      remaining: includeSlices ? [singleTuple, singleTuple] : null,
      point: pt,
      lat: pt.lat,
      lng: pt.lng,
      lookAheadPoint: { lat: pt.lat, lng: pt.lng, bearing: 0 },
      bearing: 0,
      anticipatedBearing: 0,
      segmentIndex: 0,
    };
  }

  const current = pointAtDistance(coords, cumDist, progressMeters);
  const aheadNear = pointAtDistance(coords, cumDist, progressMeters + 6);
  const aheadMid = pointAtDistance(coords, cumDist, progressMeters + 16);
  const aheadFar = pointAtDistance(coords, cumDist, progressMeters + 28);

  const lookAheadLat =
    current.lat * 0.25 +
    aheadNear.lat * 0.3 +
    aheadMid.lat * 0.3 +
    aheadFar.lat * 0.15;
  const lookAheadLng =
    current.lng * 0.25 +
    aheadNear.lng * 0.3 +
    aheadMid.lng * 0.3 +
    aheadFar.lng * 0.15;
  const anticipatedBearing = lerpAngle(aheadNear.bearing, aheadMid.bearing, 0.32);

  const idx = current.segmentIndex;
  let traveled: LngLatTuple[] | null = null;
  let remaining: LngLatTuple[] | null = null;

  if (includeSlices) {
    const splitCoord: LngLatTuple = [current.lng, current.lat];
    traveled = coords.slice(0, idx + 1).map((c): LngLatTuple => [c[0], c[1]]);
    traveled.push(splitCoord);
    remaining = [splitCoord];
    for (let i = idx + 1; i < n; i++) {
      remaining.push([coords[i][0], coords[i][1]]);
    }
  }

  return {
    traveled,
    remaining,
    point: { lat: current.lat, lng: current.lng },
    lat: current.lat,
    lng: current.lng,
    lookAheadPoint: {
      lat: lookAheadLat,
      lng: lookAheadLng,
      bearing: anticipatedBearing,
    },
    bearing: current.bearing,
    anticipatedBearing,
    segmentIndex: idx,
  };
}

export const slicePolylineFromProgress = interpolateAlongRoute;

/**
 * Computes turn friction, intersection delay penalties, and sharp-turn counts
 * using Valhalla Sif node-transition cost modeling.
 */
export function computeTurnMetrics(
  coords: readonly LngLatTuple[],
  steps: readonly ManeuverStepLike[] = []
): TurnMetrics {
  let turnCount = 0;
  let sharpTurnCount = 0;
  let turnPenaltySeconds = 0;

  for (const step of steps) {
    const mod = String(step.maneuverModifier ?? '').toLowerCase();
    const type = String(step.maneuverType ?? '').toLowerCase();
    if (type === 'depart' || type === 'arrive') continue;

    if (mod === 'uturn') {
      turnCount += 1;
      sharpTurnCount += 1;
      turnPenaltySeconds += 15;
    } else if (mod.includes('sharp')) {
      turnCount += 1;
      sharpTurnCount += 1;
      turnPenaltySeconds += 10.5;
    } else if (mod === 'left' || mod === 'right') {
      turnCount += 1;
      turnPenaltySeconds += 6.5;
    } else if (mod.includes('slight') || type === 'fork' || type === 'merge') {
      turnPenaltySeconds += 2.5;
    } else if (type.includes('roundabout') || type.includes('rotary')) {
      turnCount += 1;
      turnPenaltySeconds += 8;
    }
  }

  let geometryCornerCount = 0;
  if (coords.length >= 3) {
    let prevBrg = bearingDegrees(
      { lng: coords[0][0], lat: coords[0][1] },
      { lng: coords[1][0], lat: coords[1][1] }
    );
    for (let i = 1; i < coords.length - 1; i++) {
      const a: LatLng = { lng: coords[i][0], lat: coords[i][1] };
      const b: LatLng = { lng: coords[i + 1][0], lat: coords[i + 1][1] };
      if (haversineMeters(a, b) < 4) continue;
      const nextBrg = bearingDegrees(a, b);
      const delta = Math.abs(angularDifference(prevBrg, nextBrg));
      if (delta >= 68) {
        geometryCornerCount += 1;
      }
      prevBrg = nextBrg;
    }
  }

  if (turnCount === 0 && geometryCornerCount > 0) {
    turnCount = geometryCornerCount;
    turnPenaltySeconds = geometryCornerCount * 5.5;
  }

  return {
    turnCount,
    sharpTurnCount,
    geometryCornerCount,
    turnPenaltySeconds: Math.round(turnPenaltySeconds),
  };
}

/**
 * Computes path similarity [0..1] between two polylines to deduplicate
 * near-identical routes returned across routing engines.
 */
export function computeRouteOverlapRatio(
  coordsA: readonly LngLatTuple[],
  coordsB: readonly LngLatTuple[],
  thresholdMeters = 32
): number {
  if (coordsA.length === 0 || coordsB.length === 0) return 0;
  const stepA = Math.max(1, Math.floor(coordsA.length / 24));
  const stepB = Math.max(1, Math.floor(coordsB.length / 36));
  let matched = 0;
  let total = 0;

  for (let i = 0; i < coordsA.length; i += stepA) {
    total += 1;
    const ptA: LatLng = { lng: coordsA[i][0], lat: coordsA[i][1] };
    let minD = Infinity;
    for (let j = 0; j < coordsB.length; j += stepB) {
      const ptB: LatLng = { lng: coordsB[j][0], lat: coordsB[j][1] };
      const d = haversineMeters(ptA, ptB);
      if (d < minD) minD = d;
      if (minD <= thresholdMeters) break;
    }
    if (minD <= thresholdMeters) matched += 1;
  }

  return total > 0 ? matched / total : 0;
}

/**
 * Generates per-segment speed & congestion GeoJSON features for 3D corridor visualization.
 */
export function buildSpeedSegmentsGeoJson(
  coords: readonly LngLatTuple[],
  segmentSpeedsMps: readonly number[] = [],
  steps: readonly ManeuverStepLike[] = []
): SpeedFeatureCollection {
  if (coords.length < 2) {
    return { type: 'FeatureCollection', features: [] };
  }

  const cum = computeCumulativeDistances(coords);
  const turnLocations = steps
    .filter(
      (s): s is ManeuverStepLike & { startDistanceMeters: number } =>
        s.maneuverType !== 'depart' &&
        s.maneuverType !== 'arrive' &&
        typeof s.startDistanceMeters === 'number'
    )
    .map((s) => s.startDistanceMeters);

  const features: SpeedSegmentFeature[] = [];
  for (let i = 0; i < coords.length - 1; i++) {
    const midDist = (cum[i] + cum[i + 1]) * 0.5;
    let speedKmh = 32;

    const segMps = segmentSpeedsMps[i];
    if (typeof segMps === 'number' && Number.isFinite(segMps)) {
      speedKmh = segMps * 3.6;
    } else {
      let nearTurn = false;
      for (const td of turnLocations) {
        if (Math.abs(midDist - td) < 42) {
          nearTurn = true;
          break;
        }
      }
      speedKmh = nearTurn ? 14 : 34;
    }

    const congestionClass: CongestionClass =
      speedKmh < 18 ? 'slow' : speedKmh < 27 ? 'moderate' : 'fast';
    const prevFeature = features[features.length - 1];
    const nextCoord: LngLatTuple = [coords[i + 1][0], coords[i + 1][1]];

    if (prevFeature && prevFeature.properties.congestionClass === congestionClass) {
      prevFeature.geometry.coordinates.push(nextCoord);
    } else {
      features.push({
        type: 'Feature',
        properties: {
          speedKmh: Math.round(speedKmh),
          congestionClass,
        },
        geometry: {
          type: 'LineString',
          coordinates: [[coords[i][0], coords[i][1]], nextCoord],
        },
      });
    }
  }

  return {
    type: 'FeatureCollection',
    features,
  };
}

export function addGpsJitter(
  point: LatLng,
  sigmaMeters: number,
  rand: () => number = Math.random
): GpsJitterSample {
  if (!sigmaMeters || sigmaMeters <= 0) {
    return { lat: point.lat, lng: point.lng, errorMeters: 0 };
  }
  const u1 = Math.max(1e-6, rand());
  const u2 = rand();
  const mag = sigmaMeters * Math.sqrt(-2.0 * Math.log(u1)) * 0.55;
  const angle = 2 * Math.PI * u2;
  const dNorth = mag * Math.cos(angle);
  const dEast = mag * Math.sin(angle);
  const dLat = dNorth / METERS_PER_DEG_LAT;
  const dLng =
    dEast / (METERS_PER_DEG_LNG_EQUATOR * Math.max(0.05, Math.cos(point.lat * DEG_TO_RAD)));
  return {
    lat: point.lat + dLat,
    lng: point.lng + dLng,
    errorMeters: Math.hypot(dNorth, dEast),
  };
}

export function distancePointToPolylineMeters(
  point: LatLng,
  coords: readonly LngLatTuple[]
): PolylineDistanceResult {
  if (coords.length < 2) {
    return { distanceMeters: Infinity, segmentIndex: -1, point: null };
  }
  let bestDist = Infinity;
  let bestSeg = -1;
  let bestPt: LatLng | null = null;

  for (let i = 0; i < coords.length - 1; i++) {
    const a: LatLng = { lng: coords[i][0], lat: coords[i][1] };
    const b: LatLng = { lng: coords[i + 1][0], lat: coords[i + 1][1] };
    const proj = projectPointOnSegment(point, a, b);
    if (proj.distanceMeters < bestDist) {
      bestDist = proj.distanceMeters;
      bestSeg = i;
      bestPt = proj.point;
    }
  }

  return { distanceMeters: bestDist, segmentIndex: bestSeg, point: bestPt };
}
