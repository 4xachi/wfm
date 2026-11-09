import {
  angularDifference,
  bearingDegrees,
  clampToCaviteBounds,
  computeCumulativeDistances,
  distancePointToPolylineMeters,
  haversineMeters,
  type LatLng,
  type LngLatTuple,
} from './geo';
import {
  CAVITE_OBSTACLES,
  computeAvoidanceWaypoint,
  evaluateRouteObstacles,
  type RoadObstacle,
} from './obstacles';

export type CaviteHighwayClass = 'primary' | 'secondary' | 'municipal' | 'subdivision';

export interface CaviteGraphNode extends LatLng {
  id: string;
  name: string;
  municipality: string;
}

export interface CaviteGraphEdge {
  from: string;
  to: string;
  streetName: string;
  highwayClass: CaviteHighwayClass;
  speedKmh: number;
  bidirectional?: boolean;
  intermediatePoints?: readonly LngLatTuple[];
}

export interface FallbackRouteStep {
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

export interface FallbackLegSummary {
  legIndex: number;
  distanceMeters: number;
  durationSeconds: number;
  summary: string;
}

export interface FallbackGraphRoute {
  sourceEngine: 'CaviteOfflineGraph';
  engineName: string;
  distanceMeters: number;
  rawDurationSeconds: number;
  coordinates: LngLatTuple[];
  segmentSpeedsMps: number[];
  legSummaries: FallbackLegSummary[];
  steps: FallbackRouteStep[];
  isDetour: boolean;
}

export interface FallbackGraphOptions {
  profile?: 'motorbike' | 'l300_van' | 'foot';
  optimizationMode?: 'fastest' | 'shortest' | 'smooth' | 'subdivision';
  waypoint?: LatLng;
  obstacles?: readonly RoadObstacle[];
  penalizeEdges?: ReadonlySet<string>;
}

const GRAPH_NODES: readonly CaviteGraphNode[] = [
  // Bacoor & Molino Corridor
  { id: 'talaba_coastal', name: 'Talaba Coastal Junction', municipality: 'Bacoor', lat: 14.4588, lng: 120.9612 },
  { id: 'sm_bacoor', name: 'SM Bacoor Aguinaldo-Tirona Hub', municipality: 'Bacoor', lat: 14.4449, lng: 120.9522 },
  { id: 'panapaan_niog', name: 'Panapaan - Niog Crossing', municipality: 'Bacoor', lat: 14.4381, lng: 120.9491 },
  { id: 'niog_molino_conn', name: 'Niog - Molino Blvd Junction', municipality: 'Bacoor', lat: 14.4310, lng: 120.9635 },
  { id: 'molino_nomo', name: 'NOMO Molino Boulevard', municipality: 'Bacoor', lat: 14.4162, lng: 120.9694 },
  { id: 'molino_iii_nap', name: 'Molino III Progressive Junction', municipality: 'Bacoor', lat: 14.4045, lng: 120.9735 },
  { id: 'sm_molino', name: 'Molino IV - Daang Hari Somo', municipality: 'Bacoor', lat: 14.3840, lng: 120.9776 },

  // Imus & Daang Hari / Open Canal Corridor
  { id: 'imus_noc_plaza', name: 'Imus Poblacion NOC Plaza', municipality: 'Imus', lat: 14.4294, lng: 120.9367 },
  { id: 'imus_nueno', name: 'Aguinaldo - Nueno Ave Crossing', municipality: 'Imus', lat: 14.4239, lng: 120.9419 },
  { id: 'tanzang_luma', name: 'Tanzang Luma Aguinaldo Corridor', municipality: 'Imus', lat: 14.4148, lng: 120.9410 },
  { id: 'buhay_na_tubig', name: 'Buhay na Tubig Junction', municipality: 'Imus', lat: 14.4126, lng: 120.9582 },
  { id: 'malagasang_opencanal', name: 'Malagasang - Bucandala Crossing', municipality: 'Imus', lat: 14.3895, lng: 120.9245 },
  { id: 'anabu_district', name: 'Anabu II-D - Daang Hari Flyover', municipality: 'Imus', lat: 14.3728, lng: 120.9394 },
  { id: 'vermosa_daanghari', name: 'Vermosa Daang Hari Hub', municipality: 'Imus', lat: 14.3652, lng: 120.9595 },

  // Dasmariñas, Salitran, Paliparan & Carmona Corridor
  { id: 'salitran_nap', name: 'Salitran Aguinaldo Junction', municipality: 'Dasmariñas', lat: 14.3484, lng: 120.9390 },
  { id: 'salitran_paliparan_jct', name: 'Jose Abad Santos - Salitran East', municipality: 'Dasmariñas', lat: 14.3465, lng: 120.9688 },
  { id: 'paliparan_site', name: 'Paliparan - Governor’s Drive East', municipality: 'Dasmariñas', lat: 14.3230, lng: 120.9845 },
  { id: 'carmona_gma', name: 'GMA - Carmona Governor’s Drive', municipality: 'Carmona', lat: 14.3132, lng: 121.0450 },
  { id: 'dbb_congressional', name: 'DBB Congressional - Mangubat Blvd', municipality: 'Dasmariñas', lat: 14.3248, lng: 120.9598 },
  { id: 'vista_dasma', name: 'Aguinaldo Agustin Zone IV', municipality: 'Dasmariñas', lat: 14.3212, lng: 120.9438 },
  { id: 'pala_pala_hub', name: 'Pala-Pala Aguinaldo - Gov. Drive', municipality: 'Dasmariñas', lat: 14.3007, lng: 120.9554 },

  // Kawit, Noveleta, Rosario & Tanza Corridor
  { id: 'binakayan_kawit', name: 'Binakayan Tirona Highway', municipality: 'Kawit', lat: 14.4452, lng: 120.9245 },
  { id: 'kawit_hub', name: 'Kawit Kaingen Tirona Hub', municipality: 'Kawit', lat: 14.4439, lng: 120.9041 },
  { id: 'centennial_evo', name: 'Centennial Road Kawit', municipality: 'Kawit', lat: 14.4265, lng: 120.9062 },
  { id: 'lancaster_alapan', name: 'Alapan - Advincula Crossing', municipality: 'Imus', lat: 14.4095, lng: 120.9098 },
  { id: 'noveleta_cross', name: 'Noveleta Magdiwang Junction', municipality: 'Noveleta', lat: 14.4281, lng: 120.8801 },
  { id: 'rosario_epza_nap', name: 'Rosario Tejeros EPZA Junction', municipality: 'Rosario', lat: 14.4055, lng: 120.8588 },
  { id: 'tejero_gentri', name: 'Tejero General Trias Drive', municipality: 'General Trias', lat: 14.3992, lng: 120.8660 },
  { id: 'tanza_amaya', name: 'Tanza Daang Amaya Soriano Hwy', municipality: 'Tanza', lat: 14.3924, lng: 120.8512 },

  // General Trias, Trece Martires & Naic Corridor
  { id: 'gentri_poblacion', name: 'General Trias Poblacion Ferrer Dr', municipality: 'General Trias', lat: 14.3820, lng: 120.8812 },
  { id: 'gentri_hub', name: 'San Francisco Arnaldo Hwy Hub', municipality: 'General Trias', lat: 14.3315, lng: 120.9092 },
  { id: 'manggahan_jct', name: 'Manggahan Governor’s Drive', municipality: 'General Trias', lat: 14.2941, lng: 120.9142 },
  { id: 'trece_martires_nap', name: 'Trece Martires Capitol Junction', municipality: 'Trece Martires', lat: 14.2817, lng: 120.8669 },
  { id: 'tanza_trece_rd', name: 'Paradahan Tanza-Trece Road', municipality: 'Tanza', lat: 14.3360, lng: 120.8560 },
  { id: 'naic_proper', name: 'Naic Governor’s Drive West', municipality: 'Naic', lat: 14.3150, lng: 120.7720 },

  // Silang, Indang, Amadeo & Tagaytay Corridor
  { id: 'silang_north_bypass', name: 'Biga Silang North Bypass', municipality: 'Silang', lat: 14.2565, lng: 120.9635 },
  { id: 'silang_hub', name: 'Silang Poblacion Aguinaldo Hub', municipality: 'Silang', lat: 14.2238, lng: 120.9742 },
  { id: 'silang_east_bypass', name: 'Silang East Sta. Rosa Link', municipality: 'Silang', lat: 14.1850, lng: 120.9765 },
  { id: 'amadeo_crisanto', name: 'Amadeo Crisanto De Los Reyes', municipality: 'Amadeo', lat: 14.1725, lng: 120.9245 },
  { id: 'indang_cvsu', name: 'Indang Bancod Trece-Indang Rd', municipality: 'Indang', lat: 14.1982, lng: 120.8815 },
  { id: 'mendez_mahogany', name: 'Mendez - Tagaytay Crossing', municipality: 'Mendez', lat: 14.1285, lng: 120.9060 },
  { id: 'tagaytay_rotonda_nap', name: 'Tagaytay Olivarez Rotonda', municipality: 'Tagaytay', lat: 14.1165, lng: 120.9604 },
  { id: 'tagaytay_mahogany', name: 'Tagaytay Mahogany Nasugbu Hwy', municipality: 'Tagaytay', lat: 14.1045, lng: 120.9385 },
];

const GRAPH_EDGES: readonly CaviteGraphEdge[] = [
  // Aguinaldo Highway Spine
  { from: 'talaba_coastal', to: 'sm_bacoor', streetName: 'Aguinaldo Highway', highwayClass: 'primary', speedKmh: 38 },
  { from: 'sm_bacoor', to: 'panapaan_niog', streetName: 'Aguinaldo Highway', highwayClass: 'primary', speedKmh: 35 },
  { from: 'panapaan_niog', to: 'imus_nueno', streetName: 'Aguinaldo Highway', highwayClass: 'primary', speedKmh: 34 },
  { from: 'imus_nueno', to: 'tanzang_luma', streetName: 'Aguinaldo Highway', highwayClass: 'primary', speedKmh: 34 },
  { from: 'tanzang_luma', to: 'anabu_district', streetName: 'Aguinaldo Highway', highwayClass: 'primary', speedKmh: 38 },
  { from: 'anabu_district', to: 'salitran_nap', streetName: 'Aguinaldo Highway', highwayClass: 'primary', speedKmh: 38 },
  { from: 'salitran_nap', to: 'vista_dasma', streetName: 'Aguinaldo Highway', highwayClass: 'primary', speedKmh: 36 },
  { from: 'vista_dasma', to: 'pala_pala_hub', streetName: 'Aguinaldo Highway', highwayClass: 'primary', speedKmh: 34 },
  { from: 'pala_pala_hub', to: 'silang_north_bypass', streetName: 'Aguinaldo Highway', highwayClass: 'primary', speedKmh: 42 },
  { from: 'silang_north_bypass', to: 'silang_hub', streetName: 'Aguinaldo Highway', highwayClass: 'primary', speedKmh: 38 },
  { from: 'silang_hub', to: 'tagaytay_rotonda_nap', streetName: 'Aguinaldo Highway', highwayClass: 'primary', speedKmh: 40 },

  // Molino Boulevard & Molino Road Spine
  { from: 'talaba_coastal', to: 'niog_molino_conn', streetName: 'Molino Boulevard', highwayClass: 'primary', speedKmh: 44 },
  { from: 'niog_molino_conn', to: 'molino_nomo', streetName: 'Molino Boulevard', highwayClass: 'primary', speedKmh: 42 },
  { from: 'molino_nomo', to: 'molino_iii_nap', streetName: 'Molino Road', highwayClass: 'secondary', speedKmh: 32 },
  { from: 'molino_iii_nap', to: 'sm_molino', streetName: 'Molino Road', highwayClass: 'secondary', speedKmh: 30 },
  { from: 'sm_molino', to: 'salitran_paliparan_jct', streetName: 'Molino-Paliparan Road', highwayClass: 'secondary', speedKmh: 34 },
  { from: 'salitran_paliparan_jct', to: 'paliparan_site', streetName: 'Molino-Paliparan Road', highwayClass: 'secondary', speedKmh: 34 },

  // East-West Connectors in Bacoor / Imus / Dasmariñas
  { from: 'panapaan_niog', to: 'niog_molino_conn', streetName: 'Niog Road', highwayClass: 'municipal', speedKmh: 26 },
  { from: 'panapaan_niog', to: 'imus_noc_plaza', streetName: 'General Evangelista Street', highwayClass: 'municipal', speedKmh: 28 },
  {
    from: 'imus_noc_plaza',
    to: 'imus_nueno',
    streetName: 'Nueno Avenue',
    highwayClass: 'municipal',
    speedKmh: 26,
    intermediatePoints: [[120.93787, 14.42703]],
  },
  { from: 'imus_noc_plaza', to: 'tanzang_luma', streetName: 'General Castañeda Street', highwayClass: 'municipal', speedKmh: 25 },
  { from: 'imus_noc_plaza', to: 'lancaster_alapan', streetName: 'Alapan Road', highwayClass: 'municipal', speedKmh: 30 },
  { from: 'tanzang_luma', to: 'buhay_na_tubig', streetName: 'Tanzang Luma - Buhay na Tubig Road', highwayClass: 'municipal', speedKmh: 28 },
  { from: 'buhay_na_tubig', to: 'molino_nomo', streetName: 'Buhay na Tubig Road', highwayClass: 'municipal', speedKmh: 30 },
  { from: 'buhay_na_tubig', to: 'molino_iii_nap', streetName: 'Bahayang Pag-Asa Avenue', highwayClass: 'subdivision', speedKmh: 26 },
  { from: 'buhay_na_tubig', to: 'vermosa_daanghari', streetName: 'Pasong Buaya - Vermosa Link', highwayClass: 'secondary', speedKmh: 36 },

  // Daang Hari & Open Canal Corridor
  { from: 'sm_molino', to: 'vermosa_daanghari', streetName: 'Daang Hari Road', highwayClass: 'primary', speedKmh: 46 },
  { from: 'vermosa_daanghari', to: 'anabu_district', streetName: 'Daang Hari Road', highwayClass: 'primary', speedKmh: 44 },
  { from: 'tanzang_luma', to: 'malagasang_opencanal', streetName: 'Bucandala - Malagasang Road', highwayClass: 'municipal', speedKmh: 30 },
  { from: 'anabu_district', to: 'malagasang_opencanal', streetName: 'Open Canal Road', highwayClass: 'secondary', speedKmh: 38 },
  { from: 'malagasang_opencanal', to: 'lancaster_alapan', streetName: 'Advincula Avenue', highwayClass: 'secondary', speedKmh: 36 },
  { from: 'malagasang_opencanal', to: 'gentri_hub', streetName: 'Open Canal Road', highwayClass: 'secondary', speedKmh: 38 },

  // Dasmariñas Congressional / Salitran Mesh
  { from: 'salitran_nap', to: 'salitran_paliparan_jct', streetName: 'Jose Abad Santos Avenue', highwayClass: 'secondary', speedKmh: 34 },
  { from: 'salitran_nap', to: 'dbb_congressional', streetName: 'Congressional Road', highwayClass: 'secondary', speedKmh: 32 },
  { from: 'dbb_congressional', to: 'vista_dasma', streetName: 'Mangubat Avenue', highwayClass: 'municipal', speedKmh: 28 },
  { from: 'dbb_congressional', to: 'pala_pala_hub', streetName: 'Congressional Road South', highwayClass: 'secondary', speedKmh: 30 },
  { from: 'dbb_congressional', to: 'paliparan_site', streetName: 'DBB - Paliparan Road', highwayClass: 'municipal', speedKmh: 28 },

  // Governor's Drive Spine (East to West)
  { from: 'carmona_gma', to: 'paliparan_site', streetName: 'Governor’s Drive', highwayClass: 'primary', speedKmh: 42 },
  { from: 'paliparan_site', to: 'pala_pala_hub', streetName: 'Governor’s Drive', highwayClass: 'primary', speedKmh: 38 },
  { from: 'pala_pala_hub', to: 'manggahan_jct', streetName: 'Governor’s Drive', highwayClass: 'primary', speedKmh: 40 },
  { from: 'manggahan_jct', to: 'trece_martires_nap', streetName: 'Governor’s Drive', highwayClass: 'primary', speedKmh: 40 },
  { from: 'trece_martires_nap', to: 'naic_proper', streetName: 'Governor’s Drive', highwayClass: 'primary', speedKmh: 42 },

  // Tirona Hwy, Centennial Rd & Coastal West
  { from: 'sm_bacoor', to: 'binakayan_kawit', streetName: 'Tirona Highway', highwayClass: 'primary', speedKmh: 36 },
  { from: 'binakayan_kawit', to: 'kawit_hub', streetName: 'Tirona Highway', highwayClass: 'primary', speedKmh: 34 },
  { from: 'binakayan_kawit', to: 'centennial_evo', streetName: 'Covelandia - Centennial Link', highwayClass: 'secondary', speedKmh: 34 },
  { from: 'kawit_hub', to: 'centennial_evo', streetName: 'Centennial Road', highwayClass: 'primary', speedKmh: 42 },
  { from: 'kawit_hub', to: 'noveleta_cross', streetName: 'Magdiwang Highway', highwayClass: 'secondary', speedKmh: 32 },
  { from: 'centennial_evo', to: 'lancaster_alapan', streetName: 'Centennial Road', highwayClass: 'primary', speedKmh: 42 },
  { from: 'centennial_evo', to: 'noveleta_cross', streetName: 'Soriano Bypass Road', highwayClass: 'secondary', speedKmh: 36 },
  { from: 'noveleta_cross', to: 'rosario_epza_nap', streetName: 'Magdiwang - Marseilla Street', highwayClass: 'secondary', speedKmh: 30 },
  { from: 'centennial_evo', to: 'tejero_gentri', streetName: 'Antero Soriano Highway', highwayClass: 'primary', speedKmh: 40 },
  { from: 'rosario_epza_nap', to: 'tejero_gentri', streetName: 'General Trias Drive', highwayClass: 'secondary', speedKmh: 30 },
  { from: 'rosario_epza_nap', to: 'tanza_amaya', streetName: 'Antero Soriano Highway', highwayClass: 'primary', speedKmh: 38 },
  { from: 'tejero_gentri', to: 'tanza_amaya', streetName: 'Tejero - Amaya Connector', highwayClass: 'municipal', speedKmh: 28 },
  { from: 'tanza_amaya', to: 'naic_proper', streetName: 'Antero Soriano Highway', highwayClass: 'primary', speedKmh: 42 },

  // General Trias & Trece Martires Mesh
  { from: 'tejero_gentri', to: 'gentri_poblacion', streetName: 'General Trias Drive', highwayClass: 'secondary', speedKmh: 32 },
  { from: 'lancaster_alapan', to: 'gentri_poblacion', streetName: 'Navarro - Ferrer Road', highwayClass: 'municipal', speedKmh: 30 },
  { from: 'lancaster_alapan', to: 'gentri_hub', streetName: 'Arnaldo Highway', highwayClass: 'secondary', speedKmh: 36 },
  { from: 'gentri_poblacion', to: 'gentri_hub', streetName: 'Governor Ferrer Drive', highwayClass: 'secondary', speedKmh: 34 },
  { from: 'gentri_hub', to: 'vista_dasma', streetName: 'Santiago - Salitran Connector', highwayClass: 'municipal', speedKmh: 28 },
  { from: 'gentri_hub', to: 'manggahan_jct', streetName: 'Arnaldo Highway', highwayClass: 'secondary', speedKmh: 34 },
  { from: 'gentri_poblacion', to: 'manggahan_jct', streetName: 'Governor Ferrer Drive', highwayClass: 'secondary', speedKmh: 35 },
  { from: 'tanza_amaya', to: 'tanza_trece_rd', streetName: 'Tanza - Trece Martires Road', highwayClass: 'secondary', speedKmh: 36 },
  { from: 'tanza_trece_rd', to: 'trece_martires_nap', streetName: 'Tanza - Trece Martires Road', highwayClass: 'secondary', speedKmh: 36 },
  { from: 'tanza_trece_rd', to: 'naic_proper', streetName: 'Halayhay - Naic Provincial Road', highwayClass: 'municipal', speedKmh: 32 },

  // Upland South Cavite Mesh (Silang, Amadeo, Indang, Mendez, Tagaytay)
  { from: 'silang_north_bypass', to: 'silang_east_bypass', streetName: 'Silang Bypass Road', highwayClass: 'primary', speedKmh: 46 },
  { from: 'silang_hub', to: 'silang_east_bypass', streetName: 'Silang - Banaybanay Road', highwayClass: 'municipal', speedKmh: 32 },
  { from: 'silang_east_bypass', to: 'tagaytay_rotonda_nap', streetName: 'Sta. Rosa - Tagaytay Road', highwayClass: 'primary', speedKmh: 40 },
  { from: 'manggahan_jct', to: 'amadeo_crisanto', streetName: 'Crisanto M. De Los Reyes Avenue', highwayClass: 'secondary', speedKmh: 38 },
  { from: 'silang_hub', to: 'amadeo_crisanto', streetName: 'Silang - Amadeo Road', highwayClass: 'municipal', speedKmh: 32 },
  { from: 'amadeo_crisanto', to: 'tagaytay_rotonda_nap', streetName: 'Crisanto M. De Los Reyes Avenue', highwayClass: 'secondary', speedKmh: 36 },
  { from: 'amadeo_crisanto', to: 'tagaytay_mahogany', streetName: 'Amadeo - Mahogany Avenue', highwayClass: 'municipal', speedKmh: 32 },
  { from: 'trece_martires_nap', to: 'indang_cvsu', streetName: 'Trece Martires - Indang Road', highwayClass: 'secondary', speedKmh: 38 },
  { from: 'indang_cvsu', to: 'amadeo_crisanto', streetName: 'Indang - Amadeo Provincial Road', highwayClass: 'municipal', speedKmh: 30 },
  { from: 'indang_cvsu', to: 'mendez_mahogany', streetName: 'Indang - Mendez Road', highwayClass: 'secondary', speedKmh: 34 },
  { from: 'mendez_mahogany', to: 'tagaytay_mahogany', streetName: 'Tagaytay - Nasugbu Highway', highwayClass: 'primary', speedKmh: 38 },
  { from: 'tagaytay_mahogany', to: 'tagaytay_rotonda_nap', streetName: 'Tagaytay - Nasugbu Highway', highwayClass: 'primary', speedKmh: 36 },
];

export const CAVITE_STREET_GRAPH = {
  nodes: GRAPH_NODES,
  edges: GRAPH_EDGES,
} as const;

interface DirectedEdge {
  edgeKey: string;
  from: string;
  to: string;
  streetName: string;
  highwayClass: CaviteHighwayClass;
  speedKmh: number;
  coords: LngLatTuple[];
  distanceMeters: number;
}

const nodeById = new Map<string, CaviteGraphNode>(
  GRAPH_NODES.map((n) => [n.id, n])
);

function densifySegmentCoords(
  a: LatLng,
  b: LatLng,
  stepMeters = 140
): LngLatTuple[] {
  const dist = haversineMeters(a, b);
  const steps = Math.max(1, Math.min(28, Math.ceil(dist / stepMeters)));
  const out: LngLatTuple[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const clamped = clampToCaviteBounds(
      a.lat + (b.lat - a.lat) * t,
      a.lng + (b.lng - a.lng) * t
    );
    out.push([clamped.lng, clamped.lat]);
  }
  return out;
}

const adjacency = new Map<string, DirectedEdge[]>();

function buildAdjacencyOnce(): void {
  if (adjacency.size > 0) return;
  for (const node of GRAPH_NODES) {
    adjacency.set(node.id, []);
  }
  for (const edge of GRAPH_EDGES) {
    const a = nodeById.get(edge.from);
    const b = nodeById.get(edge.to);
    if (!a || !b) continue;

    const forwardCoords = densifySegmentCoords(a, b, 135);
    const cum = computeCumulativeDistances(forwardCoords);
    const dist = cum[cum.length - 1] ?? haversineMeters(a, b);
    const canonicalKey = [edge.from, edge.to].sort().join('::');

    adjacency.get(edge.from)?.push({
      edgeKey: canonicalKey,
      from: edge.from,
      to: edge.to,
      streetName: edge.streetName,
      highwayClass: edge.highwayClass,
      speedKmh: edge.speedKmh,
      coords: forwardCoords,
      distanceMeters: dist,
    });

    if (edge.bidirectional !== false) {
      adjacency.get(edge.to)?.push({
        edgeKey: canonicalKey,
        from: edge.to,
        to: edge.from,
        streetName: edge.streetName,
        highwayClass: edge.highwayClass,
        speedKmh: edge.speedKmh,
        coords: [...forwardCoords].reverse(),
        distanceMeters: dist,
      });
    }
  }
}

buildAdjacencyOnce();

function cardinalFromBearing(deg: number): string {
  const dirs = [
    'north',
    'northeast',
    'east',
    'southeast',
    'south',
    'southwest',
    'west',
    'northwest',
  ];
  const idx = Math.round((((deg % 360) + 360) % 360) / 45) % 8;
  return dirs[idx] ?? 'forward';
}

function classifyTurnTransition(deltaDeg: number): {
  type: string;
  modifier: string;
  verb: string;
} {
  if (deltaDeg <= -105) {
    return { type: 'turn', modifier: 'sharp-left', verb: 'Turn sharp left onto' };
  }
  if (deltaDeg <= -20) {
    return { type: 'turn', modifier: 'left', verb: 'Turn left onto' };
  }
  if (deltaDeg <= -8) {
    return { type: 'turn', modifier: 'slight-left', verb: 'Keep slight left onto' };
  }
  if (deltaDeg >= 105) {
    return { type: 'turn', modifier: 'sharp-right', verb: 'Turn sharp right onto' };
  }
  if (deltaDeg >= 20) {
    return { type: 'turn', modifier: 'right', verb: 'Turn right onto' };
  }
  if (deltaDeg >= 8) {
    return { type: 'turn', modifier: 'slight-right', verb: 'Keep slight right onto' };
  }
  return { type: 'continue', modifier: 'straight', verb: 'Continue onto' };
}

function isPolylineBlockedByUserBlock(
  coords: readonly LngLatTuple[],
  blocks: readonly RoadObstacle[]
): boolean {
  if (blocks.length === 0 || coords.length < 2) return false;
  for (const b of blocks) {
    const radius = Math.max(38, b.radiusMeters ?? 38);
    const { distanceMeters } = distancePointToPolylineMeters(b, coords);
    if (distanceMeters <= radius) {
      return true;
    }
  }
  return false;
}

function profileSpeedFactor(profile: 'motorbike' | 'l300_van' | 'foot'): number {
  if (profile === 'motorbike') return 1.12;
  if (profile === 'foot') return 0.18;
  return 0.9;
}

function solveSingleLegOnGraph(
  rawOrigin: LatLng,
  rawTarget: LatLng,
  options: FallbackGraphOptions
): {
  edges: DirectedEdge[];
  usedAvoidanceDetour: boolean;
} {
  const origin = clampToCaviteBounds(rawOrigin);
  const target = clampToCaviteBounds(rawTarget);
  const profile = options.profile ?? 'motorbike';
  const mode = options.optimizationMode ?? 'fastest';
  const obstacles = options.obstacles ?? CAVITE_OBSTACLES;
  const userBlocks = obstacles.filter((o) => o.type === 'block');
  const nonBlockObstacles = obstacles.filter((o) => o.type !== 'block');
  const penalizeEdges = options.penalizeEdges ?? new Set<string>();

  const START_ID = '__origin__';
  const END_ID = '__target__';

  // Rank graph nodes by proximity to origin and target
  const sortedByOrigin = [...GRAPH_NODES]
    .map((node) => ({ node, dist: haversineMeters(origin, node) }))
    .sort((a, b) => a.dist - b.dist);

  const sortedByTarget = [...GRAPH_NODES]
    .map((node, _i) => ({ node, dist: haversineMeters(target, node) }))
    .sort((a, b) => a.dist - b.dist);

  const buildVirtualEdgesFromOrigin = (allowBlocked: boolean): DirectedEdge[] => {
    const out: DirectedEdge[] = [];
    for (const { node } of sortedByOrigin) {
      const coords = densifySegmentCoords(origin, node, 90);
      if (!allowBlocked && isPolylineBlockedByUserBlock(coords, userBlocks)) {
        continue;
      }
      const cum = computeCumulativeDistances(coords);
      const d = cum[cum.length - 1] ?? haversineMeters(origin, node);
      out.push({
        edgeKey: `origin::${node.id}`,
        from: START_ID,
        to: node.id,
        streetName: `${node.municipality} Access Road`,
        highwayClass: 'subdivision',
        speedKmh: 24,
        coords,
        distanceMeters: d,
      });
      if (out.length >= 5) break;
    }
    return out;
  };

  const buildVirtualEdgesToTarget = (allowBlocked: boolean): Map<string, DirectedEdge> => {
    const out = new Map<string, DirectedEdge>();
    for (const { node } of sortedByTarget) {
      const coords = densifySegmentCoords(node, target, 90);
      if (!allowBlocked && isPolylineBlockedByUserBlock(coords, userBlocks)) {
        continue;
      }
      const cum = computeCumulativeDistances(coords);
      const d = cum[cum.length - 1] ?? haversineMeters(node, target);
      out.set(node.id, {
        edgeKey: `${node.id}::target`,
        from: node.id,
        to: END_ID,
        streetName: `${node.municipality} NAP Service Street`,
        highwayClass: 'subdivision',
        speedKmh: 24,
        coords,
        distanceMeters: d,
      });
      if (out.size >= 5) break;
    }
    return out;
  };

  const runDijkstra = (strictBlockAvoidance: boolean): DirectedEdge[] | null => {
    const startEdges = buildVirtualEdgesFromOrigin(!strictBlockAvoidance ? true : false);
    const targetEdgeByNode = buildVirtualEdgesToTarget(!strictBlockAvoidance ? true : false);
    if (startEdges.length === 0 || targetEdgeByNode.size === 0) {
      return null;
    }

    const distScore = new Map<string, number>([[START_ID, 0]]);
    const prevEdge = new Map<string, DirectedEdge>();
    const visited = new Set<string>();
    const frontier = new Set<string>([START_ID]);

    const speedScale = profileSpeedFactor(profile);

    const computeEdgeWeight = (edge: DirectedEdge): number | null => {
      const hitBlock = isPolylineBlockedByUserBlock(edge.coords, userBlocks);
      if (hitBlock && strictBlockAvoidance) {
        return null;
      }

      const effectiveSpeedMps = Math.max(
        1.4,
        ((edge.speedKmh * speedScale) * 1000) / 3600
      );
      let timeSeconds = edge.distanceMeters / effectiveSpeedMps;

      if (nonBlockObstacles.length > 0 && mode !== 'shortest') {
        const obsEval = evaluateRouteObstacles(edge.coords, nonBlockObstacles);
        timeSeconds += obsEval.obstaclePenaltySeconds;
      }

      let weight = mode === 'shortest' ? edge.distanceMeters : timeSeconds;
      if (mode === 'smooth' && edge.highwayClass !== 'primary') {
        weight *= 1.28;
      } else if (mode === 'subdivision' && edge.highwayClass === 'primary') {
        weight *= 1.18;
      }

      if (penalizeEdges.has(edge.edgeKey)) {
        weight *= 1.65;
      }
      if (hitBlock) {
        weight += 500_000;
      }
      return weight;
    };

    while (frontier.size > 0) {
      let current: string | null = null;
      let bestCost = Infinity;
      for (const id of frontier) {
        const c = distScore.get(id) ?? Infinity;
        if (c < bestCost) {
          bestCost = c;
          current = id;
        }
      }

      if (current === null) break;
      if (current === END_ID) {
        const chain: DirectedEdge[] = [];
        let cursor = END_ID;
        while (cursor !== START_ID) {
          const incoming = prevEdge.get(cursor);
          if (!incoming) break;
          chain.unshift(incoming);
          cursor = incoming.from;
        }
        return chain;
      }

      frontier.delete(current);
      visited.add(current);

      const outgoing: DirectedEdge[] =
        current === START_ID
          ? startEdges
          : [...(adjacency.get(current) ?? [])];

      const exitEdge = targetEdgeByNode.get(current);
      if (exitEdge) {
        outgoing.push(exitEdge);
      }

      for (const edge of outgoing) {
        if (visited.has(edge.to)) continue;
        const w = computeEdgeWeight(edge);
        if (w === null) continue;
        const nextCost = bestCost + w;
        if (nextCost < (distScore.get(edge.to) ?? Infinity)) {
          distScore.set(edge.to, nextCost);
          prevEdge.set(edge.to, edge);
          frontier.add(edge.to);
        }
      }
    }

    return null;
  };

  const unblockedChain = runDijkstra(true);
  if (unblockedChain && unblockedChain.length > 0) {
    return {
      edges: unblockedChain,
      usedAvoidanceDetour: userBlocks.length > 0,
    };
  }

  // Local geometric street detour when a block sits directly on a micro-corridor
  if (userBlocks.length > 0) {
    const primaryBlock = userBlocks[0];
    for (const side of [1, -1] as const) {
      const bypass = clampToCaviteBounds(
        computeAvoidanceWaypoint(origin, target, primaryBlock, 260, side)
      );
      const legA = densifySegmentCoords(origin, bypass, 80);
      const legB = densifySegmentCoords(bypass, target, 80);
      if (
        !isPolylineBlockedByUserBlock(legA, userBlocks) &&
        !isPolylineBlockedByUserBlock(legB, userBlocks)
      ) {
        const dA = haversineMeters(origin, bypass);
        const dB = haversineMeters(bypass, target);
        return {
          edges: [
            {
              edgeKey: 'local-detour-a',
              from: START_ID,
              to: '__bypass__',
              streetName: 'Municipal Bypass Street',
              highwayClass: 'municipal',
              speedKmh: 26,
              coords: legA,
              distanceMeters: dA,
            },
            {
              edgeKey: 'local-detour-b',
              from: '__bypass__',
              to: END_ID,
              streetName: 'Subdivision NAP Connector',
              highwayClass: 'subdivision',
              speedKmh: 24,
              coords: legB,
              distanceMeters: dB,
            },
          ],
          usedAvoidanceDetour: true,
        };
      }
    }
  }

  const relaxed = runDijkstra(false);
  if (relaxed && relaxed.length > 0) {
    return { edges: relaxed, usedAvoidanceDetour: false };
  }

  const directCoords = densifySegmentCoords(origin, target, 90);
  return {
    edges: [
      {
        edgeKey: 'direct-local',
        from: START_ID,
        to: END_ID,
        streetName: 'Cavite Local Access Street',
        highwayClass: 'municipal',
        speedKmh: 28,
        coords: directCoords,
        distanceMeters: haversineMeters(origin, target),
      },
    ],
    usedAvoidanceDetour: false,
  };
}

interface ConsolidatedRun {
  streetName: string;
  speedKmh: number;
  coords: LngLatTuple[];
}

function consolidateStreetRuns(edges: readonly DirectedEdge[]): ConsolidatedRun[] {
  const runs: ConsolidatedRun[] = [];
  for (const edge of edges) {
    if (edge.distanceMeters < 4 && edges.length > 1) continue;
    const prev = runs[runs.length - 1];
    if (prev && prev.streetName === edge.streetName) {
      const mergedSpeed = (prev.speedKmh + edge.speedKmh) * 0.5;
      prev.speedKmh = mergedSpeed;
      for (let i = 1; i < edge.coords.length; i++) {
        prev.coords.push(edge.coords[i]);
      }
    } else {
      runs.push({
        streetName: edge.streetName,
        speedKmh: edge.speedKmh,
        coords: edge.coords.map((c): LngLatTuple => [c[0], c[1]]),
      });
    }
  }

  // Ensure at least 2 street runs so turn-by-turn steps include depart + maneuver + arrive
  if (runs.length === 1 && runs[0].coords.length >= 4) {
    const only = runs[0];
    const mid = Math.floor(only.coords.length / 2);
    runs.splice(
      0,
      1,
      {
        streetName: only.streetName,
        speedKmh: only.speedKmh,
        coords: only.coords.slice(0, mid + 1),
      },
      {
        streetName: `${only.streetName} Service Approach`,
        speedKmh: Math.max(20, only.speedKmh - 4),
        coords: only.coords.slice(mid),
      }
    );
  }

  return runs;
}

/**
 * Deterministic offline Cavite highway & municipal street router using Dijkstra's algorithm,
 * densified Cavite corridor coordinates, obstacle/road-block avoidance, and turn maneuvers.
 */
export function routeOnCaviteFallbackGraph(
  rawOrigin: LatLng,
  rawTarget: LatLng,
  options: FallbackGraphOptions = {}
): FallbackGraphRoute {
  const origin = clampToCaviteBounds(rawOrigin);
  const target = clampToCaviteBounds(rawTarget);
  const profile = options.profile ?? 'motorbike';
  const speedScale = profileSpeedFactor(profile);

  const legWaypoints: LatLng[] = [origin];
  if (
    options.waypoint &&
    Number.isFinite(options.waypoint.lat) &&
    Number.isFinite(options.waypoint.lng)
  ) {
    legWaypoints.push(clampToCaviteBounds(options.waypoint));
  }
  legWaypoints.push(target);

  const allCoordinates: LngLatTuple[] = [];
  const segmentSpeedsMps: number[] = [];
  const steps: FallbackRouteStep[] = [];
  const legSummaries: FallbackLegSummary[] = [];

  let runningDistance = 0;
  let totalRawDuration = 0;
  let stepIndex = 0;
  let anyDetour = false;

  for (let legIdx = 0; legIdx < legWaypoints.length - 1; legIdx++) {
    const legStart = legWaypoints[legIdx];
    const legEnd = legWaypoints[legIdx + 1];
    const { edges, usedAvoidanceDetour } = solveSingleLegOnGraph(
      legStart,
      legEnd,
      options
    );
    if (usedAvoidanceDetour) anyDetour = true;

    const runs = consolidateStreetRuns(edges);
    let legDist = 0;
    let legDur = 0;
    let prevExitBearing: number | null = null;

    for (let rIdx = 0; rIdx < runs.length; rIdx++) {
      const run = runs[rIdx];
      const runCum = computeCumulativeDistances(run.coords);
      const runDist = runCum[runCum.length - 1] ?? 0;
      const runSpeedMps = Math.max(1.5, ((run.speedKmh * speedScale) * 1000) / 3600);
      const runDur = Math.max(3, Math.round(runDist / runSpeedMps));

      // Append coordinates & per-segment speeds
      const startVertex = allCoordinates.length > 0 ? 1 : 0;
      for (let k = startVertex; k < run.coords.length; k++) {
        allCoordinates.push(run.coords[k]);
      }
      const addedSegments = Math.max(0, run.coords.length - 1);
      for (let s = 0; s < addedSegments; s++) {
        segmentSpeedsMps.push(runSpeedMps);
      }

      const firstPt: LatLng = { lng: run.coords[0][0], lat: run.coords[0][1] };
      const secondPt: LatLng =
        run.coords.length > 1
          ? { lng: run.coords[1][0], lat: run.coords[1][1] }
          : firstPt;
      const entryBearing =
        run.coords.length > 1 ? bearingDegrees(firstPt, secondPt) : 0;

      const penultimatePt: LatLng =
        run.coords.length > 1
          ? {
              lng: run.coords[run.coords.length - 2][0],
              lat: run.coords[run.coords.length - 2][1],
            }
          : firstPt;
      const lastPt: LatLng = {
        lng: run.coords[run.coords.length - 1][0],
        lat: run.coords[run.coords.length - 1][1],
      };
      const exitBearing =
        run.coords.length > 1 ? bearingDegrees(penultimatePt, lastPt) : entryBearing;

      let maneuverType = 'continue';
      let maneuverModifier = 'straight';
      let instruction = `Continue on ${run.streetName}`;

      if (legIdx === 0 && rIdx === 0) {
        maneuverType = 'depart';
        maneuverModifier = 'straight';
        instruction = `Head ${cardinalFromBearing(entryBearing)} on ${run.streetName}`;
      } else if (prevExitBearing !== null) {
        const delta = angularDifference(prevExitBearing, entryBearing);
        const turn = classifyTurnTransition(delta);
        maneuverType = turn.type;
        maneuverModifier = turn.modifier;
        instruction = `${turn.verb} ${run.streetName}`;
      }

      steps.push({
        index: stepIndex++,
        legIndex: legIdx,
        instruction,
        verbalInstruction: instruction,
        streetName: run.streetName,
        maneuverType,
        maneuverModifier,
        bearingAfter: entryBearing,
        distanceMeters: runDist,
        durationSeconds: runDur,
        startDistanceMeters: runningDistance,
        endDistanceMeters: runningDistance + runDist,
        location: [run.coords[0][0], run.coords[0][1]],
      });

      runningDistance += runDist;
      legDist += runDist;
      legDur += runDur;
      totalRawDuration += runDur;
      prevExitBearing = exitBearing;
    }

    const primaryStreet =
      runs
        .slice()
        .sort((a, b) => b.coords.length - a.coords.length)[0]?.streetName ??
      'Cavite Street Corridor';

    legSummaries.push({
      legIndex: legIdx,
      distanceMeters: legDist,
      durationSeconds: legDur,
      summary: primaryStreet,
    });

    if (legIdx === legWaypoints.length - 2) {
      const lastCoord: LngLatTuple =
        allCoordinates[allCoordinates.length - 1] ?? [target.lng, target.lat];
      const lastStreet = runs[runs.length - 1]?.streetName ?? 'Destination street';
      steps.push({
        index: stepIndex++,
        legIndex: legIdx,
        instruction: `Arrive at FTTH job site on ${lastStreet}`,
        verbalInstruction: `Arrive at FTTH job site on ${lastStreet}`,
        streetName: lastStreet,
        maneuverType: 'arrive',
        maneuverModifier: 'straight',
        bearingAfter: prevExitBearing ?? 0,
        distanceMeters: 0,
        durationSeconds: 0,
        startDistanceMeters: runningDistance,
        endDistanceMeters: runningDistance,
        location: [lastCoord[0], lastCoord[1]],
      });
    }
  }

  return {
    sourceEngine: 'CaviteOfflineGraph',
    engineName: anyDetour
      ? 'Cavite Built-In Street Graph (Obstacle Detour)'
      : 'Cavite Built-In Street Graph (Dijkstra)',
    distanceMeters: runningDistance,
    rawDurationSeconds: Math.max(8, totalRawDuration),
    coordinates: allCoordinates,
    segmentSpeedsMps,
    legSummaries,
    steps,
    isDetour: anyDetour,
  };
}
