import {
  CAVITE_BOUNDS,
  bearingDegrees,
  buildSpeedSegmentsGeoJson,
  clampToCaviteBounds,
  computeCumulativeDistances,
  computeRouteOverlapRatio,
  computeTurnMetrics,
  decodePolyline6,
  haversineMeters,
  isWithinCaviteBounds,
  type LatLng,
  type LngLatTuple,
  type NamedLocation,
  type SpeedFeatureCollection,
} from './geo';
import {
  CAVITE_OBSTACLES,
  computeAvoidanceWaypoint,
  evaluateRouteObstacles,
  type FetchLike,
  type MatchedRouteObstacle,
  type RoadObstacle,
} from './obstacles';
import {
  CAVITE_STREET_GRAPH,
  routeOnCaviteFallbackGraph,
} from './caviteFallbackGraph';

export { CAVITE_BOUNDS, isWithinCaviteBounds, clampToCaviteBounds };

export type VehicleProfileId = 'motorbike' | 'l300_van' | 'foot';
export type OptimizationModeId = 'fastest' | 'shortest' | 'smooth' | 'subdivision';
export type RouteSourceEngine = 'Valhalla' | 'OSRM' | 'CaviteOfflineGraph';

export interface VehicleProfileConfig {
  id: VehicleProfileId;
  label: string;
  shortLabel: string;
  cruisingSpeedKmh: number;
  valhallaCosting: 'motor_scooter' | 'auto' | 'pedestrian';
  valhallaAltCosting: 'motorcycle' | 'auto' | 'pedestrian';
  osrmEndpoints: readonly [string, string];
  engineTag: string;
}

export interface OptimizationModeConfig {
  id: OptimizationModeId;
  label: string;
}

export interface CaviteCorridorPreset {
  id: string;
  municipality: string;
  label: string;
  origin: Required<NamedLocation>;
  waypoint: Required<NamedLocation>;
  target: Required<NamedLocation>;
  zoom: number;
}

export interface CaviteGazetteerPlace extends LatLng {
  shortName: string;
  name: string;
  municipality?: string;
}

export interface RouteStep {
  index: number;
  legIndex: number;
  instruction: string;
  verbalInstruction: string;
  streetName: string;
  maneuverType: string;
  maneuverModifier: string;
  bearingAfter: number;
  distanceMeters: number;
  durationSeconds: number;
  startDistanceMeters: number;
  endDistanceMeters: number;
  location: LngLatTuple;
}

export interface RouteLegSummary {
  legIndex: number;
  distanceMeters: number;
  durationSeconds: number;
  summary: string;
}

export interface CandidateStreetRoute {
  profile: VehicleProfileId;
  sourceEngine: RouteSourceEngine;
  engineName: string;
  distanceMeters: number;
  rawDurationSeconds: number;
  linkDurationSeconds: number;
  durationSeconds: number;
  effectiveDurationSeconds: number;
  turnPenaltySeconds: number;
  turnCount: number;
  sharpTurnCount: number;
  obstacleCount: number;
  signalCount: number;
  roadworkCount: number;
  floodCount: number;
  bumpCount: number;
  blockCount: number;
  obstaclePenaltySeconds: number;
  matchedObstacles: MatchedRouteObstacle[];
  isBlocked: boolean;
  isDetour?: boolean;
  averageSpeedKmh: number;
  coordinates: LngLatTuple[];
  segmentSpeedsMps: number[];
  speedGeoJson: SpeedFeatureCollection;
  legSummaries: RouteLegSummary[];
  steps: RouteStep[];
}

export interface RankedStreetRoute extends CandidateStreetRoute {
  routeId: string;
  rank: number;
  badge: string;
  viaStreet: string;
  deltaSeconds: number;
  deltaLabel: string;
}

export interface StreetRouteResult extends RankedStreetRoute {
  optimizationMode: OptimizationModeId;
  allRoutes: RankedStreetRoute[];
  alternatives: RankedStreetRoute[];
}

export interface CalculateRouteOptions {
  profile?: VehicleProfileId;
  optimizationMode?: OptimizationModeId;
  waypoint?: LatLng;
  obstacles?: readonly RoadObstacle[];
  forceOfflineGraph?: boolean;
  timeoutMs?: number;
  fetchImpl?: FetchLike;
}

export interface TechnicianStreetEta {
  profile: VehicleProfileId;
  distanceMeters: number;
  etaSeconds: number;
  etaMinutes: number;
  averageSpeedKmh: number;
  viaStreet: string;
  turnCount: number;
  obstaclePenaltySeconds: number;
  sourceEngine: RouteSourceEngine;
  coordinates: LngLatTuple[];
}

export interface PlaceLookupOptions {
  offlineOnly?: boolean;
  fetchImpl?: FetchLike;
}

/**
 * FiberBlaze FTTH Field Operations Vehicle Profiles in Cavite.
 */
export const PROFILES: Record<VehicleProfileId, VehicleProfileConfig> = {
  motorbike: {
    id: 'motorbike',
    label: '2-Wheeler Troubleshooter',
    shortLabel: '2-Wheeler',
    cruisingSpeedKmh: 36,
    valhallaCosting: 'motor_scooter',
    valhallaAltCosting: 'motorcycle',
    osrmEndpoints: [
      'https://routing.openstreetmap.de/routed-bike/route/v1/driving',
      'https://router.project-osrm.org/route/v1/driving',
    ],
    engineTag: 'Valhalla Scooter + OSRM MLD Hybrid',
  },
  l300_van: {
    id: 'l300_van',
    label: 'L300 Fiber Splice & Install Van',
    shortLabel: 'L300 Van',
    cruisingSpeedKmh: 28,
    valhallaCosting: 'auto',
    valhallaAltCosting: 'auto',
    osrmEndpoints: [
      'https://routing.openstreetmap.de/routed-car/route/v1/driving',
      'https://router.project-osrm.org/route/v1/driving',
    ],
    engineTag: 'Valhalla Auto + OSRM Car Hybrid',
  },
  foot: {
    id: 'foot',
    label: 'Subdivision Foot Access',
    shortLabel: 'Foot Access',
    cruisingSpeedKmh: 6.0,
    valhallaCosting: 'pedestrian',
    valhallaAltCosting: 'pedestrian',
    osrmEndpoints: [
      'https://routing.openstreetmap.de/routed-foot/route/v1/driving',
      'https://router.project-osrm.org/route/v1/foot',
    ],
    engineTag: 'Valhalla Pedestrian + OSRM Foot Graph',
  },
};

export const OPTIMIZATION_MODES: Record<OptimizationModeId, OptimizationModeConfig> = {
  fastest: {
    id: 'fastest',
    label: 'Fastest ETA (Turn & Obstacle Aware)',
  },
  shortest: {
    id: 'shortest',
    label: 'Shortest Street Distance',
  },
  smooth: {
    id: 'smooth',
    label: 'Main Highway Flow (Aguinaldo / Gov. Drive)',
  },
  subdivision: {
    id: 'subdivision',
    label: 'Subdivision / Barangay Access Shortcut',
  },
};

/**
 * FiberBlaze FTTH Cavite Field Operations Corridors.
 */
export const CAVITE_CORRIDORS: Record<string, CaviteCorridorPreset> = {
  bacoor: {
    id: 'bacoor',
    municipality: 'Bacoor',
    label: 'SM Bacoor Hub → Molino III NAP',
    origin: {
      lat: 14.4449,
      lng: 120.9522,
      label: 'SM Bacoor Hub, Aguinaldo Hwy, Bacoor',
    },
    waypoint: {
      lat: 14.4162,
      lng: 120.9694,
      label: 'NOMO Distribution Node, Molino Blvd, Bacoor',
    },
    target: {
      lat: 14.4045,
      lng: 120.9735,
      label: 'Molino III NAP (NAP-BCR-042), Molino Rd, Bacoor',
    },
    zoom: 13.8,
  },
  imus: {
    id: 'imus',
    municipality: 'Imus',
    label: 'Imus NOC Hub → Tanzang Luma NAP',
    origin: {
      lat: 14.4294,
      lng: 120.9367,
      label: 'Imus NOC Hub, Poblacion, Imus',
    },
    waypoint: {
      lat: 14.4239,
      lng: 120.9419,
      label: 'Nueno Ave Primary Feeder, Imus',
    },
    target: {
      lat: 14.4148,
      lng: 120.941,
      label: 'Tanzang Luma NAP (NAP-IMS-118), Aguinaldo Hwy, Imus',
    },
    zoom: 14.3,
  },
  dasmarinas: {
    id: 'dasmarinas',
    municipality: 'Dasmariñas',
    label: 'Pala-Pala Hub → Salitran NAP',
    origin: {
      lat: 14.3007,
      lng: 120.9554,
      label: 'Pala-Pala Hub, Governor’s Drive, Dasmariñas',
    },
    waypoint: {
      lat: 14.3248,
      lng: 120.9598,
      label: 'DBB Congressional Splitter Cabinet, Dasmariñas',
    },
    target: {
      lat: 14.3484,
      lng: 120.939,
      label: 'Salitran NAP (NAP-DSM-205), Aguinaldo Hwy, Dasmariñas',
    },
    zoom: 13.6,
  },
  general_trias: {
    id: 'general_trias',
    municipality: 'General Trias',
    label: 'GenTri Hub → Trece Martires NAP',
    origin: {
      lat: 14.3315,
      lng: 120.9092,
      label: 'GenTri Hub, Arnaldo Hwy, General Trias',
    },
    waypoint: {
      lat: 14.2941,
      lng: 120.9142,
      label: 'Manggahan Crossing OLT Junction, General Trias',
    },
    target: {
      lat: 14.2817,
      lng: 120.8669,
      label: 'Trece Martires NAP (NAP-GTR-310), Governor’s Drive',
    },
    zoom: 13.2,
  },
  kawit_rosario: {
    id: 'kawit_rosario',
    municipality: 'Kawit / Rosario',
    label: 'Kawit Hub → Rosario EPZA NAP',
    origin: {
      lat: 14.4439,
      lng: 120.9041,
      label: 'Kawit Hub, Tirona Hwy, Kawit',
    },
    waypoint: {
      lat: 14.4281,
      lng: 120.8801,
      label: 'Noveleta Magdiwang Fiber Cabinet, Noveleta',
    },
    target: {
      lat: 14.4055,
      lng: 120.8588,
      label: 'Rosario EPZA NAP, Tejeros Convention, Rosario',
    },
    zoom: 13.7,
  },
  silang_tagaytay: {
    id: 'silang_tagaytay',
    municipality: 'Silang / Tagaytay',
    label: 'Silang Hub → Tagaytay Rotonda NAP',
    origin: {
      lat: 14.2238,
      lng: 120.9742,
      label: 'Silang Hub, Poblacion Aguinaldo Hwy, Silang',
    },
    waypoint: {
      lat: 14.1725,
      lng: 120.9245,
      label: 'Amadeo Crisanto Trunk Junction, Amadeo',
    },
    target: {
      lat: 14.1165,
      lng: 120.9604,
      label: 'Tagaytay Rotonda NAP, Olivarez Plaza, Tagaytay',
    },
    zoom: 12.4,
  },
};

export const CAVITE_GAZETTEER: readonly CaviteGazetteerPlace[] = [
  { shortName: 'SM Bacoor Hub, Aguinaldo Hwy, Bacoor', name: 'SM Bacoor Hub, Aguinaldo Highway, Habay, Bacoor, Cavite', municipality: 'Bacoor', lat: 14.4449, lng: 120.9522 },
  { shortName: 'NAP-BCR-042, Molino III, Bacoor', name: 'Molino III NAP (NAP-BCR-042), Molino Road, Bacoor, Cavite', municipality: 'Bacoor', lat: 14.4045, lng: 120.9735 },
  { shortName: 'NOMO Molino Blvd, Bacoor', name: 'NOMO Lifestyle Center, Molino Boulevard, Bacoor, Cavite', municipality: 'Bacoor', lat: 14.4162, lng: 120.9694 },
  { shortName: 'SM Center Molino, Molino IV, Bacoor', name: 'SM Center Molino, Daang Hari & Molino Road, Bacoor, Cavite', municipality: 'Bacoor', lat: 14.384, lng: 120.9776 },
  { shortName: 'Imus NOC Hub, Poblacion, Imus', name: 'FiberBlaze Imus NOC Hub, Poblacion Plaza, Imus, Cavite', municipality: 'Imus', lat: 14.4294, lng: 120.9367 },
  { shortName: 'NAP-IMS-118, Tanzang Luma, Imus', name: 'Tanzang Luma NAP (NAP-IMS-118), Aguinaldo Hwy, Imus, Cavite', municipality: 'Imus', lat: 14.4148, lng: 120.941 },
  { shortName: 'Anabu II-D / The District, Imus', name: 'The District Imus, Aguinaldo Hwy & Daang Hari, Imus, Cavite', municipality: 'Imus', lat: 14.3728, lng: 120.9394 },
  { shortName: 'Vermosa Daang Hari, Buhay na Tubig, Imus', name: 'Vermosa Estate, Daang Hari Road, Imus, Cavite', municipality: 'Imus', lat: 14.3652, lng: 120.9595 },
  { shortName: 'Pala-Pala Hub, Governor’s Dr, Dasmariñas', name: 'Pala-Pala Field Hub, Sampaloc 1, Dasmariñas, Cavite', municipality: 'Dasmariñas', lat: 14.3007, lng: 120.9554 },
  { shortName: 'NAP-DSM-205, Salitran, Dasmariñas', name: 'Salitran NAP (NAP-DSM-205), Aguinaldo Highway, Dasmariñas, Cavite', municipality: 'Dasmariñas', lat: 14.3484, lng: 120.939 },
  { shortName: 'DBB Congressional Ave, Dasmariñas', name: 'DBB Congressional Avenue & Mangubat Blvd, Dasmariñas, Cavite', municipality: 'Dasmariñas', lat: 14.3248, lng: 120.9598 },
  { shortName: 'Paliparan Site, Governor’s Dr, Dasmariñas', name: 'Paliparan III Junction, Molino-Paliparan Rd, Dasmariñas, Cavite', municipality: 'Dasmariñas', lat: 14.323, lng: 120.9845 },
  { shortName: 'GenTri Hub, Arnaldo Hwy, General Trias', name: 'General Trias Hub, San Francisco, Arnaldo Highway, Cavite', municipality: 'General Trias', lat: 14.3315, lng: 120.9092 },
  { shortName: 'Manggahan Crossing, General Trias', name: 'Manggahan Crossing, Governor’s Drive, General Trias, Cavite', municipality: 'General Trias', lat: 14.2941, lng: 120.9142 },
  { shortName: 'NAP-GTR-310, Trece Martires Capitol', name: 'Trece Martires NAP (NAP-GTR-310), Governor’s Drive, Trece Martires, Cavite', municipality: 'Trece Martires', lat: 14.2817, lng: 120.8669 },
  { shortName: 'Kawit Hub, Tirona Hwy, Kawit', name: 'Kawit Field Hub, Kaingen, Tirona Highway, Kawit, Cavite', municipality: 'Kawit', lat: 14.4439, lng: 120.9041 },
  { shortName: 'Evo City Centennial Rd, Kawit', name: 'Evo City Junction, Centennial Road, Kawit, Cavite', municipality: 'Kawit', lat: 14.4265, lng: 120.9062 },
  { shortName: 'Rosario EPZA NAP, Tejeros Convention', name: 'Rosario EPZA NAP, General Trias Drive, Rosario, Cavite', municipality: 'Rosario', lat: 14.4055, lng: 120.8588 },
  { shortName: 'Tanza Daang Amaya, Antero Soriano Hwy', name: 'Daang Amaya Node, Antero Soriano Highway, Tanza, Cavite', municipality: 'Tanza', lat: 14.3924, lng: 120.8512 },
  { shortName: 'Silang Hub, Poblacion, Silang', name: 'Silang Field Hub, Aguinaldo Highway, Silang, Cavite', municipality: 'Silang', lat: 14.2238, lng: 120.9742 },
  { shortName: 'Tagaytay Rotonda NAP, Olivarez Plaza', name: 'Tagaytay Rotonda NAP, Aguinaldo Highway, Tagaytay, Cavite', municipality: 'Tagaytay', lat: 14.1165, lng: 120.9604 },
  { shortName: 'Carmona Estates, Governor’s Drive', name: 'Carmona Municipal Node, Governor’s Drive, Carmona, Cavite', municipality: 'Carmona', lat: 14.3132, lng: 121.045 },
  { shortName: 'Indang CvSU Main, Bancod, Indang', name: 'Bancod Node, Trece-Indang Road, Indang, Cavite', municipality: 'Indang', lat: 14.1982, lng: 120.8815 },
  { shortName: 'Naic Town Proper, Governor’s Drive', name: 'Naic Municipal Node, Poblacion, Naic, Cavite', municipality: 'Naic', lat: 14.315, lng: 120.772 },
];

interface RawOsrmManeuver {
  type?: string;
  modifier?: string;
  exit?: number;
  bearing_after?: number;
  location?: [number, number];
}

interface RawOsrmStep {
  name?: string;
  ref?: string;
  distance?: number;
  duration?: number;
  maneuver?: RawOsrmManeuver;
}

interface RawOsrmLeg {
  distance?: number;
  duration?: number;
  summary?: string;
  annotation?: {
    speed?: number[];
  };
  steps?: RawOsrmStep[];
}

interface RawOsrmRoute {
  distance?: number;
  duration?: number;
  geometry?: {
    coordinates?: [number, number][];
  };
  legs?: RawOsrmLeg[];
}

interface RawOsrmResponse {
  code?: string;
  routes?: RawOsrmRoute[];
}

interface RawValhallaManeuver {
  type?: number;
  instruction?: string;
  verbal_pre_transition_instruction?: string;
  street_names?: string[];
  length?: number;
  time?: number;
  begin_shape_index?: number;
  end_shape_index?: number;
  bearing_after?: number;
  begin_heading?: number;
}

interface RawValhallaLeg {
  shape?: string;
  summary?: {
    length?: number;
    time?: number;
  };
  maneuvers?: RawValhallaManeuver[];
}

export interface RawValhallaTrip {
  summary?: {
    length?: number;
    time?: number;
  };
  legs?: RawValhallaLeg[];
}

interface RawValhallaResponse {
  trip?: RawValhallaTrip;
  alternates?: Array<{ trip?: RawValhallaTrip }>;
}

interface PhotonFeature {
  properties?: {
    name?: string;
    street?: string;
    district?: string;
    city?: string;
  };
  geometry?: {
    coordinates?: [number, number];
  };
}

interface PhotonResponse {
  features?: PhotonFeature[];
}

interface NominatimSearchItem {
  display_name?: string;
  name?: string;
  lat?: string;
  lon?: string;
}

interface NominatimReverseResponse {
  name?: string;
  display_name?: string;
  address?: {
    road?: string;
    pedestrian?: string;
    footway?: string;
    residential?: string;
    suburb?: string;
    neighbourhood?: string;
    village?: string;
    city?: string;
    town?: string;
  };
}

export function formatManeuverInstruction(step: RawOsrmStep): string {
  const type = step.maneuver?.type ?? 'continue';
  const mod = step.maneuver?.modifier ?? 'straight';
  const rawName = (step.name ?? step.ref ?? '').trim();
  const street = rawName || 'local street';

  if (type === 'depart') {
    return `Head ${mod === 'straight' ? 'forward' : mod} on ${street}`;
  }
  if (type === 'arrive') return `Arrive at FTTH job site on ${street}`;
  if (type === 'roundabout' || type === 'rotary') {
    const exit = step.maneuver?.exit ? ` (exit ${step.maneuver.exit})` : '';
    return `Enter roundabout${exit} onto ${street}`;
  }
  if (type === 'merge') return `Merge ${mod} onto ${street}`;
  if (type === 'on ramp' || type === 'off ramp') {
    return `Take ramp ${mod} toward ${street}`;
  }
  if (type === 'fork') return `Keep ${mod} at fork onto ${street}`;
  if (type === 'end of road') return `At end of road, turn ${mod} onto ${street}`;
  if (type === 'new name') return `Continue onto ${street}`;
  if (mod === 'uturn') return `Make a U-turn onto ${street}`;
  if (mod.includes('left') || mod.includes('right')) {
    return `Turn ${mod.replace('-', ' ')} onto ${street}`;
  }
  return `Continue on ${street}`;
}

function mapValhallaManeuverType(vType = 8): { type: string; modifier: string } {
  if (vType === 1 || vType === 2 || vType === 3) {
    return { type: 'depart', modifier: 'straight' };
  }
  if (vType === 4 || vType === 5 || vType === 6) {
    return { type: 'arrive', modifier: 'straight' };
  }
  if (vType === 9 || vType === 23) return { type: 'turn', modifier: 'slight-right' };
  if (vType === 10) return { type: 'turn', modifier: 'right' };
  if (vType === 11) return { type: 'turn', modifier: 'sharp-right' };
  if (vType === 12 || vType === 13) return { type: 'turn', modifier: 'uturn' };
  if (vType === 14) return { type: 'turn', modifier: 'sharp-left' };
  if (vType === 15) return { type: 'turn', modifier: 'left' };
  if (vType === 16 || vType === 24) return { type: 'turn', modifier: 'slight-left' };
  if (vType === 26 || vType === 27) return { type: 'roundabout', modifier: 'right' };
  return { type: 'continue', modifier: 'straight' };
}

interface UnenrichedRoute {
  profile: VehicleProfileId;
  sourceEngine: RouteSourceEngine;
  engineName: string;
  distanceMeters: number;
  rawDurationSeconds: number;
  coordinates: LngLatTuple[];
  segmentSpeedsMps: number[];
  legSummaries: RouteLegSummary[];
  steps: RouteStep[];
  isDetour?: boolean;
}

function enrichRouteWithMetrics(
  route: UnenrichedRoute,
  profileId: VehicleProfileId = 'motorbike',
  obstacles: readonly RoadObstacle[] = CAVITE_OBSTACLES
): CandidateStreetRoute {
  const profile = PROFILES[profileId] ?? PROFILES.motorbike;
  const clampedCoords: LngLatTuple[] = route.coordinates.map(([lng, lat]) => {
    const c = clampToCaviteBounds(lat, lng);
    return [c.lng, c.lat];
  });

  const turnStats = computeTurnMetrics(clampedCoords, route.steps);
  const obsStats = evaluateRouteObstacles(clampedCoords, obstacles);

  const profileSpeedMps = (profile.cruisingSpeedKmh * 1000) / 3600;
  const kinematicLinkSeconds =
    route.distanceMeters > 0 ? route.distanceMeters / profileSpeedMps : 0;
  const rawEngineSeconds = route.rawDurationSeconds || kinematicLinkSeconds;

  const linkDurationSeconds =
    route.distanceMeters > 0
      ? Math.max(8, Math.round(kinematicLinkSeconds * 0.72 + rawEngineSeconds * 0.28))
      : 0;

  const effectiveDurationSeconds =
    route.distanceMeters > 0
      ? Math.max(
          10,
          Math.round(
            linkDurationSeconds +
              turnStats.turnPenaltySeconds +
              obsStats.obstaclePenaltySeconds
          )
        )
      : 0;

  const averageSpeedKmh =
    effectiveDurationSeconds > 0
      ? Math.round((route.distanceMeters / effectiveDurationSeconds) * 3.6)
      : profile.cruisingSpeedKmh;

  const speedGeoJson = buildSpeedSegmentsGeoJson(
    clampedCoords,
    route.segmentSpeedsMps,
    route.steps
  );

  return {
    ...route,
    coordinates: clampedCoords,
    linkDurationSeconds: Math.round(linkDurationSeconds),
    turnPenaltySeconds: turnStats.turnPenaltySeconds,
    turnCount: turnStats.turnCount,
    sharpTurnCount: turnStats.sharpTurnCount,
    obstacleCount: obsStats.obstacleCount,
    signalCount: obsStats.signalCount,
    roadworkCount: obsStats.roadworkCount,
    floodCount: obsStats.floodCount,
    bumpCount: obsStats.bumpCount,
    blockCount: obsStats.blockCount,
    obstaclePenaltySeconds: obsStats.obstaclePenaltySeconds,
    matchedObstacles: obsStats.matchedObstacles,
    isBlocked: obsStats.isBlocked,
    durationSeconds: effectiveDurationSeconds,
    effectiveDurationSeconds,
    averageSpeedKmh,
    speedGeoJson,
  };
}

export function normalizeOsrmRoute(
  osrmRoute: RawOsrmRoute,
  profileId: VehicleProfileId = 'motorbike',
  engineName = 'OSRM Street Graph',
  obstacles: readonly RoadObstacle[] = CAVITE_OBSTACLES
): CandidateStreetRoute {
  const coords: LngLatTuple[] = (osrmRoute.geometry?.coordinates ?? []).map((c) => [
    c[0],
    c[1],
  ]);
  const cumDist = computeCumulativeDistances(coords);
  const totalDistanceMeters =
    osrmRoute.distance ?? (cumDist[cumDist.length - 1] ?? 0);
  const rawDurationSeconds = osrmRoute.duration ?? 0;

  const steps: RouteStep[] = [];
  const segmentSpeedsMps: number[] = [];
  const legSummaries: RouteLegSummary[] = [];
  let runningDist = 0;
  let stepIdx = 0;

  const legs = osrmRoute.legs ?? [];
  for (let legIdx = 0; legIdx < legs.length; legIdx++) {
    const leg = legs[legIdx];
    legSummaries.push({
      legIndex: legIdx,
      distanceMeters: leg.distance ?? 0,
      durationSeconds: leg.duration ?? 0,
      summary: leg.summary || `Leg ${legIdx + 1}`,
    });

    if (Array.isArray(leg.annotation?.speed)) {
      segmentSpeedsMps.push(...leg.annotation.speed);
    }

    for (const rawStep of leg.steps ?? []) {
      const stepDist = rawStep.distance ?? 0;
      const stepDur = rawStep.duration ?? 0;
      const rawLoc = rawStep.maneuver?.location ?? coords[0] ?? [0, 0];
      const loc: LngLatTuple = [rawLoc[0], rawLoc[1]];
      const instruction = formatManeuverInstruction(rawStep);
      steps.push({
        index: stepIdx++,
        legIndex: legIdx,
        instruction,
        verbalInstruction: instruction,
        streetName: (rawStep.name ?? rawStep.ref ?? 'Local street').trim() || 'Local street',
        maneuverType: rawStep.maneuver?.type ?? 'continue',
        maneuverModifier: rawStep.maneuver?.modifier ?? 'straight',
        bearingAfter: rawStep.maneuver?.bearing_after ?? 0,
        distanceMeters: stepDist,
        durationSeconds: stepDur,
        startDistanceMeters: runningDist,
        endDistanceMeters: runningDist + stepDist,
        location: loc,
      });
      runningDist += stepDist;
    }
  }

  return enrichRouteWithMetrics(
    {
      profile: profileId,
      sourceEngine: 'OSRM',
      engineName,
      distanceMeters: totalDistanceMeters,
      rawDurationSeconds,
      coordinates: coords,
      segmentSpeedsMps,
      legSummaries,
      steps,
    },
    profileId,
    obstacles
  );
}

export function normalizeValhallaTrip(
  trip: RawValhallaTrip,
  profileId: VehicleProfileId = 'motorbike',
  engineName = 'Valhalla Dynamic Costing',
  obstacles: readonly RoadObstacle[] = CAVITE_OBSTACLES
): CandidateStreetRoute {
  const allCoords: LngLatTuple[] = [];
  const rawManeuvers: Array<{
    m: RawValhallaManeuver;
    legIdx: number;
    offset: number;
  }> = [];
  const legSummaries: RouteLegSummary[] = [];

  const legs = trip.legs ?? [];
  for (let legIdx = 0; legIdx < legs.length; legIdx++) {
    const leg = legs[legIdx];
    const legCoords = decodePolyline6(leg.shape ?? '', 1e-6);
    const offset = allCoords.length > 0 ? allCoords.length - 1 : 0;
    if (allCoords.length > 0 && legCoords.length > 0) {
      allCoords.push(...legCoords.slice(1));
    } else {
      allCoords.push(...legCoords);
    }

    const legDistMeters = (leg.summary?.length ?? 0) * 1000;
    const legDurSeconds = leg.summary?.time ?? 0;
    legSummaries.push({
      legIndex: legIdx,
      distanceMeters: legDistMeters,
      durationSeconds: legDurSeconds,
      summary: leg.summary ? `Valhalla Leg ${legIdx + 1}` : `Leg ${legIdx + 1}`,
    });

    for (const m of leg.maneuvers ?? []) {
      rawManeuvers.push({ m, legIdx, offset });
    }
  }

  const cumDist = computeCumulativeDistances(allCoords);
  const steps: RouteStep[] = [];
  let runningDist = 0;

  for (let idx = 0; idx < rawManeuvers.length; idx++) {
    const { m, legIdx, offset } = rawManeuvers[idx];
    const stepDist = (m.length ?? 0) * 1000;
    const stepDur = m.time ?? 0;
    const shapeIdx = Math.min(
      Math.max(0, allCoords.length - 1),
      Math.max(0, (m.begin_shape_index ?? 0) + offset)
    );
    const nextShapeIdx = Math.min(Math.max(0, allCoords.length - 1), shapeIdx + 1);
    const loc: LngLatTuple = allCoords[shapeIdx] ?? allCoords[0] ?? [0, 0];
    const nextLoc: LngLatTuple = allCoords[nextShapeIdx] ?? loc;

    const geomBearing =
      shapeIdx < nextShapeIdx
        ? bearingDegrees(
            { lng: loc[0], lat: loc[1] },
            { lng: nextLoc[0], lat: nextLoc[1] }
          )
        : 0;
    const bearingAfter = m.bearing_after ?? m.begin_heading ?? geomBearing;

    const startDist = cumDist.length > shapeIdx ? cumDist[shapeIdx] : runningDist;
    const endShapeIdx =
      m.end_shape_index !== undefined
        ? Math.min(Math.max(0, allCoords.length - 1), m.end_shape_index + offset)
        : -1;
    const endDist =
      endShapeIdx >= shapeIdx && cumDist.length > endShapeIdx
        ? cumDist[endShapeIdx]
        : startDist + stepDist;

    const mapped = mapValhallaManeuverType(m.type);
    const streetName =
      Array.isArray(m.street_names) && m.street_names.length > 0
        ? m.street_names.join(' / ')
        : 'Local street';
    const cleanInstruction =
      String(m.instruction ?? '').replace(/\.$/, '') || `Continue on ${streetName}`;

    steps.push({
      index: idx,
      legIndex: legIdx,
      instruction: cleanInstruction,
      verbalInstruction: m.verbal_pre_transition_instruction ?? cleanInstruction,
      streetName,
      maneuverType: mapped.type,
      maneuverModifier: mapped.modifier,
      bearingAfter,
      distanceMeters: Math.max(0, endDist - startDist) || stepDist,
      durationSeconds: stepDur,
      startDistanceMeters: startDist,
      endDistanceMeters: Math.max(startDist, endDist),
      location: [loc[0], loc[1]],
    });
    runningDist = Math.max(runningDist + stepDist, endDist);
  }

  const geomTotal = cumDist.length > 0 ? (cumDist[cumDist.length - 1] ?? 0) : 0;
  const totalDistanceMeters =
    geomTotal || (trip.summary?.length ?? 0) * 1000 || runningDist;
  const rawDurationSeconds = trip.summary?.time ?? 0;

  return enrichRouteWithMetrics(
    {
      profile: profileId,
      sourceEngine: 'Valhalla',
      engineName,
      distanceMeters: totalDistanceMeters,
      rawDurationSeconds,
      coordinates: allCoords,
      segmentSpeedsMps: [],
      legSummaries,
      steps,
    },
    profileId,
    obstacles
  );
}

export function rankAndDeduplicateRoutes(
  candidates: readonly CandidateStreetRoute[],
  optimizationMode: OptimizationModeId = 'fastest'
): RankedStreetRoute[] {
  const unique: CandidateStreetRoute[] = [];

  for (const cand of candidates) {
    if (cand.coordinates.length < 2) continue;
    let duplicateIndex = -1;
    for (let i = 0; i < unique.length; i++) {
      const overlap = computeRouteOverlapRatio(
        cand.coordinates,
        unique[i].coordinates,
        32
      );
      if (overlap >= 0.85) {
        duplicateIndex = i;
        break;
      }
    }
    if (duplicateIndex === -1) {
      unique.push(cand);
    } else if (
      cand.sourceEngine === 'Valhalla' &&
      unique[duplicateIndex].sourceEngine !== 'Valhalla'
    ) {
      const merged: CandidateStreetRoute = { ...cand };
      if (
        unique[duplicateIndex].segmentSpeedsMps.length > 0 &&
        merged.segmentSpeedsMps.length === 0
      ) {
        merged.segmentSpeedsMps = unique[duplicateIndex].segmentSpeedsMps;
        merged.speedGeoJson = unique[duplicateIndex].speedGeoJson;
      }
      unique[duplicateIndex] = merged;
    }
  }

  if (unique.length === 0) return [];

  const scoreForMode = (r: CandidateStreetRoute): number => {
    const blockPenalty = r.isBlocked ? 100_000 : 0;
    if (optimizationMode === 'shortest') {
      return blockPenalty + r.distanceMeters;
    }
    if (optimizationMode === 'smooth') {
      return (
        blockPenalty +
        r.effectiveDurationSeconds +
        r.turnCount * 24 +
        r.sharpTurnCount * 18
      );
    }
    if (optimizationMode === 'subdivision') {
      return blockPenalty + r.distanceMeters * 0.42 + r.effectiveDurationSeconds * 1.8;
    }
    return blockPenalty + r.effectiveDurationSeconds;
  };

  unique.sort((a, b) => scoreForMode(a) - scoreForMode(b));

  const fastestEta = Math.min(...unique.map((r) => r.effectiveDurationSeconds));
  const shortestDist = Math.min(...unique.map((r) => r.distanceMeters));
  const fewestTurns = Math.min(...unique.map((r) => r.turnCount));

  return unique.map((route, idx) => {
    const deltaSeconds = route.effectiveDurationSeconds - fastestEta;
    let badge = `Route ${idx + 1}`;
    if (route.isBlocked) {
      badge = 'Road Blocked';
    } else if (route.isDetour) {
      badge = 'Obstacle Detour';
    } else if (route.effectiveDurationSeconds === fastestEta) {
      badge = 'Fastest ETA';
    } else if (route.distanceMeters === shortestDist) {
      badge = 'Shortest Path';
    } else if (route.turnCount === fewestTurns) {
      badge = 'Fewest Turns';
    } else if (route.sourceEngine === 'Valhalla') {
      badge = 'Barangay Access';
    }

    const viaStreet =
      route.steps
        .filter(
          (s) =>
            Boolean(s.streetName) &&
            s.streetName !== 'Local street' &&
            s.maneuverType !== 'depart'
        )
        .sort((a, b) => b.distanceMeters - a.distanceMeters)[0]?.streetName ??
      'Cavite Corridor';

    return {
      ...route,
      routeId: `route-${idx}`,
      rank: idx + 1,
      badge,
      viaStreet,
      deltaSeconds,
      deltaLabel:
        deltaSeconds <= 0 ? 'Fastest' : `+${Math.ceil(deltaSeconds / 60)} min`,
    };
  });
}

async function fetchValhallaCandidates(
  waypoints: readonly LatLng[],
  profile: VehicleProfileConfig,
  optimizationMode: OptimizationModeId,
  fetchFn: FetchLike,
  obstacles: readonly RoadObstacle[],
  timeoutMs: number
): Promise<CandidateStreetRoute[]> {
  const costing = profile.valhallaCosting;
  const costingOptions: Record<string, Record<string, number>> = {};

  if (costing === 'motor_scooter') {
    costingOptions.motor_scooter = {
      top_speed: 60,
      use_primary: optimizationMode === 'subdivision' ? 0.35 : 0.75,
      use_hills: 0.5,
      use_living_streets: optimizationMode === 'subdivision' ? 0.9 : 0.6,
      maneuver_penalty: optimizationMode === 'smooth' ? 18 : 6,
    };
  } else if (costing === 'auto') {
    costingOptions.auto = {
      maneuver_penalty: optimizationMode === 'smooth' ? 20 : 8,
    };
  }

  const body = {
    locations: waypoints.map((pt) => ({ lat: pt.lat, lon: pt.lng })),
    costing,
    costing_options: costingOptions,
    alternates: 2,
    units: 'kilometers',
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchFn('https://valhalla1.openstreetmap.de/route', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return [];
    const data = (await res.json()) as RawValhallaResponse;
    const out: CandidateStreetRoute[] = [];
    if (data.trip) {
      out.push(
        normalizeValhallaTrip(data.trip, profile.id, `Valhalla ${costing}`, obstacles)
      );
    }
    for (const alt of data.alternates ?? []) {
      if (alt.trip) {
        out.push(
          normalizeValhallaTrip(
            alt.trip,
            profile.id,
            `Valhalla ${costing} Alt`,
            obstacles
          )
        );
      }
    }
    return out;
  } catch {
    clearTimeout(timer);
    return [];
  }
}

async function fetchOsrmCandidates(
  waypoints: readonly LatLng[],
  profile: VehicleProfileConfig,
  fetchFn: FetchLike,
  obstacles: readonly RoadObstacle[],
  timeoutMs: number
): Promise<CandidateStreetRoute[]> {
  const coordPairString = waypoints
    .map((pt) => `${pt.lng.toFixed(6)},${pt.lat.toFixed(6)}`)
    .join(';');

  const queryEndpoint = async (baseUrl: string): Promise<CandidateStreetRoute[]> => {
    const url = `${baseUrl}/${coordPairString}?overview=full&geometries=geojson&steps=true&annotations=speed,duration,distance&alternatives=true`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchFn(url, { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error('OSRM response not ok');
      const data = (await res.json()) as RawOsrmResponse;
      if (data.code === 'Ok' && Array.isArray(data.routes) && data.routes.length > 0) {
        return data.routes.map((r, idx) =>
          normalizeOsrmRoute(
            r,
            profile.id,
            idx === 0 ? 'FOSSGIS OSRM MLD' : `FOSSGIS OSRM Alt ${idx}`,
            obstacles
          )
        );
      }
      throw new Error('Empty OSRM routes');
    } catch (err) {
      clearTimeout(timer);
      throw err;
    }
  };

  try {
    return await Promise.any(profile.osrmEndpoints.map((u) => queryEndpoint(u)));
  } catch {
    return [];
  }
}

function buildOfflineCandidates(
  origin: LatLng,
  target: LatLng,
  profileId: VehicleProfileId,
  optimizationMode: OptimizationModeId,
  obstacles: readonly RoadObstacle[],
  waypoint?: LatLng
): CandidateStreetRoute[] {
  const primaryOffline = routeOnCaviteFallbackGraph(origin, target, {
    profile: profileId,
    optimizationMode,
    waypoint,
    obstacles,
  });
  const candidates: CandidateStreetRoute[] = [
    enrichRouteWithMetrics(
      {
        ...primaryOffline,
        profile: profileId,
      },
      profileId,
      obstacles
    ),
  ];

  // Also compute a secondary mode candidate (smooth vs shortest) for alternate path visibility
  const altMode: OptimizationModeId =
    optimizationMode === 'shortest' ? 'smooth' : 'shortest';
  const altOffline = routeOnCaviteFallbackGraph(origin, target, {
    profile: profileId,
    optimizationMode: altMode,
    waypoint,
    obstacles,
  });
  candidates.push(
    enrichRouteWithMetrics(
      {
        ...altOffline,
        profile: profileId,
        engineName: 'Cavite Built-In Street Graph (Alternate)',
      },
      profileId,
      obstacles
    )
  );

  return candidates;
}

const routeCache = new Map<string, CandidateStreetRoute[]>();

/**
 * Calculates a multi-step Cavite 3D street route for FiberBlaze field vehicles.
 * Races Valhalla + FOSSGIS OSRM within a bounded timeout and seamlessly falls back
 * to the built-in Cavite highway/municipal Dijkstra street graph when offline.
 */
export async function calculateStreetRoute(
  rawOrigin: LatLng,
  rawTarget: LatLng,
  options: CalculateRouteOptions = {}
): Promise<StreetRouteResult> {
  const origin = clampToCaviteBounds(rawOrigin);
  const target = clampToCaviteBounds(rawTarget);
  const waypoint = options.waypoint ? clampToCaviteBounds(options.waypoint) : undefined;

  const profileId: VehicleProfileId = options.profile ?? 'motorbike';
  const optimizationMode: OptimizationModeId = options.optimizationMode ?? 'fastest';
  const profile = PROFILES[profileId] ?? PROFILES.motorbike;
  const obstacles = options.obstacles ?? CAVITE_OBSTACLES;
  const timeoutMs = Math.max(150, Math.min(8000, options.timeoutMs ?? 3200));
  const forceOfflineGraph = Boolean(options.forceOfflineGraph);
  const fetchFn = options.fetchImpl ?? globalThis.fetch;

  const directDist = haversineMeters(origin, target);
  if (directDist < 3 && !waypoint) {
    const arrivedStep: RouteStep = {
      index: 0,
      legIndex: 0,
      instruction: 'Arrive at FTTH job site',
      verbalInstruction: 'Arrive at FTTH job site',
      streetName: 'Job site entrance',
      maneuverType: 'arrive',
      maneuverModifier: 'straight',
      bearingAfter: 0,
      distanceMeters: 0,
      durationSeconds: 0,
      startDistanceMeters: 0,
      endDistanceMeters: 0,
      location: [target.lng, target.lat],
    };
    const zeroRoute: RankedStreetRoute = {
      routeId: 'route-0',
      rank: 1,
      profile: profileId,
      sourceEngine: 'CaviteOfflineGraph',
      engineName: profile.engineTag,
      distanceMeters: 0,
      rawDurationSeconds: 0,
      linkDurationSeconds: 0,
      durationSeconds: 0,
      effectiveDurationSeconds: 0,
      turnPenaltySeconds: 0,
      turnCount: 0,
      sharpTurnCount: 0,
      obstacleCount: 0,
      signalCount: 0,
      roadworkCount: 0,
      floodCount: 0,
      bumpCount: 0,
      blockCount: 0,
      obstaclePenaltySeconds: 0,
      matchedObstacles: [],
      isBlocked: false,
      averageSpeedKmh: 0,
      badge: 'Arrived',
      viaStreet: 'Job site entrance',
      deltaSeconds: 0,
      deltaLabel: '0 min',
      coordinates: [
        [origin.lng, origin.lat],
        [target.lng, target.lat],
      ],
      segmentSpeedsMps: [],
      speedGeoJson: { type: 'FeatureCollection', features: [] },
      legSummaries: [],
      steps: [arrivedStep],
    };
    return {
      ...zeroRoute,
      optimizationMode,
      allRoutes: [zeroRoute],
      alternatives: [],
    };
  }

  if (forceOfflineGraph || typeof fetchFn !== 'function') {
    const offlineCandidates = buildOfflineCandidates(
      origin,
      target,
      profileId,
      optimizationMode,
      obstacles,
      waypoint
    );
    const rankedOffline = rankAndDeduplicateRoutes(offlineCandidates, optimizationMode);
    const primary = rankedOffline[0];
    return {
      ...primary,
      optimizationMode,
      allRoutes: rankedOffline,
      alternatives: rankedOffline.slice(1),
    };
  }

  const wpKey = waypoint
    ? `${waypoint.lat.toFixed(4)},${waypoint.lng.toFixed(4)}`
    : 'none';
  const blocksKey = obstacles
    .filter((o) => o.type === 'block')
    .map((o) => `${o.lat.toFixed(4)},${o.lng.toFixed(4)}`)
    .join(';');
  const cacheKey = `${origin.lat.toFixed(4)},${origin.lng.toFixed(4)}|${wpKey}|${target.lat.toFixed(4)},${target.lng.toFixed(4)}|${profileId}|${blocksKey}`;

  if (!options.fetchImpl && routeCache.has(cacheKey)) {
    const cached = routeCache.get(cacheKey);
    if (cached) {
      const rankedCached = rankAndDeduplicateRoutes(cached, optimizationMode);
      if (rankedCached.length > 0) {
        return {
          ...rankedCached[0],
          optimizationMode,
          allRoutes: rankedCached,
          alternatives: rankedCached.slice(1),
        };
      }
    }
  }

  const waypoints: LatLng[] = [origin];
  if (waypoint) waypoints.push(waypoint);
  waypoints.push(target);

  const [valhallaRes, osrmRes] = await Promise.allSettled([
    fetchValhallaCandidates(
      waypoints,
      profile,
      optimizationMode,
      fetchFn,
      obstacles,
      timeoutMs
    ),
    fetchOsrmCandidates(waypoints, profile, fetchFn, obstacles, timeoutMs),
  ]);

  const rawCandidates: CandidateStreetRoute[] = [
    ...(valhallaRes.status === 'fulfilled' ? valhallaRes.value : []),
    ...(osrmRes.status === 'fulfilled' ? osrmRes.value : []),
  ];

  const hitBlock = rawCandidates
    .flatMap((c) => c.matchedObstacles)
    .find((o) => o.type === 'block');

  if (hitBlock && !waypoint) {
    const detourLeft = clampToCaviteBounds(
      computeAvoidanceWaypoint(origin, target, hitBlock, 280, 1)
    );
    const detourRight = clampToCaviteBounds(
      computeAvoidanceWaypoint(origin, target, hitBlock, 280, -1)
    );
    const [detourLRes, detourRRes] = await Promise.allSettled([
      fetchOsrmCandidates(
        [origin, detourLeft, target],
        profile,
        fetchFn,
        obstacles,
        timeoutMs
      ),
      fetchOsrmCandidates(
        [origin, detourRight, target],
        profile,
        fetchFn,
        obstacles,
        timeoutMs
      ),
    ]);
    for (const res of [detourLRes, detourRRes]) {
      if (res.status === 'fulfilled') {
        for (const cand of res.value) {
          if (!cand.isBlocked) {
            rawCandidates.push({
              ...cand,
              isDetour: true,
              engineName: `${cand.engineName} (Obstacle Detour)`,
            });
          }
        }
      }
    }
  }

  // Always guarantee an unblocked Cavite street route if external APIs failed or were all blocked
  const hasUnblockedExternal = rawCandidates.some((c) => !c.isBlocked);
  if (!hasUnblockedExternal) {
    rawCandidates.push(
      ...buildOfflineCandidates(
        origin,
        target,
        profileId,
        optimizationMode,
        obstacles,
        waypoint
      )
    );
  }

  const ranked = rankAndDeduplicateRoutes(rawCandidates, optimizationMode);
  if (
    !options.fetchImpl &&
    rawCandidates.some((c) => c.sourceEngine !== 'CaviteOfflineGraph')
  ) {
    if (routeCache.size > 40) routeCache.clear();
    routeCache.set(cacheKey, rawCandidates);
  }

  const primary = ranked[0];
  return {
    ...primary,
    optimizationMode,
    allRoutes: ranked,
    alternatives: ranked.slice(1),
  };
}

/**
 * Estimates street-level travel distance and ETA for a FiberBlaze technician
 * traveling to a Cavite FTTH job site.
 */
export async function estimateTechnicianStreetEta(
  technicianLocation: LatLng,
  jobLocation: LatLng,
  options: CalculateRouteOptions = {}
): Promise<TechnicianStreetEta> {
  const route = await calculateStreetRoute(technicianLocation, jobLocation, options);
  return {
    profile: route.profile,
    distanceMeters: Math.round(route.distanceMeters),
    etaSeconds: route.effectiveDurationSeconds,
    etaMinutes: Math.max(1, Math.ceil(route.effectiveDurationSeconds / 60)),
    averageSpeedKmh: route.averageSpeedKmh,
    viaStreet: route.viaStreet,
    turnCount: route.turnCount,
    obstaclePenaltySeconds: route.obstaclePenaltySeconds,
    sourceEngine: route.sourceEngine,
    coordinates: route.coordinates,
  };
}

const searchCache = new Map<string, CaviteGazetteerPlace[]>();

function resolvePlaceOptions(
  optionsOrFetch?: PlaceLookupOptions | FetchLike
): PlaceLookupOptions {
  if (typeof optionsOrFetch === 'function') {
    return { fetchImpl: optionsOrFetch };
  }
  return optionsOrFetch ?? {};
}

/**
 * Searches Cavite FTTH hubs, NAP corridors, barangays, and streets strictly inside `CAVITE_BOUNDS`.
 */
export async function searchCavitePlaces(
  query: string,
  optionsOrFetch?: PlaceLookupOptions | FetchLike
): Promise<CaviteGazetteerPlace[]> {
  const q = query.trim();
  if (!q) return [];
  const opts = resolvePlaceOptions(optionsOrFetch);
  const lower = q.toLowerCase();

  const localMatches = CAVITE_GAZETTEER.filter(
    (item) =>
      item.name.toLowerCase().includes(lower) ||
      item.shortName.toLowerCase().includes(lower) ||
      (item.municipality?.toLowerCase().includes(lower) ?? false)
  ).slice(0, 6);

  if (opts.offlineOnly) {
    return localMatches;
  }

  if (searchCache.has(lower)) {
    return searchCache.get(lower) ?? localMatches;
  }

  const fetchFn = opts.fetchImpl ?? globalThis.fetch;
  if (typeof fetchFn !== 'function') {
    return localMatches;
  }

  const bboxParam = `${CAVITE_BOUNDS.minLng},${CAVITE_BOUNDS.minLat},${CAVITE_BOUNDS.maxLng},${CAVITE_BOUNDS.maxLat}`;
  try {
    const photonUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&bbox=${bboxParam}&lat=${CAVITE_BOUNDS.center.lat}&lon=${CAVITE_BOUNDS.center.lng}&limit=6`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2200);
    const res = await fetchFn(photonUrl, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (res.ok) {
      const data = (await res.json()) as PhotonResponse;
      if (Array.isArray(data.features) && data.features.length > 0) {
        const remote = data.features
          .map((f): CaviteGazetteerPlace => {
            const p = f.properties ?? {};
            const coords = f.geometry?.coordinates ?? [0, 0];
            const parts = [p.name, p.street, p.district, p.city ?? 'Cavite'].filter(
              (s): s is string => Boolean(s)
            );
            const uniqueParts = [...new Set(parts)];
            return {
              name: `${uniqueParts.join(', ')}, Cavite`,
              shortName: uniqueParts.slice(0, 2).join(', ') || p.name || q,
              municipality: p.city,
              lat: Number(coords[1]),
              lng: Number(coords[0]),
            };
          })
          .filter((pt) => isWithinCaviteBounds(pt));

        const combined = [...localMatches, ...remote].slice(0, 6);
        if (combined.length > 0) {
          searchCache.set(lower, combined);
          return combined;
        }
      }
    }
  } catch {
    // Fall back to Nominatim or local Cavite Gazetteer below
  }

  const viewbox = `${CAVITE_BOUNDS.minLng},${CAVITE_BOUNDS.maxLat},${CAVITE_BOUNDS.maxLng},${CAVITE_BOUNDS.minLat}`;
  const nomUrl = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&countrycodes=ph&bounded=1&viewbox=${viewbox}&addressdetails=1&q=${encodeURIComponent(`${q} Cavite`)}`;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2200);
    const res = await fetchFn(nomUrl, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (res.ok) {
      const items = (await res.json()) as NominatimSearchItem[];
      const remote = items
        .map((item): CaviteGazetteerPlace => {
          const displayName = item.display_name ?? q;
          return {
            name: displayName,
            shortName: item.name ?? displayName.split(',').slice(0, 2).join(', '),
            lat: Number(item.lat),
            lng: Number(item.lon),
          };
        })
        .filter((pt) => isWithinCaviteBounds(pt));
      const combined = [...localMatches, ...remote].slice(0, 6);
      searchCache.set(lower, combined);
      return combined;
    }
  } catch {
    // Return local Cavite Gazetteer matches offline
  }

  return localMatches;
}

const reverseGeocodeCache = new Map<string, string>();

/**
 * Reverse-geocodes a Cavite coordinate to its nearest FiberBlaze hub, NAP street, or municipality.
 */
export async function reverseGeocodeCaviteStreet(
  lat: number,
  lng: number,
  optionsOrFetch?: PlaceLookupOptions | FetchLike
): Promise<string> {
  const clamped = clampToCaviteBounds(lat, lng);
  const opts = resolvePlaceOptions(optionsOrFetch);

  for (const item of CAVITE_GAZETTEER) {
    if (haversineMeters(clamped, item) <= 220) {
      return item.shortName;
    }
  }

  let nearestNode = CAVITE_STREET_GRAPH.nodes[0];
  let nearestNodeDist = Infinity;
  for (const node of CAVITE_STREET_GRAPH.nodes) {
    const d = haversineMeters(clamped, node);
    if (d < nearestNodeDist) {
      nearestNodeDist = d;
      nearestNode = node;
    }
  }

  if (opts.offlineOnly) {
    return nearestNode
      ? `Near ${nearestNode.name}, ${nearestNode.municipality}, Cavite`
      : `${clamped.lat.toFixed(5)}, ${clamped.lng.toFixed(5)} (Cavite)`;
  }

  const cacheKey = `${clamped.lat.toFixed(4)},${clamped.lng.toFixed(4)}`;
  const cached = reverseGeocodeCache.get(cacheKey);
  if (cached) return cached;

  const fetchFn = opts.fetchImpl ?? globalThis.fetch;
  if (typeof fetchFn !== 'function') {
    return `Near ${nearestNode.name}, ${nearestNode.municipality}, Cavite`;
  }

  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${clamped.lat.toFixed(6)}&lon=${clamped.lng.toFixed(6)}&zoom=18`;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2200);
    const res = await fetchFn(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      return `Near ${nearestNode.name}, ${nearestNode.municipality}, Cavite`;
    }
    const data = (await res.json()) as NominatimReverseResponse;
    const addr = data.address ?? {};
    const road =
      addr.road ?? addr.pedestrian ?? addr.footway ?? addr.residential ?? data.name;
    const area =
      addr.suburb ??
      addr.neighbourhood ??
      addr.village ??
      addr.city ??
      addr.town ??
      nearestNode.municipality;
    let label = `Near ${nearestNode.name}, ${nearestNode.municipality}, Cavite`;
    if (road && area) label = `${road}, ${area}`;
    else if (road) label = `${road}, Cavite`;
    else if (data.display_name) {
      label = data.display_name.split(',').slice(0, 2).join(', ');
    }
    reverseGeocodeCache.set(cacheKey, label);
    return label;
  } catch {
    return `Near ${nearestNode.name}, ${nearestNode.municipality}, Cavite`;
  }
}
