import { router } from "expo-router";
import { Image, Pressable, StyleSheet } from "react-native";

const SAATHI_LOGO = require("../assets/images/saathilogo.png");

/**
 * Compact Saathi entry button for the app's top headers. Sits beside the
 * notification bell and navigates to the Saathi chat with a "home" entry
 * (no trip context — Saathi will ask for the trip only when one is needed).
 */
export default function SaathiHeaderButton() {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Chat with Saathi"
      hitSlop={8}
      onPress={() =>
        router.push({
          pathname: "/(root)/saathi",
          params: { entryContext: "home" },
        })
      }
      style={({ pressed }) => [styles.container, pressed && styles.pressed]}
    >
      <Image source={SAATHI_LOGO} style={styles.icon} resizeMode="cover" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 36,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  icon: {
    width: 26,
    height: 26,
    borderRadius: 13,
  },
  pressed: {
    opacity: 0.7,
  },
});