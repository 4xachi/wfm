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
  Eye,
  Layers,
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

function syncMarkerBadge(
  el: HTMLElement,
  badgeText: string | null,
  accentColor?: string,
) {
  let badge = el.querySelector('.fb-marker-badge') as HTMLElement | null;
  if (!badgeText) {
    if (badge) badge.remove();
    return;
  }
  if (!badge) {
    badge = document.createElement('div');
    badge.className = 'fb-marker-badge';
    el.appendChild(badge);
  }
  if (badge.textContent !== badgeText) {
    badge.textContent = badgeText;
  }
  if (accentColor) {
    badge.style.borderColor = accentColor;
  }
}

export function CaviteMapStage({
  mode,
  workOrders = [],
  selectedWorkOrder = null,
  onSelectWorkOrder,
  napBoxes = [],
  technicians = [],
  focusedTechId = null,
  onSelectTech,
  focusMode,
  onToggleFocusMode,
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
  const lastFocusedSelectionKeyRef = useRef<string>('');
  const lastGeoJsonDataRef = useRef<{
    primary?: string;
    alt?: string;
    obs?: string;
    crumbs?: string;
    diff?: string;
  }>({});

  const [camera3D, setCamera3D] = useState(mode !== 'ops-fleet');
  const [buildings3D, setBuildings3D] = useState(mode !== 'ops-fleet');
  const [internalFocusMode, setInternalFocusMode] = useState(true);
  const [followTech, setFollowTech] = useState(false);
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

  const effectiveFocusMode =
    mode === 'ops-fleet' ? (focusMode ?? internalFocusMode) : false;

  const handleToggleFocusMode = useCallback(
    (next: boolean) => {
      setInternalFocusMode(next);
      onToggleFocusMode?.(next);
    },
    [onToggleFocusMode],
  );

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

  const activeWo = selectedWorkOrder ?? workOrders[0] ?? null;

  // Determine the focused technician for ops-fleet mode
  const focusedTech = useMemo(() => {
    if (mode !== 'ops-fleet') return null;

    if (focusedTechId) {
      const explicit = technicians.find(
        (t) =>
          t.userId === focusedTechId &&
          t.lastLat !== null &&
          t.lastLng !== null,
      );
      if (explicit) return explicit;
    }

    if (activeWo?.assignedTechId) {
      const assigned = technicians.find(
        (t) =>
          t.userId === activeWo.assignedTechId &&
          t.lastLat !== null &&
          t.lastLng !== null,
      );
      if (assigned) return assigned;
    }

    const liveTechs = technicians.filter(
      (t) =>
        t.gpsFreshness === 'LIVE' &&
        t.lastLat !== null &&
        t.lastLng !== null,
    );
    const candidatePool =
      liveTechs.length > 0
        ? liveTechs
        : technicians.filter(
            (t) =>
              t.gpsFreshness !== 'OFFLINE' &&
              t.lastLat !== null &&
              t.lastLng !== null,
          );
    if (candidatePool.length > 0 && activeWo) {
      return (
        [...candidatePool].sort((a, b) => {
          const dA = Math.hypot(
            (a.lastLat ?? 0) - activeWo.targetLat,
            (a.lastLng ?? 0) - activeWo.targetLng,
          );
          const dB = Math.hypot(
            (b.lastLat ?? 0) - activeWo.targetLat,
            (b.lastLng ?? 0) - activeWo.targetLng,
          );
          return dA - dB;
        })[0] ?? null
      );
    }

    return (
      candidatePool[0] ??
      technicians.find((t) => t.lastLat !== null && t.lastLng !== null) ??
      null
    );
  }, [mode, focusedTechId, activeWo, technicians]);

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

    if (!activeWo) return null;

    if (mode === 'ops-fleet') {
      if (
        !focusedTech ||
        focusedTech.lastLat === null ||
        focusedTech.lastLng === null
      ) {
        return null;
      }
      return {
        origin: { lat: focusedTech.lastLat, lng: focusedTech.lastLng },
        target: { lat: activeWo.targetLat, lng: activeWo.targetLng },
      };
    }

    return {
      origin: navOrigin,
      target: { lat: activeWo.targetLat, lng: activeWo.targetLng },
    };
  }, [mode, selectedDiscrepancy, activeWo, focusedTech, navOrigin]);

  // Sync GeoJSON sources onto loaded MapLibre style with deduplicated setData
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
        const primaryKey =
          activeRoute && activeRoute.coordinates.length >= 2
            ? `${activeRoute.coordinates.length}:${activeRoute.coordinates[0]?.[0].toFixed(5)},${activeRoute.coordinates[0]?.[1].toFixed(5)}->${activeRoute.coordinates[activeRoute.coordinates.length - 1]?.[0].toFixed(5)},${activeRoute.coordinates[activeRoute.coordinates.length - 1]?.[1].toFixed(5)}`
            : 'empty';
        if (lastGeoJsonDataRef.current.primary !== primaryKey) {
          lastGeoJsonDataRef.current.primary = primaryKey;
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
      }

      const altSrc = map.getSource(
        'fb-alt-routes',
      ) as maplibregl.GeoJSONSource | undefined;
      if (altSrc) {
        const altKey = (activeRoute?.alternatives ?? [])
          .map((a) => `${a.coordinates.length}:${a.distanceMeters.toFixed(1)}`)
          .join(';');
        if (lastGeoJsonDataRef.current.alt !== altKey) {
          lastGeoJsonDataRef.current.alt = altKey;
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
      }

      const obsSrc = map.getSource(
        'fb-obstacles',
      ) as maplibregl.GeoJSONSource | undefined;
      if (obsSrc) {
        const allObs = [...CAVITE_OBSTACLES, ...blocks];
        const obsKey = allObs
          .map((o) => `${o.id}:${o.lat.toFixed(5)}:${o.lng.toFixed(5)}`)
          .join(';');
        if (lastGeoJsonDataRef.current.obs !== obsKey) {
          lastGeoJsonDataRef.current.obs = obsKey;
          obsSrc.setData(
            obstaclesToGeoJson(allObs) as unknown as GeoJSON.FeatureCollection,
          );
        }
      }

      const crumbsSrc = map.getSource(
        'fb-gps-crumbs',
      ) as maplibregl.GeoJSONSource | undefined;
      if (crumbsSrc) {
        const crumbsKey = `${crumbs.length}:${crumbs[crumbs.length - 1]?.[0]?.toFixed(5) || 0}:${crumbs[crumbs.length - 1]?.[1]?.toFixed(5) || 0}`;
        if (lastGeoJsonDataRef.current.crumbs !== crumbsKey) {
          lastGeoJsonDataRef.current.crumbs = crumbsKey;
          crumbsSrc.setData({
            type: 'FeatureCollection',
            features: crumbs.map(([lng, lat]) => ({
              type: 'Feature',
              properties: {},
              geometry: { type: 'Point', coordinates: [lng, lat] },
            })),
          });
        }
      }

      const diffSrc = map.getSource(
        'fb-diff-line',
      ) as maplibregl.GeoJSONSource | undefined;
      if (diffSrc) {
        const diffKey =
          mode === 'supervisor-diff' && selectedDiscrepancy
            ? `${selectedDiscrepancy.id}:${selectedDiscrepancy.recordedLat.toFixed(5)}:${selectedDiscrepancy.capturedLat.toFixed(5)}`
            : 'none';
        if (lastGeoJsonDataRef.current.diff !== diffKey) {
          lastGeoJsonDataRef.current.diff = diffKey;
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
      zoom: mode === 'ops-fleet' ? 14.2 : 16.2,
      maxBounds: CAVITE_BOUNDS.maxBoundsLngLat,
      pitch: mode === 'ops-fleet' ? 0 : 50,
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
            layout: {
              visibility: mode === 'ops-fleet' ? 'none' : 'visible',
            },
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
    if (typeof window !== 'undefined') {
      const w = window as unknown as { __caviteMaps?: maplibregl.Map[] };
      w.__caviteMaps = w.__caviteMaps || [];
      w.__caviteMaps.push(map);
    }

    return () => {
      if (typeof window !== 'undefined') {
        const w = window as unknown as { __caviteMaps?: maplibregl.Map[] };
        if (w.__caviteMaps) {
          w.__caviteMaps = w.__caviteMaps.filter((m) => m !== map);
        }
      }
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

  const originPrecision = mode === 'ops-fleet' ? 4 : 5;
  const endpointCoordKey = resolvedEndpoints
    ? `${resolvedEndpoints.origin.lat.toFixed(originPrecision)},${resolvedEndpoints.origin.lng.toFixed(originPrecision)}->${resolvedEndpoints.target.lat.toFixed(5)},${resolvedEndpoints.target.lng.toFixed(5)}|${vehicleProfile}|${offlineMode}|${userBlocks.map((b) => b.id).join(';')}`
    : 'none';

  const resolvedEndpointsRef = useRef(resolvedEndpoints);
  resolvedEndpointsRef.current = resolvedEndpoints;

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

    const currentEndpoints = resolvedEndpointsRef.current;
    if (!currentEndpoints) {
      setRouteResult(null);
      return;
    }

    let cancelled = false;
    (async () => {
      const route = await calculateStreetRoute(
        currentEndpoints.origin,
        currentEndpoints.target,
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
        instruction:
          step0?.instruction ?? 'Proceed along Cavite primary street route',
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
                nowMs - lastPingSentMsRef.current > 1800
              ) {
                lastPingSentMsRef.current = nowMs;
                onTelemetryPingRef.current({
                  lat: frame.snappedPoint.lat,
                  lng: frame.snappedPoint.lng,
                  speedKmh: frame.speedKmh,
                });
              }
            }

            if (
              mapRef.current &&
              camera3DRef.current &&
              now - lastCameraUpdateRef.current >= 32
            ) {
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
    vehicleProfile,
    offlineMode,
    userBlocks,
    stopDrivingLoop,
    syncGeoJsonLayers,
  ]);

  // Auto-frame the active technician -> work order corridor when selection or Focus Mode changes in ops-fleet
  const selectionFocusKey =
    mode === 'ops-fleet'
      ? `${effectiveFocusMode ? 'focus' : 'all'}:${activeWo?.id ?? 'none'}:${focusedTech?.userId ?? 'none'}`
      : 'other';

  useEffect(() => {
    if (mode !== 'ops-fleet') return;
    const map = mapRef.current;
    if (!map) return;

    if (!effectiveFocusMode) {
      if (lastFocusedSelectionKeyRef.current !== selectionFocusKey) {
        lastFocusedSelectionKeyRef.current = selectionFocusKey;
        map.flyTo({ center: [120.942, 14.422], zoom: 12.6, duration: 450 });
      }
      return;
    }

    if (
      lastFocusedSelectionKeyRef.current !== selectionFocusKey &&
      resolvedEndpoints
    ) {
      const isInitialFrame = lastFocusedSelectionKeyRef.current === '';
      lastFocusedSelectionKeyRef.current = selectionFocusKey;
      const minLng = Math.min(
        resolvedEndpoints.origin.lng,
        resolvedEndpoints.target.lng,
      );
      const maxLng = Math.max(
        resolvedEndpoints.origin.lng,
        resolvedEndpoints.target.lng,
      );
      const minLat = Math.min(
        resolvedEndpoints.origin.lat,
        resolvedEndpoints.target.lat,
      );
      const maxLat = Math.max(
        resolvedEndpoints.origin.lat,
        resolvedEndpoints.target.lat,
      );
      const padLng = Math.max(0.0022, (maxLng - minLng) * 0.18);
      const padLat = Math.max(0.0022, (maxLat - minLat) * 0.18);

      map.fitBounds(
        [
          [minLng - padLng, minLat - padLat],
          [maxLng + padLng, maxLat + padLat],
        ],
        {
          padding: { top: 96, bottom: 78, left: 100, right: 64 },
          maxZoom: 15.8,
          duration: isInitialFrame ? 0 : 400,
        },
      );
    }
  }, [mode, effectiveFocusMode, selectionFocusKey, resolvedEndpoints]);

  // Follow focused technician in real time when Follow Tech is enabled on ops-fleet map
  useEffect(() => {
    if (
      mode !== 'ops-fleet' ||
      !followTech ||
      !focusedTech ||
      focusedTech.lastLat === null ||
      focusedTech.lastLng === null
    ) {
      return;
    }
    const map = mapRef.current;
    if (!map) return;
    map.easeTo({
      center: [focusedTech.lastLng, focusedTech.lastLat],
      zoom: Math.max(map.getZoom(), 15.4),
      duration: 380,
    });
  }, [mode, followTech, focusedTech, focusedTech?.lastLat, focusedTech?.lastLng]);

  // Render NAP Boxes, Work Orders, Fleet Technicians, or Discrepancy Pins with Pooled Markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // 1. NAP Split-Boxes (filtered to serving NAP in Focus Mode)
    const napsToPlot =
      effectiveFocusMode && activeWo
        ? napBoxes.filter(
            (n) =>
              n.id === activeWo.assignedNapBoxId ||
              n.id === activeWo.oldNapBoxId,
          )
        : napBoxes;

    const currentNapIds = new Set<string>();
    for (const nap of napsToPlot) {
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

    // 3. Work Order Subscriber Pins (filtered to selected work order in Focus Mode)
    const ordersToPlot =
      mode === 'ops-fleet'
        ? effectiveFocusMode
          ? activeWo
            ? [activeWo]
            : []
          : workOrders
        : selectedWorkOrder
          ? [selectedWorkOrder]
          : [];

    const currentWoIds = new Set<string>();
    for (const wo of ordersToPlot) {
      currentWoIds.add(wo.id);
      const isSelected = activeWo?.id === wo.id;
      const color =
        wo.status === 'FB_ISSUE'
          ? '#ef4444'
          : wo.status === 'CUST_ISSUE'
            ? '#f59e0b'
            : wo.status === 'COMPLETED'
              ? '#10b981'
              : '#f97316';

      const badgeLabel =
        effectiveFocusMode && isSelected
          ? `DEST • ${wo.ticketNumber} (${wo.targetBarangay})`
          : null;

      const existing = woMarkersMapRef.current.get(wo.id);
      if (existing) {
        existing.setLngLat([wo.targetLng, wo.targetLat]);
        const el = existing.getElement();
        el.style.backgroundColor = color;
        const innerSpan = el.querySelector('span') as HTMLElement | null;
        if (innerSpan) {
          innerSpan.style.transform = isSelected ? 'scale(1.2)' : 'scale(1)';
        }
        syncMarkerBadge(el, badgeLabel, '#f97316');
      } else {
        const el = document.createElement('button');
        el.type = 'button';
        el.className = 'fb-sub-pin';
        el.setAttribute('aria-label', `Work order ${wo.ticketNumber}`);
        el.style.backgroundColor = color;
        const woSpan = document.createElement('span');
        woSpan.style.color = '#fff';
        woSpan.style.fontSize = '10px';
        woSpan.style.fontWeight = '800';
        woSpan.style.display = 'inline-block';
        if (isSelected) {
          woSpan.style.transform = 'scale(1.2)';
        }
        woSpan.textContent =
          wo.workflowType === 'REPAIR'
            ? 'R'
            : wo.workflowType === 'TRANSFER'
              ? 'T'
              : 'I';
        el.appendChild(woSpan);
        syncMarkerBadge(el, badgeLabel, '#f97316');
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
      const techsToPlot =
        effectiveFocusMode && focusedTech ? [focusedTech] : technicians;
      const currentTechIds = new Set<string>();
      for (const tech of techsToPlot) {
        if (tech.lastLat === null || tech.lastLng === null) continue;
        currentTechIds.add(tech.userId);
        const isFocusedTech = focusedTech?.userId === tech.userId;
        const techBadge =
          effectiveFocusMode && isFocusedTech
            ? `TECH • ${tech.fullName.split(' ')[0]} (${tech.lastSpeedKmh ?? 0} km/h)`
            : null;
        const existing = techMarkersMapRef.current.get(tech.userId);
        if (existing) {
          existing.setLngLat([tech.lastLng, tech.lastLat]);
          const el = existing.getElement();
          el.title = `${tech.fullName} (${tech.gpsFreshness})`;
          syncMarkerBadge(el, techBadge, '#38bdf8');
        } else {
          const el = document.createElement('div');
          el.className = 'fb-tech-puck';
          el.style.cursor = 'pointer';
          el.title = `${tech.fullName} (${tech.gpsFreshness})`;
          el.innerHTML = buildTechPuckSvg(tech.vehicleType, tech.gpsFreshness);
          syncMarkerBadge(el, techBadge, '#38bdf8');
          el.onclick = (ev) => {
            ev.stopPropagation();
            onSelectTech?.(tech.userId);
          };
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
    effectiveFocusMode,
    activeWo,
    focusedTech,
    napBoxes,
    workOrders,
    selectedWorkOrder,
    technicians,
    selectedDiscrepancy,
    vehicleProfile,
    navOrigin,
    isDriving,
    onSelectWorkOrder,
    onSelectTech,
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
      style={{
        borderColor: 'var(--border-subtle)',
        contain: 'layout paint',
      }}
    >
      <div
        ref={containerRef}
        className="h-full w-full"
        style={{ contain: 'strict' }}
      />

      {/* Top-Left Tactical Turn-by-Turn / Mode HUD Banner */}
      <div
        className="pointer-events-auto absolute left-3 top-3 z-10 flex max-w-[390px] items-center gap-3 rounded-xl border px-3.5 py-2.5 shadow-lg"
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
              : mode === 'ops-fleet' && focusedTech && activeWo
                ? `${focusedTech.fullName.split(' ')[0]} (${focusedTech.lastSpeedKmh ?? 0} km/h) → ${activeWo.ticketNumber} (${activeWo.targetBarangay})`
                : hud.street}
          </div>
        </div>
        {mode !== 'supervisor-diff' && (
          <div className="font-mono-tabular shrink-0 text-base font-bold text-white">
            {formatMeters(hud.distMeters)}
          </div>
        )}
      </div>

      {/* Top-Right View & Click Placement Controls */}
      {mode !== 'supervisor-diff' && (
        <div
          className="pointer-events-auto absolute right-12 top-3 z-10 hidden sm:flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs shadow-lg"
          style={{
            backgroundColor: 'var(--hud-glass)',
            borderColor: 'rgba(148, 163, 184, 0.25)',
            color: '#e2e8f0',
          }}
        >
          {mode === 'ops-fleet' && (
            <>
              <button
                type="button"
                onClick={() => handleToggleFocusMode(true)}
                className={`inline-flex items-center gap-1 rounded-md px-2 py-1 font-semibold transition-colors ${
                  effectiveFocusMode
                    ? 'bg-orange-500 text-slate-950'
                    : 'bg-slate-800 text-slate-200'
                }`}
                title="Show only the selected work order, its assigned technician, and real-time routing"
              >
                <Eye className="h-3 w-3" aria-hidden="true" />
                Focus Selected
              </button>
              <button
                type="button"
                onClick={() => handleToggleFocusMode(false)}
                className={`inline-flex items-center gap-1 rounded-md px-2 py-1 font-medium transition-colors ${
                  !effectiveFocusMode
                    ? 'bg-orange-500 text-slate-950 font-semibold'
                    : 'bg-slate-800 text-slate-200'
                }`}
                title="Show all Cavite work orders, NAP boxes, and field technicians"
              >
                <Layers className="h-3 w-3" aria-hidden="true" />
                All Fleet ({workOrders.length})
              </button>
              <span className="mx-0.5 h-3.5 w-px bg-slate-700" aria-hidden="true" />
            </>
          )}

          {mode === 'tech-navigation' && (
            <>
              <span className="text-[11px] text-slate-400 mr-1">Map click:</span>
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
            </>
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
              {mode === 'tech-navigation' ? ` • ${hud.speedKmh} km/h` : ''}
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

          {mode === 'ops-fleet' && (
            <button
              type="button"
              onClick={() => setFollowTech((v) => !v)}
              className={`inline-flex items-center gap-1 rounded-md px-2 py-1.5 border ${
                followTech
                  ? 'border-orange-400 bg-orange-950/70 text-orange-200 font-semibold'
                  : 'border-slate-700 bg-slate-800 text-slate-300'
              }`}
              title="Automatically follow the focused technician as live GPS updates arrive"
            >
              <LocateFixed className="h-3.5 w-3.5" aria-hidden="true" />
              Follow Tech
            </button>
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
