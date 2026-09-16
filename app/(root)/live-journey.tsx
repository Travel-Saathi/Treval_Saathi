import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import PageHeader from "../../components/PageHeader";
import TripProgressView from "../../components/trip/TripProgressView";
import { BlockLoading } from "../../components/trip/primitives";
import { useSupabase } from "../../hook/usesupabase";
import { useAppTheme } from "../../src/theme/ThemeProvider";
import type { ThemeTokens } from "../../src/theme/tokens";
import {
  getTripDetails,
  toTripSummary,
  type TripSummaryCard,
} from "../../services/liveTripsApi";
import type { TripStop, TripTransport } from "../../services/tripsApi";

type LoadState = "loading" | "ready" | "error";

export default function LiveJourneyScreen() {
  const params = useLocalSearchParams<{ tripId?: string }>();
  const tripId =
    typeof params.tripId === "string" && params.tripId
      ? params.tripId
      : null;
  const supabase = useSupabase();
  const { theme, dark } = useAppTheme();
  const styles = useMemo(() => createStyles(theme, dark), [theme, dark]);

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [trip, setTrip] = useState<TripSummaryCard | null>(null);
  const [stops, setStops] = useState<TripStop[]>([]);
  const [transports, setTransports] = useState<TripTransport[]>([]);
  const [attempt, setAttempt] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!tripId) {
      setLoadState("error");
      return;
    }

    try {
      const bundle = await getTripDetails(supabase, tripId);
      setTrip(toTripSummary(bundle.trip));
      setStops(bundle.stops);
      setTransports(bundle.transports);
      setLoadState("ready");
    } catch {
      setLoadState("error");
    }
  }, [tripId, supabase]);

  useEffect(() => {
    load();
  }, [load, attempt]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  function retry() {
    setAttempt((value) => value + 1);
  }

  const title = trip ? `Journey • ${trip.title?.trim() || trip.destination?.trim() || "Live Journey"}` : "Live Journey";

  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right", "bottom"]}>
      <PageHeader
        title="Live Journey"
        subtitle={title}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor="#00BC26"
            colors={["#00BC26"]}
          />
        }
      >
        {loadState === "loading" ? (
          <View style={styles.center}>
            <BlockLoading label="Loading live journey…" />
          </View>
        ) : null}

        {loadState === "error" ? (
          <View style={styles.center}>
            <Ionicons name="alert-circle-outline" size={40} color={theme.textMuted} />
            <Text style={styles.centerTitle}>Journey could not be loaded</Text>
            <Text style={styles.centerText}>
              The trip may have been deleted or is outside your access.
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
            <TripProgressView
              trip={trip}
              stops={stops}
              transports={transports}
              onTransportsChange={setTransports}
            />

            <Pressable
              accessibilityRole="button"
              onPress={() =>
                router.push({
                  pathname: "/(root)/saathi",
                  params: { tripId, entryContext: "trip" },
                })
              }
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
    </SafeAreaView>
  );
}

const createStyles = (theme: ThemeTokens, dark: boolean) =>
  StyleSheet.create({
    screen: {
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
    saathiBanner: {
      marginTop: 18,
      borderRadius: 16,
      backgroundColor: theme.primaryLight,
      borderWidth: 1,
      borderColor: dark ? "rgba(0, 188, 38, 0.35)" : "#BEEBC5",
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
      color: dark ? theme.textSecondary : "#08751F",
      lineHeight: 16,
    },
    saathiCTA: {
      fontSize: 13,
      fontWeight: "700",
      color: dark ? theme.primary : "#08751F",
    },
  });