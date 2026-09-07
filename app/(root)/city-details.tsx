import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import PageHeader from "../../components/PageHeader";
import PlaceMap from "../../components/PlaceMap";
import type { PlaceMapRegion } from "../../components/PlaceMap.types";
import PlacesSection from "../../components/trip/PlacesSection";
import WeatherCard from "../../components/trip/WeatherCard";
import { BlockError, BlockLoading } from "../../components/trip/primitives";
import { resolveCityCoordinates } from "../../services/routeApi";

interface CityCoords {
  latitude: number;
  longitude: number;
}

function regionForPoint(point: CityCoords): PlaceMapRegion {
  return {
    latitude: point.latitude,
    longitude: point.longitude,
    latitudeDelta: 0.12,
    longitudeDelta: 0.12,
  };
}

function CityMap({
  city,
  coords,
}: {
  city: string;
  coords?: CityCoords | null;
}) {
  const [state, setState] = useState<"loading" | "ready" | "error">(
    "loading"
  );
  const [point, setPoint] = useState<CityCoords | null>(null);
  const [attempt, setAttempt] = useState(0);

  const load = useCallback(async () => {
    setState("loading");

    try {
      const resolved =
        coords ?? (await resolveCityCoordinates(city));

      setPoint(resolved);
      setState("ready");
    } catch {
      setState("error");
    }
  }, [city, coords]);

  useEffect(() => {
    load();
  }, [load, attempt]);

  function retry() {
    setAttempt((value) => value + 1);
  }

  if (state === "loading") {
    return <BlockLoading label="Locating city…" />;
  }

  if (state === "error" || !point) {
    return (
      <BlockError
        message={`We could not locate "${city}" on the map.`}
        onRetry={retry}
      />
    );
  }

  return (
    <View style={styles.mapWrap}>
      <PlaceMap
        places={[]}
        destination={{
          name: city,
          formatted: city,
          latitude: point.latitude,
          longitude: point.longitude,
        }}
        initialRegion={regionForPoint(point)}
      />
    </View>
  );
}

export default function CityDetailsScreen() {
  const params = useLocalSearchParams<{
    city?: string;
    tripId?: string;
    lat?: string;
    lon?: string;
  }>();

  const city =
    typeof params.city === "string" && params.city.trim()
      ? params.city.trim()
      : null;

  const tripId =
    typeof params.tripId === "string" && params.tripId
      ? params.tripId
      : null;

  const coords: CityCoords | null =
    typeof params.lat === "string" &&
    typeof params.lon === "string" &&
    Number.isFinite(Number(params.lat)) &&
    Number.isFinite(Number(params.lon))
      ? {
          latitude: Number(params.lat),
          longitude: Number(params.lon),
        }
      : null;

  if (!city) {
    return (
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <PageHeader title="City" />
        <View style={styles.center}>
          <Text style={styles.centerTitle}>No city selected</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <PageHeader title={city} subtitle="City guide" />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
      >
        {tripId ? (
          <View style={styles.tripContext}>
            <Ionicons name="map-outline" size={18} color="#00BC26" />
            <Text style={styles.tripContextText}>
              Part of one of your trips.
            </Text>
            <Pressable
              onPress={() =>
                router.push({
                  pathname: "/(root)/trip-details",
                  params: { tripId },
                })
              }
              style={({ pressed }) => pressed && styles.pressed}
            >
              <Text style={styles.tripContextLink}>Open Trip →</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.block}>
          <CityMap city={city} coords={coords} />
        </View>

        <View style={styles.block}>
          <WeatherCard city={city} coords={coords} />
        </View>

        <View style={styles.block}>
          <PlacesSection
            title="Attractions"
            categories={["tourist-attraction"]}
            city={city}
            coords={coords}
          />
        </View>

        <View style={styles.block}>
          <PlacesSection
            title="Restaurants"
            categories={["restaurant"]}
            city={city}
            coords={coords}
          />
        </View>

        <View style={styles.block}>
          <PlacesSection
            title="Hotels"
            categories={["hotel"]}
            city={city}
            coords={coords}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#F7F8FA",
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  block: {
    marginTop: 22,
  },
  tripContext: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#E7F9EB",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    marginTop: 4,
  },
  tripContextText: {
    flex: 1,
    fontSize: 13,
    color: "#1C1C1E",
  },
  tripContextLink: {
    fontSize: 13,
    fontWeight: "700",
    color: "#007A1E",
  },
  mapWrap: {
    height: 220,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#EDEFF2",
  },
  center: {
    padding: 28,
  },
  centerTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: "#52525B",
  },
  pressed: {
    opacity: 0.7,
  },
});