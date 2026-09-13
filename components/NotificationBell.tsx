import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

interface NotificationBellProps {
  unreadCount?: number;
  color?: string;
  onPress?: () => void;
}

function formatBadge(count: number): string {
  return count > 9 ? "9+" : String(count);
}

export default function NotificationBell({
  unreadCount = 0,
  color = "#FFFFFF",
  onPress,
}: NotificationBellProps) {
  const showBadge = unreadCount > 0;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Notifications${showBadge ? `, ${unreadCount} unread` : ""}`}
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [styles.container, pressed && styles.pressed]}
    >
      <Ionicons name="notifications-outline" size={24} color={color} />

      {showBadge ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{formatBadge(unreadCount)}</Text>
        </View>
      ) : null}
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
  pressed: {
    opacity: 0.7,
  },
  badge: {
    position: "absolute",
    top: 4,
    right: 2,
    minWidth: 17,
    height: 17,
    borderRadius: 9,
    backgroundColor: "#FF3B30",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: "#FFFFFF",
  },
  badgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "800",
    lineHeight: 14,
  },
});