import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import type { TripActivitiesInfo } from "../../services/tripLiveApi";
import { useAppTheme } from "../../src/theme/ThemeProvider";
import type { ThemeTokens } from "../../src/theme/tokens";
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
  const { theme, dark } = useAppTheme();
  const styles = useMemo(() => createStyles(theme, dark), [theme, dark]);

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

const createStyles = (theme: ThemeTokens, dark: boolean) =>
  StyleSheet.create({
    list: {
      borderRadius: 16,
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      overflow: "hidden",
    },
    row: {
      paddingVertical: 11,
      paddingHorizontal: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.border,
    },
    title: {
      fontSize: 14,
      fontWeight: "600",
      color: theme.text,
    },
    meta: {
      fontSize: 12,
      color: theme.textSecondary,
      marginTop: 1,
    },
  });