import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";

import { formatDateRange, tripDurationDays } from "../../lib/tripDates";
import type {
  TripLifecycle,
  TripSummaryCard,
} from "../../services/liveTripsApi";
import TripStatusBadge from "./TripStatusBadge";

type IoniconName = keyof typeof Ionicons.glyphMap;

/**
 * Header summary of a trip on Trip Details: pressable cities plus the
 * core planner fields (dates, duration, travellers, budget).
 */
export default function TripOverviewCard({
  trip,
  lifecycle,
  stopCount,
  onOpenCity,
}: {
  trip: TripSummaryCard;
  lifecycle: TripLifecycle;
  stopCount: number;
  onOpenCity: (city: string) => void;
}) {
  const destination = trip.destination?.trim();
  const source = trip.source_city?.trim();
  const duration = tripDurationDays(trip.start_date, trip.end_date);

  const rows: {
    icon: IoniconName;
    label: string;
    value: string | null;
    pressableCity?: string | null;
  }[] = [
    {
      icon: "navigate-outline",
      label: "Source",
      value: source ?? null,
      pressableCity: source ?? null,
    },
    {
      icon: "star-outline",
      label: "Destination",
      value: destination ?? null,
      pressableCity: destination ?? null,
    },
    { icon: "calendar-outline", label: "Dates", value: formatDateRange(trip.start_date, trip.end_date) },
    { icon: "flag-outline", label: "Duration", value: duration !== null ? `${duration} days` : trip.totalDays !== null ? `${trip.totalDays} days` : null },
    { icon: "map-outline", label: "Stops", value: stopCount > 0 ? `${stopCount} en route` : "Direct" },
    { icon: "people-outline", label: "Travellers", value: trip.members !== null && trip.members > 1 ? `${trip.members} people` : "Solo" },
    { icon: "wallet-outline", label: "Budget", value: trip.budget === null || trip.budget === undefined ? null : `₹${trip.budget.toLocaleString("en-IN")}` },
  ];

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <TripStatusBadge status={lifecycle} />
      </View>

      <View style={styles.rows}>
        {rows
          .filter((row) => row.value !== null)
          .map((row) => (
            <View key={row.label} style={styles.row}>
              <View style={styles.rowIconWrap}>
                <Ionicons name={row.icon} size={14} color="#00BC26" />
              </View>
              <Text style={styles.rowLabel}>{row.label}</Text>
              <Text
                style={[
                  styles.rowValue,
                  row.pressableCity ? styles.rowValueLink : null,
                ]}
                numberOfLines={1}
                onPress={
                  row.pressableCity
                    ? () => onOpenCity(row.pressableCity as string)
                    : undefined
                }
              >
                {row.value}
              </Text>
            </View>
          ))}
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
    padding: 16,
  },
  head: {
    flexDirection: "row",
    marginBottom: 12,
  },
  rows: {
    gap: 10,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
  },
  rowIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#E7F9EB",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  rowLabel: {
    width: 92,
    fontSize: 13,
    color: "#71717A",
  },
  rowValue: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: "#1C1C1E",
  },
  rowValueLink: {
    color: "#00BC26",
  },
});