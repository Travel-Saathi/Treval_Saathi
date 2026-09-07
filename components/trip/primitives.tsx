import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

type IoniconName = keyof typeof Ionicons.glyphMap;

/**
 * Small presentational primitives shared by every LIVE TRIPS block so
 * loading / error / empty states look the same everywhere.
 */

/** Section heading with an icon (used between content blocks). */
export function SectionTitle({
  icon,
  title,
  subtitle,
}: {
  icon: IoniconName;
  title: string;
  subtitle?: string | null;
}) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionIconWrap}>
        <Ionicons name={icon} size={16} color="#00BC26" />
      </View>
      <View style={styles.sectionHeaderText}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {subtitle ? (
          <Text style={styles.sectionSubtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

export function BlockLoading({ label = "Loading…" }: { label?: string }) {
  return (
    <View style={styles.stateBox}>
      <ActivityIndicator color="#00BC26" />
      <Text style={styles.stateText}>{label}</Text>
    </View>
  );
}

export function BlockError({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <View style={styles.stateBox}>
      <Ionicons name="cloud-offline-outline" size={22} color="#9CA3AF" />
      <Text style={styles.stateText}>{message}</Text>
      {onRetry ? (
        <Pressable
          onPress={onRetry}
          style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
        >
          <Text style={styles.retryButtonText}>Retry</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function BlockEmpty({
  icon = "sparkles-outline",
  title,
  subtitle,
}: {
  icon?: IoniconName;
  title: string;
  subtitle?: string | null;
}) {
  return (
    <View style={styles.stateBox}>
      <Ionicons name={icon} size={22} color="#9CA3AF" />
      <Text style={styles.emptyTitle}>{title}</Text>
      {subtitle ? (
        <Text style={styles.stateText}>{subtitle}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  sectionIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#E7F9EB",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  sectionHeaderText: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1C1C1E",
  },
  sectionSubtitle: {
    fontSize: 12,
    color: "#71717A",
    marginTop: 1,
  },
  stateBox: {
    paddingVertical: 22,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  stateText: {
    fontSize: 13,
    color: "#71717A",
    textAlign: "center",
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#3F3F46",
    textAlign: "center",
  },
  retryButton: {
    marginTop: 6,
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "#00BC26",
  },
  retryButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  pressed: {
    opacity: 0.7,
  },
});