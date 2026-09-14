import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, Pressable, View } from "react-native";
import { formatShortDate } from "../../lib/tripDates";

type IoniconName = keyof typeof Ionicons.glyphMap;

interface TimelineCity {
  key: string;
  name: string;
  kind: "source" | "stop" | "destination";
  arrival?: string | null;
  departure?: string | null;
  index?: number;
  status?: "completed" | "current" | "upcoming";
}

function computeStatus(
  cityIndex: number,
  activeStopCity: string | null | undefined,
  cities: { name: string; kind: string }[]
): "completed" | "current" | "upcoming" {
  if (!activeStopCity) return "upcoming";

  const activeIdx = cities.findIndex(
    (c) => c.name.toLowerCase() === activeStopCity.toLowerCase()
  );

  if (activeIdx < 0) return "upcoming";
  if (cityIndex < activeIdx) return "completed";
  if (cityIndex === activeIdx) return "current";
  return "upcoming";
}

const STATUS_COLORS = {
  completed: { bg: "#00BC26", border: "#00BC26" },
  current: { bg: "#0EA5E9", border: "#0EA5E9" },
  upcoming: { bg: "#FFFFFF", border: "#D1D5DB" },
};

export default function StopsTimeline({
  source,
  destination,
  stops,
  activeStopCity,
  lifecycle,
  onOpenCity,
  onExploreCity,
}: {
  source: string;
  destination: string;
  stops: { id: string; city: string; arrival_date?: string | null; departure_date?: string | null; }[];
  activeStopCity?: string | null;
  lifecycle?: "active" | "upcoming" | "completed";
  onOpenCity: (city: string) => void;
  onExploreCity?: (city: string) => void;
}) {
  const cities: TimelineCity[] = [
    { key: "source", name: source, kind: "source" },
    ...stops.map((stop, index) => ({
      key: stop.id, name: stop.city, kind: "stop" as const,
      arrival: stop.arrival_date ?? null, departure: stop.departure_date ?? null, index: index + 1,
    })),
    { key: "destination", name: destination, kind: "destination" },
  ];

  const enriched = cities.map((city, index) => {
    let status: "completed" | "current" | "upcoming" = "upcoming";

    if (lifecycle === "completed") {
      status = "completed";
    } else if (lifecycle === "active") {
      if (index === 0) {
        status = "completed";
      } else {
        status = computeStatus(index, activeStopCity ?? cities[1]?.name, cities);
      }
    }

    return { ...city, status };
  });

  return (
    <View style={styles.timeline}>
      {enriched.map((city, index) => {
        const isLast = index === enriched.length - 1;
        const status = city.status ?? "upcoming";
        const palette = STATUS_COLORS[status];
        const isFilled = status === "completed" || status === "current";

        const icon: IoniconName = city.kind === "source"
          ? "navigate"
          : city.kind === "destination"
            ? "star"
            : status === "current"
              ? "radio"
              : "location";

        return (
          <View key={city.key} style={styles.row}>
            <View style={styles.rail}>
              <View style={styles.markerWrap}>
                <View style={[
                  styles.marker,
                  { backgroundColor: palette.bg, borderColor: palette.border },
                  status === "upcoming" && styles.markerUpcoming,
                ]}>
                  <Ionicons
                    name={icon}
                    size={city.kind === "stop" ? 10 : 12}
                    color={isFilled ? "#FFFFFF" : "#9CA3AF"}
                  />
                </View>
              </View>
              {!isLast ? <View style={[styles.railLine, status === "completed" && styles.railLineCompleted]} /> : null}
            </View>
            <View style={styles.cityRow}>
              <View style={styles.cityNameRow}>
                {city.kind === "stop" && city.index !== undefined ? (
                  <Text style={[
                    styles.stopOrder,
                    status === "completed" && styles.stopOrderCompleted,
                    status === "current" && styles.stopOrderCurrent,
                  ]}>{city.index}</Text>
                ) : null}
                <Text
                  style={[
                    styles.cityName,
                    city.kind === "destination" && styles.cityNameStrong,
                    status === "completed" && styles.cityNameCompleted,
                    status === "current" && styles.cityNameCurrent,
                  ]}
                  onPress={() => onOpenCity(city.name)}
                >
                  {city.name}
                </Text>
                {status === "current" ? (
                  <View style={styles.currentBadge}>
                    <Text style={styles.currentBadgeText}>NOW</Text>
                  </View>
                ) : null}
              </View>
              {city.arrival || city.departure ? (
                <Text style={styles.cityDates}>
                  {city.arrival ? `Arr ${formatShortDate(city.arrival)}` : ""}
                  {city.arrival && city.departure ? " • " : ""}
                  {city.departure ? `Dep ${formatShortDate(city.departure)}` : ""}
                </Text>
              ) : null}

              {onExploreCity ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Explore ${city.name}`}
                  onPress={() => onExploreCity(city.name)}
                  style={({ pressed }: { pressed: boolean }) => [
                    styles.exploreButton,
                    pressed && styles.pressed,
                  ]}
                >
                  <Ionicons
                    name="map-outline"
                    size={13}
                    color="#007A1E"
                  />
                  <Text style={styles.exploreButtonText}>
                    Explore
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  timeline: { gap: 0 },
  row: { flexDirection: "row" },
  rail: { width: 32, alignItems: "center" },
  markerWrap: { width: 32, alignItems: "center", justifyContent: "center", zIndex: 1 },
  marker: {
    width: 24, height: 24, borderRadius: 12,
    alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: "#00BC26",
  },
  markerUpcoming: {
    backgroundColor: "#FFFFFF",
    borderWidth: 2,
    borderColor: "#D1D5DB",
  },
  railLine: { width: 2, minHeight: 28, flex: 1, backgroundColor: "#E5E7EB" },
  railLineCompleted: { backgroundColor: "#D1FAE5" },
  cityRow: { flex: 1, paddingBottom: 14, paddingTop: 2 },
  cityNameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  stopOrder: {
    minWidth: 18, height: 18, borderRadius: 9,
    backgroundColor: "#F3F4F6", textAlign: "center",
    lineHeight: 18, fontSize: 10, fontWeight: "700", color: "#6B7280", overflow: "hidden",
  },
  stopOrderCompleted: { backgroundColor: "#E7F9EB", color: "#007A1E" },
  stopOrderCurrent: { backgroundColor: "#E0F2FE", color: "#0369A1" },
  cityName: { fontSize: 14, fontWeight: "600", color: "#1C1C1E" },
  cityNameStrong: { fontWeight: "800", color: "#007A1E" },
  cityNameCompleted: { color: "#6B7280" },
  cityNameCurrent: { fontWeight: "700", color: "#0369A1" },
  currentBadge: {
    paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: 6, backgroundColor: "#E0F2FE",
  },
  currentBadgeText: { fontSize: 9, fontWeight: "800", color: "#0369A1", letterSpacing: 0.4 },
  cityDates: { marginTop: 2, fontSize: 11, color: "#71717A" },
  exploreButton: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 7,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "#E7F9EB",
    borderWidth: 1,
    borderColor: "#BEEBC5",
  },
  exploreButtonText: { fontSize: 12, fontWeight: "700", color: "#007A1E" },
  pressed: { opacity: 0.7 },
});
