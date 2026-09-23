import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import DesktopLayout from "./DesktopLayout";
import DesktopPlanForm from "./DesktopPlanForm";
import DesktopJourneyMap from "./DesktopJourneyMap";
import { useAppTheme } from "../../src/theme/ThemeProvider";

const PREVIEW_FEATURES = [
  {
    icon: "navigate" as const,
    label: "Road route through the route engine",
  },
  {
    icon: "layers" as const,
    label: "Road & satellite map layers",
  },
  {
    icon: "location" as const,
    label: "Source, destination and stop markers",
  },
  {
    icon: "time" as const,
    label: "Live distance and duration for your route",
  },
];

export default function DesktopPlanTrip() {
  const { theme } = useAppTheme();
  const [cities, setCities] = useState<string[]>([]);

  return (
    <DesktopLayout
      title="Plan Trip"
      subtitle="Design a journey before you start driving"
      activeKey="plantrip"
    >
      <View style={styles.row}>
        <View style={styles.formColumn}>
          <View style={styles.stepHeader}>
            <View
              style={[styles.stepNumber, { backgroundColor: theme.primaryLight }]}
            >
              <Text style={[styles.stepNumberText, { color: theme.primaryDark }]}>
                1
              </Text>
            </View>
            <View style={styles.stepText}>
              <Text style={[styles.stepTitle, { color: theme.textPrimary }]}>
                Where are you headed?
              </Text>
              <Text style={[styles.stepHint, { color: theme.textSecondary }]}>
                Pick a source and destination — the preview updates instantly.
              </Text>
            </View>
          </View>

          <DesktopPlanForm
            onPlanChange={(plan) => {
              const next = [plan.source, plan.destination].filter(
                (city): city is string => Boolean(city)
              );

              if (next.length === 2) {
                setCities(next);
              } else {
                setCities([]);
              }
            }}
          />
        </View>

        <View style={styles.previewColumn}>
          <View style={styles.stepHeader}>
            <View
              style={[styles.stepNumber, { backgroundColor: theme.primaryLight }]}
            >
              <Text style={[styles.stepNumberText, { color: theme.primaryDark }]}>
                2
              </Text>
            </View>
            <View style={styles.stepText}>
              <Text style={[styles.stepTitle, { color: theme.textPrimary }]}>
                Preview the road ahead
              </Text>
              <Text style={[styles.stepHint, { color: theme.textSecondary }]}>
                A live route, distance and duration while you plan.
              </Text>
            </View>
          </View>

          {cities.length === 2 ? (
            <DesktopJourneyMap
              key={cities.join(">")}
              cities={cities}
              height={520}
            />
          ) : (
            <View
              style={[
                styles.mapPlaceholder,
                { backgroundColor: theme.surface, borderColor: theme.border },
              ]}
            >
              <Ionicons name="map-outline" size={40} color={theme.textMuted} />
              <Text
                style={[styles.mapPlaceholderText, { color: theme.textSecondary }]}
              >
                Select a source and destination above to preview the route and
                its distance.
              </Text>
            </View>
          )}

          <View style={styles.features}>
            {PREVIEW_FEATURES.map((feature) => (
              <View
                key={feature.label}
                style={[
                  styles.featureItem,
                  { backgroundColor: theme.surfaceSecondary },
                ]}
              >
                <View
                  style={[
                    styles.featureIcon,
                    { backgroundColor: theme.primaryLight },
                  ]}
                >
                  <Ionicons
                    name={feature.icon}
                    size={15}
                    color={theme.primaryDark}
                  />
                </View>
                <Text style={[styles.featureText, { color: theme.textSecondary }]}>
                  {feature.label}
                </Text>
              </View>
            ))}
          </View>
        </View>
      </View>
    </DesktopLayout>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 24,
    alignItems: "flex-start",
    flexWrap: "wrap",
  },
  formColumn: {
    flexBasis: 420,
    flexGrow: 1,
    minWidth: 320,
  },
  previewColumn: {
    flexBasis: 520,
    flexGrow: 1.4,
    minWidth: 420,
    gap: 16,
  },
  stepHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 14,
  },
  stepNumber: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  stepNumberText: {
    fontSize: 15,
    fontWeight: "800",
  },
  stepText: {
    flex: 1,
    minWidth: 0,
  },
  stepTitle: {
    fontSize: 17,
    fontWeight: "800",
  },
  stepHint: {
    fontSize: 12,
    marginTop: 1,
  },
  mapPlaceholder: {
    height: 460,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 24,
  },
  mapPlaceholderText: {
    fontSize: 13,
    textAlign: "center",
    maxWidth: 320,
  },
  features: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  featureItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 12,
    paddingHorizontal: 11,
    paddingVertical: 8,
    backgroundColor: "#F1F4F2",
  },
  featureIcon: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  featureText: {
    fontSize: 12,
    fontWeight: "600",
  },
});