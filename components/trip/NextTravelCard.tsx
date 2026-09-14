import { Ionicons } from "@expo/vector-icons";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

/**
 * "NEXT TRAVEL" card shown when the current leg is complete.
 *
 * The arrival countdown comes from the *next* leg's stored departure
 * time — the parent computes it with `countdownLabel(ms)`.
 */
export default function NextTravelCard({
  destination,
  departureTime,
  countdownText,
  onStart,
  loading = false,
}: {
  destination: string;
  departureTime: string | null;
  countdownText: string;
  onStart: () => void;
  loading?: boolean;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <View style={styles.headerBadge}>
          <Ionicons name="arrow-forward" size={13} color="#FFFFFF" />
          <Text style={styles.headerBadgeText}>NEXT TRAVEL</Text>
        </View>
        <Text style={styles.clockLabel}>{departureTime ?? "TBA"}</Text>
      </View>

      <Text style={styles.destination} numberOfLines={1}>
        Chartering to {destination}
      </Text>

      <Text style={styles.destination}>
        Next stop: {destination}
      </Text>

      {departureTime ? (
        <Text style={styles.countdown}>
          {departureTime} — in {countdownText}
        </Text>
      ) : (
        <Text style={styles.countdown}>Departure time not set yet.</Text>
      )}

      <Text style={styles.note}>
        Automatically begins live tracking for the next leg.
      </Text>

      <Pressable
        accessibilityRole="button"
        disabled={loading}
        onPress={onStart}
        style={({ pressed }) => [
          styles.ctaButton,
          pressed && styles.ctaButtonPressed,
          loading && styles.ctaButtonDisabled,
        ]}
      >
        {loading ? (
          <ActivityIndicator size="small" color="#FFFFFF" />
        ) : (
          <>
            <Ionicons name="play" size={16} color="#FFFFFF" />
            <Text style={styles.ctaText}>START NEXT TRAVEL</Text>
          </>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    backgroundColor: "#1F2937",
    padding: 16,
    gap: 8,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "#374151",
  },
  headerBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: 0.6,
  },
  clockLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#D1D5DB",
  },
  destination: {
    fontSize: 16,
    fontWeight: "800",
    color: "#FFFFFF",
    marginTop: 4,
  },
  countdown: {
    fontSize: 13,
    fontWeight: "600",
    color: "#D1D5DB",
  },
  note: {
    fontSize: 12,
    color: "#9CA3AF",
  },
  ctaButton: {
    marginTop: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 52,
    borderRadius: 14,
    backgroundColor: "#00BC26",
  },
  ctaButtonPressed: {
    opacity: 0.85,
  },
  ctaButtonDisabled: {
    opacity: 0.6,
  },
  ctaText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#FFFFFF",
  },
});