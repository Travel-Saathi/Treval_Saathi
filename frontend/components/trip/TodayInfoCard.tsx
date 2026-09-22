import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { formatDateDisplay, todayIso } from "../../lib/tripDates";
import type { JourneySegment, TripSummaryCard } from "../../services/liveTripsApi";
import type { TripStop } from "../../services/tripsApi";

type IoniconName = keyof typeof Ionicons.glyphMap;

export default function TodayInfoCard({
  trip,
  nextStop,
  segment,
  stops,
}: {
  trip: TripSummaryCard;
  nextStop: string | null;
  segment?: JourneySegment | null;
  stops?: TripStop[];
}) {
  if (trip.lifecycle === "completed") return null;

  const active = trip.lifecycle === "active";
  const icon: IoniconName = active ? "pulse" : "hourglass-outline";

  const lines: { label: string; value: string }[] = [];

  lines.push({ label: "Date", value: formatDateDisplay(todayIso()) });

  if (active) {
    lines.push({ label: "Status", value: "On the move" });
    if (trip.dayIndex !== null && trip.totalDays !== null) {
      lines.push({ label: "Day", value: `${trip.dayIndex} of ${trip.totalDays}` });
    }
    if (nextStop) {
      lines.push({ label: "Next stop", value: nextStop });
    } else if (trip.destination) {
      lines.push({ label: "Heading to", value: trip.destination });
    }
    if (segment) {
      lines.push({ label: "Leg", value: `${segment.origin} → ${segment.destination}` });
    }
    if (stops && stops.length > 0) {
      lines.push({ label: "Stops left", value: `${stops.length}` });
    }
  } else if (trip.daysUntilStart !== null) {
    if (trip.daysUntilStart === 0) {
      lines.push({ label: "Status", value: "Starts today" });
    } else {
      lines.push({ label: "Status", value: `Starts in ${trip.daysUntilStart} day${trip.daysUntilStart === 1 ? "" : "s"}` });
    }
  }

  if (lines.length === 0) return null;

  return (
    <View style={styles.card}>
      <View style={styles.iconWrap}>
        <Ionicons name={icon} size={18} color="#00BC26" />
      </View>
      <View style={styles.body}>
        {lines.map((line) => (
          <View key={line.label} style={styles.lineRow}>
            <Text style={styles.lineLabel}>{line.label}</Text>
            <Text style={styles.lineValue}>{line.value}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row", gap: 10, borderRadius: 14,
    backgroundColor: "#FFFFFF", borderWidth: 1,
    borderColor: "#E5E7EB", padding: 13,
  },
  iconWrap: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: "#E7F9EB",
    alignItems: "center", justifyContent: "center",
  },
  body: { flex: 1, gap: 4 },
  lineRow: { flexDirection: "row", alignItems: "center" },
  lineLabel: { fontSize: 12, color: "#9CA3AF", width: 82 },
  lineValue: { flex: 1, fontSize: 13, fontWeight: "600", color: "#1C1C1E" },
});