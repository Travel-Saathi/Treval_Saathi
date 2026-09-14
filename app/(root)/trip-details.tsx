import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import PageHeader from "../../components/PageHeader";
import FunFactCard from "../../components/trip/FunFactCard";
import LiveUpdatesSection from "../../components/trip/LiveUpdatesSection";
import MapSection from "../../components/trip/MapSection";
import SegmentTransportList, {
  buildSegmentTransports,
} from "../../components/trip/SegmentTransportList";
import StopsTimeline from "../../components/trip/StopsTimeline";
import TodayInfoCard from "../../components/trip/TodayInfoCard";
import TripOverviewCard from "../../components/trip/TripOverviewCard";
import WeatherCard from "../../components/trip/WeatherCard";
import { BlockLoading } from "../../components/trip/primitives";
import { useSupabase } from "../../hook/usesupabase";
import { formatDateRange } from "../../lib/tripDates";
import {
  getTripDetails,
  getCurrentJourneySegment,
  nextCheckpoint,
  toTripSummary,
  tripCitySequence,
  type TripSummaryCard,
  type JourneySegment,
} from "../../services/liveTripsApi";
import { getLiveTripUpdates, type LiveUpdatesInfo } from "../../services/tripLiveApi";
import { resolveCityCoordinates } from "../../services/routeApi";
import type { TripStop, TripTransport } from "../../services/tripsApi";
import { useAppTheme } from "../../src/theme/ThemeProvider";
import type { ThemeTokens } from "../../src/theme/tokens";

type LoadState = "loading" | "ready" | "error";

export default function TripDetailsScreen() {
  const params = useLocalSearchParams<{ tripId?: string }>();
  const { theme, dark } = useAppTheme();
  const styles = useMemo(() => createStyles(theme, dark), [theme, dark]);
  const tripId =
    typeof params.tripId === "string" && params.tripId
      ? params.tripId
      : null;
  const supabase = useSupabase();

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [trip, setTrip] = useState<TripSummaryCard | null>(null);
  const [stops, setStops] = useState<TripStop[]>([]);
  const [transports, setTransports] = useState<TripTransport[]>([]);
  const [attempt, setAttempt] = useState(0);

  const [infoVisible, setInfoVisible] = useState(false);
  const [selectedMapMode, setSelectedMapMode] = useState<"segment" | "full">("segment");
  const [liveUpdates, setLiveUpdates] = useState<LiveUpdatesInfo | null>(null);

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
      setTransports(bundle.transports);
      setLoadState("ready");

      getLiveTripUpdates(tripId).then(setLiveUpdates).catch(() => {});
    } catch {
      setLoadState("error");
    }
  }, [tripId, supabase]);

  useEffect(() => {
    load();
  }, [load, attempt]);

  const destination = trip?.destination?.trim() || "Trip";

  function openCity(city: string) {
    if (!tripId) return;
    router.push({
      pathname: "/(root)/city-details",
      params: { city, tripId },
    });
  }

  /*
   * City-card "Explore" button: resolves the city once (existing geocoder,
   * cached in-session) and opens the City Details POI exploration flow.
   */
  async function openExploreCity(cityName: string) {
    if (!tripId) return;

    try {
      const point = await resolveCityCoordinates(cityName);

      router.push({
        pathname: "/(root)/city-details",
        params: {
          city: cityName.trim(),
          tripId,
          lat: String(point.latitude),
          lon: String(point.longitude),
          state: point.state ?? "",
          country: point.country ?? "",
        },
      });
    } catch (error) {
      console.warn(
        `Could not resolve coordinates for "${cityName}":`,
        error
      );
    }
  }

  function retry() {
    setAttempt((value) => value + 1);
  }

  const cities = trip ? tripCitySequence(trip, stops) : [];
  const nextStop =
    trip && trip.lifecycle === "active"
      ? nextCheckpoint(stops, true)?.city ?? null
      : null;

  const segment: JourneySegment | null = trip
    ? getCurrentJourneySegment(trip, stops)
    : null;

  const segmentCities = segment
    ? [segment.origin, segment.destination]
    : cities.length >= 2
      ? [cities[0], cities[cities.length - 1]]
      : [];

  const segmentTransports =
    trip && cities.length >= 2
      ? buildSegmentTransports(trip, stops, transports)
      : [];
  const hasTransportInfo = segmentTransports.some(
    (segment) => segment.transport
  );

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.fixedHeader}>
        <PageHeader
          title={trip ? `Trip to ${destination}` : "Trip Details"}
          subtitle={trip ? `${formatDateRange(trip.start_date, trip.end_date)} • ${trip.source_city?.trim() || "Source"} → ${trip.destination?.trim() || "Destination"}` : undefined}
        />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
      >
        {loadState === "loading" ? (
          <View style={styles.center}>
            <BlockLoading label="Loading your trip…" />
          </View>
        ) : null}

        {loadState === "error" ? (
          <View style={styles.center}>
            <Ionicons name="alert-circle-outline" size={40} color={theme.textMuted} />
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
          <>
            {trip.lifecycle === "active" ? (
              <View style={styles.block}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() =>
                    router.push({
                      pathname: "/(root)/live-journey",
                      params: { tripId },
                    })
                  }
                  style={({ pressed }) => [
                    styles.liveBanner,
                    pressed && styles.liveBannerPressed,
                  ]}
                >
                  <View style={styles.liveIcon}>
                    <Ionicons name="pulse" size={18} color={theme.onPrimary} />
                  </View>
                  <View style={styles.liveBody}>
                    <Text style={styles.liveTitle}>Live Journey</Text>
                    <Text style={styles.liveSubtitle}>
                      Follow this trip in real time with live transport status.
                    </Text>
                  </View>
                  <Ionicons name="arrow-forward" size={18} color={theme.onPrimary} />
                </Pressable>
              </View>
            ) : null}

            {segmentCities.length >= 2 ? (
              <View style={styles.block}>
                <MapSection
                  segmentCities={segmentCities}
                  fullRouteCities={cities}
                  mapMode={selectedMapMode}
                  onToggleMapMode={
                    cities.length > 2
                      ? () => setSelectedMapMode((m) => m === "segment" ? "full" : "segment")
                      : undefined
                  }
                />
              </View>
            ) : null}

            <View style={styles.block}>
              <View style={styles.metricsRow}>
                <View style={styles.metricItem}>
                  <Ionicons name="navigate-outline" size={14} color="#00BC26" />
                  <Text style={styles.metricLabel}>From</Text>
                  <Text style={styles.metricValue} numberOfLines={1}>{segment?.origin ?? trip.source_city ?? "—"}</Text>
                </View>
                <View style={styles.metricDivider} />
                <View style={styles.metricItem}>
                  <Ionicons name="location-outline" size={14} color="#00BC26" />
                  <Text style={styles.metricLabel}>To</Text>
                  <Text style={styles.metricValue} numberOfLines={1}>{segment?.destination ?? trip.destination ?? "—"}</Text>
                </View>
                <View style={styles.metricDivider} />
                <View style={styles.metricItem}>
                  <Ionicons name="flag-outline" size={14} color="#00BC26" />
                  <Text style={styles.metricLabel}>Stops</Text>
                  <Text style={styles.metricValue}>{stops.length}</Text>
                </View>
                <Pressable
                  onPress={() => setInfoVisible(true)}
                  style={({ pressed }) => [styles.infoButton, pressed && styles.pressed]}
                >
                  <Ionicons name="information-circle-outline" size={18} color="#00BC26" />
                </Pressable>
              </View>
            </View>

            <View style={styles.block}>
              <TodayInfoCard
                trip={trip}
                nextStop={nextStop}
                segment={segment}
                stops={stops}
              />
            </View>

            {hasTransportInfo ? (
              <View style={styles.block}>
                <Text style={styles.blockHeading}>Transport</Text>
                <SegmentTransportList
                  segments={segmentTransports}
                  journeyCities={cities}
                  onOpenCity={openCity}
                />
              </View>
            ) : null}

            {stops.length > 0 ? (
              <View style={styles.block}>
                <Text style={styles.blockHeading}>Upcoming Stops</Text>
                <StopsTimeline
                  source={trip.source_city?.trim() || "Source"}
                  destination={trip.destination?.trim() || "Destination"}
                  stops={stops}
                  activeStopCity={nextStop}
                  lifecycle={trip.lifecycle}
                  onOpenCity={openCity}
                  onExploreCity={openExploreCity}
                />
              </View>
            ) : null}

            {cities.length > 0 ? (
              <View style={styles.block}>
                <Text style={styles.blockHeading}>Weather Along Your Route</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.weatherScroll}
                >
                  {cities.map((city) => (
                    <WeatherCard
                      key={city}
                      city={city}
                      compact
                      onOpenCity={openCity}
                      onExploreCity={openExploreCity}
                    />
                  ))}
                </ScrollView>
              </View>
            ) : null}

            {trip.destination ? (
              <View style={styles.block}>
                <FunFactCard city={trip.destination} compact onOpenCity={openCity} />
              </View>
            ) : null}

            <View style={styles.block}>
              <LiveUpdatesSection info={liveUpdates} />
            </View>

            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/(root)/saathi")}
              style={({ pressed }) => [
                styles.saathiBanner,
                pressed && styles.saathiBannerPressed,
              ]}
            >
              <View style={styles.saathiIcon}>
                <Ionicons name="chatbubbles-outline" size={20} color={dark ? theme.primary : "#08751F"} />
              </View>
              <View style={styles.saathiBody}>
                <Text style={styles.saathiTitle}>Need help on your journey?</Text>
                <Text style={styles.saathiSubtitle}>
                  Ask Saathi for route info, places, weather, or any travel help.
                </Text>
              </View>
              <Text style={styles.saathiCTA}>Ask Saathi →</Text>
            </Pressable>
          </>
        ) : null}
      </ScrollView>

      <Modal
        visible={infoVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setInfoVisible(false)}
      >
        <SafeAreaView style={styles.modalSafe}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Trip Overview</Text>
            <Pressable
              onPress={() => setInfoVisible(false)}
              style={({ pressed }) => [styles.modalClose, pressed && styles.pressed]}
            >
              <Ionicons name="close" size={24} color={theme.text} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.modalContent}>
            {trip ? (
              <TripOverviewCard
                trip={trip}
                lifecycle={trip.lifecycle}
                stopCount={stops.length}
                onOpenCity={(city) => {
                  setInfoVisible(false);
                  openCity(city);
                }}
              />
            ) : null}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const createStyles = (theme: ThemeTokens, dark: boolean) =>
  StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: theme.background,
    },
    scroll: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: 16,
      paddingBottom: 40,
    },
    fixedHeader: {
      backgroundColor: theme.background,
    },
    block: {
      marginTop: 18,
    },
    blockHeading: {
      fontSize: 16,
      fontWeight: "800",
      color: theme.text,
      marginBottom: 10,
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
      color: theme.text,
    },
    centerText: {
      fontSize: 13,
      color: theme.textSecondary,
      textAlign: "center",
    },
    retryButton: {
      marginTop: 14,
      paddingHorizontal: 22,
      paddingVertical: 11,
      borderRadius: 999,
      backgroundColor: theme.primary,
    },
    retryButtonText: {
      fontSize: 14,
      fontWeight: "700",
      color: theme.onPrimary,
    },
    pressed: {
      opacity: 0.7,
    },

    metricsRow: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: theme.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 12,
    },
    metricItem: {
      flex: 1,
      alignItems: "center",
      gap: 2,
    },
    metricLabel: {
      fontSize: 10,
      fontWeight: "600",
      color: theme.textMuted,
      textTransform: "uppercase",
      letterSpacing: 0.4,
    },
    metricValue: {
      fontSize: 13,
      fontWeight: "700",
      color: theme.text,
      textAlign: "center",
    },
    metricDivider: {
      width: 1,
      height: 28,
      backgroundColor: theme.border,
    },
    infoButton: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: theme.primaryLight,
      alignItems: "center",
      justifyContent: "center",
      marginLeft: 8,
    },

    liveBanner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      borderRadius: 16,
      backgroundColor: theme.primary,
      padding: 16,
      shadowColor: "#000000",
      shadowOpacity: 0.12,
      shadowRadius: 12,
      shadowOffset: {
        width: 0,
        height: 4,
      },
      elevation: 4,
    },
    liveBannerPressed: {
      opacity: 0.9,
    },
    liveIcon: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: "rgba(255,255,255,0.22)",
      alignItems: "center",
      justifyContent: "center",
    },
    liveBody: {
      flex: 1,
      gap: 2,
    },
    liveTitle: {
      fontSize: 15,
      fontWeight: "800",
      color: theme.onPrimary,
    },
    liveSubtitle: {
      fontSize: 12,
      color: theme.onPrimary,
      lineHeight: 16,
      opacity: 0.85,
    },

    weatherScroll: {
      gap: 10,
      paddingVertical: 2,
    },

    saathiBanner: {
      marginTop: 18,
      borderRadius: 16,
      backgroundColor: theme.primaryLight,
      borderWidth: 1,
      borderColor: dark ? "rgba(0,188,38,0.35)" : "#BEEBC5",
      padding: 16,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    saathiBannerPressed: {
      opacity: 0.8,
    },
    saathiIcon: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: theme.surface,
      alignItems: "center",
      justifyContent: "center",
    },
    saathiBody: {
      flex: 1,
      gap: 2,
    },
    saathiTitle: {
      fontSize: 14,
      fontWeight: "800",
      color: dark ? theme.primary : "#08751F",
    },
    saathiSubtitle: {
      fontSize: 12,
      color: dark ? theme.primary : "#08751F",
      lineHeight: 16,
    },
    saathiCTA: {
      fontSize: 13,
      fontWeight: "700",
      color: dark ? theme.primary : "#08751F",
    },

    modalSafe: {
      flex: 1,
      backgroundColor: theme.background,
    },
    modalHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 20,
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
      backgroundColor: theme.surface,
    },
    modalTitle: {
      fontSize: 18,
      fontWeight: "800",
      color: theme.text,
    },
    modalClose: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: theme.surfaceSecondary,
      alignItems: "center",
      justifyContent: "center",
    },
    modalContent: {
      padding: 16,
    },
  });
