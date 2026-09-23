import { Ionicons } from "@expo/vector-icons";
import { useUser } from "@clerk/expo";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import DesktopLayout from "./DesktopLayout";
import DesktopPlanForm from "./DesktopPlanForm";
import DesktopJourneyMap from "./DesktopJourneyMap";
import TripCard from "../trip/TripCard";
import WeatherCard from "../trip/WeatherCard";
import { useSupabase } from "../../hook/usesupabase";
import {
  listUserTrips,
  syncTripStatuses,
  toTripSummary,
  tripCitySequence,
  type ActiveTripEnrichment,
  type TripSummaryCard,
} from "../../services/liveTripsApi";
import { getTransport, listStops } from "../../services/tripsApi";
import { useAppTheme } from "../../src/theme/ThemeProvider";

function aspectOfDay(): string {
  const hour = new Date().getHours();

  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

function firstComplete(cities: string[]): string[] {
  const cleaned = cities.map((city) => city.trim()).filter(Boolean);
  return cleaned.length >= 2 ? cleaned : [];
}

export default function DesktopHome() {
  const { user } = useUser();
  const supabase = useSupabase();
  const { theme } = useAppTheme();
  const mounted = useRef(true);

  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [trips, setTrips] = useState<TripSummaryCard[]>([]);
  const [enrichment, setEnrichment] = useState<
    Record<string, ActiveTripEnrichment>
  >({});

  const load = useCallback(async () => {
    if (!user?.id) {
      return;
    }

    setLoading(true);
    setFailed(false);

    try {
      const rows = await listUserTrips(supabase, user.id);
      syncTripStatuses(supabase, rows);

      const summaries = rows.map(toTripSummary);

      if (mounted.current) {
        setTrips(summaries);
      }

      for (const summary of summaries) {
        if (summary.lifecycle !== "active") {
          continue;
        }

        try {
          const [stops, transport] = await Promise.all([
            listStops(supabase, summary.id),
            getTransport(supabase, summary.id),
          ]);

          if (mounted.current) {
            setEnrichment((prev) => ({
              ...prev,
              [summary.id]: { stops, transport },
            }));
          }
        } catch {
          // Active-trip enrichment is optional; never block the page.
        }
      }
    } catch {
      if (mounted.current) {
        setFailed(true);
      }
    } finally {
      if (mounted.current) {
        setLoading(false);
      }
    }
  }, [user?.id, supabase]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const displayName = user?.firstName || user?.username || "Traveler";
  const greeting = `Good ${aspectOfDay()}, ${displayName}`;

  const activeTrip =
    trips.find((trip) => trip.lifecycle === "active") ?? null;
  const nextTrip =
    trips.find((trip) => trip.lifecycle === "upcoming") ?? null;

  const upcomingCount = trips.filter(
    (trip) => trip.lifecycle === "upcoming"
  ).length;
  const completedCount = trips.filter(
    (trip) => trip.lifecycle === "completed"
  ).length;

  const spotlightTrip = activeTrip ?? nextTrip;
  const spotlightCities = spotlightTrip
    ? firstComplete(
        tripCitySequence(spotlightTrip, enrichment[spotlightTrip.id]?.stops ?? [])
      )
    : [];

  const openTrip = (trip: TripSummaryCard) => {
    router.push({
      pathname: "/(root)/trip-details",
      params: { tripId: trip.id },
    });
  };

  return (
    <DesktopLayout
      title="Home"
      subtitle="Plan, organise and follow every journey"
      activeKey="home"
    >
      {/* Greeting */}
      <View style={styles.greetingRow}>
        <View style={styles.greetingText}>
          <Text style={[styles.greetingTitle, { color: theme.textPrimary }]}>
            {greeting}
          </Text>
          <Text style={[styles.greetingSubtitle, { color: theme.textSecondary }]}>
            Your travel companion for every road ahead.
          </Text>
        </View>
        <View style={styles.greetingChips}>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.navigate("/(root)/(tabs)/live-trips" as never)}
            style={({ pressed }) => [
              styles.chip,
              { backgroundColor: theme.surface, borderColor: theme.border },
              pressed && styles.pressed,
            ]}
          >
            <View style={[styles.chipIcon, { backgroundColor: theme.primaryLight }]}>
              <Ionicons name="navigate" size={14} color={theme.primaryDark} />
            </View>
            <View>
              <Text style={[styles.chipNumber, { color: theme.textPrimary }]}>
                {activeTrip ? trips.filter((t) => t.lifecycle === "active").length : 0}
              </Text>
              <Text style={[styles.chipLabel, { color: theme.textMuted }]}>Active</Text>
            </View>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={() => router.navigate("/(root)/(tabs)/live-trips" as never)}
            style={({ pressed }) => [
              styles.chip,
              { backgroundColor: theme.surface, borderColor: theme.border },
              pressed && styles.pressed,
            ]}
          >
            <View style={[styles.chipIcon, { backgroundColor: theme.primaryLight }]}>
              <Ionicons name="calendar" size={14} color={theme.primaryDark} />
            </View>
            <View>
              <Text style={[styles.chipNumber, { color: theme.textPrimary }]}>
                {upcomingCount}
              </Text>
              <Text style={[styles.chipLabel, { color: theme.textMuted }]}>Upcoming</Text>
            </View>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={() => router.navigate("/(root)/(tabs)/live-trips" as never)}
            style={({ pressed }) => [
              styles.chip,
              { backgroundColor: theme.surface, borderColor: theme.border },
              pressed && styles.pressed,
            ]}
          >
            <View style={[styles.chipIcon, { backgroundColor: theme.primaryLight }]}>
              <Ionicons name="checkmark-done" size={14} color={theme.primaryDark} />
            </View>
            <View>
              <Text style={[styles.chipNumber, { color: theme.textPrimary }]}>
                {completedCount}
              </Text>
              <Text style={[styles.chipLabel, { color: theme.textMuted }]}>Completed</Text>
            </View>
          </Pressable>
        </View>
      </View>

      {/* Hero: plan form + journeys panel */}
      <View style={styles.heroRow}>
        <View style={styles.heroForm}>
          <View style={styles.panelHeader}>
            <View
              style={[styles.panelIcon, { backgroundColor: theme.primaryLight }]}
            >
              <Ionicons name="map" size={18} color={theme.primaryDark} />
            </View>
            <View style={styles.panelHeaderText}>
              <Text style={[styles.panelTitle, { color: theme.textPrimary }]}>
                Plan your next journey
              </Text>
              <Text style={[styles.panelSubtitle, { color: theme.textSecondary }]}>
                Set your cities and dates — we&apos;ll build the route for you.
              </Text>
            </View>
          </View>

          <DesktopPlanForm />
        </View>

        <View style={styles.heroTrips}>
          <View style={styles.panelHeader}>
            <View
              style={[styles.panelIcon, { backgroundColor: theme.primaryLight }]}
            >
              <Ionicons name="airplane" size={18} color={theme.primaryDark} />
            </View>
            <View style={styles.panelHeaderText}>
              <Text style={[styles.panelTitle, { color: theme.textPrimary }]}>
                Your journeys
              </Text>
              <Text style={[styles.panelSubtitle, { color: theme.textSecondary }]}>
                {loading ? "Loading your trips…" : `${trips.length} saved plan${trips.length === 1 ? "" : "s"}`}
              </Text>
            </View>
          </View>

          {loading ? (
            <View style={[styles.loadingPanel, { borderColor: theme.border }]}>
              <ActivityIndicator size="small" color={theme.primary} />
            </View>
          ) : null}

          {!loading && failed ? (
            <View style={[styles.loadingPanel, { borderColor: theme.border }]}>
              <Text style={[styles.panelSubtitle, { color: theme.textSecondary }]}>
                Could not load your trips.
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={load}
                style={({ pressed }) => [
                  styles.retryButton,
                  { backgroundColor: theme.primaryLight },
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.retryText, { color: theme.primaryDark }]}>
                  Retry
                </Text>
              </Pressable>
            </View>
          ) : null}

          {!loading && !failed && trips.length === 0 ? (
            <View style={[styles.loadingPanel, { borderColor: theme.border }]}>
              <Ionicons name="map-outline" size={30} color={theme.textMuted} />
              <Text style={[styles.panelSubtitle, { color: theme.textSecondary }]}>
                No journeys yet — plan your first trip on the left.
              </Text>
            </View>
          ) : null}

          {!loading && !failed && trips.length > 0 ? (
            <View style={styles.tripList}>
              {[activeTrip, nextTrip]
                .filter((trip): trip is TripSummaryCard => Boolean(trip))
                .slice(0, 2)
                .map((trip) => (
                  <TripCard
                    key={trip.id}
                    trip={trip}
                    enrichment={enrichment[trip.id]}
                    onOpen={openTrip}
                  />
                ))}

              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  router.navigate("/(root)/(tabs)/live-trips" as never)
                }
                style={({ pressed }) => [
                  styles.viewAll,
                  { backgroundColor: theme.primaryLight },
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.viewAllText, { color: theme.primaryDark }]}>
                  View all trips
                </Text>
                <Ionicons name="arrow-forward" size={14} color={theme.primaryDark} />
              </Pressable>
            </View>
          ) : null}
        </View>
      </View>

      {/* Journey spotlight */}
      {spotlightTrip && spotlightCities.length >= 2 ? (
        <View style={styles.spotlight}>
          <View style={styles.spotlightHeader}>
            <View style={styles.panelHeader}>
              <View
                style={[styles.panelIcon, { backgroundColor: theme.primaryLight }]}>
                <Ionicons
                  name={activeTrip ? "pulse" : "calendar-outline"}
                  size={18}
                  color={theme.primaryDark}
                />
              </View>
              <View style={styles.panelHeaderText}>
                <Text style={[styles.panelTitle, { color: theme.textPrimary }]}>
                  {activeTrip ? "Live journey" : "Next trip preview"}
                </Text>
                <Text
                  style={[styles.panelSubtitle, { color: theme.textSecondary }]}
                  numberOfLines={1}
                >
                  {spotlightTrip.title ?? spotlightTrip.destination ?? "Journey"}
                </Text>
              </View>
            </View>

            <View style={styles.spotlightActions}>
              {activeTrip ? (
                <WeatherCard
                  city={spotlightTrip.destination ?? spotlightTrip.title ?? ""}
                  compact
                />
              ) : null}
              <Pressable
                accessibilityRole="button"
                onPress={() => openTrip(spotlightTrip)}
                style={({ pressed }) => [
                  styles.openButton,
                  { backgroundColor: theme.primary },
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.openButtonText}>Open</Text>
                <Ionicons name="arrow-forward" size={15} color="#FFFFFF" />
              </Pressable>
            </View>
          </View>

          <DesktopJourneyMap
            key={`${spotlightTrip.id}-${spotlightCities.join(">")}`}
            cities={spotlightCities}
            height={360}
          />
        </View>
      ) : null}
    </DesktopLayout>
  );
}

const styles = StyleSheet.create({
  greetingRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
    flexWrap: "wrap",
    marginBottom: 22,
  },
  greetingText: {
    flex: 1,
    minWidth: 260,
  },
  greetingTitle: {
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  greetingSubtitle: {
    fontSize: 14,
    marginTop: 4,
  },
  greetingChips: {
    flexDirection: "row",
    gap: 10,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minWidth: 96,
  },
  chipIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  chipNumber: {
    fontSize: 16,
    fontWeight: "800",
  },
  chipLabel: {
    fontSize: 11,
    fontWeight: "600",
  },
  heroRow: {
    flexDirection: "row",
    gap: 20,
    alignItems: "stretch",
    flexWrap: "wrap",
  },
  heroForm: {
    flexGrow: 1.15,
    flexBasis: 460,
    minWidth: 0,
  },
  heroTrips: {
    flexGrow: 1,
    flexBasis: 360,
    minWidth: 320,
  },
  panelHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    marginBottom: 14,
  },
  panelIcon: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  panelHeaderText: {
    flex: 1,
    minWidth: 0,
  },
  panelTitle: {
    fontSize: 17,
    fontWeight: "800",
  },
  panelSubtitle: {
    fontSize: 12,
    marginTop: 1,
  },
  loadingPanel: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 22,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    minHeight: 160,
  },
  retryButton: {
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  retryText: {
    fontSize: 13,
    fontWeight: "800",
  },
  tripList: {
    gap: 14,
  },
  viewAll: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 12,
    paddingVertical: 12,
  },
  viewAllText: {
    fontSize: 14,
    fontWeight: "800",
  },
  spotlight: {
    marginTop: 28,
    gap: 16,
  },
  spotlightHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  },
  spotlightActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  openButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  openButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
  },
  pressed: {
    opacity: 0.75,
  },
});