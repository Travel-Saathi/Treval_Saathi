import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import PlaceMap from "../PlaceMap";
import type {
  JourneyStopMarker,
  PlaceMapRegion,
  RouteCoordinate,
} from "../PlaceMap.types";
import {
  getJourneyRoute,
  resolveCityCoordinates,
  type JourneyRoute,
  type RoutePoint,
} from "../../services/routeApi";
import { useAppTheme } from "../../src/theme/ThemeProvider";

function regionForPoints(points: RoutePoint[]): PlaceMapRegion {
  const latitudes = points.map((point) => point.latitude);
  const longitudes = points.map((point) => point.longitude);

  const minLat = Math.min(...latitudes);
  const maxLat = Math.max(...latitudes);
  const minLon = Math.min(...longitudes);
  const maxLon = Math.max(...longitudes);

  const dLat = maxLat - minLat;
  const dLon = maxLon - minLon;

  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLon + maxLon) / 2,
    latitudeDelta: Math.max(dLat * 1.35, 0.05),
    longitudeDelta: Math.max(dLon * 1.35, 0.05),
  };
}

function formatDistance(kilometers: number | null): string {
  if (kilometers === null || !Number.isFinite(kilometers)) {
    return "";
  }

  return kilometers >= 10
    ? `${Math.round(kilometers)} km`
    : `${kilometers.toFixed(1)} km`;
}

function formatDuration(minutes: number | null): string {
  if (minutes === null || !Number.isFinite(minutes)) {
    return "";
  }

  const rounded = Math.round(minutes);

  if (rounded < 60) {
    return `${rounded} min`;
  }

  const hours = Math.floor(rounded / 60);
  const rest = rounded % 60;

  return rest > 0 ? `${hours} hr ${rest} min` : `${hours} hr`;
}

interface DesktopJourneyMapProps {
  cities: string[];
  height?: number;
}

/**
 * Interactive journey preview used on the desktop screens. Resolves the
 * ordered city list, builds a real driving route through the route engine
 * and renders the polyline + stop markers on the existing PlaceMap.
 */
export default function DesktopJourneyMap({
  cities,
  height = 320,
}: DesktopJourneyMapProps) {
  const { theme } = useAppTheme();

  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [route, setRoute] = useState<JourneyRoute | null>(null);
  const [points, setPoints] = useState<RoutePoint[]>([]);
  const [attempt, setAttempt] = useState(0);

  const load = useCallback(async () => {
    if (!Array.isArray(cities) || cities.length < 2) {
      setState("error");
      return;
    }

    setState("loading");

    try {
      const settled = await Promise.allSettled(
        cities.map((city) => resolveCityCoordinates(city))
      );

      const resolved: { point: RoutePoint; city: string }[] = [];

      settled.forEach((result, index) => {
        if (result.status === "fulfilled") {
          resolved.push({ point: result.value, city: cities[index] });
        }
      });

      if (resolved.length < 2) {
        setState("error");
        return;
      }

      const ordered = resolved.map((entry) => entry.point);
      const journeyRoute = await getJourneyRoute(ordered);

      setPoints(ordered);
      setRoute(
        journeyRoute.coordinates.length > 0 ? journeyRoute : null
      );
      setState("ready");
    } catch {
      setState("error");
    }
  }, [cities]);

  useEffect(() => {
    load();
  }, [load, attempt]);

  function retry() {
    setAttempt((value) => value + 1);
  }

  const journeyStops: JourneyStopMarker[] = points.map((point, index) => ({
    key: `stop-${index}`,
    name: cities[index] ?? points[index].latitude.toFixed(2),
    latitude: point.latitude,
    longitude: point.longitude,
    kind:
      index === 0
        ? "source"
        : index === points.length - 1
          ? "destination"
          : "stop",
  }));

  const routeCoordinates: RouteCoordinate[] =
    route?.coordinates ?? points;

  return (
    <View style={[styles.wrap, { height }]}>
      {state === "loading" ? (
        <View style={[styles.center, { backgroundColor: theme.surface }]}>
          <Ionicons name="map-outline" size={28} color={theme.textMuted} />
          <Text style={[styles.centerText, { color: theme.textSecondary }]}>
            Building your route…
          </Text>
        </View>
      ) : null}

      {state === "error" ? (
        <View style={[styles.center, { backgroundColor: theme.surface }]}>
          <Ionicons name="cloud-offline-outline" size={28} color={theme.textMuted} />
          <Text style={[styles.centerText, { color: theme.textSecondary }]}>
            Route could not be loaded.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={retry}
            style={({ pressed }) => [
              styles.retry,
              { backgroundColor: theme.primaryLight },
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.retryText, { color: theme.primaryDark }]}>
              Try again
            </Text>
          </Pressable>
        </View>
      ) : null}

      {state === "ready" ? (
        <PlaceMap
          places={[]}
          journeyStops={journeyStops}
          routeCoordinates={routeCoordinates}
          initialRegion={regionForPoints(points)}
          topInset={0}
          bottomInset={0}
        />
      ) : null}

      {state === "ready" && route ? (
        <View style={styles.stats}>
          {formatDistance(route.distanceKilometers) ? (
            <View style={styles.statItem}>
              <Ionicons name="navigate" size={14} color="#00BC26" />
              <Text style={styles.statText}>
                {formatDistance(route.distanceKilometers)}
              </Text>
            </View>
          ) : null}
          {formatDuration(route.durationMinutes) ? (
            <View style={styles.statItem}>
              <Ionicons name="time-outline" size={14} color="#00BC26" />
              <Text style={styles.statText}>
                {formatDuration(route.durationMinutes)}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: "#EDEFF2",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  centerText: {
    fontSize: 13,
    fontWeight: "600",
  },
  retry: {
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginTop: 4,
  },
  retryText: {
    fontSize: 13,
    fontWeight: "800",
  },
  pressed: {
    opacity: 0.75,
  },
  stats: {
    position: "absolute",
    left: 12,
    bottom: 34,
    flexDirection: "row",
    gap: 8,
    backgroundColor: "rgba(255,255,255,0.94)",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  statItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  statText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#1C1C1E",
  },
});