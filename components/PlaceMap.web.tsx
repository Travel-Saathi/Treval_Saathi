import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import type {
  RouteCoordinate,
  PlaceMapProps,
  PlaceMapStyle,
  RouteLeg,
  RouteLegState,
} from "./PlaceMap.types";
import type { RouteAttraction } from "../services/placesApi";
import { useAppTheme } from "../src/theme/ThemeProvider";

interface AttractionMarkerEntry {
  attraction: RouteAttraction;
  point: ScreenPoint;
}

/**
 * Browser (web) implementation of PlaceMap.
 *
 * `react-native-maps` does not render on Expo Web, so this file draws the
 * same data (destination markers, place markers, journey stops, route
 * polyline) on top of a plain OpenStreetMap raster tile stack. It is fully
 * self-contained: no Leaflet/MapLibre dependency, no CSS imports, no
 * window/document at module scope, so it bundles safely with Expo web and
 * still renders during static export.
 *
 * Mobile keeps using react-native-maps (PlaceMap.native.tsx) unchanged.
 */

const TILE_SIZE = 256;
const ROAD_TILE_BASE_URL = "https://tile.openstreetmap.org";
const SATELLITE_TILE_BASE_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile";
const MIN_ZOOM = 1;
const ROAD_MAX_ZOOM = 19;
const SATELLITE_MAX_ZOOM = 18;
const DEFAULT_CENTER = { latitude: 23, longitude: 79, zoom: 5 };
const MAX_ROUTE_SEGMENTS = 200;

const ROUTE_GREEN = "#00BC26";
const ROUTE_GREEN_UPCOMING = "#46D37A";
const ROUTE_COMPLETED = "rgba(0, 188, 38, 0.32)";
const CURRENT_LOCATION_BLUE = "#1287F5";

const LEG_COLORS: Record<RouteLegState, string> = {
  completed: ROUTE_COMPLETED,
  active: ROUTE_GREEN,
  upcoming: ROUTE_GREEN_UPCOMING,
};

function hasRouteLegs(routeLegs: RouteLeg[] | undefined): routeLegs is RouteLeg[] {
  return Array.isArray(routeLegs) && routeLegs.length > 0;
}

function tileUrlFor(
  style: PlaceMapStyle,
  z: number,
  x: number,
  y: number
): string {
  if (style === "satellite") {
    // ESRI World Imagery uses the same standard Web Mercator XYZ layout,
    // but the request path is `z/y/x` (no file extension).
    return `${SATELLITE_TILE_BASE_URL}/${z}/${y}/${x}`;
  }

  return `${ROAD_TILE_BASE_URL}/${z}/${x}/${y}.png`;
}

function attributionFor(style: PlaceMapStyle): string {
  return style === "satellite"
    ? "Imagery © Esri, Maxar"
    : "© OpenStreetMap contributors";
}

interface MapCenter {
  latitude: number;
  longitude: number;
  zoom: number;
}

interface MapSize {
  width: number;
  height: number;
}

function clampLatitude(latitude: number): number {
  return Math.max(-85, Math.min(85, latitude));
}

/* --------------------------------------------------
   Web Mercator projection helpers
-------------------------------------------------- */

function worldSizeForZoom(zoom: number): number {
  return TILE_SIZE * 2 ** zoom;
}

function mercatorPoint(
  latitude: number,
  longitude: number,
  worldSize: number
): { x: number; y: number } {
  const x = ((longitude + 180) / 360) * worldSize;

  const latRad = (latitude * Math.PI) / 180;
  const sin = Math.sin(latRad);

  const y =
    (0.5 -
      Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) *
    worldSize;

  return { x, y };
}

function mercatorUnproject(
  x: number,
  y: number,
  worldSize: number
): { latitude: number; longitude: number } {
  const longitude = (x / worldSize) * 360 - 180;

  const n = Math.PI * (1 - (2 * y) / worldSize);

  const latitude =
    (180 / Math.PI) * Math.atan((Math.exp(n) - Math.exp(-n)) / 2);

  return { latitude: clampLatitude(latitude), longitude };
}

function zoomForLatitudeDelta(
  latitudeDelta: number,
  maxZoom: number = ROAD_MAX_ZOOM
): number {
  if (!Number.isFinite(latitudeDelta) || latitudeDelta <= 0) {
    return DEFAULT_CENTER.zoom;
  }

  const zoom = Math.round(Math.log2(360 / latitudeDelta));

  return Math.min(maxZoom, Math.max(MIN_ZOOM, zoom));
}

function clampZoom(zoom: number, maxZoom: number): number {
  return Math.min(maxZoom, Math.max(MIN_ZOOM, zoom));
}

interface ScreenPoint {
  x: number;
  y: number;
}

function projectToScreen(
  latitude: number,
  longitude: number,
  center: MapCenter,
  size: MapSize
): ScreenPoint {
  const worldSize = worldSizeForZoom(center.zoom);

  const centerPx = mercatorPoint(
    center.latitude,
    center.longitude,
    worldSize
  );

  const pointPx = mercatorPoint(latitude, longitude, worldSize);

  return {
    x: size.width / 2 + (pointPx.x - centerPx.x),
    y: size.height / 2 + (pointPx.y - centerPx.y),
  };
}

interface Tile {
  z: number;
  x: number;
  y: number;
  left: number;
  top: number;
}

function tilesFor(center: MapCenter, size: MapSize): Tile[] {
  const worldSize = worldSizeForZoom(center.zoom);

  const centerPx = mercatorPoint(
    center.latitude,
    center.longitude,
    worldSize
  );

  const originX = centerPx.x - size.width / 2;
  const originY = centerPx.y - size.height / 2;

  const tileSpan = 2 ** center.zoom;

  const minTileX = Math.floor(originX / TILE_SIZE);
  const minTileY = Math.floor(originY / TILE_SIZE);

  const maxTileX = Math.floor((originX + size.width) / TILE_SIZE);
  const maxTileY = Math.floor((originY + size.height) / TILE_SIZE);

  const tiles: Tile[] = [];

  for (let tileX = minTileX; tileX <= maxTileX; tileX += 1) {
    for (let tileY = minTileY; tileY <= maxTileY; tileY += 1) {
      tiles.push({
        z: center.zoom,
        x: ((tileX % tileSpan) + tileSpan) % tileSpan,
        y: ((tileY % tileSpan) + tileSpan) % tileSpan,
        left: tileX * TILE_SIZE - originX,
        top: tileY * TILE_SIZE - originY,
      });
    }
  }

  return tiles;
}

/**
 * Down-sample the route polyline so the DOM stays cheap while keeping
 * the shape of the line.
 */
function thinRoute(points: RouteCoordinate[]): RouteCoordinate[] {
  if (points.length <= MAX_ROUTE_SEGMENTS) {
    return points;
  }

  const step = Math.ceil(points.length / MAX_ROUTE_SEGMENTS);

  const thinned: RouteCoordinate[] = [];

  for (let i = 0; i < points.length; i += step) {
    thinned.push(points[i]);
  }

  if (thinned[thinned.length - 1] !== points[points.length - 1]) {
    thinned.push(points[points.length - 1]);
  }

  return thinned;
}

interface SegmentStyle {
  left: number;
  top: number;
  width: number;
  height: number;
  angleDeg: number;
}

function segmentStyles(
  points: ScreenPoint[]
): SegmentStyle[] {
  const segments: SegmentStyle[] = [];

  for (let i = 0; i + 1 < points.length; i += 1) {
    const a = points[i];
    const b = points[i + 1];

    const dx = b.x - a.x;
    const dy = b.y - a.y;

    const length = Math.hypot(dx, dy);

    if (length < 0.5) {
      continue;
    }

    segments.push({
      left: (a.x + b.x) / 2 - length / 2,
      top: (a.y + b.y) / 2,
      width: length,
      height: 4,
      angleDeg: (Math.atan2(dy, dx) * 180) / Math.PI,
    });
  }

  return segments;
}

/* --------------------------------------------------
   Component
-------------------------------------------------- */

export default function PlaceMap({
  places,
  destination,
  selectedPlace,
  initialRegion,
  onPlacePress,
  journeyStops,
  routeCoordinates,
  routeLegs,
  attractions,
  onAttractionPress,
  mapStyle = "road",
  onMapStyleChange,
  recenterRegion,
  nextStopLabel = false,
  topInset = 0,
  bottomInset = 0,
}: PlaceMapProps) {
  const journeyMode =
    Array.isArray(journeyStops) && journeyStops.length > 0;

  const { theme } = useAppTheme();

  const satellite = mapStyle === "satellite";
  const maxZoom = satellite ? SATELLITE_MAX_ZOOM : ROAD_MAX_ZOOM;

  const [size, setSize] = useState<MapSize | null>(null);
  const [tileFailures, setTileFailures] = useState<Set<string>>(
    () => new Set()
  );

  const [center, setCenter] = useState<MapCenter>(() => {
    const region = initialRegion;

    if (
      region &&
      Number.isFinite(region.latitude) &&
      Number.isFinite(region.longitude)
    ) {
      return {
        latitude: region.latitude,
        longitude: region.longitude,
        zoom: zoomForLatitudeDelta(region.latitudeDelta),
      };
    }

    if (
      destination &&
      Number.isFinite(destination.latitude) &&
      Number.isFinite(destination.longitude)
    ) {
      return {
        latitude: destination.latitude,
        longitude: destination.longitude,
        zoom: 13,
      };
    }

    const withCoords = places.filter(
      (place) =>
        Number.isFinite(place.latitude) &&
        Number.isFinite(place.longitude)
    );

    if (withCoords.length > 0) {
      return {
        latitude: withCoords[0].latitude,
        longitude: withCoords[0].longitude,
        zoom: 13,
      };
    }

    return DEFAULT_CENTER;
  });

  // Recenter when a place is selected, mirroring the native
  // `animateToRegion` behavior on react-native-maps.
  const selectedKey = selectedPlace
    ? selectedPlace.id
    : null;

  // Satellite caps at a lower zoom than the road provider, so pull the
  // view back in when switching styles (and vice-versa).
  useEffect(() => {
    setCenter((current) => {
      if (current.zoom <= maxZoom) {
        return current;
      }

      return { ...current, zoom: maxZoom };
    });
  }, [maxZoom, mapStyle]);

  useEffect(() => {
    if (
      !selectedKey ||
      !selectedPlace ||
      !Number.isFinite(selectedPlace.latitude) ||
      !Number.isFinite(selectedPlace.longitude)
    ) {
      return;
    }

    setCenter((current) => ({
      latitude: selectedPlace.latitude,
      longitude: selectedPlace.longitude,
      zoom: Math.max(current.zoom, 15),
    }));
  }, [selectedKey, selectedPlace]);

  const dragRef = useRef<{ x: number; y: number } | null>(null);

  function handleLayout(event: { nativeEvent: { layout: { width: number; height: number } } }) {
    const { width, height } = event.nativeEvent.layout;

    if (
      width > 0 &&
      height > 0 &&
      (width !== size?.width || height !== size?.height)
    ) {
      setSize({ width, height });
    }
  }

  function panByPixels(dx: number, dy: number) {
    setCenter((current) => {
      const worldSize = worldSizeForZoom(current.zoom);

      const centerPx = mercatorPoint(
        current.latitude,
        current.longitude,
        worldSize
      );

      const next = mercatorUnproject(
        centerPx.x - dx,
        centerPx.y + dy,
        worldSize
      );

      return {
        latitude: next.latitude,
        longitude: next.longitude,
        zoom: current.zoom,
      };
    });
  }

  function onResponderGrant() {
    dragRef.current = null;
  }

  function onResponderMove(
    event: { nativeEvent: { pageX: number; pageY: number; touches?: Array<{ pageX: number; pageY: number }> } }
  ) {
    const pageX =
      event.nativeEvent.touches?.[0]?.pageX ??
      event.nativeEvent.pageX;
    const pageY =
      event.nativeEvent.touches?.[0]?.pageY ??
      event.nativeEvent.pageY;

    if (dragRef.current === null) {
      dragRef.current = { x: pageX, y: pageY };
      return;
    }

    const dx = pageX - dragRef.current.x;
    const dy = pageY - dragRef.current.y;

    dragRef.current = { x: pageX, y: pageY };

    if (dx !== 0 || dy !== 0) {
      panByPixels(dx, dy);
    }
  }

  function zoomIn() {
    setCenter((current) => ({
      ...current,
      zoom: clampZoom(current.zoom + 1, maxZoom),
    }));
  }

  function zoomOut() {
    setCenter((current) => ({
      ...current,
      zoom: clampZoom(current.zoom - 1, maxZoom),
    }));
  }

  const handleRecenter = useCallback(() => {
    const target =
      recenterRegion ??
      (Number.isFinite(initialRegion.latitude) ? initialRegion : null);

    if (!target) return;

    setCenter({
      latitude: target.latitude,
      longitude: target.longitude,
      zoom: zoomForLatitudeDelta(target.latitudeDelta, maxZoom),
    });

    setTileFailures(new Set());
  }, [recenterRegion, initialRegion, maxZoom]);

  const recenterKey = useMemo(() => {
    if (!recenterRegion) return null;
    return [
      recenterRegion.latitude,
      recenterRegion.longitude,
      recenterRegion.latitudeDelta,
      recenterRegion.longitudeDelta,
    ].join("|");
  }, [recenterRegion]);

  useEffect(() => {
    if (recenterKey) handleRecenter();
  }, [recenterKey, handleRecenter]);

  function selectStyle(style: PlaceMapStyle) {
    onMapStyleChange?.(style);
    setTileFailures(new Set());
  }

  function markTileFailure(key: string) {
    setTileFailures((current) => {
      if (current.has(key)) {
        return current;
      }

      const next = new Set(current);

      next.add(key);

      return next;
    });
  }

  const rendered = useMemo(() => {
    if (!size) {
      return null;
    }

    const tiles = tilesFor(center, size);

    const legs = hasRouteLegs(routeLegs)
      ? routeLegs
      : Array.isArray(routeCoordinates) && routeCoordinates.length > 1
        ? [{ id: "route", coordinates: routeCoordinates, state: "active" as const }]
        : [];

    const segments: (SegmentStyle & { state: RouteLegState })[] = [];

    for (const leg of legs) {
      const points = projectCoordinateList(leg.coordinates, center, size);

      for (const segment of segmentStyles(points)) {
        segments.push({ ...segment, state: leg.state });
      }
    }

    const destinationPoint = destination
      ? projectToScreen(
          destination.latitude,
          destination.longitude,
          center,
          size
        )
      : null;

    const placeMarkers = places
      .map((place) => {
        if (
          !Number.isFinite(place.latitude) ||
          !Number.isFinite(place.longitude)
        ) {
          return null;
        }

        return {
          place,
          point: projectToScreen(
            place.latitude,
            place.longitude,
            center,
            size
          ),
        };
      })
      .filter((entry) => entry !== null) as {
      place: (typeof places)[number];
      point: ScreenPoint;
    }[];

    const journeyMarkers = journeyMode
      ? journeyStops
          .map((stop) => ({
            stop,
            point: projectToScreen(
              stop.latitude,
              stop.longitude,
              center,
              size
            ),
          }))
          .filter(
            (entry) =>
              Number.isFinite(entry.stop.latitude) &&
              Number.isFinite(entry.stop.longitude)
          )
      : [];

    const attractionMarkers = journeyMode
      ? (attractions ?? [])
          .map((attraction) => {
            if (
              !Number.isFinite(attraction.latitude) ||
              !Number.isFinite(attraction.longitude)
            ) {
              return null;
            }

            return {
              attraction,
              point: projectToScreen(
                attraction.latitude as number,
                attraction.longitude as number,
                center,
                size
              ),
            };
          })
          .filter((entry) => entry !== null) as AttractionMarkerEntry[]
      : [];

    return {
      tiles,
      segments,
      destinationPoint,
      placeMarkers,
      journeyMarkers,
      attractionMarkers,
    };
  }, [size, center, places, destination, journeyStops, routeCoordinates, routeLegs, journeyMode, attractions]);

  if (!size) {
    return (
      <View style={styles.fill} onLayout={handleLayout}>
        <View style={styles.measuring}>
          <ActivityIndicator size="small" color="#00BC26" />
          <Text style={styles.measuringText}>Loading map...</Text>
        </View>
      </View>
    );
  }

  // `size` is guaranteed non-null past the early return above, so the
  // memoized view data is available too.
  const mapData = rendered!;

  const tilesBlocked = tileFailures.size > 0;

  return (
    <View style={styles.fill} onLayout={handleLayout}>
      <View
        style={styles.mapLayer}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={onResponderGrant}
        onResponderMove={onResponderMove}
        onResponderTerminationRequest={() => false}
      >
        {mapData.tiles.map((tile) => {
          const key = `${mapStyle}-${tile.z}/${tile.x}/${tile.y}`;
          const failed = tileFailures.has(key);

          return failed ? (
            <View
              key={key}
              style={[styles.tile, styles.tileEmpty, { left: tile.left, top: tile.top }]}
            />
          ) : (
            <Image
              key={key}
              source={{
                uri: tileUrlFor(mapStyle, tile.z, tile.x, tile.y),
              }}
              style={[
                styles.tile,
                { left: tile.left, top: tile.top },
              ]}
              onError={() => {
                console.error("Map tile failed to load:", key);
                markTileFailure(key);
              }}
            />
          );
        })}

        {mapData.segments.map((segment, index) => (
          <View
            key={`seg-${index}`}
            style={[
              styles.routeSegment,
              {
                left: segment.left,
                top: segment.top,
                width: segment.width,
                backgroundColor: LEG_COLORS[segment.state],
                transform: [
                  {
                    rotateZ: `${segment.angleDeg}deg`,
                  },
                ],
              },
            ]}
          />
        ))}

        {/* Destination marker (place mode) */}
        {!journeyMode && mapData.destinationPoint && destination && (
          <View
            style={[
              styles.markerAnchor,
              {
                left: mapData.destinationPoint.x - 19,
                top: mapData.destinationPoint.y - 38,
              },
            ]}
          >
            <View style={styles.destinationMarker}>
              <Ionicons name="star" size={17} color="#FFFFFF" />
            </View>
            <View style={[styles.destinationLabel, { backgroundColor: theme.surface }]}>
              <Text style={[styles.destinationLabelText, { color: theme.text }]}>Destination</Text>
            </View>
          </View>
        )}

        {/* Place markers (place mode) */}
        {!journeyMode &&
          mapData.placeMarkers.map(({ place, point }) => {
            const isSelected =
              selectedPlace && place.id === selectedPlace.id;
            const isFinite = Number.isFinite(point.x) && Number.isFinite(point.y);

            return (
              <Pressable
                key={place.id}
                accessibilityRole="button"
                accessibilityLabel={place.name ?? undefined}
                onPress={() => onPlacePress?.(place)}
                style={[
                  styles.markerAnchor,
                  { left: point.x - 16, top: point.y - 16 },
                  !isFinite && styles.hidden,
                ]}
              >
                <View
                  style={[
                    styles.placeMarker,
                    isSelected ? styles.placeMarkerSelected : styles.placeMarkerDefault,
                  ]}
                >
                  <View
                    style={[
                      styles.placeMarkerCenter,
                      isSelected && styles.placeMarkerCenterSelected,
                    ]}
                  />
                </View>
              </Pressable>
            );
          })}

        {/* Attraction markers (journey mode) */}
        {journeyMode &&
          mapData.attractionMarkers.map(({ attraction, point }) => (
            <Pressable
              key={attraction.id}
              accessibilityRole="button"
              accessibilityLabel={attraction.name ?? undefined}
              onPress={() => onAttractionPress?.(attraction)}
              style={[
                styles.markerAnchor,
                { left: point.x - 15, top: point.y - 15 },
              ]}
            >
              <View style={styles.attractionMarker}>
                <Ionicons name="camera" size={14} color="#FFFFFF" />
              </View>
            </Pressable>
          ))}

        {/* Journey markers (journey mode) */}
        {journeyMode &&
          mapData.journeyMarkers.map(({ stop, point }) => {
            if (stop.kind === "source") {
              return (
                <View
                  key={stop.key}
                  style={[styles.markerAnchor, { left: point.x - 27, top: point.y - 27 }]}
                >
                  <View style={styles.sourceHalo} />
                  <View style={styles.sourceMarker}>
                    <View style={styles.sourceDot} />
                  </View>
                </View>
              );
            }

            if (stop.kind === "destination") {
              return (
                <View
                  key={stop.key}
                  style={[styles.markerAnchor, { left: point.x - 19, top: point.y - 38 }]}
                >
                  <View style={styles.destinationMarker}>
                    <Ionicons name="star" size={17} color="#FFFFFF" />
                  </View>
                  <View style={[styles.destinationLabel, { backgroundColor: theme.surface }]}>
                    <Text style={[styles.destinationLabelText, { color: theme.text }]}>
                      {nextStopLabel ? "Next Stop" : "Destination"}
                    </Text>
                  </View>
                </View>
              );
            }

            return (
              <View
                key={stop.key}
                style={[styles.markerAnchor, { left: point.x - 12, top: point.y - 12 }]}
              >
                <View style={styles.stopMarker}>
                  <View style={styles.stopMarkerDot} />
                </View>
              </View>
            );
          })}
      </View>

      {/* Map style control */}
      <View
        style={[
          styles.stylePill,
          { top: 14 + topInset, backgroundColor: theme.surface, borderColor: theme.border },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Road map"
          accessibilityState={{ selected: !satellite }}
          onPress={() => selectStyle("road")}
          style={({ pressed }) => [
            styles.styleOption,
            !satellite && styles.styleOptionActive,
            pressed && styles.zoomButtonPressed,
          ]}
        >
          {!satellite ? (
            <Ionicons name="map" size={13} color="#FFFFFF" />
          ) : (
            <Ionicons name="map-outline" size={13} color={theme.textSecondary} />
          )}
          <Text
            style={[
              styles.styleOptionText,
              !satellite && styles.styleOptionTextActive,
              { color: !satellite ? "#FFFFFF" : theme.textSecondary },
            ]}
          >
            Road
          </Text>
        </Pressable>
        <View style={[styles.styleDivider, { backgroundColor: theme.border }]} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Satellite map"
          accessibilityState={{ selected: satellite }}
          onPress={() => selectStyle("satellite")}
          style={({ pressed }) => [
            styles.styleOption,
            satellite && styles.styleOptionActive,
            pressed && styles.zoomButtonPressed,
          ]}
        >
          {satellite ? (
            <Ionicons name="earth" size={13} color="#FFFFFF" />
          ) : (
            <Ionicons name="earth-outline" size={13} color={theme.textSecondary} />
          )}
          <Text
            style={[
              styles.styleOptionText,
              satellite && styles.styleOptionTextActive,
              { color: satellite ? "#FFFFFF" : theme.textSecondary },
            ]}
          >
            Satellite
          </Text>
        </Pressable>
      </View>

      {/* Zoom controls */}
      <View
        style={[
          styles.zoomControls,
          { top: 62 + topInset, backgroundColor: theme.surface, borderColor: theme.border },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Zoom in"
          onPress={zoomIn}
          style={({ pressed }) => [
            styles.zoomButton,
            pressed && styles.zoomButtonPressed,
          ]}
        >
          <Ionicons name="add" size={18} color={theme.text} />
        </Pressable>

        <View style={[styles.zoomDivider, { backgroundColor: theme.border }]} />

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Zoom out"
          onPress={zoomOut}
          style={({ pressed }) => [
            styles.zoomButton,
            pressed && styles.zoomButtonPressed,
          ]}
        >
          <Ionicons name="remove" size={18} color={theme.text} />
        </Pressable>
      </View>

      {/* My location / re-centre */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="My location"
        onPress={handleRecenter}
        style={({ pressed }) => [
          styles.locateButton,
          { top: 147 + topInset, backgroundColor: theme.surface, borderColor: theme.border },
          pressed && styles.zoomButtonPressed,
        ]}
      >
        <Ionicons name="locate" size={18} color="#00BC26" />
        <View
          style={[
            styles.locatePing,
            { backgroundColor: satellite ? "#FFFFFF" : "#00BC26", borderColor: theme.surface },
          ]}
        />
      </Pressable>

      {/* Attribution */}
      <Text
        style={[
          styles.attribution,
          { bottom: 8 + bottomInset, backgroundColor: theme.surface, color: theme.textSecondary },
        ]}
        pointerEvents="none"
      >
        {attributionFor(mapStyle)}
      </Text>

      {tilesBlocked && (
        <View style={[styles.tileErrorBanner, { bottom: 28 + bottomInset }]} pointerEvents="none">
          <Ionicons name="cloud-offline-outline" size={16} color="#B42318" />
          <Text style={styles.tileErrorText}>
            Map tiles unavailable. Please check your connection.
          </Text>
        </View>
      )}
    </View>
  );
}

/**
 * Project a coordinate list to screen pixels (thinned to keep the
 * polyline DOM light). Wrapped in a tiny helper so useMemo reads cleanly.
 */
function projectCoordinateList(
  coordinates: RouteCoordinate[] | undefined,
  center: MapCenter,
  size: MapSize
): ScreenPoint[] {
  if (!Array.isArray(coordinates) || coordinates.length === 0) {
    return [];
  }

  const thinned = thinRoute(coordinates);

  return thinned.map((point) =>
    projectToScreen(point.latitude, point.longitude, center, size)
  );
}

const styles = StyleSheet.create({
  fill: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
    backgroundColor: "#EDEFF2",
  },
  measuring: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  measuringText: {
    fontSize: 13,
    color: "#6B7280",
  },
  mapLayer: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
  },
  tile: {
    position: "absolute",
    width: TILE_SIZE,
    height: TILE_SIZE,
    backgroundColor: "transparent",
  },
  tileEmpty: {
    backgroundColor: "#E2E5E9",
  },
  routeSegment: {
    position: "absolute",
    height: 8,
    backgroundColor: ROUTE_GREEN,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: "rgba(255, 255, 255, 0.95)",
    boxShadow: "0 1px 3px rgba(0, 0, 0, 0.3)",
  },
  markerAnchor: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  destinationMarker: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#00BC26",
    borderWidth: 3,
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000000",
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: {
      width: 0,
      height: 3,
    },
    elevation: 4,
  },
  destinationLabel: {
    marginTop: 2,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
  },
  destinationLabelText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#1C1C1E",
  },
  sourceHalo: {
    position: "absolute",
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: "rgba(18, 135, 245, 0.18)",
  },
  sourceMarker: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: CURRENT_LOCATION_BLUE,
    borderWidth: 2,
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000000",
    shadowOpacity: 0.25,
    shadowRadius: 5,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    elevation: 4,
  },
  sourceDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#FFFFFF",
  },
  stopMarker: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    borderWidth: 3,
    borderColor: "#00BC26",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000000",
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    elevation: 3,
  },
  stopMarkerDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: "#00BC26",
  },
  attractionMarker: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#F59E0B",
    borderWidth: 2,
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000000",
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    elevation: 3,
  },
  placeMarker: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000000",
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    elevation: 3,
  },
  placeMarkerDefault: {
    backgroundColor: "#64748B",
  },
  placeMarkerSelected: {
    backgroundColor: "#00BC26",
  },
  placeMarkerCenter: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#FFFFFF",
    opacity: 0.85,
  },
  placeMarkerCenterSelected: {
    opacity: 1,
  },
  zoomControls: {
    position: "absolute",
    right: 14,
    top: 14,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    overflow: "hidden",
    shadowColor: "#000000",
    shadowOpacity: 0.1,
    shadowRadius: 6,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    elevation: 3,
  },
  zoomButton: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
  },
  zoomButtonPressed: {
    backgroundColor: "#F0F1F3",
  },
  zoomDivider: {
    height: 1,
    backgroundColor: "#E5E7EB",
  },
  stylePill: {
    position: "absolute",
    left: 14,
    top: 14,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    padding: 3,
    shadowColor: "#000000",
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: {
      width: 0,
      height: 3,
    },
    elevation: 4,
  },
  styleOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 9,
  },
  styleOptionActive: {
    backgroundColor: "#00BC26",
  },
  styleOptionText: {
    fontSize: 12,
    fontWeight: "700",
  },
  styleOptionTextActive: {
    color: "#FFFFFF",
  },
  styleDivider: {
    width: 1,
    height: 16,
  },
  locateButton: {
    position: "absolute",
    right: 14,
    top: 62,
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000000",
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: {
      width: 0,
      height: 3,
    },
    elevation: 4,
  },
  locatePing: {
    position: "absolute",
    right: 6,
    top: 6,
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 2,
  },
  attribution: {
    position: "absolute",
    left: 10,
    bottom: 8,
    fontSize: 11,
    color: "#3A3F45",
    backgroundColor: "rgba(255,255,255,0.82)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  tileErrorBanner: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 28,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: "#FDECEA",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  tileErrorText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    color: "#B42318",
  },
  hidden: {
    opacity: 0,
  },
});