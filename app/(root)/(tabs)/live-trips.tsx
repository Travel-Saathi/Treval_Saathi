import { useUser } from "@clerk/expo";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import TripCard from "../../../components/trip/TripCard";
import { useSupabase } from "../../../hook/usesupabase";
import { useAppTheme } from "../../../src/theme/ThemeProvider";
import {
  listUserTrips,
  syncTripStatuses,
  toTripSummary,
  type ActiveTripEnrichment,
  type TripLifecycle,
  type TripSummaryCard,
} from "../../../services/liveTripsApi";
import { getTransport, listStops } from "../../../services/tripsApi";

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
        .sort(
          (a, b) =>
            (b.end_date ?? "").localeCompare(a.end_date ?? "")
        ),
    },
  ];

  return sections.filter((section) => section.trips.length > 0);
}

function TripSkeleton() {
  const { theme } = useAppTheme();

  return (
    <View
      style={[
        styles.skeletonCard,
        { backgroundColor: theme.surface, borderColor: theme.border },
      ]}
    >
      <View style={[styles.skeletonCover, { backgroundColor: theme.border }]} />
      <View style={styles.skeletonBody}>
        <View style={[styles.skeletonLineWide, { backgroundColor: theme.border }]} />
        <View style={[styles.skeletonLine, { backgroundColor: theme.border }]} />
        <View style={[styles.skeletonLine, { backgroundColor: theme.border }]} />
      </View>
    </View>
  );
}

export default function LiveTripsScreen() {
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

        // Best-effort: keep the stored status column truthful.
        syncTripStatuses(supabase, rows);

        const summaries = rows.map(toTripSummary);

        if (mounted.current) {
          setTrips(summaries);
        }

        // Light enrichment (stops + transport) only for ACTIVE trips.
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
            // Active-trip enrichment is a nice-to-have; a failure here
            // must never take the list down.
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

  function openTrip(trip: TripSummaryCard) {
    router.push({
      pathname: "/(root)/trip-details",
      params: { tripId: trip.id },
    });
  }

  function planTrip() {
    router.navigate("/(root)/(tabs)");
  }

  const isEmpty = !loading && !failed && trips.length === 0;

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: theme.background }]}
      edges={["bottom"]}
    >
      

      {failed ? (
        <View style={styles.center}>
          <Ionicons name="cloud-offline-outline" size={40} color="#C4C8CF" />
          <Text style={[styles.centerTitle, { color: theme.text }]}>Unable to load your trips</Text>
          <Text style={[styles.centerText, { color: theme.textSecondary }]}>
            Check your connection and try again.
          </Text>
          <Pressable
            onPress={() => load()}
            style={({ pressed }) => [
              styles.ctaButton,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.ctaButtonText}>Retry</Text>
          </Pressable>
        </View>
      ) : null}

      {!failed ? (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load("refresh")}
              tintColor="#00BC26"
            />
          }
        >
          {loading ? (
            <View style={styles.slot}>
              <TripSkeleton />
              <TripSkeleton />
            </View>
          ) : null}

          {!loading && isEmpty ? (
            <View style={styles.center}>
              <Ionicons name="map-outline" size={44} color="#C4C8CF" />
              <Text style={[styles.centerTitle, { color: theme.text }]}>No trips yet</Text>
              <Text style={[styles.centerText, { color: theme.textSecondary }]}>
                Start planning your next journey with Saathi and it will
                show up here.
              </Text>
              <Pressable
                onPress={planTrip}
                style={({ pressed }) => [
                  styles.ctaButton,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.ctaButtonText}>Plan a Trip</Text>
              </Pressable>
            </View>
          ) : null}

          {!loading && !isEmpty ? (
            <View style={styles.slot}>
              {sections.map((section) => (
                <View key={section.lifecycle}>
                  <View style={styles.sectionHeader}>
                    <Text style={[styles.sectionLabel, { color: theme.text }]}>
                      {section.label}
                    </Text>
                    <Text style={styles.sectionCount}>
                      {section.trips.length}
                    </Text>
                  </View>

                  {section.trips.map((trip) => (
                    <View key={trip.id} style={styles.cardSlot}>
                      <TripCard
                        trip={trip}
                        enrichment={enrichment[trip.id]}
                        onOpen={openTrip}
                      />
                    </View>
                  ))}
                </View>
              ))}
            </View>
          ) : null}
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
  header: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 12,
    backgroundColor: "#FFFFFF",
  },
  title: {
    fontSize: 26,
    fontWeight: "800",
    color: "#1C1C1E",
  },
  subtitle: {
    fontSize: 13,
    color: "#71717A",
    marginTop: 3,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 28,
  },
  slot: {
    gap: 16,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
    marginTop: 2,
  },
  sectionLabel: {
    fontSize: 16,
    fontWeight: "800",
    color: "#1C1C1E",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  sectionCount: {
    fontSize: 12,
    fontWeight: "700",
    color: "#007A1E",
    backgroundColor: "#E7F9EB",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    overflow: "hidden",
  },
  cardSlot: {
    marginBottom: 14,
  },
  center: {
    alignItems: "center",
    paddingVertical: 48,
    paddingHorizontal: 28,
    gap: 6,
  },
  centerTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#1C1C1E",
    marginTop: 6,
  },
  centerText: {
    fontSize: 13,
    color: "#71717A",
    textAlign: "center",
  },
  ctaButton: {
    marginTop: 16,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: "#00BC26",
  },
  ctaButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  pressed: {
    opacity: 0.7,
  },
  skeletonCard: {
    borderRadius: 16,
    backgroundColor: "#F1F3F5",
    overflow: "hidden",
  },
  skeletonCover: {
    height: 118,
    backgroundColor: "#E5E7EB",
  },
  skeletonBody: {
    padding: 14,
    gap: 9,
  },
  skeletonLineWide: {
    height: 14,
    width: "70%",
    borderRadius: 7,
    backgroundColor: "#E5E7EB",
  },
  skeletonLine: {
    height: 12,
    width: "90%",
    borderRadius: 6,
    backgroundColor: "#E5E7EB",
  },
});