import { StyleSheet, Text, View } from "react-native";

import type { TripActivitiesInfo } from "../../services/tripLiveApi";
import { SectionTitle } from "./primitives";

/**
 * Future-ready Activities block (spec section 26).
 *
 * Renders nothing until a real activities provider populates
 * `TripActivitiesInfo`. Wiring the provider is a one-liner inside this
 * component: call `getTripActivities(tripId)` when mounted and render
 * the same rows below. No screen changes are needed.
 */
export default function ActivitiesSection({
  info,
}: {
  info?: TripActivitiesInfo | null;
}) {
  if (!info || (info.planned.length === 0 && info.suggestions.length === 0)) {
    return null;
  }

  const rows = [
    ...info.planned.map((item) => ({
      key: `p-${item.id}`,
      title: item.title,
      meta:
        [item.city, item.date, item.time].filter(Boolean).join(" • ") ||
        "Planned",
    })),
    ...info.suggestions.map((item) => ({
      key: `s-${item.id}`,
      title: item.title,
      meta: [item.city, item.description].filter(Boolean).join(" • ") || "Suggestion",
    })),
  ];

  return (
    <View>
      <SectionTitle icon="footsteps-outline" title="Activities" />
      <View style={styles.list}>
        {rows.map((row) => (
          <View key={row.key} style={styles.row}>
            <Text style={styles.title} numberOfLines={1}>
              {row.title}
            </Text>
            <Text style={styles.meta} numberOfLines={1}>
              {row.meta}
            </Text>
          </View>
        ))}
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
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#EEF0F3",
  },
  title: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1C1C1E",
  },
  meta: {
    fontSize: 12,
    color: "#71717A",
    marginTop: 1,
  },
});