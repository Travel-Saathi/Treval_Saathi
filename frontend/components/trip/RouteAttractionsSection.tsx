import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import {
  calculateDistanceMeters,
  getAttractionsAlongRoute,
  type RouteAttraction,
} from "../../services/placesApi";
import {
  getJourneyRoute,
  resolveCityCoordinates,
  type RoutePoint,
} from "../../services/routeApi";
import {
  BlockError,
  BlockLoading,
  SectionTitle,
} from "./primitives";

type AttractionsState =
  | "loading"
  | "ready"
  | "empty"
  | "no-geometry"
  | "osm-error";

type IoniconName = keyof typeof Ionicons.glyphMap;

const CATEGORY_LABELS: Record<string, string> = {
  attraction: "Attraction",
  tourist_attractions: "Attraction",
  museum: "Museum",
  gallery: "Art gallery",
  artwork: "Landmark",
  viewpoint: "Viewpoint",
  zoo: "Zoo",
  theme_park: "Theme park",
  aquarium: "Aquarium",
  historic: "Heritage site",
  park: "Park",
  arts_centre: "Arts centre",
  temples: "Temple",
};

const CATEGORY_ICONS: Record<string, IoniconName> = {
  attraction: "camera-outline",
  tourist_attractions: "camera-outline",
  museum: "business-outline",
  gallery: "color-palette-outline",
  artwork: "brush-outline",
  viewpoint: "eye-outline",
  zoo: "paw-outline",
  theme_park: "balloon-outline",
  aquarium: "water-outline",
  historic: "time-outline",
  park: "leaf-outline",
  arts_centre: "sparkles-outline",
  temples: "business-outline",
};

/**
 * Assign the nearest ordered journey city to an attraction so a list row
 * or map marker can open the existing city detail screen. Attractions that
 * could not be geocoded (no coordinates) keep the city the backend attached.
 */
function nearestCityOf(
  attraction: RouteAttraction,
  cityCoords: RoutePoint[],
  cityNames: string[]
): string | null {
  const latitude = attraction.latitude;
  const longitude = attraction.longitude;

  if (typeof latitude !== "number" || typeof longitude !== "number") {
    return null;
  }

  let bestIndex = -1;
  let bestMeters = Infinity;

  for (let index = 0; index < cityCoords.length; index += 1) {
    const meters = calculateDistanceMeters(
      latitude,
      longitude,
      cityCoords[index].latitude,
      cityCoords[index].longitude
    );

    if (meters < bestMeters) {
      bestMeters = meters;
      bestIndex = index;
    }
  }

  return bestIndex >= 0 ? cityNames[bestIndex] : null;
}

/**
 * Self-contained "Attractions Along Your Route" block. It resolves the
 * ordered journey cities once, reuses the existing OSRM route geometry,
 * then delegates the corridor search to the backend
 * (GET /api/route/attractions). The backend discovers real attractions
 * via web search, geocodes them, filters by real distance to the route
 * polyline, ranks them and limits the count.
 *
 * UI messages map 1:1 to the backend outcome and never leak provider,
 * search-engine or HTTP status details.
 */
export default function RouteAttractionsSection({
  cities,
  categories,
  onSelectAttraction,
  onAttractionsLoaded,
}: {
  cities: string[];
  categories?: string[];
  onSelectAttraction?: (attraction: RouteAttraction) => void;
  onAttractionsLoaded?: (attractions: RouteAttraction[]) => void;
}) {
  const [state, setState] = useState<AttractionsState>("loading");
  const [attractions, setAttractions] = useState<RouteAttraction[]>([]);
  const [attempt, setAttempt] = useState(0);

  const onAttractionsLoadedRef = useRef(onAttractionsLoaded);

  useEffect(() => {
    onAttractionsLoadedRef.current = onAttractionsLoaded;
  });

  const citiesKey = cities.join("|");
  const categoriesKey = categories?.join("|") ?? "";

  const load = useCallback(async () => {
    const cityNames = citiesKey.split("|").filter(Boolean);
    const categoryList = categoriesKey
      ? categoriesKey.split("|").filter(Boolean)
      : undefined;

    onAttractionsLoadedRef.current?.([]);

    if (cityNames.length < 2) {
      setState("no-geometry");
      return;
    }

    setState("loading");

    let coordinates: RoutePoint[] = [];

    try {
      for (const city of cityNames) {
        coordinates.push(await resolveCityCoordinates(city));
      }
    } catch {
      setState("no-geometry");
      return;
    }

    try {
      const route = await getJourneyRoute(coordinates);

      const result = await getAttractionsAlongRoute(route.coordinates, {
        categories: categoryList,
        cities: cityNames,
      });

      if (result.status === "no-geometry") {
        setAttractions([]);
        onAttractionsLoadedRef.current?.([]);
        setState("no-geometry");
        return;
      }

      if (result.status === "osm-error") {
        setAttractions([]);
        onAttractionsLoadedRef.current?.([]);
        setState("osm-error");
        return;
      }

      const withCity = result.attractions.map((attraction) => ({
        ...attraction,
        nearestCity:
          attraction.nearestCity ??
          nearestCityOf(attraction, coordinates, cityNames),
      }));

      setAttractions(withCity);
      onAttractionsLoadedRef.current?.(withCity);
      setState(withCity.length > 0 ? "ready" : "empty");
    } catch {
      setAttractions([]);
      onAttractionsLoadedRef.current?.([]);
      setState("osm-error");
    }
  }, [citiesKey, categoriesKey]);

  useEffect(() => {
    load();
  }, [load, attempt]);

  function retry() {
    setAttempt((value) => value + 1);
  }

  return (
    <View>
      <SectionTitle
        icon="map-outline"
        title="Attractions Along Your Route"
        subtitle={state === "ready" ? `${attractions.length} place${attractions.length === 1 ? "" : "s"} to explore` : cities.join(" → ")}
      />

      {state === "loading" ? (
        <BlockLoading label="Finding places along your route..." />
      ) : null}

      {state === "no-geometry" ? (
        <BlockError
          message="Route information is unavailable."
          onRetry={retry}
        />
      ) : null}

      {state === "osm-error" ? (
        <BlockError
          message="Places are temporarily unavailable."
          onRetry={retry}
        />
      ) : null}

      {state === "empty" ? (
        <BlockError message="No attractions were found along this route." />
      ) : null}

      {state === "ready" ? (
        <View style={styles.card}>
          {attractions.map((attraction, index) => {
            const icon = CATEGORY_ICONS[attraction.category] ?? "location-outline";
            const label =
              CATEGORY_LABELS[attraction.category] ?? attraction.category;

            return (
              <Pressable
                key={attraction.id || `${attraction.name}-${index}`}
                onPress={onSelectAttraction ? () => onSelectAttraction(attraction) : undefined}
                disabled={!onSelectAttraction}
                style={({ pressed }) => [
                  styles.row,
                  index + 1 < attractions.length && styles.rowBorder,
                  pressed && styles.pressed,
                ]}
              >
                <View style={styles.iconWrap}>
                  <Ionicons name={icon} size={16} color="#00BC26" />
                </View>
                <View style={styles.rowText}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {attraction.name ?? "Point of interest"}
                  </Text>
                  <View style={styles.rowMeta}>
                    <Text style={styles.rowMetaText}>{label}</Text>
                    {attraction.distanceText ? (
                      <>
                        <Text style={styles.rowMetaDot}>•</Text>
                        <Text style={styles.rowMetaText}>
                          {attraction.distanceText}
                        </Text>
                      </>
                    ) : null}
                    {attraction.nearestCity ? (
                      <>
                        <Text style={styles.rowMetaDot}>•</Text>
                        <Text style={styles.rowMetaText}>
                          {attraction.nearestCity}
                        </Text>
                      </>
                    ) : null}
                  </View>
                </View>
                {onSelectAttraction ? (
                  <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
                ) : null}
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingHorizontal: 14,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: "#F1F3F5",
  },
  iconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#E7F9EB",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1C1C1E",
  },
  rowMeta: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 2,
  },
  rowMetaText: {
    fontSize: 12,
    color: "#71717A",
  },
  rowMetaDot: {
    fontSize: 12,
    color: "#9CA3AF",
    marginHorizontal: 4,
  },
  pressed: {
    opacity: 0.7,
  },
});