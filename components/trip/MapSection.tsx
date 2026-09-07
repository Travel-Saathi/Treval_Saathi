import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import PlaceMap from "../PlaceMap";
import type {
  JourneyStopMarker,
  PlaceMapRegion,
} from "../PlaceMap.types";
import { getJourneyRoute, resolveCityCoordinates } from "../../services/routeApi";
import { BlockError, BlockLoading, SectionTitle } from "./primitives";

interface CityCoords {
  latitude: number;
  longitude: number;
}

function computeRegion(points: JourneyStopMarker[]): PlaceMapRegion {
  const valid = points.filter(
    (point) =>
      Number.isFinite(point.latitude) &&
      Number.isFinite(point.longitude)
  );

  if (valid.length === 0) {
    return {
      latitude: 23.0,
      longitude: 79.0,
      latitudeDelta: 12,
      longitudeDelta: 12,
    };
  }

  const latitudes = valid.map((point) => point.latitude);
  const longitudes = valid.map((point) => point.longitude);

  const minLat = Math.min(...latitudes);
  const maxLat = Math.max(...latitudes);
  const minLon = Math.min(...longitudes);
  const maxLon = Math.max(...longitudes);

  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLon + maxLon) / 2,
    latitudeDelta: Math.max(maxLat - minLat, 0.05) * 1.6,
    longitudeDelta: Math.max(maxLon - minLon, 0.05) * 1.6,
  };
}

/**
 * Route map for the whole journey (source → stops → destination).
 * Self-contained: it geocodes and routes on its own, so a routing /
 * backend failure degrades to an inline retry instead of breaking the
 * Trip Details page. Coordinates are cached by `resolveCityCoordinates`,
 * so this block costs nothing extra when weather already resolved them.
 */
export default function MapSection({
  cities,
  height = 230,
}: {
  cities: string[];
  height?: number;
}) {
  const [state, setState] = useState<"loading" | "ready" | "error">(
    "loading"
  );
  const [markers, setMarkers] = useState<JourneyStopMarker[]>([]);
  const [routeCoordinates, setRouteCoordinates] = useState<
    { latitude: number; longitude: number }[] | null
  >(null);
  const [routeStats, setRouteStats] = useState<{
    distanceKilometers: number | null;
    durationMinutes: number | null;
  } | null>(null);
  const [region, setRegion] = useState<PlaceMapRegion | null>(null);
  const [attempt, setAttempt] = useState(0);

  const load = useCallback(async () => {
    setState("loading");

    try {
      const points = await Promise.all(
        cities.map((city) => resolveCityCoordinates(city))
      );

      const stopMarkers: JourneyStopMarker[] = cities.map((city, index) => ({
        key: `city-${index}`,
        name: city,
        latitude: points[index].latitude,
        longitude: points[index].longitude,
        kind:
          index === 0
            ? ("source" as const)
            : index === cities.length - 1
              ? ("destination" as const)
              : ("stop" as const),
      }));

      const coordinates: CityCoords[] = points.map((point) => ({
        latitude: point.latitude,
        longitude: point.longitude,
      }));

      const route = await getJourneyRoute(coordinates);

      setMarkers(stopMarkers);
      setRouteCoordinates(route.coordinates);
      setRouteStats({
        distanceKilometers: route.distanceKilometers,
        durationMinutes: route.durationMinutes,
      });
      setRegion(computeRegion(stopMarkers));
      setState("ready");
    } catch {
      setState("error");
    }
  }, [cities]);

  useEffect(() => {
    if (cities.length < 2) {
      setState("error");
      return;
    }

    load();
  }, [load, attempt, cities.length]);

  function retry() {
    setAttempt((value) => value + 1);
  }

  return (
    <View>
      <SectionTitle
        icon="map"
        title="Trip Map"
        subtitle={`${cities.length} cities on this route`}
      />

      {state === "loading" ? <BlockLoading label="Computing route…" /> : null}

      {state === "error" ? (
        <BlockError
          message="The route for this trip could not be built."
          onRetry={retry}
        />
      ) : null}

      {state === "ready" && region ? (
        <View style={styles.mapWrap}>
          <View style={[styles.mapBody, { height }]}>
            <PlaceMap
              places={[]}
              destination={null}
              initialRegion={region}
              journeyStops={markers}
              routeCoordinates={routeCoordinates ?? undefined}
            />
          </View>

          {routeStats &&
          (routeStats.distanceKilometers !== null ||
            routeStats.durationMinutes !== null) ? (
            <View style={styles.statsBar}>
              {routeStats.distanceKilometers !== null ? (
                <Text style={styles.stat}>
                  {routeStats.distanceKilometers.toFixed(0)} km
                </Text>
              ) : null}
              {routeStats.durationMinutes !== null ? (
                <Text style={styles.stat}>
                  ~{Math.round(routeStats.durationMinutes)} min
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  mapWrap: {
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
  },
  mapBody: {
    width: "100%",
    backgroundColor: "#EDEFF2",
  },
  statsBar: {
    flexDirection: "row",
    gap: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "#F1F3F5",
  },
  stat: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1C1C1E",
  },
});