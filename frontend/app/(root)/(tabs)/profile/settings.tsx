import { useAuth } from "@clerk/expo";
import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import { router } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import PageHeader from "../../../../components/PageHeader";
import { useAppTheme } from "../../../../src/theme/ThemeProvider";

interface ThemeOption {
  key: "light" | "dark" | "system";
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
}

const THEME_OPTIONS: ThemeOption[] = [
  { key: "light", icon: "sunny-outline", label: "Light" },
  { key: "dark", icon: "moon-outline", label: "Dark" },
  { key: "system", icon: "phone-portrait-outline", label: "System" },
];

export default function SettingsScreen() {
  const { signOut } = useAuth();
  const { theme, mode, setMode } = useAppTheme();

  const [signingOut, setSigningOut] = useState(false);

  const version = Constants.expoConfig?.version ?? null;

  const handleSignOut = async () => {
    if (signingOut) return;

    setSigningOut(true);

    try {
      await signOut();

      // Let Clerk finish updating its auth state before navigating.
      await new Promise((resolve) => setTimeout(resolve, 100));

      router.replace("/(auth)/sign-in");
    } catch (error) {
      console.error("SIGN OUT ERROR:", error);
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: theme.background }]}
      edges={["top", "left", "right", "bottom"]}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <PageHeader title="Settings" subtitle="App preferences" />

        {/* APPEARANCE */}
        <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>APPEARANCE</Text>

        <View
          style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}
        >
          <Text style={[styles.cardTitle, { color: theme.text }]}>Theme</Text>

          <Text style={[styles.cardHint, { color: theme.textSecondary }]}>
            Choose how the app looks.
          </Text>

          <View style={styles.themeRow}>
            {THEME_OPTIONS.map((option) => {
              const selected = mode === option.key;

              return (
                <Pressable
                  key={option.key}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => setMode(option.key)}
                  style={({ pressed }) => [
                    styles.themeOption,
                    { borderColor: selected ? theme.primary : theme.border, backgroundColor: theme.inputBackground },
                    pressed && styles.pressed,
                  ]}
                >
                  <Ionicons
                    name={option.icon}
                    size={20}
                    color={selected ? theme.primary : theme.textSecondary}
                  />

                  <Text
                    style={[
                      styles.themeLabel,
                      { color: selected ? theme.primary : theme.text },
                    ]}
                  >
                    {option.label}
                  </Text>

                  {selected ? (
                    <Ionicons name="checkmark-circle" size={16} color={theme.primary} />
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* ABOUT */}
        <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>ABOUT</Text>

        <View
          style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}
        >
          <View style={styles.aboutRow}>
            <View style={[styles.aboutIcon, { backgroundColor: theme.primaryLight }]}>
              <Ionicons name="information-circle-outline" size={20} color={theme.primary} />
            </View>

            <View style={styles.aboutTextWrap}>
              <Text style={[styles.aboutLabel, { color: theme.text }]}>Version</Text>
              <Text style={[styles.aboutValue, { color: theme.textSecondary }]}>
                Travel Saathi {version ?? "1.0.0"}
              </Text>
            </View>
          </View>
        </View>

        {/* ACCOUNT */}
        <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>ACCOUNT</Text>

        <Pressable
          accessibilityRole="button"
          onPress={() => void handleSignOut()}
          disabled={signingOut}
          style={({ pressed }) => [
            styles.signOutButton,
            { backgroundColor: theme.surface, borderColor: theme.danger },
            (pressed || signingOut) && styles.pressed,
          ]}
        >
          {signingOut ? (
            <ActivityIndicator color={theme.danger} />
          ) : (
            <>
              <Ionicons name="log-out-outline" size={19} color={theme.danger} />

              <Text style={[styles.signOutText, { color: theme.danger }]}>
                Sign Out
              </Text>
            </>
          )}
        </Pressable>
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
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    marginBottom: 18,
  },

  cardTitle: {
    fontSize: 15,
    fontWeight: "800",
  },

  cardHint: {
    marginTop: 3,
    fontSize: 12,
  },

  themeRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
  },

  themeOption: {
    flex: 1,
    minHeight: 72,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingHorizontal: 6,
  },

  themeLabel: {
    fontSize: 13,
    fontWeight: "700",
  },

  aboutRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  aboutIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },

  aboutTextWrap: {
    flex: 1,
  },

  aboutLabel: {
    fontSize: 15,
    fontWeight: "700",
  },

  aboutValue: {
    marginTop: 2,
    fontSize: 13,
  },

  signOutButton: {
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 1.5,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },

  signOutText: {
    fontSize: 15,
    fontWeight: "800",
  },

  pressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
});