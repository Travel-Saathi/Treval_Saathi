import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";

import {
  getOsmPlaces,
  type TravelPlace,
} from "../../services/placesApi";
import { resolveCityCoordinates } from "../../services/routeApi";
import { BlockEmpty, BlockError, BlockLoading, SectionTitle } from "./primitives";

type IoniconName = keyof typeof Ionicons.glyphMap;

interface CityCoords {
  latitude: number;
  longitude: number;
}

const CATEGORY_LABELS: Record<string, string> = {
  "tourist-attraction": "Attraction",
  hotel: "Hotel",
  restaurant: "Restaurant",
  cafe: "Café",
  hospital: "Hospital",
  pharmacy: "Pharmacy",
  "gas-station": "Fuel station",
  parking: "Parking",
};

/**
 * Reusable nearby-places block. Used once per category (attractions,
 * hotels, restaurants) on Trip Details and City Details. It owns its
 * own loading/error/empty states so every category degrades
 * independently. Places render only real OSM data; images/ratings come
 * later from enrichment providers and are hidden until provided.
 */
export default function PlacesSection({
  title,
  subtitle,
  categories,
  city,
  coords,
  limit = 8,
}: {
  title: string;
  subtitle?: string | null;
  categories: string[];
  city: string;
  coords?: CityCoords | null;
  limit?: number;
}) {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [places, setPlaces] = useState<TravelPlace[]>([]);
  const [attempt, setAttempt] = useState(0);

  const load = useCallback(async () => {
    setState("loading");

    try {
      const point =
        coords ?? (await resolveCityCoordinates(city));

      const result = await getOsmPlaces({
        latitude: point.latitude,
        longitude: point.longitude,
        categories,
      });

      setPlaces(result.sort(sortByDistance).slice(0, limit));
      setState("ready");
    } catch {
      setState("error");
    }
  }, [city, coords, categories, limit]);

  useEffect(() => {
    load();
  }, [load, attempt]);

  function retry() {
    setAttempt((value) => value + 1);
  }

  function sortByDistance(
    a: TravelPlace,
    b: TravelPlace
  ): number {
    const da = a.distanceMeters ?? Number.MAX_SAFE_INTEGER;
    const db = b.distanceMeters ?? Number.MAX_SAFE_INTEGER;
    return da - db;
  }

  const icon: IoniconName = categories.includes("hotel")
    ? "bed-outline"
    : categories.includes("restaurant")
      ? "restaurant-outline"
      : "sparkles-outline";

  return (
    <View>
      <SectionTitle icon={icon} title={title} subtitle={subtitle ?? city} />

      {state === "loading" ? <BlockLoading label={`Finding ${title.toLowerCase()}…`} /> : null}

      {state === "error" ? (
        <BlockError
          message={`${title} could not be loaded for ${city}.`}
          onRetry={retry}
        />
      ) : null}

      {state === "ready" && places.length === 0 ? (
        <BlockEmpty
          icon={icon}
          title={`No ${title.toLowerCase()} found near ${city}`}
          subtitle="Nothing from this category exists nearby yet."
        />
      ) : null}

      {state === "ready" && places.length > 0 ? (
        <View style={styles.list}>
          {places.map((place) => {
            const label =
              (place.name ?? place.formatted ?? "Place").trim() || "Place";
            const categoryLabel = CATEGORY_LABELS[place.category] ?? null;

            return (
              <View key={place.id} style={styles.row}>
                {place.imageUrl ? (
                  <Image
                    source={{ uri: place.imageUrl }}
                    style={styles.thumb}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={styles.thumb}>
                    <Ionicons name={icon} size={18} color="#00BC26" />
                  </View>
                )}

                <View style={styles.rowBody}>
                  <Text style={styles.name} numberOfLines={1}>
                    {label}
                  </Text>
                  <Text style={styles.meta} numberOfLines={1}>
                    {[categoryLabel, place.distanceText]
                      .filter(Boolean)
                      .join(" • ")}
                  </Text>
                  {place.opening_hours ? (
                    <Text style={styles.hours} numberOfLines={1}>
                      {place.opening_hours}
                    </Text>
                  ) : null}
                </View>

                <Ionicons name="chevron-forward" size={16} color="#C4C8CF" />
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#EEF0F3",
    gap: 11,
  },
  thumb: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: "#E7F9EB",
    alignItems: "center",
    justifyContent: "center",
  },
  rowBody: {
    flex: 1,
  },
  name: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1C1C1E",
  },
  meta: {
    fontSize: 12,
    color: "#71717A",
    marginTop: 1,
  },
  hours: {
    fontSize: 11,
    color: "#9CA3AF",
    marginTop: 1,
  },
});