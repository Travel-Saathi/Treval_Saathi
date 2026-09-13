import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";

import {
  getCurrentJourneySegment,
  nextCheckpoint,
  tripCitySequence,
  type TripSummaryCard,
} from "../../services/liveTripsApi";
import { MODE_LABELS, TRANSPORT_MODES, type TransportMode } from "../../services/transportApi";
import type { TripStop, TripTransport } from "../../services/tripsApi";
import { useAppTheme } from "../../src/theme/ThemeProvider";
import TransportCard from "./TransportCard";

type IoniconName = keyof typeof Ionicons.glyphMap;

export interface SegmentTransportItem {
  origin: string;
  destination: string;
  transport: TripTransport | null;
  current: boolean;
  currentLocationOrigin: boolean;
  nextStop: boolean;
}

function norm(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function modeIcon(mode: string | null): IoniconName {
  const matched = TRANSPORT_MODES.find((item) => item.id === (mode ?? ""));
  return matched?.icon ?? "train-outline";
}

function modeLabel(mode: string | null): string {
  if (mode && mode in MODE_LABELS) {
    return MODE_LABELS[mode as TransportMode];
  }

  return "Transport";
}

function findSegmentTransport(
  rows: TripTransport[],
  from: string,
  to: string
): TripTransport | null {
  const matches = rows.filter(
    (row) =>
      norm(row.departure_city) === norm(from) &&
      norm(row.arrival_city) === norm(to)
  );

  return matches.length > 0 ? matches[matches.length - 1] : null;
}

function fallbackTransport(rows: TripTransport[]): TripTransport | null {
  const tripLevel = rows.filter(
    (row) => !norm(row.departure_city) && !norm(row.arrival_city)
  );

  if (tripLevel.length > 0) {
    return tripLevel[tripLevel.length - 1];
  }

  const legacy = rows.filter((row) => norm(row.departure_city));

  return legacy.length === 1 ? legacy[0] : null;
}

/**
 * Match the saved transport rows to each journey leg and decide which leg
 * is "current" using the existing journey-progress logic.
 */
export function buildSegmentTransports(
  trip: TripSummaryCard,
  stops: TripStop[],
  transports: TripTransport[]
): SegmentTransportItem[] {
  const cities = tripCitySequence(trip, stops);
  const active = trip.lifecycle === "active";

  let currentIndex = -1;

  if (active && cities.length > 1) {
    const segment = getCurrentJourneySegment(trip, stops);
    const found = cities.findIndex(
      (city) => norm(city) === norm(segment.origin)
    );

    if (found >= 0 && found < cities.length - 1) {
      currentIndex = found;
    }
  }

  const nextStop = active ? nextCheckpoint(stops, true)?.city ?? null : null;
  const fallback = fallbackTransport(transports);

  const items: SegmentTransportItem[] = [];

  for (let i = 0; i + 1 < cities.length; i += 1) {
    const current = i === currentIndex;
    let transport = findSegmentTransport(transports, cities[i], cities[i + 1]);

    if (
      !transport &&
      fallback &&
      (current || (!active && i === 0))
    ) {
      transport = fallback;
    }

    items.push({
      origin: cities[i],
      destination: cities[i + 1],
      transport,
      current,
      currentLocationOrigin: current,
      nextStop:
        nextStop !== null && norm(cities[i + 1]) === norm(nextStop),
    });
  }

  return items;
}

export default function SegmentTransportList({
  segments,
  onOpenCity,
}: {
  segments: SegmentTransportItem[];
  onOpenCity: (city: string) => void;
}) {
  const { theme } = useAppTheme();

  const hasCurrent = segments.some((segment) => segment.current);
  const upcoming = segments.filter((segment) => !segment.current);

  return (
    <View style={styles.root}>
      {segments.map(
        ({ origin, destination, transport, current, currentLocationOrigin, nextStop }, index) => (
          <View
            key={`${origin}|${destination}|${index}`}
            style={[
              styles.card,
              current && {
                backgroundColor: theme.primaryLight,
                borderColor: theme.primary,
              },
            ]}
          >
            {current ? (
              <View style={[styles.currentChip, { backgroundColor: theme.primary }]}>
                <Ionicons name="pulse" size={11} color="#FFFFFF" />
                <Text style={styles.currentChipText}>CURRENT JOURNEY</Text>
              </View>
            ) : null}

            <View style={styles.locationRow}>
              <View
                style={[
                  styles.node,
                  currentLocationOrigin
                    ? { backgroundColor: theme.primary, borderColor: theme.primary }
                    : { backgroundColor: theme.surface, borderColor: theme.border },
                ]}
              >
                {currentLocationOrigin ? (
                  <Ionicons name="navigate" size={13} color="#FFFFFF" />
                ) : (
                  <View style={[styles.nodeDot, { backgroundColor: theme.textMuted }]} />
                )}
              </View>
              <View style={styles.locationText}>
                <Text
                  style={[styles.cityName, { color: theme.text }]}
                  onPress={() => onOpenCity(origin)}
                >
                  {origin}
                </Text>
                {currentLocationOrigin ? (
                  <Text style={[styles.currentLocationCaption, { color: theme.primaryDark }]}>
                    Current location
                  </Text>
                ) : null}
              </View>
            </View>

            <View style={styles.connectorRow}>
              <View style={[styles.connectorLine, { backgroundColor: theme.border }]} />
              {transport ? (
                <View
                  style={[
                    styles.modePill,
                    { backgroundColor: theme.surface, borderColor: theme.border },
                  ]}
                >
                  <Ionicons name={modeIcon(transport.mode)} size={16} color={theme.primary} />
                  <Text style={[styles.modePillText, { color: theme.text }]}>
                    {modeLabel(transport.mode)}
                  </Text>
                </View>
              ) : null}
              <View style={[styles.connectorLine, { backgroundColor: theme.border }]} />
            </View>

            <View style={styles.locationRow}>
              <View
                style={[
                  styles.node,
                  nextStop
                    ? { backgroundColor: theme.primary, borderColor: theme.primary }
                    : current
                      ? { backgroundColor: theme.primary, borderColor: theme.primary }
                      : { backgroundColor: theme.surface, borderColor: theme.border },
                ]}
              >
                {nextStop ? (
                  <Ionicons name="flag" size={13} color="#FFFFFF" />
                ) : (
                  <View style={[styles.nodeDot, { backgroundColor: theme.textMuted }]} />
                )}
              </View>
              <View style={styles.locationText}>
                <View style={styles.destinationTitleRow}>
                  <Text
                    style={[
                      styles.cityName,
                      styles.cityNameStrong,
                      { color: theme.text },
                    ]}
                    onPress={() => onOpenCity(destination)}
                  >
                    {destination}
                  </Text>
                  {nextStop ? (
                    <View style={[styles.nextStopPill, { backgroundColor: theme.surface }]}>
                      <Text style={[styles.nextStopPillText, { color: theme.primaryDark }]}>
                        Next Stop
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>
            </View>

            {transport ? (
              <View style={[styles.transportCardWrap, { marginTop: 12 }]}>
                <TransportCard
                  transport={transport}
                  segmentOrigin={origin}
                  segmentDestination={destination}
                  onOpenCity={onOpenCity}
                />
              </View>
            ) : null}
          </View>
        )
      )}

      {hasCurrent && upcoming.length > 0 ? (
        <View style={styles.upcomingLabelRow}>
          <View style={[styles.upcomingRule, { backgroundColor: theme.border }]} />
          <View style={styles.upcomingLabel}>
            <Ionicons name="arrow-down" size={11} color={theme.textSecondary} />
            <Text style={[styles.upcomingLabelText, { color: theme.textSecondary }]}>
              UPCOMING LEGS
            </Text>
          </View>
          <View style={[styles.upcomingRule, { backgroundColor: theme.border }]} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: 12,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 14,
  },
  currentChip: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    marginBottom: 10,
  },
  currentChipText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: 0.5,
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  node: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  nodeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  locationText: {
    flex: 1,
  },
  cityName: {
    fontSize: 15,
    fontWeight: "700",
  },
  cityNameStrong: {
    fontWeight: "800",
  },
  currentLocationCaption: {
    fontSize: 11,
    fontWeight: "600",
    marginTop: 1,
  },
  destinationTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  nextStopPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#BEEBC5",
  },
  nextStopPillText: {
    fontSize: 10,
    fontWeight: "800",
  },
  connectorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginVertical: 6,
    marginLeft: 5,
  },
  connectorLine: {
    height: 2,
    flex: 1,
  },
  modePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  modePillText: {
    fontSize: 13,
    fontWeight: "700",
  },
  transportCardWrap: {
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.06)",
    paddingTop: 12,
  },
  upcomingLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginVertical: 2,
  },
  upcomingRule: {
    flex: 1,
    height: 1,
  },
  upcomingLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  upcomingLabelText: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
});