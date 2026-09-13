import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import PageHeader from "../../components/PageHeader";
import FunFactCard from "../../components/trip/FunFactCard";
import LiveUpdatesSection from "../../components/trip/LiveUpdatesSection";
import MapSection from "../../components/trip/MapSection";
import PlacesSection from "../../components/trip/PlacesSection";
import SegmentTransportList, {
  buildSegmentTransports,
} from "../../components/trip/SegmentTransportList";
import StopsTimeline from "../../components/trip/StopsTimeline";
import TodayInfoCard from "../../components/trip/TodayInfoCard";
import TripOverviewCard from "../../components/trip/TripOverviewCard";
import RouteAttractionsSection from "../../components/trip/RouteAttractionsSection";
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
import type { RouteAttraction } from "../../services/placesApi";
import type { TripStop, TripTransport } from "../../services/tripsApi";
import {
  CITY_EXPLORE_CATEGORIES,
  categoryConfig,
  CUSTOM_SEARCH_CATEGORY_ID,
  CUSTOM_SEARCH_HINT,
  CUSTOM_SEARCH_PLACEHOLDER,
} from "../../services/cityDiscoveryApi";

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
  const [transports, setTransports] = useState<TripTransport[]>([]);
  const [routeAttractions, setRouteAttractions] = useState<RouteAttraction[]>(
    []
  );
  const [attempt, setAttempt] = useState(0);

  const [infoVisible, setInfoVisible] = useState(false);
  const [selectedMapMode, setSelectedMapMode] = useState<"segment" | "full">("segment");
  const [selectedExploreCity, setSelectedExploreCity] = useState<string | null>(null);
  const [selectedExploreCategory, setSelectedExploreCategory] = useState<string>("tourist-attraction");
  const [customCategory, setCustomCategory] = useState("");
  const [liveUpdates, setLiveUpdates] = useState<LiveUpdatesInfo | null>(null);

  const load = useCallback(async () => {
    if (!tripId) {
      setLoadState("error");
      return;
    }

    setLoadState("loading");
    setRouteAttractions([]);

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

  function openAttractionCity(attraction: RouteAttraction) {
    if (!attraction.nearestCity) return;
    openCity(attraction.nearestCity);
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

  const exploreCity = selectedExploreCity ?? nextStop ?? trip?.destination ?? null;

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
          <>
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
                  attractions={routeAttractions}
                  onAttractionPress={openAttractionCity}
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
                    />
                  ))}
                </ScrollView>
              </View>
            ) : null}

            {cities.length > 0 ? (
              <View style={styles.block}>
                <RouteAttractionsSection
                  cities={cities}
                  onSelectAttraction={openAttractionCity}
                  onAttractionsLoaded={setRouteAttractions}
                />
              </View>
            ) : null}

            {exploreCity ? (
              <View style={styles.block}>
                <Text style={styles.blockHeading}>Explore {exploreCity}</Text>
                {cities.length > 1 ? (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.cityChips}
                  >
                    {cities.map((city) => (
                      <Pressable
                        key={city}
                        onPress={() => setSelectedExploreCity(city)}
                        style={({ pressed }) => [
                          styles.chip,
                          exploreCity === city && styles.chipActive,
                          pressed && styles.pressed,
                        ]}
                      >
                        <Text style={[
                          styles.chipText,
                          exploreCity === city && styles.chipTextActive,
                        ]}>
                          {city}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                ) : null}

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.categoryRow}
                >
                  {CITY_EXPLORE_CATEGORIES.map((cat) => (
                    <Pressable
                      key={cat.id}
                      onPress={() => setSelectedExploreCategory(cat.id)}
                      style={({ pressed }) => [
                        styles.categoryChip,
                        selectedExploreCategory === cat.id && styles.categoryChipActive,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Ionicons
                        name={cat.icon}
                        size={14}
                        color={selectedExploreCategory === cat.id ? "#FFFFFF" : "#00BC26"}
                      />
                      <Text style={[
                        styles.categoryChipText,
                        selectedExploreCategory === cat.id && styles.categoryChipTextActive,
                      ]}>
                        {cat.label}
                      </Text>
                    </Pressable>
                  ))}

                  <Pressable
                    onPress={() => setSelectedExploreCategory(CUSTOM_SEARCH_CATEGORY_ID)}
                    style={({ pressed }) => [
                      styles.categoryChip,
                      selectedExploreCategory === CUSTOM_SEARCH_CATEGORY_ID && styles.categoryChipActive,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Ionicons
                      name="search-outline"
                      size={14}
                      color={selectedExploreCategory === CUSTOM_SEARCH_CATEGORY_ID ? "#FFFFFF" : "#00BC26"}
                    />
                    <Text style={[
                      styles.categoryChipText,
                      selectedExploreCategory === CUSTOM_SEARCH_CATEGORY_ID && styles.categoryChipTextActive,
                    ]}>
                      Custom
                    </Text>
                  </Pressable>
                </ScrollView>

                {selectedExploreCategory === CUSTOM_SEARCH_CATEGORY_ID ? (
                  <TextInput
                    value={customCategory}
                    onChangeText={setCustomCategory}
                    placeholder={CUSTOM_SEARCH_PLACEHOLDER}
                    placeholderTextColor="#9CA3AF"
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="search"
                    style={styles.customInput}
                  />
                ) : null}

                <View style={styles.exploreResults}>
                  {selectedExploreCategory === CUSTOM_SEARCH_CATEGORY_ID ? (
                    customCategory.trim() ? (
                      <PlacesSection
                        title={customCategory.trim()}
                        categories={[]}
                        customCategory={customCategory.trim()}
                        city={exploreCity}
                        limit={6}
                      />
                    ) : (
                      <View style={styles.customHint}>
                        <Ionicons name="search-outline" size={18} color="#9CA3AF" />
                        <Text style={styles.customHintText}>{CUSTOM_SEARCH_HINT}</Text>
                      </View>
                    )
                  ) : (
                    <PlacesSection
                      title={categoryConfig(selectedExploreCategory)?.label ?? "Places"}
                      categories={[selectedExploreCategory]}
                      city={exploreCity}
                      limit={6}
                    />
                  )}
                </View>
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
                <Ionicons name="chatbubbles-outline" size={20} color="#08751F" />
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
              <Ionicons name="close" size={24} color="#1C1C1E" />
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
  fixedHeader: {
    backgroundColor: "#F7F8FA",
  },
  block: {
    marginTop: 18,
  },
  blockHeading: {
    fontSize: 16,
    fontWeight: "800",
    color: "#1C1C1E",
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

  metricsRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
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
    color: "#9CA3AF",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  metricValue: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1C1C1E",
    textAlign: "center",
  },
  metricDivider: {
    width: 1,
    height: 28,
    backgroundColor: "#F1F3F5",
  },
  infoButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#E7F9EB",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },

  weatherScroll: {
    gap: 10,
    paddingVertical: 2,
  },

  cityChips: {
    gap: 8,
    marginBottom: 10,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  chipActive: {
    backgroundColor: "#E7F9EB",
    borderColor: "#00BC26",
  },
  chipText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#6B7280",
  },
  chipTextActive: {
    color: "#007A1E",
    fontWeight: "700",
  },

  categoryRow: {
    gap: 8,
    marginBottom: 12,
  },
  categoryChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "#E7F9EB",
    borderWidth: 1,
    borderColor: "#BEEBC5",
  },
  categoryChipActive: {
    backgroundColor: "#00BC26",
    borderColor: "#00BC26",
  },
  categoryChipText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#007A1E",
  },
  categoryChipTextActive: {
    color: "#FFFFFF",
  },

  exploreResults: {
    marginTop: 2,
  },

  customInput: {
    marginBottom: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: "#1C1C1E",
  },

  customHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  customHintText: {
    flex: 1,
    fontSize: 13,
    color: "#71717A",
  },

  saathiBanner: {
    marginTop: 18,
    borderRadius: 16,
    backgroundColor: "#E7F9EB",
    borderWidth: 1,
    borderColor: "#BEEBC5",
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
    backgroundColor: "#FFFFFF",
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
    color: "#08751F",
  },
  saathiSubtitle: {
    fontSize: 12,
    color: "#08751F",
    lineHeight: 16,
  },
  saathiCTA: {
    fontSize: 13,
    fontWeight: "700",
    color: "#08751F",
  },

  modalSafe: {
    flex: 1,
    backgroundColor: "#F7F8FA",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F3F5",
    backgroundColor: "#FFFFFF",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#1C1C1E",
  },
  modalClose: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  modalContent: {
    padding: 16,
  },
});
