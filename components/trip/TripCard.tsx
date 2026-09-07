import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { weatherConditionLabel } from "../../lib/weatherLabels";
import { formatDateRange } from "../../lib/tripDates";
import { resolveCityCoordinates } from "../../services/routeApi";
import {
  nextCheckpoint,
  transportSummary,
  type ActiveTripEnrichment,
  type TripSummaryCard,
} from "../../services/liveTripsApi";
import { getWeather } from "../../services/weatherApi";
import TripStatusBadge from "./TripStatusBadge";

type IoniconName = keyof typeof Ionicons.glyphMap;

const COVER_PALETTE = [
  "#0E7C4A",
  "#107A8C",
  "#3B5BDB",
  "#7048D0",
  "#B35A00",
  "#0E8A6B",
];

function coverColor(name: string): string {
  let hash = 0;

  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }

  return COVER_PALETTE[hash % COVER_PALETTE.length];
}

/**
 * Lazy weather pill shown only for ACTIVE trips. Fails quietly: if the
 * coordinate or the backend cannot be reached the pill simply does not
 * render (a card must never break because of weather).
 */
function WeatherPill({ city }: { city: string }) {
  const [state, setState] = useState<
    "loading" | "ok" | "none"
  >("loading");
  const [temperature, setTemperature] = useState<number | null>(null);
  const [condition, setCondition] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const point = await resolveCityCoordinates(city);
        const weather = await getWeather(
          point.latitude,
          point.longitude
        );
        const current = weather.current;

        if (
          !cancelled &&
          current &&
          current.temperature !== null
        ) {
          setTemperature(Math.round(current.temperature));
          setCondition(
            current.weatherCode === null
              ? null
              : weatherConditionLabel(current.weatherCode)
          );
          setState("ok");
        } else if (!cancelled) {
          setState("none");
        }
      } catch {
        if (!cancelled) {
          setState("none");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [city]);

  if (state !== "ok" || temperature === null) {
    return null;
  }

  return (
    <View style={styles.weatherPill}>
      <Ionicons name="partly-sunny" size={14} color="#007A1E" />
      <Text style={styles.weatherTemp}>{temperature}°</Text>
      {condition ? (
        <Text style={styles.weatherCondition} numberOfLines={1}>
          {condition}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * A trip on the LIVE TRIPS list. Renders only data that exists and is
 * derived from the loaded rows; it never blocks on secondary fetches.
 */
export default function TripCard({
  trip,
  enrichment,
  coverImageUrl,
  onOpen,
}: {
  trip: TripSummaryCard;
  enrichment?: ActiveTripEnrichment | null;
  coverImageUrl?: string | null;
  onOpen: (trip: TripSummaryCard) => void;
}) {
  const destination = trip.destination?.trim() || "My Trip";
  const source = trip.source_city?.trim();

  const active = trip.lifecycle === "active";
  const stops = enrichment?.stops ?? [];
  const transport = enrichment?.transport ?? null;
  const checkpoint = nextCheckpoint(stops, active);
  const transportLine = transportSummary(transport);

  const meta: { icon: IoniconName; text: string | null }[] = [
    {
      icon: "calendar-outline",
      text: formatDateRange(trip.start_date, trip.end_date),
    },
    {
      icon: "flag-outline",
      text:
        trip.dayIndex !== null && trip.totalDays !== null
          ? `Day ${trip.dayIndex} of ${trip.totalDays}`
          : trip.totalDays !== null
            ? `${trip.totalDays} days`
            : trip.daysUntilStart !== null
              ? trip.daysUntilStart <= 0
                ? "Starts today"
                : `Starts in ${trip.daysUntilStart} day${
                    trip.daysUntilStart === 1 ? "" : "s"
                  }`
              : null,
    },
    {
      icon: "people-outline",
      text:
        trip.members !== null && trip.members > 1
          ? `${trip.members} travellers`
          : null,
    },
    {
      icon: "wallet-outline",
      text:
        trip.budget === null || trip.budget === undefined
          ? null
          : `₹${trip.budget.toLocaleString("en-IN")}`,
    },
    {
      icon: "train-outline",
      text: transportLine,
    },
    {
      icon: "navigate-outline",
      text: checkpoint ? `Next: ${checkpoint.city}` : null,
    },
  ];

  function openCity(city: string) {
    router.push({
      pathname: "/(root)/city-details",
      params: { city, tripId: trip.id },
    });
  }

  const tint = coverColor(destination);

  return (
    <View style={styles.card}>
      <Pressable
        accessibilityRole="button"
        onPress={() => onOpen(trip)}
        style={({ pressed }) => pressed && styles.pressed}
      >
        <View style={[styles.cover, { backgroundColor: tint }]}>
          {coverImageUrl ? (
            <Image
              source={{ uri: coverImageUrl }}
              style={StyleSheet.absoluteFill}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.coverWatermark}>
              <Ionicons name="map" size={72} color="rgba(255,255,255,0.16)" />
            </View>
          )}

          <View style={styles.coverTop}>
            <View style={styles.coverBadge}>
              <TripStatusBadge status={trip.lifecycle} />
            </View>
            {active && destination ? <WeatherPill city={destination} /> : null}
          </View>

          <Text style={styles.coverDestination} numberOfLines={1}>
            {destination}
          </Text>

          <View style={styles.coverRoute}>
            <Text style={styles.coverRouteCity} numberOfLines={1}>
              {source ?? "?"}
            </Text>
            <Ionicons name="arrow-forward" size={13} color="rgba(255,255,255,0.85)" />
            <Text style={styles.coverRouteCity} numberOfLines={1}>
              {destination}
            </Text>
          </View>
        </View>
      </Pressable>

      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={1}>
            {trip.title?.trim() || destination}
          </Text>
          <Text style={styles.destinationLink} onPress={() => openCity(destination)}>
            City →
          </Text>
        </View>

        <View style={styles.metaList}>
          {meta
            .filter((item) => item.text !== null)
            .map((item) => (
              <View key={item.icon} style={styles.metaRow}>
                <Ionicons name={item.icon} size={14} color="#71717A" />
                <Text style={styles.metaText} numberOfLines={1}>
                  {item.text}
                </Text>
              </View>
            ))}
        </View>

        <View style={styles.footer}>
          <Pressable
            onPress={() => onOpen(trip)}
            style={({ pressed }) => [
              styles.openButton,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.openButtonText}>
              {trip.lifecycle === "completed" ? "View Trip" : "Open Trip"}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    overflow: "hidden",
    shadowColor: "#000000",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  pressed: {
    opacity: 0.85,
  },
  cover: {
    height: 118,
    padding: 14,
    justifyContent: "flex-end",
  },
  coverWatermark: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "flex-end",
    justifyContent: "flex-end",
    padding: 8,
  },
  coverTop: {
    position: "absolute",
    top: 12,
    left: 12,
    right: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  coverBadge: {
    borderRadius: 999,
    overflow: "hidden",
  },
  weatherPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.94)",
  },
  weatherTemp: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1C1C1E",
  },
  weatherCondition: {
    fontSize: 11,
    color: "#3F3F46",
    maxWidth: 80,
  },
  coverDestination: {
    fontSize: 22,
    fontWeight: "800",
    color: "#FFFFFF",
    textShadowColor: "rgba(0,0,0,0.25)",
    textShadowRadius: 4,
    textShadowOffset: { width: 0, height: 1 },
  },
  coverRoute: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 4,
  },
  coverRouteCity: {
    flex: 1,
    fontSize: 12,
    color: "rgba(255,255,255,0.92)",
    fontWeight: "600",
  },
  body: {
    padding: 14,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  title: {
    flex: 1,
    fontSize: 16,
    fontWeight: "700",
    color: "#1C1C1E",
  },
  destinationLink: {
    fontSize: 13,
    fontWeight: "700",
    color: "#00BC26",
    marginLeft: 8,
  },
  metaList: {
    gap: 7,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  metaText: {
    flex: 1,
    fontSize: 13,
    color: "#52525B",
  },
  footer: {
    marginTop: 12,
    flexDirection: "row",
  },
  openButton: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: "#00BC26",
    alignItems: "center",
  },
  openButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});