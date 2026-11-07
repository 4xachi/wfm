import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import {
  CAVITE_BOUNDS,
  isWithinCaviteBounds,
  clampToCaviteBounds,
  haversineMeters,
  bearingDegrees,
  lerpAngle,
  projectPointOnSegment,
  computeCumulativeDistances,
  interpolateAlongRoute,
  decodePolyline6,
  encodePolyline6,
  computeTurnMetrics,
  computeRouteOverlapRatio,
  buildSpeedSegmentsGeoJson,
  GpsKalmanFilter2D,
  ViterbiRoadSnapper,
  CAVITE_OBSTACLES,
  getLocalObstaclesForCorridor,
  obstaclesToGeoJson,
  evaluateRouteObstacles,
  computeAvoidanceWaypoint,
  CAVITE_STREET_GRAPH,
  routeOnCaviteFallbackGraph,
  PROFILES,
  OPTIMIZATION_MODES,
  CAVITE_CORRIDORS,
  calculateStreetRoute,
  estimateTechnicianStreetEta,
  normalizeOsrmRoute,
  normalizeValhallaTrip,
  rankAndDeduplicateRoutes,
  searchCavitePlaces,
  reverseGeocodeCaviteStreet,
  NavigationController,
  type RoadObstacle,
  type RouteStep,
} from '@/map-engine';

describe('Cavite 3D Map & Routing Engine (FiberBlaze FTTH WFM)', () => {
  it('validates and clamps coordinates strictly to Cavite Province bounds', () => {
    expect(CAVITE_BOUNDS.minLat).toBe(14.05);
    expect(CAVITE_BOUNDS.maxLat).toBe(14.5);
    expect(CAVITE_BOUNDS.minLng).toBe(120.58);
    expect(CAVITE_BOUNDS.maxLng).toBe(121.08);

    // Valid Cavite coordinates (Imus NOC Hub & Tagaytay)
    expect(isWithinCaviteBounds(14.4294, 120.9367)).toBe(true);
    expect(isWithinCaviteBounds({ lat: 14.1165, lng: 120.9604 })).toBe(true);

    // Outside Cavite (Quezon City North / Batangas South / NaN)
    expect(isWithinCaviteBounds(14.65, 121.05)).toBe(false);
    expect(isWithinCaviteBounds({ lat: 13.92, lng: 120.45 })).toBe(false);
    expect(isWithinCaviteBounds(Number.NaN, 120.95)).toBe(false);

    // Clamping coordinates & objects
    const clampedCoord = clampToCaviteBounds(14.65, 121.22);
    expect(clampedCoord).toEqual({
      lat: CAVITE_BOUNDS.maxLat,
      lng: CAVITE_BOUNDS.maxLng,
    });
    expect(isWithinCaviteBounds(clampedCoord)).toBe(true);

    const clampedNamed = clampToCaviteBounds({
      lat: 13.88,
      lng: 120.31,
      label: 'Out-of-province pin',
    });
    expect(clampedNamed.lat).toBe(CAVITE_BOUNDS.minLat);
    expect(clampedNamed.lng).toBe(CAVITE_BOUNDS.minLng);
    expect(clampedNamed.label).toBe('Out-of-province pin');
  });

  it('computes Haversine distances, bearings, polyline6 round-trips, cumulative distances, route interpolation, and speed GeoJSON', () => {
    const bacoor = { lat: 14.4449, lng: 120.9522 };
    const eastPoint = { lat: 14.4449, lng: 120.9622 };

    const dist = haversineMeters(bacoor, eastPoint);
    expect(dist).toBeGreaterThan(1060);
    expect(dist).toBeLessThan(1095);

    const brg = bearingDegrees(bacoor, eastPoint);
    expect(Math.abs(brg - 90)).toBeLessThan(0.5);

    const northWrap = lerpAngle(359, 1, 0.5);
    expect(northWrap < 1e-6 || Math.abs(northWrap - 360) < 1e-6).toBe(true);

    // Segment projection (normal + zero-length degenerate)
    const proj = projectPointOnSegment(
      { lat: 14.4451, lng: 120.9572 },
      bacoor,
      eastPoint
    );
    expect(proj.u).toBeCloseTo(0.5, 1);
    expect(proj.distanceMeters).toBeGreaterThan(18);
    expect(proj.distanceMeters).toBeLessThan(28);

    const degen = projectPointOnSegment({ lat: 14.4451, lng: 120.9572 }, bacoor, bacoor);
    expect(degen.u).toBe(0);
    expect(degen.point).toEqual(bacoor);

    // Polyline6 encode/decode round-trip
    const cavitePolyline: [number, number][] = [
      [120.952201, 14.444902],
      [120.949104, 14.438105],
      [120.941002, 14.414801],
    ];
    const encoded = encodePolyline6(cavitePolyline, 1e-6);
    const decoded = decodePolyline6(encoded, 1e-6);
    expect(decoded).toHaveLength(cavitePolyline.length);
    for (let i = 0; i < cavitePolyline.length; i++) {
      expect(decoded[i][0]).toBeCloseTo(cavitePolyline[i][0], 5);
      expect(decoded[i][1]).toBeCloseTo(cavitePolyline[i][1], 5);
    }

    // Cumulative distances & interpolateAlongRoute
    const cum = computeCumulativeDistances(cavitePolyline);
    expect(cum[0]).toBe(0);
    expect(cum[2]).toBeGreaterThan(cum[1]);

    const midInterp = interpolateAlongRoute(cavitePolyline, cum, cum[2] * 0.5, true);
    expect(isWithinCaviteBounds(midInterp.point)).toBe(true);
    expect(midInterp.remaining).not.toBeNull();
    expect(midInterp.remaining!.length).toBeGreaterThanOrEqual(2);
    expect(midInterp.traveled!.length).toBeGreaterThanOrEqual(2);

    // Turn metrics & overlap ratio
    const sampleSteps: Partial<RouteStep>[] = [
      { maneuverType: 'depart', maneuverModifier: 'straight' },
      { maneuverType: 'turn', maneuverModifier: 'left' },
      { maneuverType: 'turn', maneuverModifier: 'sharp-right' },
      { maneuverType: 'arrive', maneuverModifier: 'straight' },
    ];
    const turnStats = computeTurnMetrics(cavitePolyline, sampleSteps);
    expect(turnStats.turnCount).toBe(2);
    expect(turnStats.sharpTurnCount).toBe(1);
    expect(turnStats.turnPenaltySeconds).toBeGreaterThanOrEqual(15);

    expect(computeRouteOverlapRatio(cavitePolyline, cavitePolyline, 25)).toBe(1);

    // Speed segments GeoJSON
    const speedGeo = buildSpeedSegmentsGeoJson(cavitePolyline, [11, 3.8], []);
    expect(speedGeo.type).toBe('FeatureCollection');
    expect(speedGeo.features).toHaveLength(2);
    expect(speedGeo.features[0].properties.congestionClass).toBe('fast');
    expect(speedGeo.features[1].properties.congestionClass).toBe('slow');
  });

  it('smooths noisy Cavite subdivision GPS pings using GpsKalmanFilter2D and predicts forward', () => {
    const kalman = new GpsKalmanFilter2D();
    kalman.reset(14.4294, 120.9367, 90, 1_000);

    // Steady eastward progression along Nueno Ave with a lateral multipath spike
    kalman.process(14.4294, 120.9372, 8, 2_000, 9.5);
    const lateralSpikeLat = 14.4294 + 0.00024; // ~26.7m lateral multipath jump
    const smoothed = kalman.process(lateralSpikeLat, 120.9377, 16, 3_000, 9.5);

    const rawLateralErrorDeg = Math.abs(lateralSpikeLat - 14.4294);
    const filteredLateralErrorDeg = Math.abs(smoothed.lat - 14.4294);
    expect(filteredLateralErrorDeg).toBeLessThan(rawLateralErrorDeg * 0.7);

    const ahead = kalman.predict(0.5);
    expect(ahead.lng).toBeGreaterThan(smoothed.lng);
  });

  it('snaps noisy telemetry onto street centerlines with ViterbiRoadSnapper and reports confidence %', () => {
    const snapper = new ViterbiRoadSnapper();
    const aguinaldoSegment: [number, number][] = [
      [120.9522, 14.4449],
      [120.9522, 14.4400],
      [120.9522, 14.4350],
      [120.9480, 14.4350],
    ];
    snapper.setRoute(aguinaldoSegment);

    // 11m lateral noise east of Aguinaldo Hwy heading south (180 deg)
    const snapped = snapper.match({
      lat: 14.4425,
      lng: 120.9523,
      bearing: 182,
    });
    expect(snapped.isSnapped).toBe(true);
    expect(snapped.isOffRoute).toBe(false);
    expect(snapped.snappedPoint.lng).toBeCloseTo(120.9522, 4);
    expect(snapped.confidence).toBeGreaterThan(0.75);
    expect(snapped.confidencePercent).toBeGreaterThanOrEqual(75);
    expect(snapped.confidencePercent).toBeLessThanOrEqual(99);
    expect(snapped.viterbiCandidatesEvaluated).toBeGreaterThanOrEqual(1);

    // Hysteresis: 1 borderline excursion (~41m) does not immediately trigger off-route, 2nd consecutive does
    const excursion1 = snapper.match(
      { lat: 14.4415, lng: 120.95259, bearing: 180 },
      { offRouteThresholdMeters: 38 }
    );
    expect(excursion1.consecutiveOffRoute).toBe(1);
    expect(excursion1.isOffRoute).toBe(false);

    const excursion2 = snapper.match(
      { lat: 14.4410, lng: 120.95260, bearing: 180 },
      { offRouteThresholdMeters: 38 }
    );
    expect(excursion2.consecutiveOffRoute).toBe(2);
    expect(excursion2.isOffRoute).toBe(true);
    expect(excursion2.confidencePercent).toBeLessThan(snapped.confidencePercent);
  });

  it('evaluates Cavite obstacles, converts to GeoJSON, and routes offline around user road blocks inside Cavite bounds', async () => {
    expect(CAVITE_OBSTACLES.length).toBeGreaterThanOrEqual(12);
    for (const obs of CAVITE_OBSTACLES) {
      expect(isWithinCaviteBounds(obs.lat, obs.lng)).toBe(true);
    }

    // Verify FiberBlaze FTTH vehicle profiles & Cavite corridors
    expect(PROFILES.motorbike.label).toContain('2-Wheeler Troubleshooter');
    expect(PROFILES.l300_van.label).toContain('L300 Fiber Splice & Install Van');
    expect(PROFILES.l300_van.valhallaCosting).toBe('auto');
    expect(PROFILES.l300_van.osrmEndpoints[0]).toContain('car');
    expect(PROFILES.foot.label).toContain('Subdivision Foot Access');
    expect(OPTIMIZATION_MODES.fastest).toBeDefined();

    const corridorKeys = Object.keys(CAVITE_CORRIDORS);
    expect(corridorKeys.length).toBeGreaterThanOrEqual(6);
    for (const corridor of Object.values(CAVITE_CORRIDORS)) {
      expect(isWithinCaviteBounds(corridor.origin)).toBe(true);
      expect(isWithinCaviteBounds(corridor.target)).toBe(true);
    }

    // Built-in Cavite fallback graph sanity check
    expect(CAVITE_STREET_GRAPH.nodes.length).toBeGreaterThanOrEqual(25);
    const directGraphRoute = routeOnCaviteFallbackGraph(
      CAVITE_CORRIDORS.bacoor.origin,
      CAVITE_CORRIDORS.bacoor.target,
      { profile: 'motorbike', optimizationMode: 'fastest' }
    );
    expect(directGraphRoute.coordinates.length).toBeGreaterThanOrEqual(5);

    // Offline / dead-zone deterministic street routing on Bacoor -> Imus / Molino corridor
    const origin = CAVITE_CORRIDORS.bacoor.origin;
    const target = CAVITE_CORRIDORS.bacoor.target;

    const baseRoute = await calculateStreetRoute(origin, target, {
      profile: 'l300_van',
      forceOfflineGraph: true,
    });

    expect(baseRoute.distanceMeters).toBeGreaterThan(1500);
    expect(baseRoute.durationSeconds).toBeGreaterThan(60);
    expect(baseRoute.steps.length).toBeGreaterThanOrEqual(3);
    expect(baseRoute.coordinates.length).toBeGreaterThanOrEqual(6);
    for (const [lng, lat] of baseRoute.coordinates) {
      expect(isWithinCaviteBounds(lat, lng)).toBe(true);
    }

    // Place a user road block directly on a midpoint vertex of the chosen route
    const midVertex = baseRoute.coordinates[Math.floor(baseRoute.coordinates.length / 2)];
    const userBlock: RoadObstacle = {
      id: 'user-block-molino-1',
      type: 'block',
      label: 'Emergency Fiber Pole Re-stringing Closure',
      lat: midVertex[1],
      lng: midVertex[0],
      delaySeconds: 900,
      radiusMeters: 45,
    };

    const corridorObs = getLocalObstaclesForCorridor(origin, target, [userBlock], null);
    expect(corridorObs.some((o) => o.id === 'user-block-molino-1')).toBe(true);

    const obsGeo = obstaclesToGeoJson(corridorObs, new Set(['user-block-molino-1']));
    expect(obsGeo.type).toBe('FeatureCollection');
    expect(
      obsGeo.features.find((f) => f.properties.id === 'user-block-molino-1')?.properties
        .onActiveRoute
    ).toBe(1);

    // Confirm the original coordinates would be flagged blocked
    const evalOnOriginal = evaluateRouteObstacles(baseRoute.coordinates, [userBlock]);
    expect(evalOnOriginal.isBlocked).toBe(true);

    const detourWaypoint = computeAvoidanceWaypoint(origin, target, userBlock, 260, 1);
    expect(haversineMeters(userBlock, detourWaypoint)).toBeGreaterThan(220);

    // Reroute with the road block active — offline Cavite street graph must detour cleanly!
    const detouredRoute = await calculateStreetRoute(origin, target, {
      profile: 'l300_van',
      obstacles: corridorObs,
      forceOfflineGraph: true,
    });

    expect(detouredRoute.isBlocked).toBe(false);
    expect(detouredRoute.steps.length).toBeGreaterThanOrEqual(3);
    for (const [lng, lat] of detouredRoute.coordinates) {
      expect(isWithinCaviteBounds(lat, lng)).toBe(true);
    }
    const postDetourCheck = evaluateRouteObstacles(detouredRoute.coordinates, [userBlock]);
    expect(postDetourCheck.isBlocked).toBe(false);

    // Also verify graceful fallback when online fetch times out / fails
    const failingFetch = async () => {
      throw new Error('Network unreachable in Cavite subdivision dead-zone');
    };
    const fallbackFromTimeout = await calculateStreetRoute(
      CAVITE_CORRIDORS.dasmarinas.origin,
      CAVITE_CORRIDORS.dasmarinas.target,
      {
        profile: 'motorbike',
        fetchImpl: failingFetch,
        timeoutMs: 200,
      }
    );
    expect(fallbackFromTimeout.steps.length).toBeGreaterThanOrEqual(3);
    expect(fallbackFromTimeout.distanceMeters).toBeGreaterThan(1000);

    // Technician Street ETA & Cavite place search / reverse geocode
    const motoEta = await estimateTechnicianStreetEta(origin, target, {
      profile: 'motorbike',
      forceOfflineGraph: true,
    });
    const vanEta = await estimateTechnicianStreetEta(origin, target, {
      profile: 'l300_van',
      forceOfflineGraph: true,
    });
    expect(motoEta.etaSeconds).toBeLessThanOrEqual(vanEta.etaSeconds);
    expect(motoEta.distanceMeters).toBeGreaterThan(1500);

    const places = await searchCavitePlaces('Salitran', { offlineOnly: true });
    expect(places.length).toBeGreaterThanOrEqual(1);
    expect(isWithinCaviteBounds(places[0])).toBe(true);

    const revLabel = await reverseGeocodeCaviteStreet(14.4449, 120.9522, { offlineOnly: true });
    expect(revLabel.toLowerCase()).toContain('bacoor');
  });

  it('advances NavigationController steps across 1x/2x/5x/10x playback and fires onOffRoute when displaced >45m', async () => {
    const route = await calculateStreetRoute(
      CAVITE_CORRIDORS.imus.origin,
      CAVITE_CORRIDORS.imus.target,
      { profile: 'motorbike', forceOfflineGraph: true }
    );

    const announcedSteps: string[] = [];
    const offRouteEvents: number[] = [];
    let reroutedCount = 0;

    const nav = new NavigationController({
      onStepChange: (step, _next, announcement) => {
        announcedSteps.push(announcement || step.instruction);
      },
      onOffRoute: (frame) => {
        offRouteEvents.push(frame.lateralDistanceMeters);
      },
      onReroute: () => {
        reroutedCount += 1;
      },
      autoReroute: true,
      rerouteOptions: { forceOfflineGraph: true },
    });

    nav.setRoute(route);
    nav.setPlaybackSpeed(10);
    expect(nav.getPlaybackSpeed()).toBe(10);

    // Advance simulation with 10x speed and 12m GPS noise until at least step 1 is reached
    let lastProgress = 0;
    for (let tick = 0; tick < 60; tick++) {
      const frame = nav.advanceSimulation(0.2, 10, 12);
      expect(frame).not.toBeNull();
      expect(frame!.routeProgressMeters).toBeGreaterThanOrEqual(lastProgress);
      expect(frame!.confidencePercent).toBeGreaterThan(0);
      lastProgress = frame!.routeProgressMeters;
      if (nav.getCurrentStepIndex() >= 1) break;
    }

    expect(nav.getCurrentStepIndex()).toBeGreaterThanOrEqual(1);
    expect(announcedSteps.length).toBeGreaterThanOrEqual(1);

    // Displace technician > 45m (~62m laterally) off the active route
    const currentPos = nav.getLastFrame()!.snappedPoint;
    const displacedLat = currentPos.lat + 0.00058; // ~64.5m north
    const displacedLng = currentPos.lng + 0.00058; // ~62.5m east (~89m total offset)

    const offFrame = nav.ingestTelemetry({
      lat: displacedLat,
      lng: displacedLng,
      accuracy: 8,
    });

    expect(offFrame).not.toBeNull();
    expect(offFrame!.lateralDistanceMeters).toBeGreaterThan(45);
    expect(offFrame!.isOffRoute).toBe(true);
    expect(offRouteEvents.length).toBeGreaterThanOrEqual(1);

    // Wait microtask/promise tick for automatic offline reroute to resolve
    await nav.waitForPendingReroute();
    expect(reroutedCount).toBe(1);
  });

  it('normalizes Valhalla & OSRM payloads, aborts hanging network endpoints on timeoutMs, and routes all 6 Cavite corridors cleanly', async () => {
    const shape = encodePolyline6([
      [120.9522, 14.4449],
      [120.9491, 14.4381],
      [120.9410, 14.4148],
    ]);

    const valhallaCandidate = normalizeValhallaTrip(
      {
        summary: { length: 3.6, time: 390 },
        legs: [
          {
            shape,
            summary: { length: 3.6, time: 390 },
            maneuvers: [
              {
                type: 1,
                instruction: 'Head south on Aguinaldo Highway.',
                street_names: ['Aguinaldo Highway'],
                length: 1.4,
                time: 150,
                begin_shape_index: 0,
              },
              {
                type: 10,
                instruction: 'Turn right onto Tanzang Luma Road.',
                street_names: ['Tanzang Luma Road'],
                length: 2.2,
                time: 240,
                begin_shape_index: 1,
              },
            ],
          },
        ],
      },
      'motorbike',
      'Valhalla motor_scooter'
    );

    const osrmCandidate = normalizeOsrmRoute(
      {
        distance: 4100,
        duration: 460,
        geometry: {
          coordinates: [
            [120.9522, 14.4449],
            [120.9694, 14.4162],
            [120.9410, 14.4148],
          ],
        },
        legs: [
          {
            distance: 4100,
            duration: 460,
            summary: 'Molino Boulevard',
            annotation: { speed: [11.5, 9.2] },
            steps: [
              {
                name: 'Molino Boulevard',
                distance: 2300,
                duration: 240,
                maneuver: { type: 'depart', modifier: 'straight', location: [120.9522, 14.4449] },
              },
              {
                name: 'Buhay na Tubig Road',
                distance: 1800,
                duration: 220,
                maneuver: { type: 'turn', modifier: 'right', location: [120.9694, 14.4162] },
              },
            ],
          },
        ],
      },
      'motorbike',
      'FOSSGIS OSRM MLD'
    );

    const ranked = rankAndDeduplicateRoutes([osrmCandidate, valhallaCandidate], 'fastest');
    expect(ranked).toHaveLength(2);
    expect(ranked[0].badge).toBe('Fastest ETA');

    // Verify hanging external network calls abort cleanly at timeoutMs and fall back to Cavite graph
    const hangingFetch = (_url: string | URL, init?: RequestInit): Promise<Response> =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });

    const tStart = performance.now();
    const timedOutFallback = await calculateStreetRoute(
      CAVITE_CORRIDORS.general_trias.origin,
      CAVITE_CORRIDORS.general_trias.target,
      {
        profile: 'l300_van',
        fetchImpl: hangingFetch,
        timeoutMs: 180,
      }
    );
    const elapsed = performance.now() - tStart;
    expect(elapsed).toBeLessThan(1200);
    expect(timedOutFallback.sourceEngine).toBe('CaviteOfflineGraph');
    expect(timedOutFallback.steps.length).toBeGreaterThanOrEqual(3);

    // Verify all 6 Cavite corridors route cleanly offline
    for (const [corridorKey, corridor] of Object.entries(CAVITE_CORRIDORS)) {
      const corridorRoute = await calculateStreetRoute(corridor.origin, corridor.target, {
        profile: 'motorbike',
        waypoint: corridor.waypoint,
        forceOfflineGraph: true,
      });
      expect(
        corridorRoute.distanceMeters,
        `Corridor ${corridorKey} must return non-trivial street distance`
      ).toBeGreaterThan(1000);
      expect(corridorRoute.steps.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('contains zero forbidden food-delivery terms anywhere in src/map-engine/', () => {
    const engineDir = path.resolve(__dirname, '../../src/map-engine');
    const files = fs.readdirSync(engineDir).filter((f) => f.endsWith('.ts'));
    expect(files.length).toBeGreaterThanOrEqual(8);

    const forbiddenPatterns = [
      /grabfood/i,
      /foodpanda/i,
      /\bmerchant\b/i,
      /\bpickup\b/i,
      /\brider\b/i,
      /delivery\s+courier/i,
    ];

    for (const fileName of files) {
      const content = fs.readFileSync(path.join(engineDir, fileName), 'utf8');
      for (const regex of forbiddenPatterns) {
        expect(
          regex.test(content),
          `Forbidden term ${regex} found in src/map-engine/${fileName}`
        ).toBe(false);
      }
    }
  });
});
