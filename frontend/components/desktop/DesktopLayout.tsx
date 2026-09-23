import { Ionicons } from "@expo/vector-icons";
import { useUser } from "@clerk/expo";
import { router } from "expo-router";
import React from "react";
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";

import NotificationBell from "../NotificationBell";
import SaathiHeaderButton from "../SaathiHeaderButton";
import { useAppTheme } from "../../src/theme/ThemeProvider";
import { useNotificationsStore } from "../../store/notificationsStore";

type IoniconName = keyof typeof Ionicons.glyphMap;

export interface DesktopNavItem {
  key: string;
  label: string;
  icon: IoniconName;
  href: string;
}

export const DESKTOP_NAV_ITEMS: DesktopNavItem[] = [
  {
    key: "home",
    label: "Home",
    icon: "home",
    href: "/(root)/(tabs)",
  },
  {
    key: "explore",
    label: "Explore",
    icon: "compass",
    href: "/(root)/(tabs)/testsearch",
  },
  {
    key: "plans",
    label: "My Plans",
    icon: "airplane",
    href: "/(root)/(tabs)/live-trips",
  },
  {
    key: "plantrip",
    label: "Plan Trip",
    icon: "add-circle",
    href: "/(root)/(tabs)/plan-trip",
  },
  {
    key: "live",
    label: "Live Updates",
    icon: "pulse",
    href: "/(root)/(tabs)/live-updates",
  },
  {
    key: "profile",
    label: "Profile",
    icon: "person",
    href: "/(root)/(tabs)/profile",
  },
];

const SIDEBAR_WIDTH = 236;

function initialsOf(first: string | null | undefined, last: string | null | undefined): string {
  const a = first ? first.trim().charAt(0) : "";
  const b = last ? last.trim().charAt(0) : "";
  return `${a}${b}`.toUpperCase() || "TS";
}

export default function DesktopLayout({
  title,
  subtitle,
  activeKey,
  children,
}: {
  title: string;
  subtitle?: string;
  activeKey: string;
  children: React.ReactNode;
}) {
  const { theme, dark, toggleTheme } = useAppTheme();
  const { user } = useUser();
  const height = useWindowDimensions().height;
  const unreadCount = useNotificationsStore((state) => state.unreadCount);

  const name = user?.firstName ?? user?.username;
  const initials = initialsOf(user?.firstName, user?.lastName);

  return (
    <View
      style={[
        styles.root,
        { backgroundColor: theme.background, height },
      ]}
    >
      {/* Sidebar */}
      <View style={[styles.sidebar, { backgroundColor: theme.surface }]}>
        <View style={styles.brandRow}>
          <Image
            source={require("../../assets/images/2logo.png")}
            style={styles.brandLogo}
            resizeMode="contain"
          />
          <Text
            style={[styles.brandText, { color: theme.textPrimary }]}
            numberOfLines={1}
          >
            Travel Saathi
          </Text>
        </View>

        <ScrollView style={styles.navScroll} contentContainerStyle={styles.navList}>
          {DESKTOP_NAV_ITEMS.map((item) => {
            const active = item.key === activeKey;

            return (
              <Pressable
                key={item.key}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => router.navigate(item.href as never)}
                style={({ pressed }) => [
                  styles.navItem,
                  active && { backgroundColor: theme.primaryLight },
                  pressed && { opacity: 0.75 },
                ]}
              >
                <View
                  style={[
                    styles.navIcon,
                    active && { backgroundColor: theme.primary },
                  ]}
                >
                  <Ionicons
                    name={item.icon}
                    size={20}
                    color={active ? "#FFFFFF" : theme.textSecondary}
                  />
                </View>
                <Text
                  style={[
                    styles.navLabel,
                    { color: active ? theme.primaryDark : theme.textSecondary },
                    active && styles.navLabelActive,
                  ]}
                  numberOfLines={1}
                >
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={[styles.sidebarFooter, { borderTopColor: theme.border }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Toggle theme"
            onPress={toggleTheme}
            style={({ pressed }) => [
              styles.themeToggle,
              { backgroundColor: theme.surfaceSecondary },
              pressed && styles.pressed,
            ]}
          >
            <Ionicons
              name={dark ? "sunny" : "moon"}
              size={18}
              color={theme.text}
            />
            <Text style={[styles.themeToggleText, { color: theme.textSecondary }]}>
              {dark ? "Light mode" : "Dark mode"}
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Main column */}
      <View style={styles.main}>
        <View
          style={[
            styles.topbar,
            { backgroundColor: theme.primary, borderBottomColor: theme.primaryDark },
          ]}
        >
          <View style={styles.topbarTitle}>
            <Text style={styles.topbarTitleText}>
              {title}
            </Text>
            {Boolean(subtitle) ? (
              <Text
                style={styles.topbarSubtitle}
                numberOfLines={1}
              >
                {subtitle}
              </Text>
            ) : null}
          </View>

          <View style={styles.topbarActions}>
            <SaathiHeaderButton />
            <NotificationBell
              unreadCount={unreadCount}
              color="#FFFFFF"
              onPress={() =>
                router.navigate("/(root)/(tabs)/profile/notifications" as never)
              }
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${name ?? "Profile"} profile`}
              onPress={() => router.navigate("/(root)/(tabs)/profile" as never)}
              style={({ pressed }) => [
                styles.avatar,
                { backgroundColor: "#FFFFFF", borderColor: "rgba(255,255,255,0.9)" },
                pressed && styles.avatarPressed,
              ]}
            >
              <Text style={styles.avatarText}>{initials}</Text>
            </Pressable>
          </View>
        </View>

        <ScrollView
          style={styles.contentScroll}
          contentContainerStyle={styles.content}
        >
          {children}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: "row",
    overflow: "hidden",
  },
  sidebar: {
    width: SIDEBAR_WIDTH,
    borderRightWidth: 1,
    borderRightColor: "rgba(0,0,0,0.06)",
    paddingTop: 8,
    paddingBottom: 16,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  brandLogo: {
    width: 40,
    height: 40,
  },
  brandText: {
    fontSize: 17,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  navScroll: {
    flex: 1,
  },
  navList: {
    paddingHorizontal: 12,
    paddingTop: 8,
    gap: 4,
  },
  navItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 12,
    paddingVertical: 9,
    paddingHorizontal: 10,
  },
  navIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  navLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
  },
  navLabelActive: {
    fontWeight: "800",
  },
  sidebarFooter: {
    paddingHorizontal: 12,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  themeToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  themeToggleText: {
    fontSize: 13,
    fontWeight: "700",
  },
  pressed: {
    opacity: 0.75,
  },
  main: {
    flex: 1,
    minWidth: 0,
  },
  topbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 26,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  topbarTitle: {
    flex: 1,
    minWidth: 0,
  },
  topbarTitleText: {
    fontSize: 21,
    fontWeight: "800",
    letterSpacing: -0.3,
    color: "#FFFFFF",
  },
  topbarSubtitle: {
    fontSize: 13,
    marginTop: 2,
    color: "rgba(255,255,255,0.85)",
  },
  topbarActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginLeft: 16,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarPressed: {
    opacity: 0.85,
  },
  avatarText: {
    color: "#00BC26",
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  contentScroll: {
    flex: 1,
    minWidth: 0,
  },
  content: {
    width: "100%",
    maxWidth: 1400,
    alignSelf: "center",
    padding: 28,
    paddingTop: 24,
  },
});