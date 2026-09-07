import { StyleSheet, Text, View } from "react-native";

import type { LiveUpdatesInfo } from "../../services/tripLiveApi";
import { SectionTitle } from "./primitives";

const SEVERITY_COLORS: Record<string, string> = {
  info: "#0EA5E9",
  warning: "#F59E0B",
  alert: "#EF4444",
};

/**
 * Future-ready Live Updates block (spec section 26).
 *
 * Renders nothing until a live-updates provider populates
 * `LiveUpdatesInfo` (IRCTC/IRIS feeds, alerts, tracking webhooks...).
 * When wired up, call `getLiveTripUpdates(tripId)` inside this
 * component and render the items below — no screen changes required.
 */
export default function LiveUpdatesSection({
  info,
}: {
  info?: LiveUpdatesInfo | null;
}) {
  if (!info || info.items.length === 0) {
    return null;
  }

  return (
    <View>
      <SectionTitle
        icon="notifications"
        title="Live Updates"
        subtitle={info.updatedAt ?? undefined}
      />
      <View style={styles.list}>
        {info.items.map((item) => {
          const color = SEVERITY_COLORS[item.severity] ?? "#0EA5E9";

          return (
            <View key={item.id} style={styles.row}>
              <View style={[styles.dot, { backgroundColor: color }]} />
              <View style={styles.body}>
                <Text style={styles.title} numberOfLines={1}>
                  {item.title}
                </Text>
                {item.message ? (
                  <Text style={styles.message} numberOfLines={2}>
                    {item.message}
                  </Text>
                ) : null}
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    gap: 10,
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#EEF0F3",
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 5,
  },
  body: {
    flex: 1,
  },
  title: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1C1C1E",
  },
  message: {
    fontSize: 12,
    color: "#71717A",
    marginTop: 1,
  },
});