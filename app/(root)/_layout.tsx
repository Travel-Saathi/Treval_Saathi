import { useAuth } from "@clerk/expo";
import { Stack } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import { useUserSync } from "../../hook/useuserSync";
import { useUserStore } from "../../store/userStore";

export default function RootLayout() {
  const { isSignedIn, isLoaded } = useAuth();

  const profileLoading = useUserStore(
    (state) => state.profileLoading
  );

  const syncError = useUserStore(
    (state) => state.syncError
  );

  useUserSync();

  console.log("[AUTH_DEBUG] ROOT_GATE", {
    isLoaded,
    isSignedIn,
    profileLoading,
  });

  if (!isLoaded || !isSignedIn || profileLoading) {
    return null;
  }

  if (syncError) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorTitle}>
          Could not load your profile
        </Text>

        <Text style={styles.errorText}>
          {syncError}
        </Text>
      </View>
    );
  }

  console.log("[AUTH_DEBUG] ROOT_RENDER_TABS");

  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    />
  );
}

const styles = StyleSheet.create({
  errorContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#F3F6F2",
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#B42318",
    marginBottom: 8,
  },
  errorText: {
    fontSize: 14,
    color: "#718077",
    textAlign: "center",
  },
});