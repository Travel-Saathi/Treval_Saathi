import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";

import {
  modeJourneyHeader,
  SEGMENT_STATUS_LABELS,
  type SegmentStatus,
} from "../../services/tripProgressApi";
import type { TripTransport } from "../../services/tripsApi";
import { useAppTheme } from "../../src/theme/ThemeProvider";

/**
 * Journey card for in-progress legs whose mode has no live provider
 * (bus/flight/cab, or a train with no live data yet).
 *
 * Truthful by design: it shows the saved plan (mode, times, duration) and an
 * explicit note that live tracking for this mode is not available — it never
 * invents a current location or GPS position.
 */
export default function ModeJourneyCard({
  mode,
  transport,
  status,
  origin,
  destination,
}: {
  mode: string | null;
  transport: TripTransport | null;
  status: SegmentStatus;
  origin: string;
  destination: string;
}) {
  const { theme } = useAppTheme();

  const modeKey = String(mode ?? "").trim().toLowerCase();
  const statusLabel = SEGMENT_STATUS_LABELS[status];

  const name =
    transport?.transport_name?.trim() ||
    transport?.transport_number?.trim() ||
    null;
  const times = [
    transport?.departure_time?.trim(),
    transport?.arrival_time?.trim(),
  ];
  const hasTimes = times.some(Boolean);
  const duration = transport?.duration?.trim();
  const price =
    transport?.deal_price?.trim() || transport?.price?.trim() || null;

  return (
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={styles.headerRow}>
        <Text style={styles.heading}>{modeJourneyHeader(mode)}</Text>
        <View style={[styles.statusChip, { backgroundColor: theme.primaryLight }]}>
          <Text style={[styles.statusText, { color: theme.primaryDark }]}>
            {statusLabel}
          </Text>
        </View>
      </View>

      {name ? (
        <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
          {name}
        </Text>
      ) : null}

      <View style={styles.routeRow}>
        <Ionicons name="location-outline" size={15} color={theme.primary} />
        <Text style={[styles.routeCity, { color: theme.text }]} numberOfLines={1}>
          {origin}
        </Text>
        <Ionicons name="arrow-forward" size={14} color={theme.primary} />
        <Text style={[styles.routeCity, styles.routeCityStrong, { color: theme.text }]} numberOfLines={1}>
          {destination}
        </Text>
      </View>

      {hasTimes ? (
        <View style={styles.timesRow}>
          <Text style={[styles.timeText, { color: theme.textSecondary }]}>
            {times[0] ?? "—"}
          </Text>
          <Text style={[styles.timeText, { color: theme.textSecondary }]}>
            {times[1] ?? "—"}
          </Text>
        </View>
      ) : null}

      {duration || price ? (
        <View style={styles.detailRow}>
          {duration ? (
            <View style={styles.detailItem}>
              <Ionicons name="time-outline" size={13} color={theme.textMuted} />
              <Text style={[styles.detailText, { color: theme.textSecondary }]}>{duration}</Text>
            </View>
          ) : null}
          {price ? (
            <View style={styles.detailItem}>
              <Ionicons name="ticket-outline" size={13} color={theme.textMuted} />
              <Text style={[styles.detailText, { color: theme.textSecondary }]}>{price}</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      <View style={styles.noteRow}>
        <Ionicons name="information-circle-outline" size={13} color={theme.textMuted} />
        <Text style={[styles.noteText, { color: theme.textSecondary }]}>
          Live tracking for {modeKey || "this mode"} is not available yet — times shown
          are from your saved plan.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 8,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  heading: {
    flex: 1,
    fontSize: 12,
    fontWeight: "800",
    color: "#08751F",
    letterSpacing: 0.5,
  },
  statusChip: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 999,
  },
  statusText: {
    fontSize: 10,
    fontWeight: "800",
  },
  title: {
    fontSize: 14,
    fontWeight: "800",
  },
  routeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  routeCity: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
  },
  routeCityStrong: {
    fontWeight: "800",
  },
  timesRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 2,
  },
  timeText: {
    fontSize: 12,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  detailItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  detailText: {
    fontSize: 12,
  },
  noteRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    borderRadius: 10,
    backgroundColor: "#F9FAFB",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  noteText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 15,
  },
});