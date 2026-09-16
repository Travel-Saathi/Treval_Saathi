import { useUser } from "@clerk/expo";
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import PageHeader from "../../../../components/PageHeader";
import { useSupabase } from "../../../../hook/usesupabase";
import { getProfileByClerkId } from "../../../../services/profilesApi";
import { useAppTheme } from "../../../../src/theme/ThemeProvider";

/**
 * Language & Region page.
 *
 * Region reflects the real home_city stored on the user's profile. There
 * is no language setting in the app yet, so the Language section states
 * honestly that the app's interface is in English — it never pretends the
 * user picked a preference that is not stored anywhere.
 */

export default function LanguageRegionScreen() {
  const { user } = useUser();
  const supabase = useSupabase();
  const { theme } = useAppTheme();

  const clerkId = user?.id ?? null;

  const [homeCity, setHomeCity] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const loadRegion = async () => {
      if (!clerkId) {
        setLoading(false);
        return;
      }

      try {
        const profile = await getProfileByClerkId(supabase, clerkId);

        if (!cancelled) {
          setHomeCity(profile?.home_city?.trim() ?? null);
        }
      } catch (error) {
        console.error("REGION LOAD ERROR:", error);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadRegion();

    return () => {
      cancelled = true;
    };
  }, [clerkId, supabase]);

  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: theme.background }]}
      edges={["top", "left", "right", "bottom"]}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <PageHeader title="Language & Region" subtitle="Language and home region" />

        {/* REGION */}
        <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>REGION</Text>

        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={[styles.rowIcon, { backgroundColor: theme.primaryLight }]}>
            <Ionicons name="location-outline" size={20} color={theme.primary} />
          </View>

          <View style={styles.rowContent}>
            <Text style={[styles.rowLabel, { color: theme.text }]}>Home City</Text>

            {loading ? (
              <ActivityIndicator size="small" color={theme.primary} />
            ) : (
              <Text style={[styles.rowValue, { color: homeCity ? theme.text : theme.textMuted }]}>
                {homeCity ?? "Not added"}
              </Text>
            )}
          </View>
        </View>

        <Text style={[styles.hint, { color: theme.textSecondary }]}>
          Your home region comes from your profile. Update it from Edit Profile.
        </Text>

        {/* LANGUAGE */}
        <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>LANGUAGE</Text>

        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={[styles.rowIcon, { backgroundColor: theme.primaryLight }]}>
            <Ionicons name="language-outline" size={20} color={theme.primary} />
          </View>

          <View style={styles.rowContent}>
            <Text style={[styles.rowLabel, { color: theme.text }]}>App Language</Text>
            <Text style={[styles.rowValue, { color: theme.text }]}>English</Text>
            <Text style={[styles.rowNote, { color: theme.textSecondary }]}>
              The app is currently available only in English.
            </Text>
          </View>
        </View>

        <Text style={[styles.hint, { color: theme.textSecondary }]}>
          Language selection is not available yet. More languages will be
          added here in a future update.
        </Text>
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

  card: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },

  rowIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },

  rowContent: {
    flex: 1,
  },

  rowLabel: {
    fontSize: 15,
    fontWeight: "700",
  },

  rowValue: {
    marginTop: 2,
    fontSize: 14,
    fontWeight: "600",
  },

  rowNote: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 16,
  },

  hint: {
    marginTop: 8,
    marginBottom: 18,
    fontSize: 12,
    lineHeight: 17,
  },
});