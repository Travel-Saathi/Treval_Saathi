import { useUser } from "@clerk/expo";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

import {
  Image,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from "react-native";

export default function HomeScreen() {
  const { user } = useUser();
  const displayName = user?.firstName || user?.fullName || "User";

  console.log("[AUTH_DEBUG] HOME_MOUNT");

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.brandGroup}>
          <Image
            source={require("../../../assets/images/2logo.png")}
            style={styles.brandLogo}
          />
          <Text style={styles.greeting}>Hi, {displayName}</Text>
          <Ionicons name="location-outline" size={18} color="#00bc26" />
        </View>

        <View style={styles.actions}>
          <Pressable
            accessibilityLabel="Notifications"
            style={({ pressed }) => [
              styles.iconButton,
              pressed && styles.avatarPressed,
            ]}
          >
            <Ionicons name="notifications-outline" size={24} color="#1C1C1E" />
          </Pressable>

          <Pressable
            accessibilityLabel="Open profile"
            onPress={() => router.push("/(root)/(tabs)/profile")}
            style={({ pressed }) => [
              styles.avatarButton,
              pressed && styles.avatarPressed,
            ]}
          >
            {user?.imageUrl ? (
              <Image source={{ uri: user.imageUrl }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarFallback}>
                <Text style={styles.avatarInitial}>
                  {displayName.charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
          </Pressable>
        </View>
      </View>

      <View style={styles.existingContent}>
        <Text>Home Screen</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  brandGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  brandLogo: {
    width: 34,
    height: 34,
    resizeMode: "contain",
  },
  greeting: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1C1C1E",
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  iconButton: {
    width: 32,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarButton: {
    borderRadius: 24,
  },
  avatarPressed: {
    opacity: 0.7,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  avatarFallback: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
    backgroundColor: "#E5E5EA",
  },
  avatarInitial: {
    fontSize: 20,
    fontWeight: "700",
    color: "#3A3A3C",
  },
  existingContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
});
