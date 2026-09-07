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
import ActivitiesSection from "../../components/trip/ActivitiesSection";
import LiveUpdatesSection from "../../components/trip/LiveUpdatesSection";
import MapSection from "../../components/trip/MapSection";
import PlacesSection from "../../components/trip/PlacesSection";
import StopsTimeline from "../../components/trip/StopsTimeline";
import TodayInfoCard from "../../components/trip/TodayInfoCard";
import TransportCard from "../../components/trip/TransportCard";
import TripOverviewCard from "../../components/trip/TripOverviewCard";
import WeatherCard from "../../components/trip/WeatherCard";
import { BlockLoading } from "../../components/trip/primitives";
import { useSupabase } from "../../hook/usesupabase";
import { formatDateRange } from "../../lib/tripDates";
import {
  getTripDetails,
  nextCheckpoint,
  toTripSummary,
  tripCitySequence,
  type TripSummaryCard,
} from "../../services/liveTripsApi";
import type { TripStop, TripTransport } from "../../services/tripsApi";

type LoadState = "loading" | "ready" | "error";

export default function TripDetailsScreen() {
  const params = useLocalSearchParams<{ tripId?: string }>();
  const tripId =
    typeof params.tripId === "string" && params.tripId
      ? params.tripId
      : null;
  const supabase = useSupabase();

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [trip, setTrip] = useState<TripSummaryCard | null>(null);
  const [stops, setStops] = useState<TripStop[]>([]);
  const [transport, setTransport] = useState<TripTransport | null>(null);
  const [attempt, setAttempt] = useState(0);

  const load = useCallback(async () => {
    if (!tripId) {
      setLoadState("error");
      return;
    }

    setLoadState("loading");

    try {
      const bundle = await getTripDetails(supabase, tripId);

      setTrip(toTripSummary(bundle.trip));
      setStops(bundle.stops);
      setTransport(bundle.transport);
      setLoadState("ready");
    } catch {
      setLoadState("error");
    }
  }, [tripId, supabase]);

  useEffect(() => {
    load();
  }, [load, attempt]);

  const destination = trip?.destination?.trim() || "Trip";

  function openCity(city: string) {
    if (!tripId) {
      return;
    }

    router.push({
      pathname: "/(root)/city-details",
      params: { city, tripId },
    });
  }

  function retry() {
    setAttempt((value) => value + 1);
  }

  const cities = trip ? tripCitySequence(trip, stops) : [];
  const nextStop =
    trip && trip.lifecycle === "active"
      ? nextCheckpoint(stops, true)?.city ?? null
      : null;

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <PageHeader
        title={trip?.title?.trim() || "Trip Details"}
        subtitle={trip ? `${destination} • ${formatDateRange(trip.start_date, trip.end_date)}` : undefined}
      />

      {loadState === "loading" ? (
        <View style={styles.center}>
          <BlockLoading label="Loading your trip…" />
        </View>
      ) : null}

      {loadState === "error" ? (
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={40} color="#C4C8CF" />
          <Text style={styles.centerTitle}>Trip could not be loaded</Text>
          <Text style={styles.centerText}>
            It may have been deleted or is outside your access.
          </Text>
          <Pressable
            onPress={retry}
            style={({ pressed }) => [
              styles.retryButton,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.retryButtonText}>Retry</Text>
          </Pressable>
        </View>
      ) : null}

      {loadState === "ready" && trip ? (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
        >
          <TripOverviewCard
            trip={trip}
            lifecycle={trip.lifecycle}
            stopCount={stops.length}
            onOpenCity={openCity}
          />

          <TodayInfoCard trip={trip} nextStop={nextStop} />

          {stops.length > 0 ? (
            <View style={styles.block}>
              <Text style={styles.blockHeading}>Route</Text>
              <StopsTimeline
                source={trip.source_city?.trim() || "Source"}
                destination={trip.destination?.trim() || "Destination"}
                stops={stops}
                onOpenCity={openCity}
              />
            </View>
          ) : null}

          {transport ? (
            <View style={styles.block}>
              <Text style={styles.blockHeading}>Transport</Text>
              <TransportCard
                transport={transport}
                onOpenCity={openCity}
              />
            </View>
          ) : null}

          {trip.destination ? (
            <View style={styles.block}>
              <WeatherCard city={trip.destination} onOpenCity={openCity} />
            </View>
          ) : null}

          {cities.length >= 2 ? (
            <View style={styles.block}>
              <MapSection cities={cities} />
            </View>
          ) : null}

          {trip.destination ? (
            <>
              <View style={styles.block}>
                <PlacesSection
                  title="Attractions"
                  categories={["tourist-attraction"]}
                  city={trip.destination}
                />
              </View>

              <View style={styles.block}>
                <PlacesSection
                  title="Restaurants"
                  categories={["restaurant"]}
                  city={trip.destination}
                />
              </View>

              <View style={styles.block}>
                <PlacesSection
                  title="Hotels"
                  categories={["hotel"]}
                  city={trip.destination}
                />
              </View>
            </>
          ) : null}

          <View style={styles.block}>
            <ActivitiesSection />
          </View>
          <View style={styles.block}>
            <LiveUpdatesSection />
          </View>
        </ScrollView>
      ) : null}
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
  blockHeading: {
    fontSize: 18,
    fontWeight: "800",
    color: "#1C1C1E",
    marginBottom: 12,
  },
  center: {
    paddingHorizontal: 28,
    paddingVertical: 40,
    gap: 8,
    alignItems: "center",
  },
  centerTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#1C1C1E",
  },
  centerText: {
    fontSize: 13,
    color: "#71717A",
    textAlign: "center",
  },
  retryButton: {
    marginTop: 14,
    paddingHorizontal: 22,
    paddingVertical: 11,
    borderRadius: 999,
    backgroundColor: "#00BC26",
  },
  retryButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  pressed: {
    opacity: 0.7,
  },
});