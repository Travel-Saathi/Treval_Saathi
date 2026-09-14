import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import PlaceMap from "../PlaceMap";
import type {
  JourneyStopMarker,
  PlaceMapRegion,
  PlaceMapStyle,
  RouteLeg,
  RouteLegState,
  RouteSegment,
} from "../PlaceMap.types";
import { getJourneyRoute, resolveCityCoordinates } from "../../services/routeApi";
import type { RouteAttraction } from "../../services/placesApi";
import { BlockError, BlockLoading, SectionTitle } from "./primitives";
import { useAppTheme } from "../../src/theme/ThemeProvider";

interface CityCoords { latitude: number; longitude: number; }

interface RouteStats { distanceKilometers: number | null; durationMinutes: number | null; }

interface ResolvedMap {
  markers: JourneyStopMarker[];
  routeCoordinates: CityCoords[];
  routeStats: RouteStats | null;
  region: PlaceMapRegion;
  legs: RouteLeg[];
  nextStopName: string | null;
  segments: RouteSegment[] | null;
  warnings: string[];
  routeLabel: string | null;
}

function computeRegion(points: JourneyStopMarker[]): PlaceMapRegion {
  const valid = points.filter((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude));
  if (valid.length === 0) return { latitude: 23.0, longitude: 79.0, latitudeDelta: 12, longitudeDelta: 12 };
  const latitudes = valid.map((point) => point.latitude);
  const longitudes = valid.map((point) => point.longitude);
  const minLat = Math.min(...latitudes);
  const maxLat = Math.max(...latitudes);
  const minLon = Math.min(...longitudes);
  const maxLon = Math.max(...longitudes);
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLon + maxLon) / 2,
    latitudeDelta: Math.max(maxLat - minLat, 0.05) * 1.5,
    longitudeDelta: Math.max(maxLon - minLon, 0.05) * 1.5,
  };
}

function nearestRouteIndex(coords: CityCoords[], point: CityCoords): number {
  let best = 0;
  let bestDistance = Infinity;

  for (let i = 0; i < coords.length; i += 1) {
    const dLat = coords[i].latitude - point.latitude;
    const dLon = coords[i].longitude - point.longitude;
    const distance = dLat * dLat + dLon * dLon;

    if (distance < bestDistance) {
      bestDistance = distance;
      best = i;
    }
  }

  return best;
}

function splitRouteLegs(
  routeCoordinates: CityCoords[],
  stops: JourneyStopMarker[]
): CityCoords[][] {
  if (routeCoordinates.length < 2 || stops.length < 2) {
    return [];
  }

  const starts: number[] = [];

  for (const stop of stops) {
    const index = nearestRouteIndex(routeCoordinates, stop);
    const previous = starts.length > 0 ? starts[starts.length - 1] : 0;
    starts.push(Math.max(previous, index));
  }

  const legs: CityCoords[][] = [];

  for (let i = 0; i + 1 < stops.length; i += 1) {
    const from = starts[i];
    const to = Math.max(starts[i + 1], from + 1);
    legs.push(routeCoordinates.slice(from, to + 1));
  }

  return legs;
}

function resolveLegState(index: number, activeFrom: number): RouteLegState {
  if (index < activeFrom) return "completed";
  if (index === activeFrom) return "active";
  return "upcoming";
}

export default function MapSection({
  segmentCities,
  fullRouteCities,
  mapMode = "segment",
  onToggleMapMode,
  height = 360,
  attractions,
  onAttractionPress,
}: {
  segmentCities: string[];
  fullRouteCities: string[];
  mapMode?: "segment" | "full";
  onToggleMapMode?: () => void;
  height?: number;
  attractions?: RouteAttraction[];
  onAttractionPress?: (attraction: RouteAttraction) => void;
}) {
  const { theme, dark } = useAppTheme();
  const insets = useSafeAreaInsets();

  const [mapState, setMapState] = useState<"loading" | "ready" | "error">("loading");
  const [resolved, setResolved] = useState<ResolvedMap | null>(null);
  const [segmentResolved, setSegmentResolved] = useState<ResolvedMap | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [mapStyle, setMapStyle] = useState<PlaceMapStyle>("road");
  const [expanded, setExpanded] = useState(false);

  const cacheRef = useRef<Record<string, ResolvedMap>>({});

  const segmentOrigin = segmentCities[0] ?? null;
  const segmentDestination = segmentCities[1] ?? null;
  const segmentKey = segmentCities.join("|");
  const activeCities = mapMode === "segment" ? segmentCities : fullRouteCities;
  const activeKey = activeCities.join("|");

  const load = useCallback(async () => {
    const cached = cacheRef.current[activeKey];

    if (cached) {
      setResolved(cached);
      setMapState("ready");
      if (activeKey === segmentKey) setSegmentResolved(cached);
      return;
    }

    try {
      const cityNames = activeKey.split("|").filter(Boolean);

      const resolveMapData = async () => {
        const points = await Promise.all(cityNames.map((city) => resolveCityCoordinates(city)));

        if (points.some((point) => !Number.isFinite(point.latitude) || !Number.isFinite(point.longitude))) {
          throw new Error("One or more stops have invalid coordinates.");
        }

        const stopMarkers: JourneyStopMarker[] = cityNames.map((city, index) => ({
          key: `city-${index}`,
          name: city,
          latitude: points[index].latitude,
          longitude: points[index].longitude,
          kind: index === 0 ? "source" : index === cityNames.length - 1 ? "destination" : "stop",
        }));
        const region = computeRegion(stopMarkers  );
        return { stopMarkers, region };
      };

      const { stopMarkers, region } = await resolveMapData();

      // ── Map data is authoritative: markers + region always exist above.
      // ── Route data is OPTIONAL. Building the route must never make the
      //    map disappear; on failure we render the map with markers and a
      //    truthful warning instead.
      let routeCoordinates: CityCoords[] = [];
      let routeStats: { distanceKilometers: number | null; durationMinutes: number | null } | null = { distanceKilometers: null, durationMinutes: null };
      let legs: RouteLeg[] = [];
      let segments: RouteSegment[] | null = null;
      let warnings: string[] = [];
      let routeLabel: string | null = null;
      let nextStopName = segmentDestination ?? cityNames[cityNames.length - 1] ?? null;

      if (cityNames.length >= 2) {
        const coordinates: CityCoords[] = stopMarkers.map((marker) => ({
          latitude: marker.latitude,
          longitude: marker.longitude,
        }));

        try {
          const route = await getJourneyRoute(coordinates);

          if (route.coordinates.length >= 2) {
            routeCoordinates = route.coordinates;
            routeStats = {
              distanceKilometers: route.distanceKilometers,
              durationMinutes: route.durationMinutes,
            };
          } else {
            throw new Error("Empty road route.");
          }
        } catch {
          // IMPORTANT: do NOT fail the whole map. Render coordinates with a
          // truthful warning; page-level consumers show the routeLabel.
          routeCoordinates = coordinates;
          warnings = ["The route could not be built from live road data. Showing stop locations only."];
          routeLabel = nextStopName
            ? `${segmentOrigin ?? "Start"} → ${nextStopName}`
            : null;
        }
      }

      const built: ResolvedMap = {
        markers: stopMarkers,
        routeCoordinates,
        routeStats,
        region,
        legs,
        nextStopName,
        segments,
        warnings,
        routeLabel,
      };

      cacheRef.current[activeKey] = built;
      setResolved(built);
      setMapState("ready");
      if (activeKey === segmentKey) setSegmentResolved(built);
    } catch {
      setMapState("error");
    }
  }, [activeKey, segmentKey, segmentOrigin, segmentDestination]);

  useEffect(() => {
    if (activeCities.length < 2) { setMapState("error"); return; }
    if (!cacheRef.current[activeKey]) setMapState("loading");
    load();
  }, [load, attempt, activeKey, activeCities.length]);

  function retry() { setAttempt((value) => value + 1); }

  const isSegment = mapMode === "segment";
  const title = isSegment ? "Current Route" : "Full Route";
  const subtitle = isSegment
    ? `${activeCities[0]} → ${activeCities[activeCities.length - 1]}`
    : `${activeCities.length} cities on this route`;

  const infoStats = segmentResolved?.routeStats ?? resolved?.routeStats ?? null;
  const infoName =
    (segmentResolved ?? resolved)?.nextStopName ??
    activeCities[activeCities.length - 1] ??
    null;

  const distanceText =
    infoStats && infoStats.distanceKilometers !== null
      ? `${infoStats.distanceKilometers.toFixed(0)} km`
      : null;
  const durationText =
    infoStats && infoStats.durationMinutes !== null
      ? `~${Math.round(infoStats.durationMinutes)} min`
      : null;
  const metaText = [distanceText, durationText].filter(Boolean).join("  •  ");

  const canToggle = Boolean(onToggleMapMode) && fullRouteCities.length > 2;

  return (
    <View>
      <SectionTitle icon="map" title={title} subtitle={subtitle} />
      {mapState === "loading" ? <BlockLoading label="Computing route…" /> : null}
      {mapState === "error" ? <BlockError message="The route for this trip could not be built." onRetry={retry} /> : null}
      {mapState === "ready" && resolved ? (
        <>
          <View style={styles.cardShadow}>
            <View style={[styles.mapWrap, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <View
                style={[
                  styles.mapBody,
                  { height, backgroundColor: dark ? "#1A221C" : "#EDEFF2" },
                ]}
              >
                <PlaceMap
                  places={[]}
                  destination={null}
                  initialRegion={resolved.region}
                  journeyStops={resolved.markers}
                  routeCoordinates={resolved.routeCoordinates}
                  routeLegs={resolved.legs}
                  attractions={attractions}
                  onAttractionPress={onAttractionPress}
                  mapStyle={mapStyle}
                  onMapStyleChange={setMapStyle}
                  recenterRegion={resolved.region}
                  nextStopLabel={isSegment}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Expand map"
                  onPress={() => setExpanded(true)}
                  style={({ pressed }) => [
                    styles.topActionButton,
                    { backgroundColor: theme.surface, borderColor: theme.border },
                    pressed && styles.overlayPressed,
                  ]}
                >
                  <Ionicons name="expand" size={20} color={theme.text} />
                </Pressable>
              </View>
              {resolved.routeStats &&
              (resolved.routeStats.distanceKilometers !== null || resolved.routeStats.durationMinutes !== null) ? (
                <View style={[styles.statsBar, { borderTopColor: theme.border }]}>
                  {resolved.routeStats.distanceKilometers !== null ? (
                    <View style={[styles.statChip, { backgroundColor: theme.primaryLight }]}>
                      <Ionicons name="git-commit-outline" size={12} color={theme.primary} />
                      <Text style={[styles.stat, { color: theme.primaryDark }]}>{resolved.routeStats.distanceKilometers.toFixed(0)} km</Text>
                    </View>
                  ) : null}
                  {resolved.routeStats.durationMinutes !== null ? (
                    <View style={[styles.statChip, { backgroundColor: theme.primaryLight }]}>
                      <Ionicons name="time-outline" size={12} color={theme.primary} />
                      <Text style={[styles.stat, { color: theme.primaryDark }]}>~{Math.round(resolved.routeStats.durationMinutes)} min</Text>
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>
          </View>

          {onToggleMapMode && fullRouteCities.length > 2 ? (
            <Pressable
              onPress={onToggleMapMode}
              style={({ pressed }) => [
                styles.toggleButton,
                { backgroundColor: theme.primaryLight, borderColor: theme.border },
                pressed && styles.toggleButtonPressed,
              ]}
            >
              <Ionicons name={isSegment ? "expand-outline" : "contract-outline"} size={16} color={theme.primary} />
              <Text style={[styles.toggleText, { color: theme.primary }]}>
                {isSegment ? "Show Full Route" : "Show Current Segment"}
              </Text>
            </Pressable>
          ) : null}
        </>
      ) : null}

      <Modal
        visible={expanded}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setExpanded(false)}
      >
        <View style={[styles.expandedRoot, { backgroundColor: theme.background }]}>
          {mapState === "ready" && resolved ? (
            <>
              <PlaceMap
                places={[]}
                destination={null}
                initialRegion={resolved.region}
                journeyStops={resolved.markers}
                routeCoordinates={resolved.routeCoordinates}
                routeLegs={resolved.legs}
                attractions={attractions}
                onAttractionPress={onAttractionPress}
                mapStyle={mapStyle}
                onMapStyleChange={setMapStyle}
                recenterRegion={resolved.region}
                nextStopLabel={isSegment}
                topInset={insets.top}
                bottomInset={insets.bottom}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close expanded map"
                onPress={() => setExpanded(false)}
                style={({ pressed }) => [
                  styles.topActionButton,
                  styles.expandedCloseButton,
                  { top: insets.top + 12, backgroundColor: theme.surface, borderColor: theme.border },
                  pressed && styles.overlayPressed,
                ]}
              >
                <Ionicons name="close" size={22} color={theme.text} />
              </Pressable>

              <View
                style={[
                  styles.nextStopCard,
                  {
                    bottom: insets.bottom + 14,
                    backgroundColor: theme.surface,
                    borderColor: theme.border,
                  },
                ]}
              >
                <View style={styles.nextStopLabelRow}>
                  <View style={[styles.nextStopChip, { backgroundColor: theme.primaryLight }]}>
                    <Ionicons name="flag" size={12} color={theme.primary} />
                    <Text style={[styles.nextStopChipText, { color: theme.primaryDark }]}>Next Stop</Text>
                  </View>
                  <Text style={[styles.nextStopMode, { color: theme.textSecondary }]}>
                    {isSegment ? "Current route" : "Full route"}
                  </Text>
                </View>

                <Text style={[styles.nextStopName, { color: theme.text }]} numberOfLines={1}>
                  {infoName ?? "Journey"}
                </Text>

                {metaText ? (
                  <Text style={[styles.nextStopMeta, { color: theme.textSecondary }]}>
                    {metaText}
                  </Text>
                ) : null}

                {canToggle ? (
                  <Pressable
                    onPress={onToggleMapMode}
                    style={({ pressed }) => [
                      styles.nextStopToggle,
                      { backgroundColor: theme.primaryLight, borderColor: theme.border },
                      pressed && styles.toggleButtonPressed,
                    ]}
                  >
                    <Ionicons name={isSegment ? "git-branch-outline" : "locate-outline"} size={14} color={theme.primary} />
                    <Text style={[styles.nextStopToggleText, { color: theme.primary }]}>
                      {isSegment ? "Show Full Route" : "Show Current Segment"}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            </>
          ) : null}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  cardShadow: {
    borderRadius: 20,
    shadowColor: "#000000",
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: {
      width: 0,
      height: 6,
    },
    elevation: 4,
    boxShadow: "0 6px 16px rgba(0, 0, 0, 0.08)",
  },
  mapWrap: {
    borderRadius: 20,
    overflow: "hidden",
    borderWidth: 1,
  },
  mapBody: {
    width: "100%",
    backgroundColor: "#EDEFF2",
  },
  statsBar: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
  },
  statChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  stat: {
    fontSize: 12,
    fontWeight: "700",
  },
  toggleButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  toggleButtonPressed: { opacity: 0.7 },
  toggleText: { fontSize: 13, fontWeight: "700" },
  topActionButton: {
    position: "absolute",
    right: 12,
    top: 12,
    width: 40,
    height: 40,
    borderRadius: 13,
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
    elevation: 5,
  },
  expandedCloseButton: {
    zIndex: 10,
  },
  overlayPressed: {
    opacity: 0.75,
  },
  expandedRoot: {
    flex: 1,
  },
  nextStopCard: {
    position: "absolute",
    left: 14,
    right: 14,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
    shadowColor: "#000000",
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: {
      width: 0,
      height: 6,
    },
    elevation: 6,
  },
  nextStopLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  nextStopChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  nextStopChipText: {
    fontSize: 11,
    fontWeight: "700",
  },
  nextStopMode: {
    fontSize: 11,
    fontWeight: "600",
  },
  nextStopName: {
    fontSize: 20,
    fontWeight: "800",
    marginTop: 8,
  },
  nextStopMeta: {
    fontSize: 13,
    fontWeight: "600",
    marginTop: 3,
  },
  nextStopToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 12,
    paddingVertical: 9,
    borderRadius: 11,
    borderWidth: 1,
  },
  nextStopToggleText: {
    fontSize: 13,
    fontWeight: "700",
  },
});