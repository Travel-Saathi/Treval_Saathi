import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";

import type {
  TripSummaryCard,
} from "../../services/liveTripsApi";

type IoniconName = keyof typeof Ionicons.glyphMap;

/**
 * Highlight strip for ACTIVE / UPCOMING trips ("Today's important
 * information"). Derived purely from the loaded trip + stops rows; it
 * never blocks on secondary data.
 */
export default function TodayInfoCard({
  trip,
  nextStop,
}: {
  trip: TripSummaryCard;
  nextStop: string | null;
}) {
  if (trip.lifecycle === "completed") {
    return null;
  }

  const active = trip.lifecycle === "active";
  const icon: IoniconName = active ? "pulse" : "hourglass-outline";

  const lines: string[] = [];

  if (active) {
    if (trip.dayIndex !== null && trip.totalDays !== null) {
      lines.push(`Day ${trip.dayIndex} of ${trip.totalDays}`);
    }

    if (nextStop) {
      lines.push(`Next stop: ${nextStop}`);
    } else if (trip.destination) {
      lines.push(`Heading to ${trip.destination}`);
    }

    if (trip.members && trip.members > 1) {
      lines.push(`${trip.members} travellers on this trip`);
    }
  } else if (trip.daysUntilStart !== null) {
    if (trip.daysUntilStart === 0) {
      lines.push("Starts today");
    } else {
      lines.push(
        `Starts in ${trip.daysUntilStart} day${
          trip.daysUntilStart === 1 ? "" : "s"
        }`
      );
    }
  }

  if (lines.length === 0) {
    return null;
  }

  return (
    <View style={styles.card}>
      <View style={styles.iconWrap}>
        <Ionicons name={icon} size={18} color="#F59E0B" />
      </View>
      <View style={styles.body}>
        {lines.map((line) => (
          <Text key={line} style={styles.line}>
            {line}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    gap: 10,
    borderRadius: 14,
    backgroundColor: "#FFF8EC",
    borderWidth: 1,
    borderColor: "#FDE8C8",
    padding: 13,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#FFF1DA",
    alignItems: "center",
    justifyContent: "center",
  },
  body: {
    flex: 1,
    gap: 2,
  },
  line: {
    fontSize: 13,
    fontWeight: "600",
    color: "#7C4A0D",
  },
});