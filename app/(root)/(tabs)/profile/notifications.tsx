import { Ionicons } from "@expo/vector-icons";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import PageHeader from "../../../../components/PageHeader";
import { useAppTheme } from "../../../../src/theme/ThemeProvider";
import { useNotificationsStore } from "../../../../store/notificationsStore";

/**
 * Notifications page.
 *
 * The app has no notifications backend yet — the shared notifications
 * store only tracks an unread count set elsewhere. This screen reflects
 * that honest state: it shows the unread count from the store when it is
 * > 0 and an empty inbox otherwise. No notifications are invented here.
 */

export default function NotificationsScreen() {
  const { theme } = useAppTheme();
  const unreadCount = useNotificationsStore((state) => state.unreadCount);

  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: theme.background }]}
      edges={["top", "left", "right", "bottom"]}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <PageHeader title="Notifications" subtitle="Alerts and trip updates" />

        {unreadCount > 0 ? (
          <View style={[styles.unreadBanner, { backgroundColor: theme.primaryLight }]}>
            <View style={[styles.unreadBadge, { backgroundColor: theme.primary }]}>
              <Text style={[styles.unreadBadgeText, { color: theme.onPrimary }]}>
                {unreadCount > 9 ? "9+" : String(unreadCount)}
              </Text>
            </View>

            <Text style={[styles.unreadText, { color: theme.text }]}>
              {unreadCount === 1
                ? "You have 1 unread notification."
                : `You have ${unreadCount} unread notifications.`}
            </Text>
          </View>
        ) : null}

        <View
          style={[styles.emptyCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
        >
          <View style={[styles.emptyIcon, { backgroundColor: theme.primaryLight }]}>
            <Ionicons name="notifications-outline" size={28} color={theme.primary} />
          </View>

          <Text style={[styles.emptyTitle, { color: theme.text }]}>
            No notifications yet
          </Text>

          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
            Alerts about your trips and travel updates will appear here.
          </Text>
        </View>
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

  unreadBanner: {
    borderRadius: 14,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
  },

  unreadBadge: {
    minWidth: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },

  unreadBadgeText: {
    fontSize: 12,
    fontWeight: "800",
  },

  unreadText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
  },

  emptyCard: {
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    padding: 30,
  },

  emptyIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },

  emptyTitle: {
    fontSize: 17,
    fontWeight: "800",
  },

  emptyText: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
    paddingHorizontal: 20,
  },
});