import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { getCityFunFact, type CityFact } from "../../services/webInfoApi";
import { useAppTheme } from "../../src/theme/ThemeProvider";
import type { ThemeTokens } from "../../src/theme/tokens";
import { BlockLoading, SectionTitle } from "./primitives";

type FactState = "loading" | "ready" | "error";

export default function FunFactCard({
  city,
  compact,
  onOpenCity,
}: {
  city: string;
  compact?: boolean;
  onOpenCity?: (city: string) => void;
}) {
  const { theme, dark } = useAppTheme();
  const styles = useMemo(() => createStyles(theme, dark), [theme, dark]);
  const [state, setState] = useState<FactState>("loading");
  const [fact, setFact] = useState<CityFact | null>(null);
  const [attempt, setAttempt] = useState(0);

  const load = useCallback(async () => {
    setState("loading"); setFact(null);
    try {
      const result = await getCityFunFact(city);
      if (result) { setFact(result); setState("ready"); }
      else setState("error");
    } catch { setState("error"); }
  }, [city]);

  useEffect(() => { load(); }, [load, attempt]);

  function retry() { setAttempt((value) => value + 1); }

  if (compact) {
    if (state === "loading" || state === "error" || !fact) return null;

    return (
      <View style={styles.compactCard}>
        <Ionicons name="sparkles" size={14} color={theme.warning} />
        <Text style={styles.compactText} numberOfLines={2}>{fact.text}</Text>
      </View>
    );
  }

  return (
    <View>
      <SectionTitle icon="bulb-outline" title="Did You Know?" subtitle={city} />
      {state === "loading" ? <BlockLoading label="Loading interesting facts…" /> : null}
      {state === "error" ? (
        <View style={styles.stateBox}>
          <Ionicons name="cloud-offline-outline" size={22} color={theme.textMuted} />
          <Text style={styles.stateText}>Some information is temporarily unavailable.</Text>
          <Pressable onPress={retry} style={({ pressed }) => [styles.tryAgain, pressed && styles.pressed]}>
            <Text style={styles.tryAgainText}>Try Again</Text>
          </Pressable>
        </View>
      ) : null}
      {state === "ready" && fact ? (
        <View style={styles.card}>
          <View style={styles.bodyRow}>
            <Ionicons name="sparkles" size={18} color={theme.warning} />
            <Text style={styles.factText}>{fact.text}</Text>
          </View>
          <View style={styles.footer}>
            {fact.title ? <Text style={styles.titleText} numberOfLines={1}>{fact.title}</Text> : null}
            {onOpenCity ? (
              <Pressable onPress={() => onOpenCity(city)} style={({ pressed }) => pressed && styles.pressed}>
                <Text style={styles.exploreLink}>Explore {city} →</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const createStyles = (theme: ThemeTokens, dark: boolean) =>
  StyleSheet.create({
    card: {
      borderRadius: 16,
      backgroundColor: dark ? "rgba(251,191,36,0.14)" : "#FFF9EB",
      borderWidth: 1,
      borderColor: dark ? "rgba(245,158,11,0.35)" : "#F3DFA7",
      padding: 14,
    },
    bodyRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
    factText: { flex: 1, fontSize: 14, lineHeight: 21, color: theme.text },
    footer: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
      marginTop: 12,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: dark ? "rgba(245,158,11,0.35)" : "#F3DFA7",
    },
    titleText: { flex: 1, fontSize: 12, color: theme.textSecondary },
    exploreLink: { fontSize: 13, fontWeight: "700", color: theme.primary },
    stateBox: {
      paddingVertical: 22,
      paddingHorizontal: 16,
      borderRadius: 14,
      backgroundColor: theme.surfaceSecondary,
      borderWidth: 1,
      borderColor: theme.border,
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
    },
    stateText: { fontSize: 13, color: theme.textSecondary, textAlign: "center" },
    tryAgain: {
      marginTop: 6,
      paddingHorizontal: 16,
      paddingVertical: 7,
      borderRadius: 999,
      backgroundColor: theme.primary,
    },
    tryAgainText: { fontSize: 13, fontWeight: "700", color: theme.onPrimary },
    pressed: { opacity: 0.7 },
    compactCard: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 8,
      borderRadius: 12,
      backgroundColor: dark ? "rgba(251,191,36,0.14)" : "#FFF9EB",
      borderWidth: 1,
      borderColor: dark ? "rgba(245,158,11,0.35)" : "#F3DFA7",
      padding: 10,
    },
    compactText: {
      flex: 1,
      fontSize: 12,
      lineHeight: 17,
      color: theme.text,
    },
  });
