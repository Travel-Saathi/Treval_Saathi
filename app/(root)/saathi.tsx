import { Ionicons } from "@expo/vector-icons";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import PageHeader from "../../components/PageHeader";

const SUGGESTED_QUESTIONS = [
  "Best places to stop along my route?",
  "What is the weather like at my destination?",
  "Any fuel and rest stops nearby?",
  "Hidden gems around my destination?",
];

export default function SaathiScreen() {
  return (
    <SafeAreaView
      style={styles.screen}
      edges={["top", "left", "right", "bottom"]}
    >
      <PageHeader
        title="Saathi"
        subtitle="Your journey companion."
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <View style={styles.cardIcon}>
            <Ionicons
              name="chatbubbles"
              size={26}
              color="#00BC26"
            />
          </View>

          <Text style={styles.cardTitle}>
            Ask Saathi anything about your journey
          </Text>

          <Text style={styles.cardText}>
            Saathi will help you with routes, weather, nearby
            places and travel tips. Chat support is coming soon.
          </Text>
        </View>

        <Text style={styles.sectionTitle}>Try asking</Text>

        <Text style={styles.sectionSubtitle}>
          Tap a question to get started once Saathi is available.
        </Text>

        <View style={styles.chips}>
          {SUGGESTED_QUESTIONS.map((question) => (
            <View key={question} style={styles.chip}>
              <Ionicons
                name="sparkles-outline"
                size={15}
                color="#00BC26"
              />

              <Text style={styles.chipText}>{question}</Text>
            </View>
          ))}
        </View>

        <View style={styles.inputBar}>
          <View style={styles.inputShell}>
            <Text style={styles.inputPlaceholder}>
              Ask Saathi...
            </Text>

            <View style={styles.sendCircle}>
              <Ionicons
                name="arrow-up"
                size={18}
                color="#FFFFFF"
              />
            </View>
          </View>

          <Text style={styles.inputNote}>
            Messaging will be available soon.
          </Text>
        </View>
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

  card: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#F0F1F3",
    paddingHorizontal: 20,
    paddingVertical: 26,
    marginBottom: 24,
    shadowColor: "#000000",
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: {
      width: 0,
      height: 3,
    },
    elevation: 1,
  },

  cardIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#E7F9EB",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },

  cardTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#1C1C1E",
    textAlign: "center",
    letterSpacing: -0.2,
  },

  cardText: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 19,
    color: "#6B7280",
    textAlign: "center",
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

  chips: {
    gap: 10,
    marginBottom: 24,
  },

  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },

  chipText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "600",
    color: "#1C1C1E",
  },

  inputBar: {
    gap: 10,
  },

  inputShell: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingLeft: 18,
    paddingRight: 8,
    paddingVertical: 8,
    gap: 10,
  },

  inputPlaceholder: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
    color: "#9CA1A9",
  },

  sendCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#00BC26",
    alignItems: "center",
    justifyContent: "center",
  },

  inputNote: {
    alignSelf: "center",
    fontSize: 12,
    color: "#9CA1A9",
  },
});