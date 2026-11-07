import {
  bearingDegrees,
  distancePointToPolylineMeters,
  haversineMeters,
  type LatLng,
  type LngLatTuple,
} from './geo';

export type ObstacleType =
  | 'signal'
  | 'roadwork'
  | 'bridge'
  | 'flood'
  | 'gate'
  | 'bump'
  | 'block';

export interface RoadObstacle {
  id: string;
  type: ObstacleType;
  label: string;
  lat: number;
  lng: number;
  delaySeconds: number;
  radiusMeters: number;
}

export interface MatchedRouteObstacle extends RoadObstacle {
  distanceToRouteMeters: number;
  segmentIndex: number;
}

export interface RouteObstacleEvaluation {
  matchedObstacles: MatchedRouteObstacle[];
  obstacleCount: number;
  signalCount: number;
  roadworkCount: number;
  floodCount: number;
  bumpCount: number;
  blockCount: number;
  obstaclePenaltySeconds: number;
  isBlocked: boolean;
}

export interface ObstacleFeatureProperties {
  id: string;
  type: ObstacleType;
  label: string;
  delaySeconds: number;
  onActiveRoute: 0 | 1;
}

export interface ObstacleGeoJsonFeature {
  type: 'Feature';
  properties: ObstacleFeatureProperties;
  geometry: {
    type: 'Point';
    coordinates: LngLatTuple;
  };
}

export interface ObstacleFeatureCollection {
  type: 'FeatureCollection';
  features: ObstacleGeoJsonFeature[];
}

export type FetchLike = (
  input: string | URL,
  init?: RequestInit
) => Promise<Response>;

interface OverpassElement {
  id?: number;
  lat?: number;
  lon?: number;
  tags?: Record<string, string | undefined>;
}

interface OverpassResponse {
  elements?: OverpassElement[];
}

/**
 * Verified Cavite street infrastructure, DPWH roadworks, river bridge bottlenecks,
 * monsoon flood-prone zones, traffic signals, and subdivision access gates.
 */
export const CAVITE_OBSTACLES: readonly RoadObstacle[] = [
  // Bacoor - Imus Corridor (Aguinaldo Hwy & Poblacion)
  {
    id: 'obs-bacoor-sm-signal',
    type: 'signal',
    label: 'SM Bacoor / Tirona Hwy Traffic Signal',
    lat: 14.4454,
    lng: 120.9525,
    delaySeconds: 14,
    radiusMeters: 24,
  },
  {
    id: 'obs-panapaan-flood',
    type: 'flood',
    label: 'Panapaan / Niog Low-Lying Flood Zone',
    lat: 14.4381,
    lng: 120.9491,
    delaySeconds: 22,
    radiusMeters: 28,
  },
  {
    id: 'obs-imus-nueno-signal',
    type: 'signal',
    label: 'Nueno Ave / Tanzang Luma Junction Signal',
    lat: 14.4239,
    lng: 120.9419,
    delaySeconds: 12,
    radiusMeters: 24,
  },
  {
    id: 'obs-imus-plaza-bump',
    type: 'bump',
    label: 'Imus Cathedral School Zone Speed Hump',
    lat: 14.4288,
    lng: 120.9372,
    delaySeconds: 4,
    radiusMeters: 20,
  },
  {
    id: 'obs-imus-bridge',
    type: 'bridge',
    label: 'Imus River Bridge Single-Lane Bottleneck',
    lat: 14.4321,
    lng: 120.9398,
    delaySeconds: 9,
    radiusMeters: 26,
  },

  // Molino - Anabu - Daang Hari Corridor
  {
    id: 'obs-molino-blvd-roadwork',
    type: 'roadwork',
    label: 'Molino Blvd / Buhay na Tubig DPWH Drainage Roadwork',
    lat: 14.4126,
    lng: 120.9708,
    delaySeconds: 26,
    radiusMeters: 28,
  },
  {
    id: 'obs-pagasa-bump',
    type: 'bump',
    label: 'Pag-Asa Subdivision Speed Calming',
    lat: 14.3945,
    lng: 120.9752,
    delaySeconds: 4,
    radiusMeters: 20,
  },
  {
    id: 'obs-anabu-daanghari-signal',
    type: 'signal',
    label: 'The District Imus / Daang Hari Flyover Signal',
    lat: 14.3733,
    lng: 120.9399,
    delaySeconds: 15,
    radiusMeters: 26,
  },

  // Dasmariñas Pala-Pala - DBB - Salitran Corridor
  {
    id: 'obs-salitran-roadwork',
    type: 'roadwork',
    label: 'Aguinaldo Hwy Salitran Conduit & Reblocking Zone',
    lat: 14.3484,
    lng: 120.939,
    delaySeconds: 20,
    radiusMeters: 26,
  },
  {
    id: 'obs-palapala-signal',
    type: 'signal',
    label: 'Pala-Pala Aguinaldo / Governor’s Drive Junction',
    lat: 14.3016,
    lng: 120.9562,
    delaySeconds: 18,
    radiusMeters: 28,
  },
  {
    id: 'obs-dbb-gate',
    type: 'gate',
    label: 'DLSU-D / DBB Subdivision Security Gate',
    lat: 14.3239,
    lng: 120.9592,
    delaySeconds: 8,
    radiusMeters: 22,
  },
  {
    id: 'obs-congressional-bump',
    type: 'bump',
    label: 'Congressional Rd Pedestrian Speed Table',
    lat: 14.3145,
    lng: 120.9609,
    delaySeconds: 5,
    radiusMeters: 20,
  },

  // General Trias - Manggahan - Trece Martires Corridor
  {
    id: 'obs-manggahan-signal',
    type: 'signal',
    label: 'Manggahan Governor’s Drive Crossing Signal',
    lat: 14.2941,
    lng: 120.9142,
    delaySeconds: 16,
    radiusMeters: 28,
  },
  {
    id: 'obs-arnaldo-bridge',
    type: 'bridge',
    label: 'San Francisco Arnaldo Hwy Bridge Approach',
    lat: 14.3168,
    lng: 120.9125,
    delaySeconds: 8,
    radiusMeters: 24,
  },
  {
    id: 'obs-trece-capitol-signal',
    type: 'signal',
    label: 'Trece Martires Capitol / Governor’s Drive Signal',
    lat: 14.2819,
    lng: 120.8675,
    delaySeconds: 13,
    radiusMeters: 25,
  },

  // Kawit - Noveleta - Rosario Corridor
  {
    id: 'obs-kawit-bridge',
    type: 'bridge',
    label: 'Marulas / Kawit River Bridge Bottleneck',
    lat: 14.4426,
    lng: 120.9012,
    delaySeconds: 10,
    radiusMeters: 24,
  },
  {
    id: 'obs-noveleta-flood',
    type: 'flood',
    label: 'Noveleta Magdiwang Tidal Flood-Prone Section',
    lat: 14.4281,
    lng: 120.8801,
    delaySeconds: 24,
    radiusMeters: 28,
  },
  {
    id: 'obs-tejero-signal',
    type: 'signal',
    label: 'Tejero / EPZA Rosario Junction Signal',
    lat: 14.4048,
    lng: 120.8599,
    delaySeconds: 15,
    radiusMeters: 26,
  },

  // Silang - Tagaytay Corridor
  {
    id: 'obs-silang-bypass-signal',
    type: 'signal',
    label: 'Silang Aguinaldo Hwy / Bypass Signal',
    lat: 14.2185,
    lng: 120.9728,
    delaySeconds: 11,
    radiusMeters: 24,
  },
  {
    id: 'obs-tagaytay-rotonda',
    type: 'signal',
    label: 'Tagaytay Olivarez Rotonda Bottleneck',
    lat: 14.1162,
    lng: 120.9601,
    delaySeconds: 16,
    radiusMeters: 28,
  },
];

const overpassCache = new Map<string, RoadObstacle[]>();
const overpassInFlight = new Set<string>();

function mergeUniqueObstacles(list: readonly RoadObstacle[]): RoadObstacle[] {
  const out: RoadObstacle[] = [];
  for (const item of list) {
    const duplicate = out.some(
      (existing) => existing.type === item.type && haversineMeters(existing, item) < 28
    );
    if (!duplicate) {
      out.push(item);
    }
  }
  return out;
}

/**
 * Synchronously returns verified Cavite corridor obstacles + user road blocks + cached OSM items.
 * Pass `fetchImpl = null` (default in offline/deterministic mode) to skip background OSM warming.
 */
export function getLocalObstaclesForCorridor(
  origin: LatLng,
  target: LatLng,
  userBlocks: readonly RoadObstacle[] = [],
  fetchImpl: FetchLike | null = null
): RoadObstacle[] {
  const minLat = Math.min(origin.lat, target.lat) - 0.015;
  const maxLat = Math.max(origin.lat, target.lat) + 0.015;
  const minLng = Math.min(origin.lng, target.lng) - 0.015;
  const maxLng = Math.max(origin.lng, target.lng) + 0.015;

  const baseLocal = CAVITE_OBSTACLES.filter(
    (o) => o.lat >= minLat && o.lat <= maxLat && o.lng >= minLng && o.lng <= maxLng
  );

  const cacheKey = `${minLat.toFixed(2)},${minLng.toFixed(2)},${maxLat.toFixed(2)},${maxLng.toFixed(2)}`;
  const cachedOsm = overpassCache.get(cacheKey) ?? [];

  if (
    fetchImpl !== null &&
    !overpassCache.has(cacheKey) &&
    !overpassInFlight.has(cacheKey)
  ) {
    overpassInFlight.add(cacheKey);
    void fetchObstaclesForCorridor(origin, target, [], fetchImpl).finally(() => {
      overpassInFlight.delete(cacheKey);
    });
  }

  return mergeUniqueObstacles([...userBlocks, ...baseLocal, ...cachedOsm]);
}

export async function fetchObstaclesForCorridor(
  origin: LatLng,
  target: LatLng,
  userBlocks: readonly RoadObstacle[] = [],
  fetchImpl: FetchLike | undefined = globalThis.fetch
): Promise<RoadObstacle[]> {
  const minLat = Math.min(origin.lat, target.lat) - 0.015;
  const maxLat = Math.max(origin.lat, target.lat) + 0.015;
  const minLng = Math.min(origin.lng, target.lng) - 0.015;
  const maxLng = Math.max(origin.lng, target.lng) + 0.015;

  const baseLocal = CAVITE_OBSTACLES.filter(
    (o) => o.lat >= minLat && o.lat <= maxLat && o.lng >= minLng && o.lng <= maxLng
  );

  const cacheKey = `${minLat.toFixed(2)},${minLng.toFixed(2)},${maxLat.toFixed(2)},${maxLng.toFixed(2)}`;
  const existingOsm = overpassCache.get(cacheKey);
  if (existingOsm) {
    return mergeUniqueObstacles([...userBlocks, ...baseLocal, ...existingOsm]);
  }

  if (typeof fetchImpl !== 'function') {
    return mergeUniqueObstacles([...userBlocks, ...baseLocal]);
  }

  const query = `[out:json][timeout:3];(node["highway"="traffic_signals"](${minLat.toFixed(4)},${minLng.toFixed(4)},${maxLat.toFixed(4)},${maxLng.toFixed(4)});node["traffic_calming"](${minLat.toFixed(4)},${minLng.toFixed(4)},${maxLat.toFixed(4)},${maxLng.toFixed(4)});node["barrier"~"gate|lift_gate|toll_booth"](${minLat.toFixed(4)},${minLng.toFixed(4)},${maxLat.toFixed(4)},${maxLng.toFixed(4)}););out body 35;`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2800);
  try {
    const res = await fetchImpl('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(query)}`,
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (res.ok) {
      const data = (await res.json()) as OverpassResponse;
      const osmItems: RoadObstacle[] = (data.elements ?? [])
        .filter(
          (el): el is OverpassElement & { lat: number; lon: number } =>
            typeof el.lat === 'number' &&
            Number.isFinite(el.lat) &&
            typeof el.lon === 'number' &&
            Number.isFinite(el.lon)
        )
        .map((el) => {
          const tags = el.tags ?? {};
          const elId = el.id ?? Math.round(el.lat * 1e5);
          if (tags.highway === 'traffic_signals') {
            return {
              id: `osm-sig-${elId}`,
              type: 'signal',
              label: tags.name ?? 'OSM Traffic Signal',
              lat: el.lat,
              lng: el.lon,
              delaySeconds: 12,
              radiusMeters: 24,
            };
          }
          if (tags.traffic_calming) {
            return {
              id: `osm-bump-${elId}`,
              type: 'bump',
              label: `Speed ${tags.traffic_calming}`,
              lat: el.lat,
              lng: el.lon,
              delaySeconds: 4,
              radiusMeters: 20,
            };
          }
          return {
            id: `osm-gate-${elId}`,
            type: 'gate',
            label: tags.name ?? 'Subdivision Access Gate',
            lat: el.lat,
            lng: el.lon,
            delaySeconds: 8,
            radiusMeters: 22,
          };
        });
      overpassCache.set(cacheKey, osmItems);
      return mergeUniqueObstacles([...userBlocks, ...baseLocal, ...osmItems]);
    }
  } catch {
    clearTimeout(timer);
  }

  return mergeUniqueObstacles([...userBlocks, ...baseLocal]);
}

/**
 * Evaluates which Cavite obstacles and user road blocks intersect a candidate polyline.
 */
export function evaluateRouteObstacles(
  coords: readonly LngLatTuple[],
  obstacles: readonly RoadObstacle[] = []
): RouteObstacleEvaluation {
  if (coords.length < 2 || obstacles.length === 0) {
    return {
      matchedObstacles: [],
      obstacleCount: 0,
      signalCount: 0,
      roadworkCount: 0,
      floodCount: 0,
      bumpCount: 0,
      blockCount: 0,
      obstaclePenaltySeconds: 0,
      isBlocked: false,
    };
  }

  const matchedObstacles: MatchedRouteObstacle[] = [];
  let signalCount = 0;
  let roadworkCount = 0;
  let floodCount = 0;
  let bumpCount = 0;
  let blockCount = 0;
  let obstaclePenaltySeconds = 0;

  for (const obs of obstacles) {
    const threshold = obs.radiusMeters ?? (obs.type === 'block' ? 32 : 24);
    const { distanceMeters, segmentIndex } = distancePointToPolylineMeters(obs, coords);
    if (distanceMeters <= threshold) {
      matchedObstacles.push({
        ...obs,
        distanceToRouteMeters: Math.round(distanceMeters * 10) / 10,
        segmentIndex,
      });
      if (obs.type === 'signal') signalCount += 1;
      else if (obs.type === 'roadwork') roadworkCount += 1;
      else if (obs.type === 'flood') floodCount += 1;
      else if (obs.type === 'bump') bumpCount += 1;
      else if (obs.type === 'block') blockCount += 1;

      obstaclePenaltySeconds += obs.delaySeconds ?? (obs.type === 'block' ? 600 : 8);
    }
  }

  return {
    matchedObstacles,
    obstacleCount: matchedObstacles.length,
    signalCount,
    roadworkCount,
    floodCount,
    bumpCount,
    blockCount,
    obstaclePenaltySeconds: Math.round(obstaclePenaltySeconds),
    isBlocked: blockCount > 0,
  };
}

/**
 * Computes a lateral avoidance waypoint perpendicular to a blocked street segment.
 */
export function computeAvoidanceWaypoint(
  origin: LatLng,
  target: LatLng,
  blockPoint: LatLng,
  offsetMeters = 260,
  side: 1 | -1 = 1
): LatLng {
  const corridorBearing = bearingDegrees(origin, target);
  const perpBearingRad = ((corridorBearing + side * 90) * Math.PI) / 180;
  const dNorth = Math.cos(perpBearingRad) * offsetMeters;
  const dEast = Math.sin(perpBearingRad) * offsetMeters;
  const cosLat = Math.max(0.1, Math.cos((blockPoint.lat * Math.PI) / 180));

  return {
    lat: blockPoint.lat + dNorth / 111132.92,
    lng: blockPoint.lng + dEast / (111412.84 * cosLat),
  };
}

/**
 * Converts Cavite obstacles into a MapLibre-ready GeoJSON FeatureCollection.
 */
export function obstaclesToGeoJson(
  obstacles: readonly RoadObstacle[] = [],
  activeRouteIds: ReadonlySet<string> = new Set()
): ObstacleFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: obstacles.map((obs) => ({
      type: 'Feature',
      properties: {
        id: obs.id,
        type: obs.type,
        label: obs.label,
        delaySeconds: obs.delaySeconds,
        onActiveRoute: activeRouteIds.has(obs.id) ? 1 : 0,
      },
      geometry: {
        type: 'Point',
        coordinates: [obs.lng, obs.lat],
      },
    })),
  };
}
