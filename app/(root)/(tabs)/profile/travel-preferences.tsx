import { Ionicons } from "@expo/vector-icons";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import PageHeader from "../../../../components/PageHeader";
import { useAppTheme } from "../../../../src/theme/ThemeProvider";

/**
 * Travel preferences page.
 *
 * There is no preferences table or column in the project yet, so nothing
 * here invents storage or fake choices. Each category that will exist is
 * listed in an honest "coming soon" state so the screen can be wired to a
 * real provider later without a redesign.
 */

interface PreferenceCategory {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  description: string;
}

const CATEGORIES: PreferenceCategory[] = [
  {
    key: "transport",
    icon: "train-outline",
    label: "Preferred Transport",
    description: "Train, bus, flight or car for your journeys",
  },
  {
    key: "food",
    icon: "restaurant-outline",
    label: "Food Preference",
    description: "Veg, non-veg or other dietary choices",
  },
  {
    key: "style",
    icon: "compass-outline",
    label: "Travel Style",
    description: "Family trips, solo adventures or groups",
  },
  {
    key: "budget",
    icon: "wallet-outline",
    label: "Budget Preference",
    description: "How you prefer to plan spending",
  },
];

export default function TravelPreferencesScreen() {
  const { theme } = useAppTheme();

  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: theme.background }]}
      edges={["top", "left", "right", "bottom"]}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <PageHeader
          title="Travel Preferences"
          subtitle="How you like to travel"
        />

        <View
          style={[styles.infoCard, { backgroundColor: theme.primaryLight }]}
        >
          <Ionicons name="information-circle-outline" size={20} color={theme.primary} />

          <Text style={[styles.infoText, { color: theme.textSecondary }]}>
            Preferences are not saved yet. They will be stored here as soon as
            preference storage is added to the app.
          </Text>
        </View>

        <View
          style={[
            styles.preferenceCard,
            { backgroundColor: theme.surface, borderColor: theme.border },
          ]}
        >
          {CATEGORIES.map((category, index) => (
            <View key={category.key} style={styles.categoryRowWrap}>
              {index > 0 ? (
                <View style={[styles.rowDivider, { backgroundColor: theme.border }]} />
              ) : null}

              <View style={styles.categoryRow}>
                <View
                  style={[
                    styles.categoryIcon,
                    { backgroundColor: theme.surfaceSecondary },
                  ]}
                >
                  <Ionicons name={category.icon} size={20} color={theme.textSecondary} />
                </View>

                <View style={styles.categoryTextWrap}>
                  <Text style={[styles.categoryLabel, { color: theme.text }]}>
                    {category.label}
                  </Text>

                  <Text style={[styles.categoryDesc, { color: theme.textSecondary }]}>
                    {category.description}
                  </Text>
                </View>

                <Text style={[styles.notSet, { color: theme.textMuted }]}>
                  Not set yet
                </Text>
              </View>
            </View>
          ))}
        </View>

        <View
          style={[styles.emptyCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
        >
          <View style={[styles.emptyIcon, { backgroundColor: theme.primaryLight }]}>
            <Ionicons name="options-outline" size={26} color={theme.primary} />
          </View>

          <Text style={[styles.emptyTitle, { color: theme.text }]}>
            Coming soon
          </Text>

          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
            You will be able to set your travel preferences here once the
            feature is ready.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },

  content: {
    width: "100%",
    maxWidth: 900,
    alignSelf: "center",
    padding: 20,
    paddingBottom: 40,
  },

  infoCard: {
    borderRadius: 14,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 16,
  },

  infoText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },

  preferenceCard: {
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 16,
    marginBottom: 16,
  },

  categoryRowWrap: {
    overflow: "hidden",
  },

  categoryRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 15,
  },

  rowDivider: {
    height: StyleSheet.hairlineWidth,
  },

  categoryIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },

  categoryTextWrap: {
    flex: 1,
  },

  categoryLabel: {
    fontSize: 15,
    fontWeight: "700",
  },

  categoryDesc: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 16,
  },

  notSet: {
    fontSize: 12,
    marginLeft: 8,
  },

  emptyCard: {
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    padding: 28,
  },

  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },

  emptyTitle: {
    fontSize: 17,
    fontWeight: "800",
  },

  emptyText: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
    paddingHorizontal: 20,
  },
});