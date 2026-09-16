import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import { router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import PageHeader from "../../../../components/PageHeader";
import { useAppTheme } from "../../../../src/theme/ThemeProvider";

/**
 * Help & Support page.
 *
 * A small static FAQ whose actions link to real parts of the app (trip
 * planning, live trips, Saathi AI). Contact information only shows the
 * app version — no support email is configured in the app config yet, so
 * none is invented here.
 */

interface FaqItem {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  question: string;
  answer: string;
  actionLabel: string | null;
  route: string | null;
}

const FAQ: FaqItem[] = [
  {
    key: "plan-trip",
    icon: "map-outline",
    question: "How do I plan a trip?",
    answer:
      "Open the Home tab, pick your start and destination cities, choose dates and create your trip.",
    actionLabel: "Go to Home",
    route: "/(root)/(tabs)",
  },
  {
    key: "live-trips",
    icon: "airplane-outline",
    question: "Where can I see my trips?",
    answer:
      "Your upcoming, active and completed trips are listed under the Live Trips tab.",
    actionLabel: "Open Live Trips",
    route: "/(root)/(tabs)/live-trips",
  },
  {
    key: "saathi",
    icon: "chatbubble-ellipses-outline",
    question: "Who is Saathi?",
    answer:
      "Saathi is your AI travel companion that helps with trip planning, suggestions and answers — personalised to your profile and current trip.",
    actionLabel: "Chat with Saathi",
    route: "/(root)/saathi",
  },
];

export default function HelpSupportScreen() {
  const { theme } = useAppTheme();

  const version = Constants.expoConfig?.version ?? null;

  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: theme.background }]}
      edges={["top", "left", "right", "bottom"]}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <PageHeader title="Help & Support" subtitle="Get assistance" />

        <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>FAQs</Text>

        {FAQ.map((item) => (
          <View
            key={item.key}
            style={[styles.faqCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
          >
            <View style={styles.faqRow}>
              <View style={[styles.faqIcon, { backgroundColor: theme.primaryLight }]}>
                <Ionicons name={item.icon} size={20} color={theme.primary} />
              </View>

              <Text style={[styles.faqQuestion, { color: theme.text }]}>
                {item.question}
              </Text>
            </View>

            <Text style={[styles.faqAnswer, { color: theme.textSecondary }]}>
              {item.answer}
            </Text>

            {item.route ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push({ pathname: item.route as never })}
                style={({ pressed }) => [
                  styles.faqAction,
                  { alignSelf: "flex-start" },
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.faqActionText, { color: theme.primary }]}>
                  {item.actionLabel}
                </Text>

                <Ionicons name="arrow-forward" size={14} color={theme.primary} />
              </Pressable>
            ) : null}
          </View>
        ))}

        <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>CONTACT</Text>

        <View style={[styles.contactCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={[styles.contactIcon, { backgroundColor: theme.primaryLight }]}>
            <Ionicons name="mail-outline" size={20} color={theme.primary} />
          </View>

          <View style={styles.contactTextWrap}>
            <Text style={[styles.contactLabel, { color: theme.text }]}>
              Support Email
            </Text>

            <Text style={[styles.contactValue, { color: theme.textMuted }]}>
              Not configured yet
            </Text>
          </View>
        </View>

        <View style={[styles.contactCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={[styles.contactIcon, { backgroundColor: theme.primaryLight }]}>
            <Ionicons name="information-circle-outline" size={20} color={theme.primary} />
          </View>

          <View style={styles.contactTextWrap}>
            <Text style={[styles.contactLabel, { color: theme.text }]}>App Version</Text>

            <Text style={[styles.contactValue, { color: theme.text }]}>
              {version ?? "1.0.0"}
            </Text>
          </View>
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

  sectionLabel: {
    marginBottom: 8,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.6,
  },

  faqCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
  },

  faqRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  faqIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },

  faqQuestion: {
    flex: 1,
    fontSize: 15,
    fontWeight: "800",
  },

  faqAnswer: {
    marginTop: 10,
    fontSize: 13,
    lineHeight: 19,
  },

  faqAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },

  faqActionText: {
    fontSize: 13,
    fontWeight: "800",
  },

  pressed: {
    opacity: 0.7,
  },

  contactCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 10,
  },

  contactIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },

  contactTextWrap: {
    flex: 1,
  },

  contactLabel: {
    fontSize: 15,
    fontWeight: "700",
  },

  contactValue: {
    marginTop: 2,
    fontSize: 13,
  },
});