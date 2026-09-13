import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { Image, StyleSheet, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import NotificationBell from "../../../components/NotificationBell";
import { useAppTheme } from "../../../src/theme/ThemeProvider";
import { useNotificationsStore } from "../../../store/notificationsStore";

function NavigationHeader() {
  const insets = useSafeAreaInsets();
  const { theme } = useAppTheme();
  const { width: screenWidth } = useWindowDimensions();
  const brandLogoWidth = screenWidth >= 768 ? 140 : 100;
  const brandLogoHeight = brandLogoWidth / 3;
  const unreadCount = useNotificationsStore((state) => state.unreadCount);

  return (
    <View
      style={[
        styles.header,
        {
          height: insets.top + 64,
          paddingTop: insets.top,
          backgroundColor: theme.headerBg,
        },
      ]}
    >
      <View style={styles.brandGroup}>
        <Image
          source={require("../../../assets/images/2logo.png")}
          style={[
            styles.brandLogo,
            { width: brandLogoWidth, height: brandLogoHeight },
          ]}
        />
      </View>

      <View style={styles.actions}>
        <NotificationBell unreadCount={unreadCount} color={theme.headerText} />
      </View>
    </View>
  );
}

export default function TabLayout() {
  console.log("[AUTH_DEBUG] TABS_RENDER");

  const { theme } = useAppTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        header: () => <NavigationHeader />,
        headerStyle: {
          height: 64,
          backgroundColor: theme.headerBg,
        },
        headerShadowVisible: false,

        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.tabInactive,

        tabBarStyle: {
          height: 64,
          paddingTop: 6,
          paddingBottom: 8,
          backgroundColor: theme.surface,
          borderTopColor: theme.border,
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
        name="profile"
        options={{
          title: "Profile",
          headerShown: false,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person" size={size} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="testsearch"
        options={{
          href: null,
        }}
      />

      <Tabs.Screen
        name="plan-trip"
        options={{
          href: null,
        }}
      />

      <Tabs.Screen
        name="live-updates"
        options={{
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
  },
  brandGroup: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 1,
  },
  brandLogo: {
    resizeMode: "contain",
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
});