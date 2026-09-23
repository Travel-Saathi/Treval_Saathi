import { Ionicons } from "@expo/vector-icons";
import { useUser } from "@clerk/expo";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import DesktopLayout from "./DesktopLayout";
import TripStatusBadge from "../trip/TripStatusBadge";
import WeatherCard from "../trip/WeatherCard";
import { formatDateRange } from "../../lib/tripDates";
import { useSupabase } from "../../hook/usesupabase";
import {
  listUserTrips,
  nextCheckpoint,
  syncTripStatuses,
  toTripSummary,
  transportSummary,
  type ActiveTripEnrichment,
  type TripSummaryCard,
} from "../../services/liveTripsApi";
import { getTransport, listStops } from "../../services/tripsApi";
import { useAppTheme } from "../../src/theme/ThemeProvider";

export default function DesktopLiveUpdates() {
  const { user } = useUser();
  const supabase = useSupabase();
  const { theme } = useAppTheme();
  const mounted = useRef(true);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);
  const [trips, setTrips] = useState<TripSummaryCard[]>([]);
  const [enrichment, setEnrichment] = useState<
    Record<string, ActiveTripEnrichment>
  >({});

  const load = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!user?.id) {
        return;
      }

      if (mode === "initial") {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

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
            // Enrichment is optional; the panel must never break on it.
          }
        }
      } catch {
        if (mounted.current) {
          setFailed(true);
        }
      } finally {
        if (mounted.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [user?.id, supabase]
  );

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const activeTrips = trips.filter((trip) => trip.lifecycle === "active");
  const upcomingCount = trips.filter(
    (trip) => trip.lifecycle === "upcoming"
  ).length;
  const completedCount = trips.filter(
    (trip) => trip.lifecycle === "completed"
  ).length;

  return (
    <DesktopLayout
      title="Live Updates"
      subtitle="Weather, transport and next checkpoints for journeys in motion"
      activeKey="live"
    >
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={[styles.headerTitle, { color: theme.textPrimary }]}>
            {activeTrips.length > 0 ? "Live now" : "Nothing in motion"}
          </Text>
          <Text style={[styles.headerSubtitle, { color: theme.textSecondary }]}>
            {activeTrips.length > 0
              ? `${activeTrips.length} journey${activeTrips.length === 1 ? "" : "s"} are currently active.`
              : `You have ${upcomingCount} upcoming and ${completedCount} completed journeys.`}
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Refresh live updates"
          onPress={() => load("refresh")}
          style={({ pressed }) => [
            styles.refresh,
            { backgroundColor: theme.surface, borderColor: theme.border },
            pressed && styles.pressed,
          ]}
        >
          {refreshing ? (
            <ActivityIndicator size="small" color={theme.primary} />
          ) : (
            <Ionicons name="refresh" size={17} color={theme.textSecondary} />
          )}
          <Text style={[styles.refreshText, { color: theme.textSecondary }]}>
            Refresh
          </Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={[styles.centerText, { color: theme.textSecondary }]}>
            Checking your journeys…
          </Text>
        </View>
      ) : null}

      {!loading && failed ? (
        <View style={styles.center}>
          <Ionicons name="cloud-offline-outline" size={40} color={theme.textMuted} />
          <Text style={[styles.centerTitle, { color: theme.textPrimary }]}>
            Unable to load live updates
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => load()}
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

      {!loading && !failed && activeTrips.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="pulse-outline" size={44} color={theme.textMuted} />
          <Text style={[styles.centerTitle, { color: theme.textPrimary }]}>
            No active journeys yet
          </Text>
          <Text style={[styles.centerText, { color: theme.textSecondary }]}>
            Live updates (weather, transport and next checkpoints) appear
            here while a trip is in motion. Plan a trip to get started.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.navigate("/(root)/(tabs)/plan-trip" as never)}
            style={({ pressed }) => [
              styles.cta,
              { backgroundColor: theme.primary },
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.ctaText}>Plan a Trip</Text>
          </Pressable>
        </View>
      ) : null}

      {!loading && !failed && activeTrips.length > 0 ? (
        <View style={styles.grid}>
          {activeTrips.map((trip) => {
            const enrichmentForTrip = enrichment[trip.id];
            const checkpoint = nextCheckpoint(
              enrichmentForTrip?.stops ?? [],
              true
            );
            const transport = transportSummary(
              enrichmentForTrip?.transport ?? null
            );
            const destination =
              trip.destination?.trim() ||
              checkpoint?.city?.trim() ||
              trip.title ||
              "";

            return (
              <View
                key={trip.id}
                style={[
                  styles.liveCard,
                  { backgroundColor: theme.surface, borderColor: theme.border },
                ]}
              >
                <View style={styles.cardHeader}>
                  <View style={styles.cardTitleBlock}>
                    <Text
                      style={[styles.cardTitle, { color: theme.textPrimary }]}
                      numberOfLines={1}
                    >
                      {trip.title ?? trip.destination ?? "Journey"}
                    </Text>
                    {formatDateRange(trip.start_date, trip.end_date) ? (
                      <Text
                        style={[styles.cardDates, { color: theme.textMuted }]}
                      >
                        {formatDateRange(trip.start_date, trip.end_date)}
                      </Text>
                    ) : null}
                  </View>
                  <TripStatusBadge status={trip.lifecycle} />
                </View>

                <View style={styles.liveRows}>
                  <View style={styles.liveRow}>
                    <Ionicons name="flag" size={16} color={theme.primary} />
                    <Text style={[styles.liveRowLabel, { color: theme.textMuted }]}>
                      Next checkpoint
                    </Text>
                    <Text
                      style={[styles.liveRowValue, { color: theme.textPrimary }]}
                      numberOfLines={1}
                    >
                      {checkpoint
                        ? checkpoint.city || "Next stop"
                        : destination || "—"}
                    </Text>
                  </View>

                  <View style={styles.liveRow}>
                    <Ionicons name="car" size={16} color={theme.primary} />
                    <Text style={[styles.liveRowLabel, { color: theme.textMuted }]}>
                      Transport
                    </Text>
                    <Text
                      style={[styles.liveRowValue, { color: theme.textPrimary }]}
                      numberOfLines={1}
                    >
                      {transport ?? "Not selected"}
                    </Text>
                  </View>
                </View>

                {destination ? (
                  <WeatherCard city={destination} compact />
                ) : null}

                <Pressable
                  accessibilityRole="button"
                  onPress={() =>
                    router.push({
                      pathname: "/(root)/trip-details",
                      params: { tripId: trip.id },
                    })
                  }
                  style={({ pressed }) => [
                    styles.open,
                    { backgroundColor: theme.primaryLight },
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={[styles.openText, { color: theme.primaryDark }]}>
                    Open journey
                  </Text>
                  <Ionicons name="arrow-forward" size={15} color={theme.primaryDark} />
                </Pressable>
              </View>
            );
          })}
        </View>
      ) : null}
    </DesktopLayout>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    flexWrap: "wrap",
    marginBottom: 22,
  },
  headerText: {
    flex: 1,
    minWidth: 260,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 13,
    marginTop: 3,
  },
  refresh: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  refreshText: {
    fontSize: 13,
    fontWeight: "700",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 20,
  },
  liveCard: {
    flexGrow: 1,
    flexBasis: 380,
    minWidth: 330,
    borderRadius: 18,
    borderWidth: 1,
    padding: 18,
    gap: 16,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  cardTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "800",
  },
  cardDates: {
    fontSize: 12,
    marginTop: 2,
  },
  liveRows: {
    gap: 10,
  },
  liveRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  liveRowLabel: {
    fontSize: 12,
    fontWeight: "600",
    width: 112,
  },
  liveRowValue: {
    flex: 1,
    fontSize: 13,
    fontWeight: "700",
  },
  open: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderRadius: 12,
    paddingVertical: 12,
  },
  openText: {
    fontSize: 14,
    fontWeight: "800",
  },
  center: {
    alignItems: "center",
    paddingVertical: 56,
    paddingHorizontal: 24,
    gap: 8,
  },
  centerTitle: {
    fontSize: 18,
    fontWeight: "800",
    marginTop: 4,
  },
  centerText: {
    fontSize: 13,
    textAlign: "center",
    maxWidth: 420,
  },
  retry: {
    marginTop: 10,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  retryText: {
    fontSize: 13,
    fontWeight: "800",
  },
  cta: {
    marginTop: 14,
    borderRadius: 999,
    paddingHorizontal: 22,
    paddingVertical: 11,
  },
  ctaText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
  pressed: {
    opacity: 0.75,
  },
});