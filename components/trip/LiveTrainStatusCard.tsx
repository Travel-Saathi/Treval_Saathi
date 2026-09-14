import { Ionicons } from "@expo/vector-icons";
import { useMemo } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import type {
  LiveTrainStatusInfo,
  TimeKind,
} from "../../services/liveTrainStatusApi";
import { useAppTheme } from "../../src/theme/ThemeProvider";
import type { ThemeTokens } from "../../src/theme/tokens";

function trainTitle(status: LiveTrainStatusInfo): string | null {
  const name = status.trainName?.trim();
  const number = status.trainNumber?.trim();

  if (name && number) {
    return `${name} • ${number}`;
  }

  return name ?? number ?? null;
}

function timeKindLabel(kind: TimeKind): string | null {
  switch (kind) {
    case "actual":
      return "Actual";
    case "expected":
      return "Expected";
    case "scheduled":
      return "Scheduled";
    default:
      return null;
  }
}

function delayColor(text: string | null, theme: ThemeTokens): string {
  if (!text) {
    return theme.textMuted;
  }

  if (text === "On Time") {
    return theme.primaryDark;
  }

  if (text.endsWith("early")) {
    return theme.warning;
  }

  return theme.danger;
}

function TimeDetailRow({
  label,
  kind,
  time,
}: {
  label: string;
  kind: TimeKind;
  time: string | null;
}) {
  const { theme, dark } = useAppTheme();
  const styles = useMemo(() => createStyles(theme, dark), [theme, dark]);
  const kindLabel = timeKindLabel(kind);

  return (
    <View style={styles.timeRow}>
      <Text style={styles.timeRowLabel}>{label}</Text>

      {kindLabel ? (
        <View
          style={[
            styles.kindChip,
            kind === "actual" && styles.kindChipActual,
            kind === "expected" && styles.kindChipExpected,
            kind === "scheduled" && styles.kindChipScheduled,
          ]}
        >
          <Text
            style={[
              styles.kindChipText,
              kind === "actual" && styles.kindChipTextActual,
              kind === "expected" && styles.kindChipTextExpected,
              kind === "scheduled" && styles.kindChipTextScheduled,
            ]}
          >
            {kindLabel}
          </Text>
        </View>
      ) : null}

      <Text
        style={[styles.timeRowValue, kind === "none" && styles.timeRowEmpty]}
        numberOfLines={1}
      >
        {time ?? "—"}
      </Text>
    </View>
  );
}

export default function LiveTrainStatusCard({
  status,
  refreshing = false,
  liveUnavailable = false,
  onRefresh,
}: {
  status: LiveTrainStatusInfo | null;
  refreshing?: boolean;
  liveUnavailable?: boolean;
  onRefresh?: () => void;
}) {
  const { theme, dark } = useAppTheme();
  const styles = useMemo(() => createStyles(theme, dark), [theme, dark]);

  if (!status) {
    return null;
  }

  const title = trainTitle(status);
  const statusColor = status.onTime === false ? "#EF4444" : theme.primary;
  const overallLabel =
    status.statusLabel ??
    (status.onTime === false ? "Late" : status.arrived ? "Arrived" : null);

  const startingLine = [
    status.startingStation ? `Starting Stop: ${status.startingStation}` : null,
    status.startingTime,
  ]
    .filter(Boolean)
    .join(" • ");

  return (
    <View style={styles.card}>
      <View style={styles.headingRow}>
        <Text style={styles.heading}>🚆 LIVE RUNNING STATUS</Text>

        {onRefresh ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Refresh live status"
            hitSlop={8}
            disabled={refreshing}
            onPress={onRefresh}
            style={({ pressed }) => [
              styles.refreshButton,
              pressed && styles.refreshButtonPressed,
            ]}
          >
            {refreshing ? (
              <ActivityIndicator size="small" color={theme.primaryDark} />
            ) : (
              <Ionicons name="refresh" size={15} color={theme.primaryDark} />
            )}
          </Pressable>
        ) : null}
      </View>

      {title ? (
        <Text style={styles.trainTitle} numberOfLines={1}>
          {title}
        </Text>
      ) : null}

      {startingLine ? (
        <Text style={styles.startingStop}>{startingLine}</Text>
      ) : null}

      {status.arrived ? (
        <View style={styles.arrivedBanner}>
          <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" />
          <Text style={styles.arrivedBannerText}>
            You have arrived at{" "}
            {status.expectedArrivalStation ?? status.currentStation ?? "your destination"}
          </Text>
        </View>
      ) : null}

      {liveUnavailable ? (
        <View style={styles.unavailableRow}>
          <Ionicons name="warning-outline" size={13} color="#B45309" />
          <Text style={styles.unavailableText}>
            ⚠️ Live update unavailable — showing last known status
          </Text>
        </View>
      ) : null}

      {status.stations.length > 1 ? (
        <View style={styles.timeline}>
          {status.stations.map((point, index) => {
            const isCurrent = point.state === "current";
            const isNext = point.state === "next";
            const isDestination = point.state === "destination";
            const isLast = index === status.stations.length - 1;
            const isDeparted = point.stopStatus === "Departed";
            const isArrivedStop = point.stopStatus === "Arrived";

            return (
              <View key={`${point.station ?? "point"}-${index}`} style={styles.timelineRow}>
                <View style={styles.timelineRail}>
                  <View
                    style={[
                      styles.timelineDot,
                      isCurrent && styles.timelineDotCurrent,
                      isNext && styles.timelineDotNext,
                      isDestination && !isCurrent && styles.timelineDotDestination,
                      isCurrent && isArrivedStop && styles.timelineDotDone,
                      (isDeparted || isArrivedStop) && !isCurrent && styles.timelineDotDone,
                    ]}
                  >
                    {isCurrent && !isArrivedStop ? (
                      <View style={styles.timelineDotInner} />
                    ) : null}
                    {isArrivedStop ? (
                      <Ionicons name="checkmark" size={10} color="#FFFFFF" />
                    ) : null}
                  </View>
                  {!isLast ? <View style={styles.timelineLine} /> : null}
                </View>

                <View
                  style={[
                    styles.timelineContent,
                    isCurrent && styles.timelineContentCurrent,
                    isNext && styles.timelineContentNext,
                  ]}
                >
                  <View style={styles.timelineTopRow}>
                    <Text
                      style={[
                        styles.timelineStation,
                        isCurrent && styles.timelineStationCurrent,
                      ]}
                      numberOfLines={1}
                    >
                      {point.station ?? "—"}
                      {point.code ? ` (${point.code})` : ""}
                    </Text>

                    {point.role ? (
                      <View
                        style={[
                          styles.roleChip,
                          isCurrent && styles.roleChipCurrent,
                          isNext && styles.roleChipNext,
                          isDestination && styles.roleChipDestination,
                        ]}
                      >
                        <Text
                          style={[
                            styles.roleChipText,
                            (isCurrent || isNext || isDestination) &&
                              styles.roleChipTextStrong,
                          ]}
                        >
                          {point.role.toUpperCase()}
                        </Text>
                      </View>
                    ) : null}
                  </View>

                  <View style={styles.timelineStatusRow}>
                    {point.stopStatus ? (
                      <Text
                        style={[
                          styles.timelineStatus,
                          isCurrent && styles.timelineStatusCurrent,
                        ]}
                      >
                        {point.stopStatus}
                      </Text>
                    ) : null}

                    {point.delayText ? (
                      <Text
                        style={[
                          styles.timelineDelay,
                          { color: delayColor(point.delayText, theme) },
                        ]}
                      >
                        {point.delayText}
                      </Text>
                    ) : null}

                    {point.distanceKm != null ? (
                      <Text style={styles.timelineMeta}>
                        {point.distanceKm.toFixed(0)} km
                      </Text>
                    ) : null}
                  </View>

                  <View style={styles.timesBox}>
                    <TimeDetailRow
                      label="Arrival"
                      kind={point.arrivalKind}
                      time={point.arrivalTime}
                    />
                    <TimeDetailRow
                      label="Departure"
                      kind={point.departureKind}
                      time={point.departureTime}
                    />
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      ) : null}

      <View style={styles.divider} />

      <View style={styles.grid}>
        {status.currentStation ? (
          <View style={styles.cell}>
            <Text style={styles.cellLabel}>📍 Current Station</Text>
            <Text style={styles.cellValue} numberOfLines={1}>
              {status.currentStation}
              {status.currentStationCode
                ? ` (${status.currentStationCode})`
                : ""}
            </Text>
          </View>
        ) : null}

        <View style={styles.cell}>
          <Text style={styles.cellLabel}>Last updated</Text>
          <View style={styles.statusRow}>
            <Text style={styles.cellValue}>
              {status.lastUpdatedAt ?? "—"}
            </Text>
            {overallLabel ? (
              <View style={[styles.statusPill, { borderColor: statusColor }]}>
                <Ionicons
                  name="ellipse"
                  size={8}
                  color={statusColor}
                  style={{ marginRight: 4 }}
                />
                <Text style={[styles.statusPillText, { color: statusColor }]}>
                  {overallLabel}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        {status.expectedArrivalStation || status.nextStation ? (
          <View style={styles.cell}>
            <Text style={styles.cellLabel} numberOfLines={1}>
              Expected Arrival {status.expectedArrivalStation ?? ""}
            </Text>
            <Text style={styles.arrivalValue}>
              {status.expectedArrivalTime ?? "—"}
            </Text>
          </View>
        ) : null}

        {status.delay ? (
          <View style={styles.cell}>
            <Text style={styles.cellLabel}>Delay</Text>
            <Text style={[styles.cellValue, styles.delayValue]}>
              {status.delay}
            </Text>
          </View>
        ) : null}
      </View>

      {status.source === "schedule" ? (
        <Text style={styles.scheduleNote}>
          Live data not available yet — times from your saved plan.
        </Text>
      ) : null}
    </View>
  );
}

const createStyles = (theme: ThemeTokens, dark: boolean) =>
  StyleSheet.create({
    card: {
      borderRadius: 16,
      backgroundColor: "#FFFFFF",
      borderWidth: 1,
      borderColor: theme.border,
      padding: 14,
    },
  headingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  heading: {
    fontSize: 12,
    fontWeight: "800",
    color: theme.primaryDark,
    letterSpacing: 0.5,
  },
  refreshButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: theme.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  refreshButtonPressed: {
    opacity: 0.7,
  },
  trainTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: theme.text,
  },
  startingStop: {
    fontSize: 12,
    color: theme.textMuted,
    marginTop: 2,
  },
  arrivedBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginTop: 10,
    borderRadius: 12,
    backgroundColor: theme.primary,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  arrivedBannerText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  unavailableRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
    borderRadius: 10,
    backgroundColor: "#FFFBEB",
    borderWidth: 1,
    borderColor: "#FDE68A",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  unavailableText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    color: "#B45309",
  },
  timeline: {
    marginTop: 12,
    gap: 0,
  },
  timelineRow: {
    flexDirection: "row",
  },
  timelineRail: {
    width: 22,
    alignItems: "center",
  },
  timelineDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: "#C9CDD3",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  timelineDotCurrent: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderColor: theme.primary,
    backgroundColor: theme.primaryLight,
    marginTop: 2,
  },
  timelineDotDone: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderColor: theme.primary,
    backgroundColor: theme.primary,
    marginTop: 2,
  },
  timelineDotNext: {
    borderColor: theme.info,
  },
  timelineDotDestination: {
    borderColor: theme.primary,
  },
  timelineDotOrigin: {
    borderColor: "#C9CDD3",
  },
  timelineDotInner: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.primary,
  },
  timelineLine: {
    flex: 1,
    width: 2,
    minHeight: 26,
    backgroundColor: "#E3E6EA",
  },
  timelineContent: {
    flex: 1,
    marginLeft: 10,
    paddingBottom: 16,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F3F5",
  },
  timelineContentCurrent: {
    backgroundColor: theme.primaryLight,
  },
  timelineContentNext: {
    backgroundColor: dark ? "rgba(37, 99, 235, 0.16)" : "#E8F0FD",
  },
  timelineTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginTop: 6,
  },
  timelineStation: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: "#3F3F46",
  },
  timelineStationCurrent: {
    fontWeight: "800",
    color: theme.text,
  },
  roleChip: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "#F3F4F6",
  },
  roleChipCurrent: {
    backgroundColor: theme.primary,
  },
  roleChipNext: {
    backgroundColor: theme.info,
  },
  roleChipDestination: {
    backgroundColor: theme.primary,
  },
  roleChipText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#3F3F46",
  },
  roleChipTextStrong: {
    fontWeight: "800",
    color: "#FFFFFF",
  },
  timelineStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  timelineStatus: {
    fontSize: 12,
    fontWeight: "700",
    color: "#3F3F46",
  },
  timelineStatusCurrent: {
    fontWeight: "800",
    color: theme.primaryDark,
  },
  timelineDelay: {
    fontSize: 11,
    fontWeight: "700",
  },
  timelineMeta: {
    fontSize: 11,
    color: "#71717A",
  },
  timesBox: {
    gap: 4,
    marginTop: 8,
  },
  timeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  timeRowLabel: {
    width: 64,
    fontSize: 11,
    fontWeight: "700",
    color: "#9CA3AF",
  },
  kindChip: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
    backgroundColor: "#F3F4F6",
  },
  kindChipActual: {
    backgroundColor: theme.primaryLight,
  },
  kindChipExpected: {
    backgroundColor: dark ? "rgba(37, 99, 235, 0.16)" : "#E8F0FD",
  },
  kindChipScheduled: {
    backgroundColor: "#F3F4F6",
  },
  kindChipText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#6B7280",
  },
  kindChipTextActual: {
    color: theme.primaryDark,
  },
  kindChipTextExpected: {
    color: theme.info,
  },
  kindChipTextScheduled: {
    color: "#6B7280",
  },
  timeRowValue: {
    flex: 1,
    fontSize: 12,
    fontWeight: "700",
    color: theme.text,
  },
  timeRowEmpty: {
    color: "#9CA3AF",
    fontWeight: "400",
  },
  divider: {
    height: 1,
    backgroundColor: "#F1F3F5",
    marginVertical: 12,
  },
  grid: {
    gap: 12,
  },
  cell: {
    gap: 2,
  },
  cellLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "#6B7280",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  cellValue: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.text,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 2,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: "#FFFFFF",
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: "800",
  },
  delayValue: {
    color: "#DC2626",
  },
  arrivalValue: {
    fontSize: 16,
    fontWeight: "800",
    color: theme.primaryDark,
    marginTop: 2,
  },
  scheduleNote: {
    marginTop: 12,
    fontSize: 11,
    color: "#9CA3AF",
  },
});