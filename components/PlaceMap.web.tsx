import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useRef, useState } from "react";
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
  JourneyStopMarker,
  PlaceMapProps,
} from "./PlaceMap.types";

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
const TILE_BASE_URL = "https://tile.openstreetmap.org";
const MIN_ZOOM = 1;
const MAX_ZOOM = 19;
const DEFAULT_CENTER = { latitude: 23, longitude: 79, zoom: 5 };
const MAX_ROUTE_SEGMENTS = 200;

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

function zoomForLatitudeDelta(latitudeDelta: number): number {
  if (!Number.isFinite(latitudeDelta) || latitudeDelta <= 0) {
    return DEFAULT_CENTER.zoom;
  }

  const zoom = Math.round(Math.log2(360 / latitudeDelta));

  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
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
}: PlaceMapProps) {
  const journeyMode =
    Array.isArray(journeyStops) && journeyStops.length > 0;

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
      zoom: clampZoom(current.zoom + 1),
    }));
  }

  function zoomOut() {
    setCenter((current) => ({
      ...current,
      zoom: clampZoom(current.zoom - 1),
    }));
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

    const routeScreenPoints = projectCoordinateList(
      routeCoordinates,
      center,
      size
    );

    const segments =
      routeScreenPoints.length > 1
        ? segmentStyles(routeScreenPoints)
        : [];

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

    return {
      tiles,
      segments,
      destinationPoint,
      placeMarkers,
      journeyMarkers,
    };
  }, [size, center, places, destination, journeyStops, routeCoordinates, journeyMode]);

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
          const key = `${tile.z}/${tile.x}/${tile.y}`;
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
                uri: `${TILE_BASE_URL}/${tile.z}/${tile.x}/${tile.y}.png`,
              }}
              style={[
                styles.tile,
                { left: tile.left, top: tile.top },
              ]}
              onError={() => {
                console.error("OSM tile failed to load:", key);
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
                left: mapData.destinationPoint.x - 16,
                top: mapData.destinationPoint.y - 32,
              },
            ]}
          >
            <View style={styles.destinationMarker}>
              <Ionicons name="star" size={15} color="#FFFFFF" />
            </View>
            <View style={styles.destinationLabel}>
              <Text style={styles.destinationLabelText}>Destination</Text>
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

        {/* Journey markers (journey mode) */}
        {journeyMode &&
          mapData.journeyMarkers.map(({ stop, point }) => {
            if (stop.kind === "source") {
              return (
                <View
                  key={stop.key}
                  style={[styles.markerAnchor, { left: point.x - 17, top: point.y - 17 }]}
                >
                  <View style={styles.sourceMarker}>
                    <Ionicons name="navigate" size={16} color="#FFFFFF" />
                  </View>
                </View>
              );
            }

            if (stop.kind === "destination") {
              return (
                <View
                  key={stop.key}
                  style={[styles.markerAnchor, { left: point.x - 16, top: point.y - 32 }]}
                >
                  <View style={styles.destinationMarker}>
                    <Ionicons name="star" size={15} color="#FFFFFF" />
                  </View>
                  <View style={styles.destinationLabel}>
                    <Text style={styles.destinationLabelText}>Destination</Text>
                  </View>
                </View>
              );
            }

            return (
              <View
                key={stop.key}
                style={[styles.markerAnchor, { left: point.x - 15, top: point.y - 15 }]}
              >
                <View style={styles.stopMarker}>
                  <View style={styles.stopMarkerDot} />
                </View>
              </View>
            );
          })}
      </View>

      {/* Zoom controls */}
      <View style={styles.zoomControls}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Zoom in"
          onPress={zoomIn}
          style={({ pressed }) => [
            styles.zoomButton,
            pressed && styles.zoomButtonPressed,
          ]}
        >
          <Ionicons name="add" size={18} color="#1C1C1E" />
        </Pressable>

        <View style={styles.zoomDivider} />

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Zoom out"
          onPress={zoomOut}
          style={({ pressed }) => [
            styles.zoomButton,
            pressed && styles.zoomButtonPressed,
          ]}
        >
          <Ionicons name="remove" size={18} color="#1C1C1E" />
        </Pressable>
      </View>

      {/* Attribution */}
      <Text style={styles.attribution} pointerEvents="none">
        © OpenStreetMap contributors
      </Text>

      {tilesBlocked && (
        <View style={styles.tileErrorBanner} pointerEvents="none">
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
    height: 4,
    backgroundColor: "#00BC26",
    borderRadius: 2,
  },
  markerAnchor: {
    position: "absolute",
    alignItems: "center",
  },
  destinationMarker: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#00BC26",
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
  destinationLabel: {
    marginTop: 2,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: "rgba(255, 255, 255, 0.94)",
  },
  destinationLabelText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#1C1C1E",
  },
  sourceMarker: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#0EA5E9",
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
  stopMarker: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#FFFFFF",
    borderWidth: 4,
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
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#00BC26",
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