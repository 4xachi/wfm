'use client';

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import * as maplibregl from 'maplibre-gl';
import {
  Play,
  Square,
  Compass,
  Building2,
  LocateFixed,
  Maximize2,
  Ban,
  CornerUpRight,
  CornerUpLeft,
  ArrowUp,
  MapPin,
} from 'lucide-react';
import {
  CAVITE_BOUNDS,
  CAVITE_OBSTACLES,
  NavigationController,
  calculateStreetRoute,
  clampToCaviteBounds,
  obstaclesToGeoJson,
  type LatLng,
  type NavigationFrame,
  type PlaybackSpeedMultiplier,
  type RoadObstacle,
  type StreetRouteResult,
} from '@/map-engine';
import type { CaviteMapStageProps } from './mapTypes';

function formatMeters(m: number): string {
  if (!Number.isFinite(m) || m <= 0) return '0 m';
  if (m >= 1000) return `${(m / 1000).toFixed(2)} km`;
  return `${Math.round(m)} m`;
}

function formatDuration(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return '00:00';
  const mins = Math.floor(sec / 60);
  const rem = Math.floor(sec % 60);
  return `${String(mins).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
}

function buildTechPuckSvg(
  vehicleType: 'motorbike' | 'l300_van',
  freshness: 'LIVE' | 'STALE' | 'OFFLINE',
): string {
  const fill =
    freshness === 'OFFLINE'
      ? '#64748b'
      : freshness === 'STALE'
        ? '#f59e0b'
        : vehicleType === 'l300_van'
          ? '#0284c7'
          : '#10b981';

  return `
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M 20 3 L 28.4 13 A 11 11 0 1 1 11.6 13 Z" fill="${fill}" stroke="#ffffff" stroke-width="2.5" stroke-linejoin="round"/>
      <path d="M 20 7.5 L 24.5 13.5 L 20 12.2 L 15.5 13.5 Z" fill="#ffffff" fill-opacity="0.95"/>
      <circle cx="20" cy="20" r="3.75" fill="#ffffff"/>
      <circle cx="20" cy="20" r="1.75" fill="${fill}"/>
    </svg>
  `;
}

export function CaviteMapStage({
  mode,
  workOrders = [],
  selectedWorkOrder = null,
  onSelectWorkOrder,
  napBoxes = [],
  technicians = [],
  selectedDiscrepancy = null,
  activeTechPosition = null,
  vehicleProfile = 'l300_van',
  offlineMode = false,
  onTelemetryPing,
  onFieldPinCaptured,
  compactHeight = false,
}: CaviteMapStageProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const mapLoadedRef = useRef(false);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const napMarkersMapRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const woMarkersMapRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const techMarkersMapRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const diffMarkersRef = useRef<maplibregl.Marker[]>([]);
  const navMarkerRef = useRef<maplibregl.Marker | null>(null);
  const navArrowElRef = useRef<HTMLDivElement | null>(null);
  const navControllerRef = useRef<NavigationController | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number>(0);
  const lastPingSentMsRef = useRef<number>(0);
  const lastCameraUpdateRef = useRef<number>(0);
  const lastCrumbUpdateRef = useRef<number>(0);
  const initialPitchAppliedRef = useRef(false);
  const breadcrumbsRef = useRef<Array<[number, number]>>([]);

  const [camera3D, setCamera3D] = useState(true);
  const [buildings3D, setBuildings3D] = useState(true);
  const [clickAction, setClickAction] = useState<'origin' | 'pin' | 'block'>(
    mode === 'tech-navigation' ? 'block' : 'pin',
  );
  const [userBlocks, setUserBlocks] = useState<RoadObstacle[]>([]);
  const [navOrigin, setNavOrigin] = useState<LatLng>(() =>
    activeTechPosition ?? { lat: 14.4449, lng: 120.9522 },
  );
  const [routeResult, setRouteResult] = useState<StreetRouteResult | null>(
    null,
  );
  const [isDriving, setIsDriving] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] =
    useState<PlaybackSpeedMultiplier>(2);

  const camera3DRef = useRef(camera3D);
  camera3DRef.current = camera3D;
  const playbackSpeedRef = useRef(playbackSpeed);
  playbackSpeedRef.current = playbackSpeed;
  const onTelemetryPingRef = useRef(onTelemetryPing);
  onTelemetryPingRef.current = onTelemetryPing;
  const lastHudUpdateRef = useRef(0);
  const prevInstructionRef = useRef('');
  const [hud, setHud] = useState({
    instruction: 'Calculating fastest Cavite street route…',
    street: 'OpenFreeMap 3D • Cavite Graph',
    distMeters: 0,
    modifier: 'straight',
    confidence: 98,
    speedKmh: 0,
    etaSec: 0,
  });

  const stopDrivingLoop = useCallback(() => {
    if (animFrameRef.current !== null) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    setIsDriving(false);
  }, []);

  // Resolve route origin and destination based on active mode
  const resolvedEndpoints = useMemo((): {
    origin: LatLng;
    target: LatLng;
  } | null => {
    if (mode === 'supervisor-diff' && selectedDiscrepancy) {
      return {
        origin: {
          lat: selectedDiscrepancy.recordedLat,
          lng: selectedDiscrepancy.recordedLng,
        },
        target: {
          lat: selectedDiscrepancy.capturedLat,
          lng: selectedDiscrepancy.capturedLng,
        },
      };
    }

    const activeWo = selectedWorkOrder ?? workOrders[0] ?? null;
    if (!activeWo) return null;

    if (mode === 'ops-fleet') {
      const assignedTech = technicians.find(
        (t) =>
          t.userId === activeWo.assignedTechId &&
          t.lastLat !== null &&
          t.lastLng !== null,
      );
      const fallbackTech = technicians.find(
        (t) =>
          t.gpsFreshness !== 'OFFLINE' &&
          t.lastLat !== null &&
          t.lastLng !== null,
      );
      const sourceTech = assignedTech ?? fallbackTech;
      if (!sourceTech || sourceTech.lastLat === null || sourceTech.lastLng === null) {
        return null;
      }
      return {
        origin: { lat: sourceTech.lastLat, lng: sourceTech.lastLng },
        target: { lat: activeWo.targetLat, lng: activeWo.targetLng },
      };
    }

    return {
      origin: navOrigin,
      target: { lat: activeWo.targetLat, lng: activeWo.targetLng },
    };
  }, [
    mode,
    selectedDiscrepancy,
    selectedWorkOrder,
    workOrders,
    technicians,
    navOrigin,
  ]);

  // Sync GeoJSON sources onto loaded MapLibre style
  const syncGeoJsonLayers = useCallback(
    (
      map: maplibregl.Map,
      activeRoute: StreetRouteResult | null,
      blocks: RoadObstacle[],
      crumbs: Array<[number, number]>,
    ) => {
      if (!mapLoadedRef.current) return;

      const primarySrc = map.getSource(
        'fb-primary-route',
      ) as maplibregl.GeoJSONSource | undefined;
      if (primarySrc) {
        primarySrc.setData({
          type: 'FeatureCollection',
          features:
            activeRoute && activeRoute.coordinates.length >= 2
              ? [
                  {
                    type: 'Feature',
                    properties: {},
                    geometry: {
                      type: 'LineString',
                      coordinates: activeRoute.coordinates,
                    },
                  },
                ]
              : [],
        });
      }

      const altSrc = map.getSource(
        'fb-alt-routes',
      ) as maplibregl.GeoJSONSource | undefined;
      if (altSrc) {
        altSrc.setData({
          type: 'FeatureCollection',
          features: (activeRoute?.alternatives ?? []).map((alt, idx) => ({
            type: 'Feature',
            properties: { routeIndex: idx + 1 },
            geometry: {
              type: 'LineString',
              coordinates: alt.coordinates,
            },
          })),
        });
      }

      const obsSrc = map.getSource(
        'fb-obstacles',
      ) as maplibregl.GeoJSONSource | undefined;
      if (obsSrc) {
        obsSrc.setData(
          obstaclesToGeoJson([...CAVITE_OBSTACLES, ...blocks]) as unknown as GeoJSON.FeatureCollection,
        );
      }

      const crumbsSrc = map.getSource(
        'fb-gps-crumbs',
      ) as maplibregl.GeoJSONSource | undefined;
      if (crumbsSrc) {
        crumbsSrc.setData({
          type: 'FeatureCollection',
          features: crumbs.map(([lng, lat]) => ({
            type: 'Feature',
            properties: {},
            geometry: { type: 'Point', coordinates: [lng, lat] },
          })),
        });
      }

      const diffSrc = map.getSource(
        'fb-diff-line',
      ) as maplibregl.GeoJSONSource | undefined;
      if (diffSrc) {
        diffSrc.setData({
          type: 'FeatureCollection',
          features:
            mode === 'supervisor-diff' && selectedDiscrepancy
              ? [
                  {
                    type: 'Feature',
                    properties: {},
                    geometry: {
                      type: 'LineString',
                      coordinates: [
                        [
                          selectedDiscrepancy.recordedLng,
                          selectedDiscrepancy.recordedLat,
                        ],
                        [
                          selectedDiscrepancy.capturedLng,
                          selectedDiscrepancy.capturedLat,
                        ],
                      ],
                    },
                  },
                ]
              : [],
        });
      }
    },
    [mode, selectedDiscrepancy],
  );

  // Initialize MapLibre WebGL Map with OpenFreeMap Liberty + 3D Extruded Cavite Buildings
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const initialCenter: [number, number] = selectedWorkOrder
      ? [selectedWorkOrder.targetLng, selectedWorkOrder.targetLat]
      : [120.942, 14.429];

    maplibregl.setWorkerUrl('/maplibre-gl-worker.js');

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: 'https://tiles.openfreemap.org/styles/liberty',
      center: initialCenter,
      zoom: mode === 'ops-fleet' ? 12.6 : 16.2,
      maxBounds: CAVITE_BOUNDS.maxBoundsLngLat,
      pitch: 50,
      maxPitch: 56,
      bearing: 0,
      fadeDuration: 0,
      canvasContextAttributes: { preserveDrawingBuffer: false },
      trackResize: true,
      renderWorldCopies: false,
      maxTileCacheSize: 40,
    });

    map.setMissingStyleImageResolver((id: string) => {
      try {
        if (!map.hasImage(id)) {
          map.addImage(id, {
            width: 1,
            height: 1,
            data: new Uint8Array(4),
          });
        }
      } catch {
        // Silently ignore benign sprite lookup
      }
    });

    map.addControl(
      new maplibregl.NavigationControl({ visualizePitch: true }),
      'top-right',
    );

    map.on('load', () => {
      mapLoadedRef.current = true;

      // 3D Extruded Cavite Buildings (Residential 6.5m 2-storey floor + commercial render_height)
      const sources = map.getStyle()?.sources ?? {};
      const vecSource = sources.openmaptiles
        ? 'openmaptiles'
        : Object.keys(sources).find((k) => sources[k].type === 'vector');

      if (vecSource) {
        if (map.getLayer('building-3d')) {
          map.setLayoutProperty('building-3d', 'visibility', 'none');
        }
        if (!map.getLayer('fb-3d-buildings')) {
          map.addLayer({
            id: 'fb-3d-buildings',
            type: 'fill-extrusion',
            source: vecSource,
            'source-layer': 'building',
            minzoom: 15.6,
            maxzoom: 19.5,
            paint: {
              'fill-extrusion-height': [
                'max',
                6.5,
                [
                  'coalesce',
                  ['get', 'render_height'],
                  ['get', 'height'],
                  6.5,
                ],
              ],
              'fill-extrusion-base': [
                'coalesce',
                ['get', 'render_min_height'],
                ['get', 'min_height'],
                0,
              ],
              'fill-extrusion-color': '#cbd5e1',
              'fill-extrusion-opacity': 0.82,
            },
          });
        }
      }

      map.addSource('fb-alt-routes', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'fb-alt-routes-casing',
        type: 'line',
        source: 'fb-alt-routes',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#0f172a', 'line-width': 8, 'line-opacity': 0.7 },
      });
      map.addLayer({
        id: 'fb-alt-routes-line',
        type: 'line',
        source: 'fb-alt-routes',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#38bdf8', 'line-width': 4.5, 'line-opacity': 0.85 },
      });

      map.addSource('fb-primary-route', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'fb-primary-route-casing',
        type: 'line',
        source: 'fb-primary-route',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#431407', 'line-width': 10 },
      });
      map.addLayer({
        id: 'fb-primary-route-line',
        type: 'line',
        source: 'fb-primary-route',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#f97316', 'line-width': 6 },
      });

      map.addSource('fb-diff-line', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'fb-diff-line-layer',
        type: 'line',
        source: 'fb-diff-line',
        paint: {
          'line-color': '#f97316',
          'line-width': 4,
          'line-dasharray': [2, 2],
        },
      });

      map.addSource('fb-obstacles', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'fb-obstacles-layer',
        type: 'circle',
        source: 'fb-obstacles',
        paint: {
          'circle-radius': [
            'match',
            ['get', 'type'],
            'block',
            9,
            'flood',
            7,
            5.5,
          ],
          'circle-color': [
            'match',
            ['get', 'type'],
            'block',
            '#ef4444',
            'flood',
            '#f59e0b',
            'signal',
            '#10b981',
            '#e11d48',
          ],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#0f172a',
        },
      });

      map.addSource('fb-gps-crumbs', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'fb-gps-crumbs-layer',
        type: 'circle',
        source: 'fb-gps-crumbs',
        paint: {
          'circle-radius': 4.2,
          'circle-color': '#ef4444',
          'circle-stroke-width': 1.2,
          'circle-stroke-color': '#1e293b',
        },
      });
    });

    mapRef.current = map;

    return () => {
      stopDrivingLoop();
      navMarkerRef.current?.remove();
      navMarkerRef.current = null;
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      napMarkersMapRef.current.forEach((m) => m.remove());
      napMarkersMapRef.current.clear();
      woMarkersMapRef.current.forEach((m) => m.remove());
      woMarkersMapRef.current.clear();
      techMarkersMapRef.current.forEach((m) => m.remove());
      techMarkersMapRef.current.clear();
      diffMarkersRef.current.forEach((m) => m.remove());
      diffMarkersRef.current = [];
      mapLoadedRef.current = false;
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Map click handler for road blocks, origin override, or field GPS pin capture
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const handleClick = (e: maplibregl.MapMouseEvent) => {
      const clamped = clampToCaviteBounds({
        lat: e.lngLat.lat,
        lng: e.lngLat.lng,
      });

      if (clickAction === 'block') {
        const nextBlock: RoadObstacle = {
          id: `block-${Date.now()}`,
          type: 'block',
          label: 'Field Road Closure (Detour Active)',
          lat: clamped.lat,
          lng: clamped.lng,
          delaySeconds: 600,
          radiusMeters: 42,
        };
        setUserBlocks((prev) => [...prev, nextBlock]);
      } else if (clickAction === 'origin' && mode === 'tech-navigation') {
        stopDrivingLoop();
        setNavOrigin({ lat: clamped.lat, lng: clamped.lng });
      } else if (clickAction === 'pin' && onFieldPinCaptured) {
        onFieldPinCaptured({ lat: clamped.lat, lng: clamped.lng });
      }
    };

    map.on('click', handleClick);
    return () => {
      map.off('click', handleClick);
    };
  }, [clickAction, mode, onFieldPinCaptured, stopDrivingLoop]);

  // Toggle 3D camera pitch & 3D buildings layer visibility
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (initialPitchAppliedRef.current) {
      map.easeTo({ pitch: camera3D ? 50 : 0, duration: 250 });
    } else {
      initialPitchAppliedRef.current = true;
    }
    if (mapLoadedRef.current && map.getLayer('fb-3d-buildings')) {
      map.setLayoutProperty(
        'fb-3d-buildings',
        'visibility',
        buildings3D ? 'visible' : 'none',
      );
    }
  }, [camera3D, buildings3D]);

  const endpointCoordKey = resolvedEndpoints
    ? `${resolvedEndpoints.origin.lat.toFixed(5)},${resolvedEndpoints.origin.lng.toFixed(5)}->${resolvedEndpoints.target.lat.toFixed(5)},${resolvedEndpoints.target.lng.toFixed(5)}|${vehicleProfile}|${offlineMode}|${userBlocks.map((b) => b.id).join(';')}`
    : 'none';

  // Compute Cavite Street Route whenever endpoints, profile, offlineMode, or userBlocks change
  useEffect(() => {
    if (mode === 'supervisor-diff') {
      setRouteResult(null);
      const map = mapRef.current;
      if (map && selectedDiscrepancy) {
        syncGeoJsonLayers(map, null, userBlocks, []);
        map.fitBounds(
          [
            [
              Math.min(
                selectedDiscrepancy.recordedLng,
                selectedDiscrepancy.capturedLng,
              ) - 0.0015,
              Math.min(
                selectedDiscrepancy.recordedLat,
                selectedDiscrepancy.capturedLat,
              ) - 0.0015,
            ],
            [
              Math.max(
                selectedDiscrepancy.recordedLng,
                selectedDiscrepancy.capturedLng,
              ) + 0.0015,
              Math.max(
                selectedDiscrepancy.recordedLat,
                selectedDiscrepancy.capturedLat,
              ) + 0.0015,
            ],
          ],
          { padding: 60, maxZoom: 18, duration: 500 },
        );
      }
      return;
    }

    if (!resolvedEndpoints) {
      setRouteResult(null);
      return;
    }

    let cancelled = false;
    (async () => {
      const route = await calculateStreetRoute(
        resolvedEndpoints.origin,
        resolvedEndpoints.target,
        {
          profile: vehicleProfile,
          optimizationMode: 'fastest',
          obstacles: [...CAVITE_OBSTACLES, ...userBlocks],
          forceOfflineGraph: offlineMode,
          timeoutMs: 2600,
        },
      );
      if (cancelled) return;

      setRouteResult(route);
      const step0 = route.steps[0];
      setHud({
        instruction: step0?.instruction ?? 'Proceed along Cavite primary street route',
        street: `Current street: ${step0?.streetName || 'Cavite Arterial'} • ${route.engineName}`,
        distMeters: step0?.distanceMeters ?? route.distanceMeters,
        modifier: step0?.maneuverModifier || 'straight',
        confidence: 98,
        speedKmh: 0,
        etaSec: route.durationSeconds,
      });

      if (!navControllerRef.current) {
        navControllerRef.current = new NavigationController({
          onFrame: (frame: NavigationFrame) => {
            const now = performance.now();
            if (
              now - lastHudUpdateRef.current > 250 ||
              frame.currentStep.instruction !== prevInstructionRef.current
            ) {
              lastHudUpdateRef.current = now;
              prevInstructionRef.current = frame.currentStep.instruction;
              setHud({
                instruction: frame.currentStep.instruction,
                street: `Current street: ${frame.currentStep.streetName || 'Local street'}`,
                distMeters: Math.round(
                  frame.distanceToNextManeuverMeters ||
                    frame.remainingDistanceMeters,
                ),
                modifier: frame.currentStep.maneuverModifier || 'straight',
                confidence: frame.confidencePercent,
                speedKmh: frame.speedKmh,
                etaSec: frame.remainingDurationSeconds,
              });
            }

            navMarkerRef.current?.setLngLat([
              frame.displayPoint.lng,
              frame.displayPoint.lat,
            ]);
            if (navArrowElRef.current) {
              navArrowElRef.current.style.transform = `rotate(${frame.bearing.toFixed(1)}deg)`;
            }

            if (frame.newGpsPing) {
              if (now - lastCrumbUpdateRef.current >= 350) {
                lastCrumbUpdateRef.current = now;
                breadcrumbsRef.current = [
                  ...breadcrumbsRef.current.slice(-22),
                  [frame.rawPoint.lng, frame.rawPoint.lat],
                ];
                if (mapRef.current) {
                  const src = mapRef.current.getSource(
                    'fb-gps-crumbs',
                  ) as maplibregl.GeoJSONSource | undefined;
                  src?.setData({
                    type: 'FeatureCollection',
                    features: breadcrumbsRef.current.map(([lng, lat]) => ({
                      type: 'Feature',
                      properties: {},
                      geometry: { type: 'Point', coordinates: [lng, lat] },
                    })),
                  });
                }
              }

              const nowMs = Date.now();
              if (
                onTelemetryPingRef.current &&
                nowMs - lastPingSentMsRef.current > 3500
              ) {
                lastPingSentMsRef.current = nowMs;
                onTelemetryPingRef.current({
                  lat: frame.snappedPoint.lat,
                  lng: frame.snappedPoint.lng,
                  speedKmh: frame.speedKmh,
                });
              }
            }

            if (mapRef.current && camera3DRef.current && now - lastCameraUpdateRef.current >= 32) {
              lastCameraUpdateRef.current = now;
              mapRef.current.jumpTo({
                center: frame.camera.center,
                bearing: frame.camera.bearing,
                pitch: 50,
                zoom: Math.min(18.2, frame.camera.zoom),
              });
            }

            if (frame.arrived) {
              stopDrivingLoop();
              setHud((prev) => ({
                ...prev,
                instruction: 'Arrived at subscriber FTTH service location',
              }));
            }
          },
        });
      }

      breadcrumbsRef.current = [];
      navControllerRef.current.setRoute(route);

      const map = mapRef.current;
      if (map) {
        const applyWhenLoaded = () =>
          syncGeoJsonLayers(map, route, userBlocks, breadcrumbsRef.current);
        if (mapLoadedRef.current) {
          applyWhenLoaded();
        } else {
          map.once('load', applyWhenLoaded);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    mode,
    selectedDiscrepancy,
    endpointCoordKey,
    resolvedEndpoints,
    vehicleProfile,
    offlineMode,
    userBlocks,
    stopDrivingLoop,
    syncGeoJsonLayers,
  ]);

  // Render NAP Boxes, Work Orders, Fleet Technicians, or Discrepancy Pins with Pooled Markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // 1. NAP Split-Boxes
    const currentNapIds = new Set<string>();
    for (const nap of napBoxes) {
      currentNapIds.add(nap.id);
      const freeCount = nap.ports.filter((p) => p.status === 'FREE').length;
      const text = `${nap.code} (${freeCount}/${nap.totalPorts})`;
      const title = `${nap.code} • ${nap.municipality} ${nap.barangay} • ${freeCount} free ports`;
      const existing = napMarkersMapRef.current.get(nap.id);
      if (existing) {
        const el = existing.getElement();
        if (el.textContent !== text) el.textContent = text;
        if (el.title !== title) el.title = title;
      } else {
        const el = document.createElement('div');
        el.className = 'fb-nap-marker';
        el.textContent = text;
        el.title = title;
        const m = new maplibregl.Marker({ element: el })
          .setLngLat([nap.lng, nap.lat])
          .addTo(map);
        napMarkersMapRef.current.set(nap.id, m);
      }
    }
    for (const [id, marker] of napMarkersMapRef.current.entries()) {
      if (!currentNapIds.has(id)) {
        marker.remove();
        napMarkersMapRef.current.delete(id);
      }
    }

    // 2. Discrepancy Diff Pins
    diffMarkersRef.current.forEach((m) => m.remove());
    diffMarkersRef.current = [];
    if (mode === 'supervisor-diff' && selectedDiscrepancy) {
      woMarkersMapRef.current.forEach((m) => m.remove());
      woMarkersMapRef.current.clear();
      techMarkersMapRef.current.forEach((m) => m.remove());
      techMarkersMapRef.current.clear();

      const recEl = document.createElement('div');
      recEl.className = 'fb-sub-pin';
      recEl.style.backgroundColor = '#0284c7';
      recEl.title = 'Recorded Verified Subscriber Coordinate';
      const recSpan = document.createElement('span');
      recSpan.style.color = '#fff';
      recSpan.style.fontSize = '11px';
      recSpan.style.fontWeight = '700';
      recSpan.textContent = 'REC';
      recEl.appendChild(recSpan);

      const capEl = document.createElement('div');
      capEl.className = 'fb-sub-pin';
      capEl.style.backgroundColor = '#f97316';
      capEl.title = 'Field Technician Captured Coordinate';
      const capSpan = document.createElement('span');
      capSpan.style.color = '#090d12';
      capSpan.style.fontSize = '11px';
      capSpan.style.fontWeight = '700';
      capSpan.textContent = 'NEW';
      capEl.appendChild(capSpan);

      diffMarkersRef.current.push(
        new maplibregl.Marker({ element: recEl })
          .setLngLat([
            selectedDiscrepancy.recordedLng,
            selectedDiscrepancy.recordedLat,
          ])
          .addTo(map),
        new maplibregl.Marker({ element: capEl })
          .setLngLat([
            selectedDiscrepancy.capturedLng,
            selectedDiscrepancy.capturedLat,
          ])
          .addTo(map),
      );
      return;
    }

    // 3. Work Order Subscriber Pins
    const ordersToPlot =
      mode === 'ops-fleet'
        ? workOrders
        : selectedWorkOrder
          ? [selectedWorkOrder]
          : [];

    const currentWoIds = new Set<string>();
    for (const wo of ordersToPlot) {
      currentWoIds.add(wo.id);
      const isSelected = selectedWorkOrder?.id === wo.id;
      const color =
        wo.status === 'FB_ISSUE'
          ? '#ef4444'
          : wo.status === 'CUST_ISSUE'
            ? '#f59e0b'
            : wo.status === 'COMPLETED'
              ? '#10b981'
              : '#f97316';

      const existing = woMarkersMapRef.current.get(wo.id);
      if (existing) {
        existing.setLngLat([wo.targetLng, wo.targetLat]);
        const el = existing.getElement();
        el.style.backgroundColor = color;
        el.style.transform = isSelected ? 'scale(1.18)' : 'scale(1)';
      } else {
        const el = document.createElement('button');
        el.type = 'button';
        el.className = 'fb-sub-pin';
        el.setAttribute('aria-label', `Work order ${wo.ticketNumber}`);
        el.style.backgroundColor = color;
        if (isSelected) {
          el.style.transform = 'scale(1.18)';
        }
        const woSpan = document.createElement('span');
        woSpan.style.color = '#fff';
        woSpan.style.fontSize = '10px';
        woSpan.style.fontWeight = '800';
        woSpan.textContent =
          wo.workflowType === 'REPAIR'
            ? 'R'
            : wo.workflowType === 'TRANSFER'
              ? 'T'
              : 'I';
        el.appendChild(woSpan);
        el.onclick = (ev) => {
          ev.stopPropagation();
          onSelectWorkOrder?.(wo.id);
        };

        const m = new maplibregl.Marker({ element: el })
          .setLngLat([wo.targetLng, wo.targetLat])
          .addTo(map);
        woMarkersMapRef.current.set(wo.id, m);
      }
    }
    for (const [id, marker] of woMarkersMapRef.current.entries()) {
      if (!currentWoIds.has(id)) {
        marker.remove();
        woMarkersMapRef.current.delete(id);
      }
    }

    // 4. Fleet Technicians (ops-fleet) vs Active Navigation Puck (tech-navigation)
    if (mode === 'ops-fleet') {
      navMarkerRef.current?.remove();
      navMarkerRef.current = null;
      const currentTechIds = new Set<string>();
      for (const tech of technicians) {
        if (tech.lastLat === null || tech.lastLng === null) continue;
        currentTechIds.add(tech.userId);
        const existing = techMarkersMapRef.current.get(tech.userId);
        if (existing) {
          existing.setLngLat([tech.lastLng, tech.lastLat]);
        } else {
          const el = document.createElement('div');
          el.className = 'fb-tech-puck';
          el.title = `${tech.fullName} (${tech.gpsFreshness})`;
          el.innerHTML = buildTechPuckSvg(tech.vehicleType, tech.gpsFreshness);
          const m = new maplibregl.Marker({ element: el })
            .setLngLat([tech.lastLng, tech.lastLat])
            .addTo(map);
          techMarkersMapRef.current.set(tech.userId, m);
        }
      }
      for (const [id, marker] of techMarkersMapRef.current.entries()) {
        if (!currentTechIds.has(id)) {
          marker.remove();
          techMarkersMapRef.current.delete(id);
        }
      }
    } else if (mode === 'tech-navigation') {
      techMarkersMapRef.current.forEach((m) => m.remove());
      techMarkersMapRef.current.clear();
      if (!navMarkerRef.current) {
        const wrapper = document.createElement('div');
        wrapper.className = 'fb-tech-puck';
        const inner = document.createElement('div');
        inner.innerHTML = buildTechPuckSvg(vehicleProfile, 'LIVE');
        wrapper.appendChild(inner);
        navArrowElRef.current = inner;
        navMarkerRef.current = new maplibregl.Marker({ element: wrapper })
          .setLngLat([navOrigin.lng, navOrigin.lat])
          .addTo(map);
      } else {
        if (navArrowElRef.current) {
          navArrowElRef.current.innerHTML = buildTechPuckSvg(
            vehicleProfile,
            'LIVE',
          );
        }
        if (!isDriving) {
          navMarkerRef.current.setLngLat([navOrigin.lng, navOrigin.lat]);
        }
      }
    }
  }, [
    mode,
    napBoxes,
    workOrders,
    selectedWorkOrder,
    technicians,
    selectedDiscrepancy,
    vehicleProfile,
    navOrigin,
    isDriving,
    onSelectWorkOrder,
  ]);

  function startOrToggleDrive() {
    if (isDriving) {
      stopDrivingLoop();
      return;
    }
    if (!routeResult || !navControllerRef.current) return;

    setIsDriving(true);
    lastFrameTimeRef.current = performance.now();

    const step = (now: number) => {
      const dt = Math.min(0.12, (now - lastFrameTimeRef.current) / 1000);
      lastFrameTimeRef.current = now;
      const frame = navControllerRef.current?.advanceSimulation(
        dt,
        playbackSpeedRef.current,
        7,
      );
      if (frame && !frame.arrived) {
        animFrameRef.current = requestAnimationFrame(step);
      } else {
        animFrameRef.current = null;
        setIsDriving(false);
      }
    };
    animFrameRef.current = requestAnimationFrame(step);
  }

  function fitActiveRoute() {
    const map = mapRef.current;
    if (!map || !routeResult || routeResult.coordinates.length < 2) {
      map?.flyTo({ center: [120.942, 14.429], zoom: 13.2, duration: 500 });
      return;
    }
    let minLng = Infinity;
    let maxLng = -Infinity;
    let minLat = Infinity;
    let maxLat = -Infinity;
    for (const [lng, lat] of routeResult.coordinates) {
      minLng = Math.min(minLng, lng);
      maxLng = Math.max(maxLng, lng);
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
    }
    map.fitBounds(
      [
        [minLng, minLat],
        [maxLng, maxLat],
      ],
      { padding: 54, maxZoom: 16.8, duration: 550 },
    );
  }

  function centerActiveTechnician() {
    const map = mapRef.current;
    if (!map) return;
    const frame = navControllerRef.current?.getLastFrame();
    const pt = frame?.displayPoint ?? navOrigin;
    map.easeTo({
      center: [pt.lng, pt.lat],
      zoom: 17.5,
      pitch: camera3D ? 52 : 0,
      duration: 420,
    });
  }

  const TurnIcon = hud.modifier.includes('left')
    ? CornerUpLeft
    : hud.modifier.includes('right')
      ? CornerUpRight
      : ArrowUp;

  return (
    <div
      className={`relative w-full overflow-hidden rounded-xl border ${
        compactHeight ? 'h-[360px]' : 'h-[540px]'
      }`}
      style={{ borderColor: 'var(--border-subtle)' }}
    >
      <div ref={containerRef} className="h-full w-full" />

      {/* Top-Left Tactical Turn-by-Turn / Mode HUD Banner */}
      <div
        className="pointer-events-auto absolute left-3 top-3 z-10 flex max-w-[360px] items-center gap-3 rounded-xl border px-3.5 py-2.5 shadow-lg"
        style={{
          backgroundColor: 'var(--hud-glass)',
          borderColor: 'rgba(148, 163, 184, 0.25)',
          color: '#f8fafc',
        }}
      >
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border"
          style={{
            backgroundColor: 'rgba(249, 115, 22, 0.18)',
            borderColor: '#f97316',
            color: '#fb923c',
          }}
        >
          <TurnIcon className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">
            {mode === 'supervisor-diff' && selectedDiscrepancy
              ? `GPS Pin Delta: ${selectedDiscrepancy.distanceMeters.toFixed(1)} m`
              : hud.instruction}
          </div>
          <div className="truncate text-xs text-slate-300">
            {mode === 'supervisor-diff' && selectedDiscrepancy
              ? `${selectedDiscrepancy.ticketNumber} • Blue = Trusted • Orange = Field`
              : hud.street}
          </div>
        </div>
        {mode !== 'supervisor-diff' && (
          <div className="font-mono-tabular shrink-0 text-base font-bold text-white">
            {formatMeters(hud.distMeters)}
          </div>
        )}
      </div>

      {/* Top-Right Click Placement Controls */}
      {mode !== 'supervisor-diff' && (
        <div
          className="pointer-events-auto absolute right-12 top-3 z-10 hidden sm:flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs shadow-lg"
          style={{
            backgroundColor: 'var(--hud-glass)',
            borderColor: 'rgba(148, 163, 184, 0.25)',
            color: '#e2e8f0',
          }}
        >
          <span className="text-[11px] text-slate-400 mr-1">Map click:</span>
          {mode === 'tech-navigation' && (
            <button
              type="button"
              onClick={() => setClickAction('origin')}
              className={`rounded-md px-2 py-1 font-medium ${
                clickAction === 'origin'
                  ? 'bg-orange-500 text-slate-950'
                  : 'bg-slate-800 text-slate-200'
              }`}
            >
              Origin
            </button>
          )}
          {onFieldPinCaptured && (
            <button
              type="button"
              onClick={() => setClickAction('pin')}
              className={`inline-flex items-center gap-1 rounded-md px-2 py-1 font-medium ${
                clickAction === 'pin'
                  ? 'bg-orange-500 text-slate-950'
                  : 'bg-slate-800 text-slate-200'
              }`}
            >
              <MapPin className="h-3 w-3" aria-hidden="true" />
              Capture Pin
            </button>
          )}
          <button
            type="button"
            onClick={() => setClickAction('block')}
            className={`inline-flex items-center gap-1 rounded-md px-2 py-1 font-medium ${
              clickAction === 'block'
                ? 'bg-red-500 text-white'
                : 'bg-slate-800 text-slate-200'
            }`}
          >
            <Ban className="h-3 w-3" aria-hidden="true" />
            Block road
          </button>
          {userBlocks.length > 0 && (
            <button
              type="button"
              onClick={() => setUserBlocks([])}
              className="rounded-md bg-slate-700 px-2 py-1 font-mono-tabular text-[11px] text-amber-300"
            >
              Clear ({userBlocks.length})
            </button>
          )}
        </div>
      )}

      {/* Bottom Legend & Camera / Simulation Dock */}
      <div
        className="pointer-events-auto absolute bottom-3 left-3 right-3 z-10 flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs shadow-lg"
        style={{
          backgroundColor: 'var(--hud-glass)',
          borderColor: 'rgba(148, 163, 184, 0.25)',
          color: '#e2e8f0',
        }}
      >
        <div className="flex flex-wrap items-center gap-3 text-[11px]">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-3.5 rounded-sm bg-orange-500" />
            Fastest street route
          </span>
          <span className="hidden md:inline-flex items-center gap-1.5">
            <span className="h-2 w-3.5 rounded-sm bg-sky-400" />
            Alt route
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
            3D buildings &amp; NAPs
          </span>
          <span className="hidden sm:inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
            Road block / GPS drift
          </span>
          {routeResult && mode !== 'supervisor-diff' && (
            <span className="font-mono-tabular text-amber-300">
              ETA {formatDuration(hud.etaSec)} •{' '}
              {formatMeters(routeResult.distanceMeters)}
              {mode === 'tech-navigation'
                ? ` • ${hud.speedKmh} km/h • HMM ${hud.confidence}%`
                : ''}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {mode === 'tech-navigation' && (
            <>
              <button
                type="button"
                onClick={startOrToggleDrive}
                className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 font-semibold bg-orange-500 text-slate-950"
              >
                {isDriving ? (
                  <>
                    <Square className="h-3.5 w-3.5" aria-hidden="true" />
                    Pause
                  </>
                ) : (
                  <>
                    <Play className="h-3.5 w-3.5" aria-hidden="true" />
                    3D Drive
                  </>
                )}
              </button>
              <select
                aria-label="Simulation playback speed"
                value={playbackSpeed}
                onChange={(e) =>
                  setPlaybackSpeed(
                    Number(e.target.value) as PlaybackSpeedMultiplier,
                  )
                }
                className="rounded-md bg-slate-800 px-2 py-1.5 font-mono-tabular text-xs text-white border border-slate-700"
              >
                <option value={1}>1x</option>
                <option value={2}>2x</option>
                <option value={5}>5x</option>
                <option value={10}>10x</option>
              </select>
            </>
          )}

          <button
            type="button"
            onClick={() => setCamera3D((v) => !v)}
            className={`inline-flex items-center gap-1 rounded-md px-2 py-1.5 border ${
              camera3D
                ? 'border-sky-400 bg-sky-950/60 text-sky-200'
                : 'border-slate-700 bg-slate-800 text-slate-300'
            }`}
          >
            <Compass className="h-3.5 w-3.5" aria-hidden="true" />
            3D Gimbal
          </button>

          <button
            type="button"
            onClick={() => setBuildings3D((v) => !v)}
            className={`inline-flex items-center gap-1 rounded-md px-2 py-1.5 border ${
              buildings3D
                ? 'border-emerald-400 bg-emerald-950/60 text-emerald-200'
                : 'border-slate-700 bg-slate-800 text-slate-300'
            }`}
          >
            <Building2 className="h-3.5 w-3.5" aria-hidden="true" />
            3D Bldgs
          </button>

          <button
            type="button"
            onClick={fitActiveRoute}
            className="inline-flex items-center gap-1 rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 text-slate-200"
          >
            <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
            Fit route
          </button>

          {mode === 'tech-navigation' && (
            <button
              type="button"
              onClick={centerActiveTechnician}
              className="inline-flex items-center gap-1 rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 text-slate-200"
            >
              <LocateFixed className="h-3.5 w-3.5" aria-hidden="true" />
              Center
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
