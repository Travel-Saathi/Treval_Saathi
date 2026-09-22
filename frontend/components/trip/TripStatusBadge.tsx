import { StyleSheet, Text, View, type TextStyle, type ViewStyle } from "react-native";

import type { TripLifecycle } from "../../services/liveTripsApi";

interface BadgePalette {
  badge: ViewStyle;
  dot: ViewStyle;
  label: TextStyle;
}

/**
 * Lifecycle badge used on every trip card. Colours follow the spec:
 * ACTIVE (green), UPCOMING (amber), COMPLETED (neutral grey).
 */
export default function TripStatusBadge({
  status,
}: {
  status: TripLifecycle;
}) {
  const palette: BadgePalette =
    status === "active"
      ? ACTIVE_PALETTE
      : status === "upcoming"
        ? UPCOMING_PALETTE
        : COMPLETED_PALETTE;

  const label =
    status === "active"
      ? "Active"
      : status === "upcoming"
        ? "Upcoming"
        : "Completed";

  return (
    <View style={[styles.badge, palette.badge]}>
      <View style={[styles.dot, palette.dot]} />
      <Text style={[styles.label, palette.label]}>{label}</Text>
    </View>
  );
}

const ACTIVE_PALETTE: BadgePalette = {
  badge: { backgroundColor: "#E7F9EB" },
  dot: { backgroundColor: "#00BC26" },
  label: { color: "#007A1E" },
};

const UPCOMING_PALETTE: BadgePalette = {
  badge: { backgroundColor: "#FFF4E0" },
  dot: { backgroundColor: "#F59E0B" },
  label: { color: "#B45309" },
};

const COMPLETED_PALETTE: BadgePalette = {
  badge: { backgroundColor: "#F1F3F5" },
  dot: { backgroundColor: "#9CA3AF" },
  label: { color: "#6B7280" },
};

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    gap: 6,
    backgroundColor: "#F1F3F5",
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: "#9CA3AF",
  },
  label: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    color: "#6B7280",
  },
});