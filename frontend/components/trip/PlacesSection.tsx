import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";

import {
  getCityPlaces,
  type DiscoveredPlace,
} from "../../services/cityDiscoveryApi";
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

function capitalize(value: string | null | undefined): string | null {
  const text = String(value ?? "").trim();

  if (!text) {
    return null;
  }

  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Place discovery block used by the Explore City feature. It discovers real
 * places for a "category (or custom category) in a city" through the backend
 * city-discovery service — the selected city always drives the search. Own
 * loading/error/empty states so every category degrades independently.
 */
export default function PlacesSection({
  title,
  subtitle,
  categories,
  customCategory,
  city,
  coords,
  limit = 8,
}: {
  title: string;
  subtitle?: string | null;
  categories: string[];
  customCategory?: string | null;
  city: string;
  coords?: CityCoords | null;
  limit?: number;
}) {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [places, setPlaces] = useState<DiscoveredPlace[]>([]);
  const [attempt, setAttempt] = useState(0);

  const categoryId = categories[0];
  const custom = customCategory && customCategory.trim()
    ? customCategory.trim()
    : null;

  const load = useCallback(async () => {
    setState("loading");

    try {
      const result = await getCityPlaces({
        city,
        categoryId: categoryId || undefined,
        customCategory: custom || undefined,
        coords,
        limit,
      });

      setPlaces(result);
      setState("ready");
    } catch {
      setState("error");
    }
  }, [city, categoryId, custom, coords, limit]);

  useEffect(() => {
    load();
  }, [load, attempt]);

  function retry() {
    setAttempt((value) => value + 1);
  }

  const icon: IoniconName = categoryId === "hotel"
    ? "bed-outline"
    : categoryId === "restaurant"
      ? "restaurant-outline"
      : categoryId === "temple"
        ? "business-outline"
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
              (place.name ?? place.address ?? "Place").trim() || "Place";
            const categoryLabel =
              capitalize(place.categoryLabel) ??
              CATEGORY_LABELS[place.category ?? ""] ??
              null;
            const meta = [categoryLabel, place.distanceText]
              .filter(Boolean)
              .join(" • ");

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
                  {meta ? (
                    <Text style={styles.meta} numberOfLines={1}>
                      {meta}
                    </Text>
                  ) : null}
                  {place.description ? (
                    <Text style={styles.desc} numberOfLines={2}>
                      {place.description}
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
  desc: {
    fontSize: 12,
    color: "#9CA3AF",
    marginTop: 2,
    lineHeight: 16,
  },
});