import { Ionicons } from "@expo/vector-icons";
import { useMemo } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { MODE_LABELS, type TransportMode } from "../services/transportApi";
import { useAppTheme } from "../src/theme/ThemeProvider";
import type { ThemeTokens } from "../src/theme/tokens";

const MONTH_LABELS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function formatDateDisplay(iso: string | null): string {
  if (!iso) {
    return "Not available";
  }

  const parts = iso.split("-").map(Number);

  if (parts.length !== 3) {
    return iso;
  }

  const [year, month, day] = parts;

  return `${day} ${MONTH_LABELS[month - 1].slice(0, 3)} ${year}`;
}

export interface TripSummaryModalProps {
  visible: boolean;
  destination: string | null;
  startDate: string | null;
  endDate: string | null;
  transportMode: TransportMode | null;
  transportName: string | null;
  transportNumber: string | null;
  intermediateCities: string[];
  placeCount: number;
  starting?: boolean;
  error?: string | null;
  onClose: () => void;
  onStartTrip: () => void;
}

interface SummaryRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}

interface TransportDetailRow {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}

const TRANSPORT_EMOJIS: Record<TransportMode, string> = {
  train: "🚆",
  bus: "🚌",
  flight: "✈️",
  cab: "🚗",
  "multi-modal": "🚗",
};

const TRANSPORT_ICONS: Record<TransportMode, keyof typeof Ionicons.glyphMap> = {
  train: "train-outline",
  bus: "bus-outline",
  flight: "airplane-outline",
  cab: "car-outline",
  "multi-modal": "car-outline",
};

const TRANSPORT_DETAIL_LABELS: Partial<
  Record<TransportMode, { nameLabel: string; numberLabel: string }>
> = {
  train: { nameLabel: "Train Name", numberLabel: "Train Number" },
  bus: { nameLabel: "Bus Name", numberLabel: "Bus Number" },
  flight: { nameLabel: "Flight Name", numberLabel: "Flight Number" },
};

function SummaryRow({ icon, label, value }: SummaryRowProps) {
  const { theme, dark } = useAppTheme();
  const styles = useMemo(() => createStyles(theme, dark), [theme, dark]);

  return (
    <View style={styles.row}>
      <View style={styles.rowIcon}>
        <Ionicons name={icon} size={18} color={theme.primary} />
      </View>
      <View style={styles.rowText}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowValue}>{value}</Text>
      </View>
    </View>
  );
}

export default function TripSummaryModal({
  visible,
  destination,
  startDate,
  endDate,
  transportMode,
  transportName,
  transportNumber,
  intermediateCities,
  placeCount,
  starting = false,
  error = null,
  onClose,
  onStartTrip,
}: TripSummaryModalProps) {
  const { theme, dark } = useAppTheme();
  const styles = useMemo(() => createStyles(theme, dark), [theme, dark]);

  const destinationText = (destination || "").trim() || "Not available";
  const intermediates = (intermediateCities || []).filter(
    (city) => (city || "").trim().length > 0
  );
  const safePlaceCount = Math.max(0, placeCount || 0);

  const transportLabel = transportMode
    ? MODE_LABELS[transportMode] ?? "Not specified"
    : "Not specified";

  const transportEmoji = transportMode
    ? TRANSPORT_EMOJIS[transportMode]
    : "🚗";

  const transportIcon: keyof typeof Ionicons.glyphMap = transportMode
    ? TRANSPORT_ICONS[transportMode]
    : "car-outline";

  const transportDetails = transportMode
    ? TRANSPORT_DETAIL_LABELS[transportMode]
    : undefined;

  const transportDetailRows: TransportDetailRow[] = [];

  if (transportDetails) {
    const name = (transportName || "").trim();
    const number = (transportNumber || "").trim();

    if (name) {
      transportDetailRows.push({
        icon: "pricetag-outline",
        label: transportDetails.nameLabel,
        value: name,
      });
    }

    if (number) {
      transportDetailRows.push({
        icon: "calculator-outline",
        label: transportDetails.numberLabel,
        value: number,
      });
    }
  }

  return (
    <Modal
      animationType="fade"
      transparent
      visible={visible}
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.card} onPress={() => undefined}>
          <View style={styles.header}>
            <Text style={styles.title}>YOUR TRIP</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close trip summary"
              hitSlop={10}
              onPress={onClose}
              style={({ pressed }) => [
                styles.closeButton,
                pressed && styles.closeButtonPressed,
              ]}
            >
              <Ionicons name="close" size={20} color={theme.icon} />
            </Pressable>
          </View>

          <View style={styles.body}>
            <SummaryRow
              icon="flag-outline"
              label="Destination"
              value={destinationText}
            />
            <SummaryRow
              icon="calendar-outline"
              label="Dates"
              value={`${formatDateDisplay(startDate)} → ${formatDateDisplay(
                endDate
              )}`}
            />
            <SummaryRow
              icon={transportIcon}
              label="Transport"
              value={`${transportEmoji} ${transportLabel}`}
            />
            {transportDetailRows.map((row) => (
              <SummaryRow
                key={row.label}
                icon={row.icon}
                label={row.label}
                value={row.value}
              />
            ))}
            <SummaryRow
              icon="location-outline"
              label="Intermediate"
              value={
                intermediates.length > 0
                  ? intermediates.join(" · ")
                  : "None added yet"
              }
            />
            <SummaryRow
              icon="map-outline"
              label="Places"
              value={`${safePlaceCount} place${
                safePlaceCount === 1 ? "" : "s"
              }`}
            />
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Start trip"
            disabled={starting}
            onPress={onStartTrip}
            style={({ pressed }) => [
              styles.startButton,
              (pressed || starting) && styles.startButtonPressed,
              starting && styles.startButtonDisabled,
            ]}
          >
            {starting ? (
              <ActivityIndicator size="small" color={theme.onPrimary} />
            ) : (
              <Ionicons name="rocket-outline" size={20} color={theme.onPrimary} />
            )}
            <Text style={styles.startButtonText}>
              {starting ? "Starting Trip..." : "START TRIP"}
            </Text>
          </Pressable>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const createStyles = (theme: ThemeTokens, dark: boolean) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: theme.overlay,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: theme.surface,
    borderRadius: 20,
    padding: 22,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: theme.text,
    letterSpacing: 0.6,
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: theme.background,
    alignItems: "center",
    justifyContent: "center",
  },
  closeButtonPressed: {
    opacity: 0.8,
  },
  body: {
    marginTop: 6,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  rowText: {
    flex: 1,
  },
  rowLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: theme.textMuted,
    letterSpacing: 0.8,
    marginBottom: 3,
  },
  rowValue: {
    fontSize: 15,
    fontWeight: "700",
    color: theme.text,
    lineHeight: 21,
  },
  startButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: theme.primary,
    borderRadius: 14,
    paddingVertical: 14,
    marginTop: 20,
    minHeight: 48,
  },
  startButtonPressed: {
    opacity: 0.9,
  },
  startButtonDisabled: {
    opacity: 0.7,
  },
  startButtonText: {
    color: theme.onPrimary,
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  errorText: {
    marginTop: 12,
    fontSize: 13,
    fontWeight: "600",
    color: theme.danger,
    textAlign: "center",
  },
});