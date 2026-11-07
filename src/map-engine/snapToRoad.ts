import {
  angularDifference,
  bearingDegrees,
  computeCumulativeDistances,
  haversineMeters,
  type LatLng,
  type LngLatTuple,
} from './geo';

const DEG_TO_RAD = Math.PI / 180;
const METERS_PER_DEG_LAT = 111132.92;
const METERS_PER_DEG_LNG_EQUATOR = 111412.84;

export interface ViterbiSnapperConfig {
  sigmaZ?: number;
  beta?: number;
  topK?: number;
}

export interface ViterbiRawObservation extends LatLng {
  bearing?: number;
}

export interface ViterbiMatchOptions {
  snapThresholdMeters?: number;
  offRouteThresholdMeters?: number;
  severeOffRouteMeters?: number;
  forceImmediateOffRoute?: boolean;
}

export interface ViterbiSnapResult {
  snappedPoint: LatLng;
  nearestStreetPoint: LatLng;
  rawPoint: LatLng;
  lateralDistanceMeters: number;
  segmentIndex: number;
  routeProgressMeters: number;
  remainingDistanceMeters: number;
  segmentBearing: number;
  isSnapped: boolean;
  isOffRoute: boolean;
  consecutiveOffRoute: number;
  confidence: number;
  confidencePercent: number;
  viterbiCandidatesEvaluated: number;
  scannedAll: boolean;
}

interface CandidateProjection {
  segmentIndex: number;
  snappedPoint: LatLng;
  lateralDistanceMeters: number;
  selectionScore: number;
  routeProgressMeters: number;
  segmentBearing: number;
}

interface TrellisNode extends CandidateProjection {
  logEmission: number;
  viterbiLogProb: number;
  parentIndex: number;
}

/**
 * Newson & Krumm (2009) Viterbi Dynamic Programming Hidden Markov Model (HMM)
 * Road Centerline Snapper for Cavite FTTH field telemetry.
 *
 * Precomputes segment tangent vectors, lengths, and bearings in Float64Arrays
 * on route load so per-tick projection runs in sub-0.05ms without trig calls.
 */
export class ViterbiRoadSnapper {
  private readonly sigmaZ: number;
  private readonly beta: number;
  private readonly topK: number;

  private coords: LngLatTuple[] = [];
  private cumDist: Float64Array = new Float64Array(0);
  private segVx: Float64Array = new Float64Array(0);
  private segVy: Float64Array = new Float64Array(0);
  private segLenSq: Float64Array = new Float64Array(0);
  private segLengths: Float64Array = new Float64Array(0);
  private segBearings: Float64Array = new Float64Array(0);
  private metersPerDegLng = METERS_PER_DEG_LNG_EQUATOR;
  private totalDistanceMeters = 0;

  private prevTrellis: TrellisNode[] = [];
  private prevRawPoint: LatLng | null = null;
  private lastProgressMeters = 0;
  private lastSegmentIndex = 0;
  private consecutiveOffRoute = 0;

  constructor(config: ViterbiSnapperConfig = {}) {
    this.sigmaZ = config.sigmaZ ?? 11.5;
    this.beta = config.beta ?? 24.0;
    this.topK = config.topK ?? 8;
  }

  setRoute(coords: readonly LngLatTuple[]): void {
    this.coords = coords.map((c): LngLatTuple => [c[0], c[1]]);
    const n = this.coords.length;
    this.cumDist = computeCumulativeDistances(this.coords);
    this.totalDistanceMeters = n > 0 ? (this.cumDist[n - 1] ?? 0) : 0;

    const nSeg = Math.max(0, n - 1);
    this.segVx = new Float64Array(nSeg);
    this.segVy = new Float64Array(nSeg);
    this.segLenSq = new Float64Array(nSeg);
    this.segLengths = new Float64Array(nSeg);
    this.segBearings = new Float64Array(nSeg);

    if (n >= 2) {
      const refLatRad = this.coords[0][1] * DEG_TO_RAD;
      this.metersPerDegLng =
        METERS_PER_DEG_LNG_EQUATOR * Math.max(0.05, Math.cos(refLatRad));
      for (let i = 0; i < nSeg; i++) {
        const aLng = this.coords[i][0];
        const aLat = this.coords[i][1];
        const bLng = this.coords[i + 1][0];
        const bLat = this.coords[i + 1][1];
        const vx = (bLng - aLng) * this.metersPerDegLng;
        const vy = (bLat - aLat) * METERS_PER_DEG_LAT;
        const lenSq = vx * vx + vy * vy;
        this.segVx[i] = vx;
        this.segVy[i] = vy;
        this.segLenSq[i] = lenSq;
        this.segLengths[i] = Math.sqrt(lenSq);
        this.segBearings[i] = bearingDegrees(
          { lng: aLng, lat: aLat },
          { lng: bLng, lat: bLat }
        );
      }
    }

    this.prevTrellis = [];
    this.prevRawPoint = null;
    this.lastProgressMeters = 0;
    this.lastSegmentIndex = 0;
    this.consecutiveOffRoute = 0;
  }

  private projectOntoSegmentFast(
    rawLat: number,
    rawLng: number,
    i: number,
    useLocalityBias: boolean
  ): CandidateProjection {
    const aLng = this.coords[i][0];
    const aLat = this.coords[i][1];
    const bLng = this.coords[i + 1][0];
    const bLat = this.coords[i + 1][1];

    const wx = (rawLng - aLng) * this.metersPerDegLng;
    const wy = (rawLat - aLat) * METERS_PER_DEG_LAT;
    const lenSq = this.segLenSq[i];

    let u = 0;
    let projLat = aLat;
    let projLng = aLng;
    let distanceMeters = 0;

    if (lenSq < 1e-9) {
      distanceMeters = Math.hypot(wx, wy);
    } else {
      const vx = this.segVx[i];
      const vy = this.segVy[i];
      u = Math.max(0, Math.min(1, (wx * vx + wy * vy) / lenSq));
      projLat = aLat + u * (bLat - aLat);
      projLng = aLng + u * (bLng - aLng);
      distanceMeters = Math.hypot(wx - u * vx, wy - u * vy);
    }

    const routeProgressMeters = this.cumDist[i] + u * this.segLengths[i];
    const progressGap = useLocalityBias
      ? Math.max(0, Math.abs(routeProgressMeters - this.lastProgressMeters) - 45)
      : 0;

    return {
      segmentIndex: i,
      snappedPoint: { lat: projLat, lng: projLng },
      lateralDistanceMeters: distanceMeters,
      selectionScore: distanceMeters + progressGap * 0.12,
      routeProgressMeters,
      segmentBearing: this.segBearings[i],
    };
  }

  match(
    rawPoint: ViterbiRawObservation,
    options: ViterbiMatchOptions = {}
  ): ViterbiSnapResult {
    const snapThresholdMeters = options.snapThresholdMeters ?? 36;
    const offRouteThresholdMeters = options.offRouteThresholdMeters ?? 38;
    const severeOffRouteMeters =
      options.severeOffRouteMeters ?? Math.max(45, offRouteThresholdMeters + 7);
    const forceImmediateOffRoute = Boolean(options.forceImmediateOffRoute);
    const nSeg = this.coords.length - 1;

    if (nSeg < 1) {
      return {
        snappedPoint: { lat: rawPoint.lat, lng: rawPoint.lng },
        nearestStreetPoint: { lat: rawPoint.lat, lng: rawPoint.lng },
        rawPoint: { lat: rawPoint.lat, lng: rawPoint.lng },
        lateralDistanceMeters: 0,
        segmentIndex: 0,
        routeProgressMeters: 0,
        remainingDistanceMeters: 0,
        segmentBearing: rawPoint.bearing ?? 0,
        isSnapped: false,
        isOffRoute: false,
        consecutiveOffRoute: 0,
        confidence: 1,
        confidencePercent: 99,
        viterbiCandidatesEvaluated: 0,
        scannedAll: false,
      };
    }

    const useLocalityBias = this.prevTrellis.length > 0 && !forceImmediateOffRoute;
    const rawCandidates: CandidateProjection[] = [];
    let minLateralDist = Infinity;
    let scannedAll = false;

    if (useLocalityBias && nSeg > 50) {
      const startIdx = Math.max(0, this.lastSegmentIndex - 12);
      const endIdx = Math.min(nSeg - 1, this.lastSegmentIndex + 38);
      for (let i = startIdx; i <= endIdx; i++) {
        const cand = this.projectOntoSegmentFast(rawPoint.lat, rawPoint.lng, i, true);
        if (cand.lateralDistanceMeters < minLateralDist) {
          minLateralDist = cand.lateralDistanceMeters;
        }
        rawCandidates.push(cand);
      }
    }

    if (rawCandidates.length === 0 || minLateralDist > 28) {
      rawCandidates.length = 0;
      minLateralDist = Infinity;
      scannedAll = true;
      for (let i = 0; i < nSeg; i++) {
        const cand = this.projectOntoSegmentFast(
          rawPoint.lat,
          rawPoint.lng,
          i,
          useLocalityBias
        );
        if (cand.lateralDistanceMeters < minLateralDist) {
          minLateralDist = cand.lateralDistanceMeters;
        }
        rawCandidates.push(cand);
      }
    }

    rawCandidates.sort((a, b) => a.selectionScore - b.selectionScore);
    const candidates = rawCandidates.slice(0, this.topK);

    const greatCircleStepMeters = this.prevRawPoint
      ? haversineMeters(this.prevRawPoint, rawPoint)
      : 0;

    const currentTrellis: TrellisNode[] = [];

    for (const cand of candidates) {
      const dNorm = cand.lateralDistanceMeters / this.sigmaZ;
      let logEmission = -0.5 * dNorm * dNorm;

      if (typeof rawPoint.bearing === 'number' && Number.isFinite(rawPoint.bearing)) {
        const diffRad =
          angularDifference(rawPoint.bearing, cand.segmentBearing) * DEG_TO_RAD;
        logEmission += 0.45 * Math.cos(diffRad);
      }

      let bestPathLogProb = logEmission;
      let bestParentIndex = -1;

      if (!forceImmediateOffRoute && this.prevTrellis.length > 0 && this.prevRawPoint) {
        bestPathLogProb = -Infinity;
        for (let m = 0; m < this.prevTrellis.length; m++) {
          const prev = this.prevTrellis[m];
          const routeDelta = cand.routeProgressMeters - prev.routeProgressMeters;
          const absRouteDist = Math.abs(routeDelta);

          const distDiscrepancy = Math.abs(greatCircleStepMeters - absRouteDist);
          let logTransition = -distDiscrepancy / this.beta;

          if (routeDelta < -8) {
            logTransition -= Math.abs(routeDelta) / 6.0;
          }

          const totalLogProb = prev.viterbiLogProb + logTransition + logEmission;
          if (totalLogProb > bestPathLogProb) {
            bestPathLogProb = totalLogProb;
            bestParentIndex = m;
          }
        }
      }

      currentTrellis.push({
        ...cand,
        logEmission,
        viterbiLogProb: bestPathLogProb,
        parentIndex: bestParentIndex,
      });
    }

    currentTrellis.sort((a, b) => b.viterbiLogProb - a.viterbiLogProb);
    const maxLogProb = currentTrellis[0]?.viterbiLogProb ?? 0;
    for (const node of currentTrellis) {
      node.viterbiLogProb -= maxLogProb;
    }

    const winner = currentTrellis[0] ?? candidates[0];
    const lateralDist = winner ? winner.lateralDistanceMeters : minLateralDist;
    const exceedsOffRoute = lateralDist > offRouteThresholdMeters;

    if (exceedsOffRoute) {
      this.consecutiveOffRoute += 1;
    } else {
      this.consecutiveOffRoute = 0;
    }

    const isOffRoute = forceImmediateOffRoute
      ? exceedsOffRoute
      : lateralDist > severeOffRouteMeters || this.consecutiveOffRoute >= 2;

    const isSnapped = lateralDist <= snapThresholdMeters && !isOffRoute;

    if (isSnapped && winner) {
      this.prevTrellis = currentTrellis;
      this.prevRawPoint = { lat: rawPoint.lat, lng: rawPoint.lng };
      this.lastProgressMeters = winner.routeProgressMeters;
      this.lastSegmentIndex = winner.segmentIndex;
    } else if (forceImmediateOffRoute || isOffRoute) {
      this.prevTrellis = [];
      this.prevRawPoint = { lat: rawPoint.lat, lng: rawPoint.lng };
    }

    const activeProgress = winner ? winner.routeProgressMeters : this.lastProgressMeters;
    const remainingDistanceMeters = Math.max(0, this.totalDistanceMeters - activeProgress);

    const emissionConfidence = Math.exp(
      -0.5 * Math.pow(lateralDist / (this.sigmaZ * 1.8), 2)
    );
    const confidence = Math.min(0.99, Math.max(0.05, emissionConfidence));
    const confidencePercent = Math.round(confidence * 100);

    return {
      snappedPoint:
        isSnapped && winner
          ? winner.snappedPoint
          : { lat: rawPoint.lat, lng: rawPoint.lng },
      nearestStreetPoint: winner
        ? winner.snappedPoint
        : { lat: rawPoint.lat, lng: rawPoint.lng },
      rawPoint: { lat: rawPoint.lat, lng: rawPoint.lng },
      lateralDistanceMeters: lateralDist,
      segmentIndex: winner ? winner.segmentIndex : this.lastSegmentIndex,
      routeProgressMeters: activeProgress,
      remainingDistanceMeters,
      segmentBearing: winner ? winner.segmentBearing : (rawPoint.bearing ?? 0),
      isSnapped,
      isOffRoute,
      consecutiveOffRoute: this.consecutiveOffRoute,
      confidence,
      confidencePercent,
      viterbiCandidatesEvaluated: candidates.length,
      scannedAll,
    };
  }
}

export { ViterbiRoadSnapper as SnapToRoadMatcher };
