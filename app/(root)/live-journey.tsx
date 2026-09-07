import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import PageHeader from "../../components/PageHeader";

interface SectionItem {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  text: string;
}

const SECTIONS: SectionItem[] = [
  {
    icon: "map-outline",
    label: "Map",
    text: "Your live route map will appear here.",
  },
  {
    icon: "locate-outline",
    label: "Current location",
    text: "Your live location will appear here.",
  },
  {
    icon: "navigate-outline",
    label: "Route",
    text: "Your planned route will appear here.",
  },
  {
    icon: "time-outline",
    label: "Estimated arrival",
    text: "Estimated time of arrival will appear here.",
  },
  {
    icon: "speedometer-outline",
    label: "Remaining distance",
    text: "Distance left on your route will appear here.",
  },
  {
    icon: "partly-sunny-outline",
    label: "Weather",
    text: "Weather along your route will appear here.",
  },
  {
    icon: "restaurant-outline",
    label: "Nearby places",
    text: "Nearby places on your route will appear here.",
  },
  {
    icon: "megaphone-outline",
    label: "Journey updates",
    text: "Live updates for your journey will appear here.",
  },
];

export default function LiveJourneyScreen() {
  const params = useLocalSearchParams<{ tripId?: string }>();

  const tripId = typeof params.tripId === "string" ? params.tripId : null;

  return (
    <SafeAreaView
      style={styles.screen}
      edges={["top", "left", "right", "bottom"]}
    >
      <PageHeader
        title="Live Journey"
        subtitle={tripId ? `Live tracking for this journey.` : "Follow your journey in real time."}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionTitle}>Live tracking</Text>

        <Text style={styles.sectionSubtitle}>
          Live tracking features are coming soon.
        </Text>

        {tripId ? (
          <View style={styles.card}>
            <View style={styles.cardIcon}>
              <Ionicons name="checkmark-circle" size={20} color="#00BC26" />
            </View>

            <View style={styles.cardBody}>
              <Text style={styles.cardLabel}>Journey loaded</Text>

              <Text style={styles.cardText}>
                This journey is ready to track.
              </Text>
            </View>
          </View>
        ) : null}

        {SECTIONS.map((item) => (
          <View key={item.label} style={styles.card}>
            <View style={styles.cardIcon}>
              <Ionicons
                name={item.icon}
                size={20}
                color="#00BC26"
              />
            </View>

            <View style={styles.cardBody}>
              <Text style={styles.cardLabel}>{item.label}</Text>

              <Text style={styles.cardText}>{item.text}</Text>
            </View>
          </View>
        ))}

        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("../saathi")}
          style={({ pressed }) => [
            styles.saathiButton,
            pressed && styles.saathiButtonPressed,
          ]}
        >
          <View style={styles.saathiButtonIcon}>
            <Ionicons
              name="chatbubbles-outline"
              size={20}
              color="#08751F"
            />
          </View>

          <Text style={styles.saathiButtonText}>Ask Saathi</Text>

          <Ionicons
            name="arrow-forward"
            size={18}
            color="#08751F"
          />
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#F7F7F9",
  },

  scroll: {
    flex: 1,
  },

  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 40,
  },

  sectionTitle: {
    fontSize: 19,
    fontWeight: "800",
    color: "#1C1C1E",
    letterSpacing: -0.3,
  },

  sectionSubtitle: {
    marginTop: 3,
    marginBottom: 14,
    fontSize: 13,
    color: "#6B7280",
  },

  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#F0F1F3",
    paddingHorizontal: 14,
    paddingVertical: 13,
    marginBottom: 10,
    gap: 12,
  },

  cardIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#E7F9EB",
    alignItems: "center",
    justifyContent: "center",
  },

  cardBody: {
    flex: 1,
  },

  cardLabel: {
    fontSize: 14,
    fontWeight: "800",
    color: "#1C1C1E",
  },

  cardText: {
    marginTop: 2,
    fontSize: 13,
    lineHeight: 18,
    color: "#6B7280",
  },

  saathiButton: {
    marginTop: 14,
    height: 56,
    borderRadius: 16,
    backgroundColor: "#E7F9EB",
    borderWidth: 1,
    borderColor: "#BEEBC5",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 16,
  },

  saathiButtonPressed: {
    transform: [
      {
        scale: 0.98,
      },
    ],
  },

  saathiButtonIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },

  saathiButtonText: {
    flex: 1,
    textAlign: "left",
    fontSize: 16,
    fontWeight: "800",
    color: "#08751F",
  },
});