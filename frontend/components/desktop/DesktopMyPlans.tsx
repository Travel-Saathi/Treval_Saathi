import { Ionicons } from "@expo/vector-icons";
import { useUser } from "@clerk/expo";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import DesktopLayout from "./DesktopLayout";
import TripCard from "../trip/TripCard";
import { useSupabase } from "../../hook/usesupabase";
import {
  listUserTrips,
  syncTripStatuses,
  toTripSummary,
  type ActiveTripEnrichment,
  type TripLifecycle,
  type TripSummaryCard,
} from "../../services/liveTripsApi";
import { getTransport, listStops } from "../../services/tripsApi";
import { useAppTheme } from "../../src/theme/ThemeProvider";

interface SectionGroup {
  lifecycle: TripLifecycle;
  label: string;
  trips: TripSummaryCard[];
}

function sortByStartAsc(a: TripSummaryCard, b: TripSummaryCard): number {
  return (a.start_date ?? "9999").localeCompare(b.start_date ?? "9999");
}

function groupTrips(trips: TripSummaryCard[]): SectionGroup[] {
  const sections: SectionGroup[] = [
    {
      lifecycle: "active",
      label: "Active",
      trips: trips
        .filter((trip) => trip.lifecycle === "active")
        .sort(sortByStartAsc),
    },
    {
      lifecycle: "upcoming",
      label: "Upcoming",
      trips: trips
        .filter((trip) => trip.lifecycle === "upcoming")
        .sort(sortByStartAsc),
    },
    {
      lifecycle: "completed",
      label: "Completed",
      trips: trips
        .filter((trip) => trip.lifecycle === "completed")
        .sort((a, b) => (b.end_date ?? "").localeCompare(a.end_date ?? "")),
    },
  ];

  return sections.filter((section) => section.trips.length > 0);
}

export default function DesktopMyPlans() {
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
            // Active-trip enrichment is a nice-to-have; never block.
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

  const sections = groupTrips(trips);
  const isEmpty = !loading && !failed && trips.length === 0;

  function openTrip(trip: TripSummaryCard) {
    router.push({
      pathname: "/(root)/trip-details",
      params: { tripId: trip.id },
    });
  }

  return (
    <DesktopLayout
      title="My Plans"
      subtitle="Every journey you've planned with Saathi"
      activeKey="plans"
    >
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={[styles.centerText, { color: theme.textSecondary }]}>
            Loading your trips…
          </Text>
        </View>
      ) : null}

      {!loading && failed ? (
        <View style={styles.center}>
          <Ionicons name="cloud-offline-outline" size={40} color={theme.textMuted} />
          <Text style={[styles.centerTitle, { color: theme.textPrimary }]}>
            Unable to load your trips
          </Text>
          <Text style={[styles.centerText, { color: theme.textSecondary }]}>
            Check your connection and try again.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => load()}
            style={({ pressed }) => [
              styles.ctaButton,
              { backgroundColor: theme.primary },
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.ctaText}>Retry</Text>
          </Pressable>
        </View>
      ) : null}

      {!loading && isEmpty ? (
        <View style={styles.center}>
          <Ionicons name="map-outline" size={44} color={theme.textMuted} />
          <Text style={[styles.centerTitle, { color: theme.textPrimary }]}>
            No trips yet
          </Text>
          <Text style={[styles.centerText, { color: theme.textSecondary }]}>
            Start planning your next journey with Saathi and it will show
            up here.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.navigate("/(root)/(tabs)" as never)}
            style={({ pressed }) => [
              styles.ctaButton,
              { backgroundColor: theme.primary },
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.ctaText}>Plan a Trip</Text>
          </Pressable>
        </View>
      ) : null}

      {!loading && !isEmpty ? (
        <View style={styles.sections}>
          {refreshing ? (
            <View style={styles.refreshNote}>
              <ActivityIndicator size="small" color={theme.primary} />
              <Text style={[styles.refreshText, { color: theme.textMuted }]}>
                Refreshing…
              </Text>
            </View>
          ) : null}

          {sections.map((section) => (
            <View key={section.lifecycle} style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionLabel, { color: theme.textPrimary }]}>
                  {section.label}
                </Text>
                <View
                  style={[styles.sectionCount, { backgroundColor: theme.primaryLight }]}
                >
                  <Text style={[styles.sectionCountText, { color: theme.primaryDark }]}>
                    {section.trips.length}
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Refresh trips"
                  hitSlop={8}
                  onPress={() => load("refresh")}
                  style={({ pressed }) => [
                    styles.refreshButton,
                    { backgroundColor: theme.surfaceSecondary },
                    pressed && styles.pressed,
                  ]}
                >
                  <Ionicons name="refresh" size={16} color={theme.textSecondary} />
                </Pressable>
              </View>

              <View style={styles.grid}>
                {section.trips.map((trip) => (
                  <View key={trip.id} style={styles.gridCell}>
                    <TripCard
                      trip={trip}
                      enrichment={enrichment[trip.id]}
                      onOpen={openTrip}
                    />
                  </View>
                ))}
              </View>
            </View>
          ))}
        </View>
      ) : null}
    </DesktopLayout>
  );
}

const styles = StyleSheet.create({
  sections: {
    gap: 30,
  },
  section: {
    gap: 14,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  sectionLabel: {
    fontSize: 15,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  sectionCount: {
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 2,
  },
  sectionCountText: {
    fontSize: 12,
    fontWeight: "800",
  },
  refreshButton: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: "auto",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 18,
  },
  gridCell: {
    flexGrow: 1,
    flexBasis: 330,
    minWidth: 280,
    maxWidth: 560,
  },
  refreshNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  refreshText: {
    fontSize: 12,
    fontWeight: "600",
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
  },
  ctaButton: {
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