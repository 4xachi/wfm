import {
  addGpsJitter,
  angularDifference,
  computeCumulativeDistances,
  distancePointToPolylineMeters,
  haversineMeters,
  interpolateAlongRoute,
  lerpAngle,
  type LatLng,
  type LngLatTuple,
  type LookAheadPoint,
  type RouteInterpolationResult,
} from './geo';
import { GpsKalmanFilter2D } from './kalman';
import type { MatchedRouteObstacle } from './obstacles';
import {
  PROFILES,
  calculateStreetRoute,
  type CalculateRouteOptions,
  type RouteStep,
  type StreetRouteResult,
  type VehicleProfileId,
} from './router';
import { ViterbiRoadSnapper, type ViterbiSnapResult } from './snapToRoad';

export const PLAYBACK_SPEEDS = [1, 2, 5, 10] as const;
export type PlaybackSpeedMultiplier = (typeof PLAYBACK_SPEEDS)[number];

export interface GimbalCameraPose {
  center: LngLatTuple;
  bearing: number;
  pitch: number;
  zoom: number;
}

export interface TelemetryObservation extends LatLng {
  accuracy?: number;
  bearing?: number;
  speedMps?: number | null;
  trueProgressMeters?: number;
  dtSeconds?: number;
  syncGeoJson?: boolean;
  newGpsPing?: boolean;
  forceImmediateOffRoute?: boolean;
  timestampMs?: number;
}

export interface NavigationFrame {
  rawPoint: LatLng;
  kalmanPoint: LatLng;
  snappedPoint: LatLng;
  nearestStreetPoint: LatLng;
  displayPoint: LatLng;
  lookAheadPoint: LookAheadPoint;
  camera: GimbalCameraPose;
  bearing: number;
  turnBankDeg: number;
  speedKmh: number;
  playbackSpeed: PlaybackSpeedMultiplier;
  lateralDistanceMeters: number;
  routeProgressMeters: number;
  remainingDistanceMeters: number;
  remainingDurationSeconds: number;
  remainingTurnPenaltySeconds: number;
  progressRatio: number;
  isSnapped: boolean;
  isOffRoute: boolean;
  consecutiveOffRoute: number;
  confidence: number;
  confidencePercent: number;
  viterbiCandidatesEvaluated: number;
  traveledCoords: LngLatTuple[] | null;
  remainingCoords: LngLatTuple[] | null;
  syncGeoJson: boolean;
  currentStep: RouteStep;
  nextStep: RouteStep | null;
  stepAnnouncement: string;
  nearbyObstacle: MatchedRouteObstacle | null;
  distanceToNextManeuverMeters: number;
  newGpsPing: boolean;
  arrived: boolean;
}

export type RerouteHandler = (
  currentPosition: LatLng,
  destination: LatLng,
  options: CalculateRouteOptions
) => Promise<StreetRouteResult>;

export interface NavigationControllerCallbacks {
  onFrame?: (frame: NavigationFrame) => void;
  onStepChange?: (
    currentStep: RouteStep,
    nextStep: RouteStep | null,
    announcement: string
  ) => void;
  onOffRoute?: (frame: NavigationFrame) => void;
  onReroute?: (newRoute: StreetRouteResult, triggerFrame: NavigationFrame) => void;
  onArrive?: (frame: NavigationFrame) => void;
  autoReroute?: boolean;
  offRouteThresholdMeters?: number;
  rerouteOptions?: CalculateRouteOptions;
  rerouteHandler?: RerouteHandler;
}

interface StepResolution {
  currentStep: RouteStep;
  nextStep: RouteStep | null;
  announcement: string;
  distanceToNextManeuverMeters: number;
  remainingTurnPenaltySeconds: number;
}

export interface NavigableRouteInput {
  profile?: VehicleProfileId;
  sourceEngine?: string;
  engineName?: string;
  distanceMeters: number;
  durationSeconds: number;
  coordinates: LngLatTuple[];
  matchedObstacles?: MatchedRouteObstacle[];
  steps: RouteStep[];
}

/**
 * Real-Time & Simulated (1x/2x/5x/10x) 3D Street Navigation Controller.
 * Combines 2D GPS Kalman smoothing, Newson-Krumm Viterbi HMM centerline snapping,
 * turn-step voice/HUD announcements, and >38m off-route detection with automatic rerouting.
 */
export class NavigationController {
  private readonly onFrame: ((frame: NavigationFrame) => void) | null;
  private readonly onStepChange:
    | ((currentStep: RouteStep, nextStep: RouteStep | null, announcement: string) => void)
    | null;
  private readonly onOffRoute: ((frame: NavigationFrame) => void) | null;
  private readonly onReroute:
    | ((newRoute: StreetRouteResult, triggerFrame: NavigationFrame) => void)
    | null;
  private readonly onArrive: ((frame: NavigationFrame) => void) | null;
  private readonly autoReroute: boolean;
  private readonly offRouteThresholdMeters: number;
  private readonly rerouteOptions: CalculateRouteOptions;
  private readonly rerouteHandler: RerouteHandler;

  private readonly kalman = new GpsKalmanFilter2D();
  private readonly snapper = new ViterbiRoadSnapper();

  private route: NavigableRouteInput | null = null;
  private cumDist: Float64Array = new Float64Array(0);
  private currentStepIndex = 0;
  private playbackSpeed: PlaybackSpeedMultiplier = 1;

  private simProgressMeters = 0;
  private visualProgressMeters = 0;
  private currentSpeedMps = 0;
  private currentBearing = 0;
  private cameraBearing = 0;
  private cameraCenter: LatLng | null = null;
  private cameraZoom = 18.75;

  private driftLat = 0;
  private driftLng = 0;
  private lastRawPoint: LatLng | null = null;
  private lastMatchResult: ViterbiSnapResult | null = null;
  private lastStepResolution: StepResolution | null = null;
  private lastNearbyObstacle: MatchedRouteObstacle | null = null;
  private lastFrame: NavigationFrame | null = null;

  private gpsSampleTimerSec = 0;
  private sensorSyncTimerSec = 0;
  private simClockMs = Date.now();
  private arrived = false;
  private pendingReroutePromise: Promise<StreetRouteResult | null> | null = null;

  constructor(callbacks: NavigationControllerCallbacks = {}) {
    this.onFrame = callbacks.onFrame ?? null;
    this.onStepChange = callbacks.onStepChange ?? null;
    this.onOffRoute = callbacks.onOffRoute ?? null;
    this.onReroute = callbacks.onReroute ?? null;
    this.onArrive = callbacks.onArrive ?? null;
    this.autoReroute = callbacks.autoReroute ?? true;
    this.offRouteThresholdMeters = callbacks.offRouteThresholdMeters ?? 38;
    this.rerouteOptions = callbacks.rerouteOptions ?? {};
    this.rerouteHandler =
      callbacks.rerouteHandler ??
      ((pos, dest, opts) => calculateStreetRoute(pos, dest, opts));
  }

  setPlaybackSpeed(speed: PlaybackSpeedMultiplier): void {
    if (PLAYBACK_SPEEDS.includes(speed)) {
      this.playbackSpeed = speed;
    }
  }

  getPlaybackSpeed(): PlaybackSpeedMultiplier {
    return this.playbackSpeed;
  }

  getCurrentStepIndex(): number {
    return this.currentStepIndex;
  }

  getLastFrame(): NavigationFrame | null {
    return this.lastFrame;
  }

  async waitForPendingReroute(): Promise<StreetRouteResult | null> {
    if (!this.pendingReroutePromise) return null;
    return this.pendingReroutePromise;
  }

  setRoute(routeResult: NavigableRouteInput): void {
    this.route = routeResult;
    const coords = routeResult.coordinates ?? [];
    this.cumDist = computeCumulativeDistances(coords);
    this.snapper.setRoute(coords);
    this.currentStepIndex = 0;
    this.simProgressMeters = 0;
    this.visualProgressMeters = 0;
    this.currentSpeedMps = 0;
    this.driftLat = 0;
    this.driftLng = 0;
    this.lastMatchResult = null;
    this.lastStepResolution = null;
    this.lastNearbyObstacle = null;
    this.lastFrame = null;
    this.gpsSampleTimerSec = 0;
    this.sensorSyncTimerSec = 1.0;
    this.simClockMs = Date.now();
    this.arrived = false;

    if (coords.length > 0) {
      const initialSlice = interpolateAlongRoute(coords, this.cumDist, 0, false);
      const startPt = initialSlice.point;
      const initialBearing =
        coords.length >= 2
          ? initialSlice.bearing
          : (routeResult.steps[0]?.bearingAfter ?? 0);

      this.currentBearing = initialBearing;
      this.cameraBearing = initialBearing;
      this.cameraCenter = {
        lat: initialSlice.lookAheadPoint.lat,
        lng: initialSlice.lookAheadPoint.lng,
      };
      this.cameraZoom = 18.75;
      this.lastRawPoint = { lat: startPt.lat, lng: startPt.lng };
      this.kalman.reset(startPt.lat, startPt.lng, initialBearing, this.simClockMs);
    }
  }

  private buildAnnouncement(
    step: RouteStep,
    nextStep: RouteStep | null,
    distToNextMeters: number
  ): string {
    if (step.maneuverType === 'arrive') {
      return step.verbalInstruction || step.instruction;
    }
    if (nextStep && nextStep !== step && distToNextMeters <= 120) {
      return `In ${Math.max(10, Math.round(distToNextMeters))} meters, ${nextStep.verbalInstruction || nextStep.instruction}`;
    }
    return step.verbalInstruction || step.instruction;
  }

  private resolveSteps(progressMeters: number): StepResolution {
    const steps = this.route?.steps ?? [];
    if (steps.length === 0) {
      const fallbackStep: RouteStep = {
        index: 0,
        legIndex: 0,
        instruction: 'Proceed along Cavite street route',
        verbalInstruction: 'Proceed along Cavite street route',
        streetName: 'Active corridor',
        maneuverType: 'continue',
        maneuverModifier: 'straight',
        bearingAfter: this.currentBearing,
        distanceMeters: 0,
        durationSeconds: 0,
        startDistanceMeters: 0,
        endDistanceMeters: 0,
        location: [0, 0],
      };
      return {
        currentStep: fallbackStep,
        nextStep: null,
        announcement: fallbackStep.instruction,
        distanceToNextManeuverMeters: 0,
        remainingTurnPenaltySeconds: 0,
      };
    }

    let activeIdx = 0;
    for (let i = 0; i < steps.length; i++) {
      if (progressMeters >= steps[i].startDistanceMeters) {
        activeIdx = i;
      } else {
        break;
      }
    }

    const currentStep = steps[activeIdx];
    const nextStep = steps[activeIdx + 1] ?? null;
    const distanceToNextManeuverMeters = nextStep
      ? Math.max(0, nextStep.startDistanceMeters - progressMeters)
      : 0;
    const announcement = this.buildAnnouncement(
      currentStep,
      nextStep,
      distanceToNextManeuverMeters
    );

    let remainingTurnPenaltySeconds = 0;
    for (let i = activeIdx + 1; i < steps.length; i++) {
      const mod = String(steps[i].maneuverModifier ?? '');
      if (mod === 'uturn') remainingTurnPenaltySeconds += 15;
      else if (mod.includes('sharp')) remainingTurnPenaltySeconds += 10;
      else if (mod.includes('left') || mod.includes('right')) {
        remainingTurnPenaltySeconds += 6;
      }
    }

    if (activeIdx !== this.currentStepIndex) {
      this.currentStepIndex = activeIdx;
      if (this.onStepChange) {
        this.onStepChange(currentStep, nextStep, announcement);
      }
    }

    const res: StepResolution = {
      currentStep,
      nextStep,
      announcement,
      distanceToNextManeuverMeters,
      remainingTurnPenaltySeconds,
    };
    this.lastStepResolution = res;
    return res;
  }

  private updateGimbalCamera(
    sliced: RouteInterpolationResult,
    speedKmh: number,
    dtSeconds = 0.016
  ): GimbalCameraPose {
    const dt = Math.max(0.004, Math.min(0.25, dtSeconds));
    const posAlpha = 1 - Math.exp(-dt * 7.5);
    const brgAlpha = 1 - Math.exp(-dt * 5.2);
    const zoomAlpha = 1 - Math.exp(-dt * 3.5);

    const targetCenter = sliced.lookAheadPoint;
    if (!this.cameraCenter) {
      this.cameraCenter = { lat: targetCenter.lat, lng: targetCenter.lng };
    } else {
      this.cameraCenter.lat += (targetCenter.lat - this.cameraCenter.lat) * posAlpha;
      this.cameraCenter.lng += (targetCenter.lng - this.cameraCenter.lng) * posAlpha;
    }

    const desiredBearing = sliced.anticipatedBearing;
    this.cameraBearing = lerpAngle(this.cameraBearing, desiredBearing, brgAlpha);

    const desiredZoom = speedKmh < 18 ? 18.95 : speedKmh > 34 ? 18.55 : 18.75;
    this.cameraZoom += (desiredZoom - this.cameraZoom) * zoomAlpha;

    return {
      center: [this.cameraCenter.lng, this.cameraCenter.lat],
      bearing: this.cameraBearing,
      pitch: 50,
      zoom: this.cameraZoom,
    };
  }

  private triggerAutomaticReroute(triggerFrame: NavigationFrame): void {
    if (!this.autoReroute || this.pendingReroutePromise || !this.route) return;
    const coords = this.route.coordinates;
    if (coords.length < 2) return;

    const lastCoord = coords[coords.length - 1];
    const destination: LatLng = { lat: lastCoord[1], lng: lastCoord[0] };
    const profile: VehicleProfileId = this.route.profile ?? 'motorbike';
    const preserveOffline =
      this.rerouteOptions.forceOfflineGraph ??
      this.route.sourceEngine === 'CaviteOfflineGraph';

    this.pendingReroutePromise = this.rerouteHandler(triggerFrame.rawPoint, destination, {
      profile,
      ...this.rerouteOptions,
      forceOfflineGraph: preserveOffline,
    })
      .then((newRoute) => {
        this.setRoute(newRoute);
        if (this.onReroute) {
          this.onReroute(newRoute, triggerFrame);
        }
        return newRoute;
      })
      .catch(() => null)
      .finally(() => {
        this.pendingReroutePromise = null;
      });
  }

  ingestTelemetry(obs: TelemetryObservation): NavigationFrame | null {
    if (!this.route || this.route.coordinates.length < 2) {
      return null;
    }

    this.simClockMs = Math.max(this.simClockMs + 50, obs.timestampMs ?? this.simClockMs + 50);
    const timestampMs = obs.timestampMs ?? this.simClockMs;
    const accuracyMeters = obs.accuracy ?? 10;
    const dtSeconds = obs.dtSeconds ?? 0.05;
    const syncGeoJson = obs.syncGeoJson ?? true;

    const severeOffRouteMeters = Math.max(45, this.offRouteThresholdMeters + 7);
    const rawExcursionMeters =
      accuracyMeters <= 25
        ? distancePointToPolylineMeters(
            { lat: obs.lat, lng: obs.lng },
            this.route.coordinates
          ).distanceMeters
        : 0;

    if (obs.forceImmediateOffRoute || rawExcursionMeters > severeOffRouteMeters) {
      this.kalman.reset(
        obs.lat,
        obs.lng,
        obs.bearing ?? this.currentBearing,
        timestampMs
      );
    }

    const filtered = this.kalman.process(
      obs.lat,
      obs.lng,
      accuracyMeters,
      timestampMs,
      obs.speedMps ?? null
    );

    const matchResult = this.snapper.match(
      {
        lat: filtered.lat,
        lng: filtered.lng,
        bearing: obs.bearing ?? filtered.bearing,
      },
      {
        snapThresholdMeters: 36,
        offRouteThresholdMeters: this.offRouteThresholdMeters,
        severeOffRouteMeters: Math.max(45, this.offRouteThresholdMeters + 7),
        forceImmediateOffRoute: Boolean(obs.forceImmediateOffRoute),
      }
    );
    this.lastMatchResult = matchResult;

    let activeProgressMeters = matchResult.routeProgressMeters;
    if (
      typeof obs.trueProgressMeters === 'number' &&
      Number.isFinite(obs.trueProgressMeters)
    ) {
      activeProgressMeters = obs.trueProgressMeters;
      this.simProgressMeters = obs.trueProgressMeters;
      this.visualProgressMeters = obs.trueProgressMeters;
    } else {
      const deltaProgress = matchResult.routeProgressMeters - this.visualProgressMeters;
      if (deltaProgress >= 0) {
        this.visualProgressMeters += deltaProgress * 0.65;
      } else if (deltaProgress < -14 || obs.forceImmediateOffRoute) {
        this.visualProgressMeters = matchResult.routeProgressMeters;
      }
      this.simProgressMeters = this.visualProgressMeters;
      activeProgressMeters = this.visualProgressMeters;
    }

    const sliced = interpolateAlongRoute(
      this.route.coordinates,
      this.cumDist,
      activeProgressMeters,
      syncGeoJson
    );

    const targetBearing = matchResult.isSnapped
      ? sliced.anticipatedBearing
      : filtered.bearing;
    const headingRate = 1 - Math.exp(-Math.max(0.01, dtSeconds) * 9.0);
    this.currentBearing = lerpAngle(this.currentBearing, targetBearing, headingRate);

    const {
      currentStep,
      nextStep,
      announcement,
      distanceToNextManeuverMeters,
      remainingTurnPenaltySeconds,
    } = this.resolveSteps(activeProgressMeters);

    const profileId: VehicleProfileId = this.route.profile ?? 'motorbike';
    const profile = PROFILES[profileId] ?? PROFILES.motorbike;
    const defaultSpeedMps = (profile.cruisingSpeedKmh * 1000) / 3600;
    const effectiveSpeedMps =
      obs.speedMps != null && obs.speedMps > 0.5
        ? obs.speedMps
        : filtered.speedMps > 1.2
          ? filtered.speedMps
          : defaultSpeedMps;
    const speedKmh = Math.round(effectiveSpeedMps * 3.6);

    const remainingDistanceMeters = Math.max(
      0,
      this.route.distanceMeters - activeProgressMeters
    );
    const remainingDurationSeconds = Math.max(
      0,
      Math.round(
        remainingDistanceMeters / effectiveSpeedMps + remainingTurnPenaltySeconds
      )
    );

    const displayPoint: LatLng = matchResult.isSnapped
      ? sliced.point
      : { lat: filtered.lat, lng: filtered.lng };

    const camera = this.updateGimbalCamera(sliced, speedKmh, dtSeconds);

    const matchedObs = this.route.matchedObstacles;
    let nearbyObstacle: MatchedRouteObstacle | null = null;
    if (matchedObs && matchedObs.length > 0) {
      for (const item of matchedObs) {
        if (haversineMeters(displayPoint, item) <= 85) {
          nearbyObstacle = item;
          break;
        }
      }
    }
    this.lastNearbyObstacle = nearbyObstacle;

    const frame: NavigationFrame = {
      rawPoint: { lat: obs.lat, lng: obs.lng },
      kalmanPoint: { lat: filtered.lat, lng: filtered.lng },
      snappedPoint: sliced.point,
      nearestStreetPoint: matchResult.nearestStreetPoint,
      displayPoint,
      lookAheadPoint: sliced.lookAheadPoint,
      camera,
      bearing: this.currentBearing,
      turnBankDeg: Math.max(
        -18,
        Math.min(
          18,
          angularDifference(sliced.bearing, sliced.anticipatedBearing) * 0.45
        )
      ),
      speedKmh,
      playbackSpeed: this.playbackSpeed,
      lateralDistanceMeters: matchResult.lateralDistanceMeters,
      routeProgressMeters: activeProgressMeters,
      remainingDistanceMeters,
      remainingDurationSeconds,
      remainingTurnPenaltySeconds,
      progressRatio:
        this.route.distanceMeters > 0
          ? Math.min(1, activeProgressMeters / this.route.distanceMeters)
          : 1,
      isSnapped: matchResult.isSnapped,
      isOffRoute: matchResult.isOffRoute,
      consecutiveOffRoute: matchResult.consecutiveOffRoute,
      confidence: matchResult.confidence,
      confidencePercent: matchResult.confidencePercent,
      viterbiCandidatesEvaluated: matchResult.viterbiCandidatesEvaluated,
      traveledCoords: sliced.traveled,
      remainingCoords: sliced.remaining,
      syncGeoJson,
      currentStep,
      nextStep,
      stepAnnouncement: announcement,
      nearbyObstacle,
      distanceToNextManeuverMeters,
      newGpsPing: Boolean(obs.newGpsPing),
      arrived: remainingDistanceMeters <= 8,
    };

    this.lastFrame = frame;

    if (frame.isOffRoute) {
      if (this.onOffRoute) {
        this.onOffRoute(frame);
      }
      this.triggerAutomaticReroute(frame);
    }

    if (frame.arrived && !this.arrived) {
      this.arrived = true;
      if (this.onArrive) {
        this.onArrive(frame);
      }
    }

    if (this.onFrame) {
      this.onFrame(frame);
    }

    return frame;
  }

  advanceSimulation(
    dtSeconds = 0.05,
    speedMultiplier?: number,
    jitterSigmaMeters = 0
  ): NavigationFrame | null {
    if (!this.route || this.route.coordinates.length < 2) {
      return null;
    }

    const activeMultiplier = speedMultiplier ?? this.playbackSpeed;
    if (
      speedMultiplier === 1 ||
      speedMultiplier === 2 ||
      speedMultiplier === 5 ||
      speedMultiplier === 10
    ) {
      this.playbackSpeed = speedMultiplier;
    }

    const dt = Math.max(0.004, Math.min(0.5, dtSeconds));
    const profileId: VehicleProfileId = this.route.profile ?? 'motorbike';
    const profile = PROFILES[profileId] ?? PROFILES.motorbike;
    const baseSpeedMps = (profile.cruisingSpeedKmh * 1000) / 3600;

    const stepInfo =
      this.lastStepResolution ?? this.resolveSteps(this.simProgressMeters);
    const nextStep = stepInfo.nextStep;
    const distToTurn = Math.max(
      0,
      (nextStep?.startDistanceMeters ?? 0) - this.simProgressMeters
    );

    let targetFactor = 1.0;
    const mod = String(nextStep?.maneuverModifier ?? '');
    if (
      nextStep &&
      nextStep.maneuverType !== 'arrive' &&
      (mod.includes('left') || mod.includes('right') || mod === 'uturn') &&
      distToTurn < 48
    ) {
      targetFactor = Math.max(0.45, distToTurn / 48);
    }

    const targetSpeedMps = baseSpeedMps * targetFactor;
    const accelAlpha = 1 - Math.exp(-dt * 4.5);
    this.currentSpeedMps =
      this.currentSpeedMps === 0
        ? targetSpeedMps * 0.65
        : this.currentSpeedMps + (targetSpeedMps - this.currentSpeedMps) * accelAlpha;

    const stepDistance = this.currentSpeedMps * activeMultiplier * dt;
    const nextProgress = Math.min(
      this.route.distanceMeters,
      this.simProgressMeters + stepDistance
    );
    this.simProgressMeters = nextProgress;
    this.visualProgressMeters = nextProgress;

    this.gpsSampleTimerSec += dt;
    this.sensorSyncTimerSec += dt;

    const shouldSyncSensors =
      !this.lastMatchResult ||
      this.sensorSyncTimerSec >= 0.095 ||
      dt >= 0.045 ||
      this.route.distanceMeters - nextProgress <= 8;

    if (!shouldSyncSensors && this.lastMatchResult) {
      const fastSlice = interpolateAlongRoute(
        this.route.coordinates,
        this.cumDist,
        nextProgress,
        false
      );
      const headingRate = 1 - Math.exp(-dt * 9.0);
      this.currentBearing = lerpAngle(
        this.currentBearing,
        fastSlice.anticipatedBearing,
        headingRate
      );
      const speedKmh = Math.round(this.currentSpeedMps * 3.6);
      const camera = this.updateGimbalCamera(fastSlice, speedKmh, dt);
      const remainingDistanceMeters = Math.max(
        0,
        this.route.distanceMeters - nextProgress
      );
      const prevMatch = this.lastMatchResult;

      const fastFrame: NavigationFrame = {
        rawPoint: this.lastRawPoint ?? fastSlice.point,
        kalmanPoint: fastSlice.point,
        snappedPoint: fastSlice.point,
        nearestStreetPoint: fastSlice.point,
        displayPoint: fastSlice.point,
        lookAheadPoint: fastSlice.lookAheadPoint,
        camera,
        bearing: this.currentBearing,
        turnBankDeg: 0,
        speedKmh,
        playbackSpeed: this.playbackSpeed,
        lateralDistanceMeters: prevMatch.lateralDistanceMeters,
        routeProgressMeters: nextProgress,
        remainingDistanceMeters,
        remainingDurationSeconds: Math.max(
          0,
          Math.round(
            remainingDistanceMeters / Math.max(1, this.currentSpeedMps) +
              stepInfo.remainingTurnPenaltySeconds
          )
        ),
        remainingTurnPenaltySeconds: stepInfo.remainingTurnPenaltySeconds,
        progressRatio:
          this.route.distanceMeters > 0
            ? Math.min(1, nextProgress / this.route.distanceMeters)
            : 1,
        isSnapped: prevMatch.isSnapped,
        isOffRoute: false,
        consecutiveOffRoute: 0,
        confidence: prevMatch.confidence,
        confidencePercent: prevMatch.confidencePercent,
        viterbiCandidatesEvaluated: prevMatch.viterbiCandidatesEvaluated,
        traveledCoords: null,
        remainingCoords: null,
        syncGeoJson: false,
        currentStep: stepInfo.currentStep,
        nextStep: stepInfo.nextStep,
        stepAnnouncement: stepInfo.announcement,
        nearbyObstacle: this.lastNearbyObstacle,
        distanceToNextManeuverMeters: distToTurn,
        newGpsPing: false,
        arrived: remainingDistanceMeters <= 8,
      };

      this.lastFrame = fastFrame;
      if (this.onFrame) {
        this.onFrame(fastFrame);
      }
      return fastFrame;
    }

    this.sensorSyncTimerSec = 0;
    const trueSlice = interpolateAlongRoute(
      this.route.coordinates,
      this.cumDist,
      nextProgress,
      false
    );

    let newGpsPing = false;
    if (!this.lastRawPoint || this.gpsSampleTimerSec >= 0.25 || dt >= 0.2) {
      this.gpsSampleTimerSec = 0;
      newGpsPing = true;
      const clampedSigma = Math.min(26, jitterSigmaMeters);
      const freshNoise = addGpsJitter({ lat: 0, lng: 0 }, clampedSigma);
      const decay = 0.68;
      this.driftLat = this.driftLat * decay + freshNoise.lat * (1 - decay);
      this.driftLng = this.driftLng * decay + freshNoise.lng * (1 - decay);
    }

    const noisyLat =
      trueSlice.point.lat + (jitterSigmaMeters > 0 ? this.driftLat : 0);
    const noisyLng =
      trueSlice.point.lng + (jitterSigmaMeters > 0 ? this.driftLng : 0);
    this.lastRawPoint = { lat: noisyLat, lng: noisyLng };
    this.simClockMs += Math.round(dt * 1000);

    return this.ingestTelemetry({
      lat: noisyLat,
      lng: noisyLng,
      accuracy: Math.max(28, jitterSigmaMeters || 6),
      bearing: trueSlice.bearing,
      speedMps: this.currentSpeedMps,
      trueProgressMeters: nextProgress,
      dtSeconds: dt,
      syncGeoJson: true,
      newGpsPing,
      timestampMs: this.simClockMs,
    });
  }
}
