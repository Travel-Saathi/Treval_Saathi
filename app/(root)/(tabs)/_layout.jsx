import { useUser } from "@clerk/expo";
import { Ionicons } from "@expo/vector-icons";
import { Tabs, router } from "expo-router";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

function NavigationHeader() {
  const { user } = useUser();
  const insets = useSafeAreaInsets();
  const displayName = user?.firstName || user?.fullName || "User";

  return (
    <View
      style={[
        styles.header,
        { height: insets.top + 64, paddingTop: insets.top },
      ]}
    >
      <View style={styles.brandGroup}>
        <Image
          source={require("../../../assets/images/2logo.png")}
          style={styles.brandLogo}
        />
        <Text style={styles.brandName}>Travel Saathi</Text>
      </View>

      <View style={styles.actions}>
        <Pressable
          accessibilityLabel="Notifications"
          style={({ pressed }) => [
            styles.iconButton,
            pressed && styles.pressed,
          ]}
        >
          <Ionicons
            name="notifications-outline"
            size={24}
            color="#1C1C1E"
          />
        </Pressable>

        <Pressable
          accessibilityLabel="Open profile"
          onPress={() => router.push("/(root)/(tabs)/profile")}
          style={({ pressed }) => [
            styles.avatarButton,
            pressed && styles.pressed,
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
  );
}

export default function TabLayout() {
  console.log("[AUTH_DEBUG] TABS_RENDER");

  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        header: () => <NavigationHeader />,
        headerStyle: {
          height: 64,
          backgroundColor: "#FFFFFF",
        },
        headerShadowVisible: false,

        tabBarActiveTintColor: "#00bc26",
        tabBarInactiveTintColor: "#454545",

        tabBarStyle: {
          height: 64,
          paddingTop: 6,
          paddingBottom: 8,
        },

        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: "600",
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          headerShown: false,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home" size={size} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="live-trips"
        options={{
          title: "Live Trips",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="airplane" size={size} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="plan-trip"
        options={{
          title: "Plan Trip",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="add-circle" size={size} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="live-updates"
        options={{
          title: "Live Updates",
          tabBarIcon: ({ color, size }) => (
            <Ionicons
              name="notifications"
              size={size}
              color={color}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="profile"
        options={{
          headerShown: false,
          href: null,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  header: {
    height: 64,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    backgroundColor: "#FFFFFF",
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
  brandName: {
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
    borderRadius: 20,
  },
  pressed: {
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
    fontSize: 18,
    fontWeight: "700",
    color: "#3A3A3C",
  },
});