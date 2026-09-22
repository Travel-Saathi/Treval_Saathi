import { useUser } from "@clerk/expo";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect, type Href } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import NotificationBell from "../../../../components/NotificationBell";
import { useSupabase } from "../../../../hook/usesupabase";
import {
  listUserTrips,
  toTripSummary,
  type TripSummaryCard,
} from "../../../../services/liveTripsApi";
import {
  getProfileByClerkId,
  isCoreProfileComplete,
  type ProfileRow,
} from "../../../../services/profilesApi";
import { useAppTheme } from "../../../../src/theme/ThemeProvider";
import { useNotificationsStore } from "../../../../store/notificationsStore";

const ROUTES = {
  editProfile: "/(root)/(tabs)/profile/edit-profile",
  travelPreferences: "/(root)/(tabs)/profile/travel-preferences",
  notifications: "/(root)/(tabs)/profile/notifications",
  languageRegion: "/(root)/(tabs)/profile/language-region",
  helpSupport: "/(root)/(tabs)/profile/help-support",
  settings: "/(root)/(tabs)/profile/settings",
} as const;

interface MenuItem {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  hint: string;
  route: string;
}

const MENU_ITEMS: MenuItem[] = [
  {
    key: "edit-profile",
    icon: "person-outline",
    label: "Edit Profile",
    hint: "Update your traveler details",
    route: ROUTES.editProfile,
  },
  {
    key: "travel-preferences",
    icon: "options-outline",
    label: "Travel Preferences",
    hint: "How you like to travel",
    route: ROUTES.travelPreferences,
  },
  {
    key: "notifications",
    icon: "notifications-outline",
    label: "Notifications",
    hint: "Alerts and trip updates",
    route: ROUTES.notifications,
  },
  {
    key: "language-region",
    icon: "language-outline",
    label: "Language & Region",
    hint: "Language and home region",
    route: ROUTES.languageRegion,
  },
  {
    key: "help-support",
    icon: "help-circle-outline",
    label: "Help & Support",
    hint: "Get assistance",
    route: ROUTES.helpSupport,
  },
  {
    key: "settings",
    icon: "settings-outline",
    label: "Settings",
    hint: "App preferences",
    route: ROUTES.settings,
  },
];

export default function ProfileScreen() {
  const { user } = useUser();
  const supabase = useSupabase();
  const { theme } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const unreadCount = useNotificationsStore((state) => state.unreadCount);

  const clerkId = user?.id ?? null;

  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [trips, setTrips] = useState<TripSummaryCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      const load = async () => {
        if (!clerkId) {
          setLoading(false);
          return;
        }

        setLoading(true);
        setErrorMessage("");

        try {
          const [profileRow, tripRows] = await Promise.all([
            getProfileByClerkId(supabase, clerkId),
            listUserTrips(supabase, clerkId),
          ]);

          if (cancelled) return;

          setProfile(profileRow);
          setTrips(tripRows.map(toTripSummary));
        } catch (error) {
          console.error("PROFILE LOAD ERROR:", error);

          if (!cancelled) {
            setErrorMessage("Could not load your profile.");
          }
        } finally {
          if (!cancelled) {
            setLoading(false);
          }
        }
      };

      void load();

      return () => {
        cancelled = true;
      };
    }, [clerkId, supabase])
  );

  const fullName =
    profile?.full_name?.trim() ||
    user?.fullName ||
    user?.firstName ||
    null;
  const username = profile?.username?.trim() || null;
  const avatarUrl = profile?.avatar_url?.trim() || null;
  const homeCity = profile?.home_city?.trim() || null;
  const bio = profile?.bio?.trim() || null;
  const age = profile?.age ?? null;
  const email = profile?.email?.trim() || null;
  const memberSince = profile?.created_at || null;

  const initials = (fullName ?? "TS")
    .split(" ")
    .map((part) => part.charAt(0) || "")
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const complete = profile != null && isCoreProfileComplete(profile);

  const totalTrips = trips.length;
  const activeTrips = trips.filter((trip) => trip.lifecycle === "active").length;
  const completedTrips = trips.filter(
    (trip) => trip.lifecycle === "completed"
  ).length;

  const brandLogoWidth = screenWidth >= 768 ? 140 : 100;
  const brandLogoHeight = brandLogoWidth / 3;

  const openPage = (route: string) => {
    router.push(route as Href);
  };

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      {/* Brand header (logo + notification icon), mirrors the tab header. */}
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
        <Image
          source={require("../../../../assets/images/2logo.png")}
          style={[styles.brandLogo, { width: brandLogoWidth, height: brandLogoHeight }]}
        />

        <NotificationBell
          unreadCount={unreadCount}
          color={theme.headerText}
          onPress={() => openPage(ROUTES.notifications)}
        />
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
            Loading profile...
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {/* TRAVELER IDENTITY CARD */}
          <View
            style={[
              styles.identityCard,
              {
                backgroundColor: theme.surface,
                borderColor: theme.border,
              },
            ]}
          >
            {/* Formal document top band */}
            <View
              style={[
                styles.identityBand,
                { backgroundColor: theme.primaryDark },
              ]}
            >
              <View style={styles.bandEmblem}>
                <Ionicons name="airplane" size={16} color={theme.primaryDark} />
              </View>

              <Text style={[styles.bandTitle, { color: theme.onPrimary }]}>
                TRAVELER PROFILE
              </Text>

              <Text style={[styles.bandMark, { color: theme.onPrimary }]}>
                SAATHI
              </Text>
            </View>

            <View style={styles.identityBody}>
              {/* Photo + name */}
              <View style={styles.identityTop}>
                <View style={styles.photoFrame}>
                  {avatarUrl ? (
                    <Image
                      source={{ uri: avatarUrl }}
                      style={styles.photo}
                    />
                  ) : (
                    <View
                      style={[
                        styles.photoPlaceholder,
                        { backgroundColor: theme.primaryLight },
                      ]}
                    >
                      <Text
                        style={[styles.photoInitials, { color: theme.primary }]}
                      >
                        {initials}
                      </Text>
                    </View>
                  )}
                </View>

                <View style={styles.nameBlock}>
                  <Text style={[styles.name, { color: theme.text }]}>
                    {fullName ?? "Traveler"}
                  </Text>

                  {username ? (
                    <Text style={[styles.username, { color: theme.textSecondary }]}>
                      @{username}
                    </Text>
                  ) : null}

                  <Text style={[styles.documentHint, { color: theme.textMuted }]}>
                    {complete
                      ? "Traveler identity verified"
                      : "Complete your profile"}
                  </Text>
                </View>
              </View>

              {/* Decorative passport divider + fields */}
              <View
                style={[styles.docDivider, { borderColor: theme.border }]}
              />

              <View style={styles.docGrid}>
                <View style={styles.docField}>
                  <Text style={[styles.docLabel, { color: theme.textMuted }]}>
                    HOME CITY
                  </Text>
                  <Text style={[styles.docValue, { color: theme.text }]}>
                    {homeCity ?? (complete ? "—" : "Not added")}
                  </Text>
                </View>

                {age != null ? (
                  <View style={styles.docField}>
                    <Text style={[styles.docLabel, { color: theme.textMuted }]}>
                      AGE
                    </Text>
                    <Text style={[styles.docValue, { color: theme.text }]}>
                      {String(age)}
                    </Text>
                  </View>
                ) : null}
              </View>

              {homeCity ? (
                <View style={styles.docField}>
                  <Text style={[styles.docLabel, { color: theme.textMuted }]}>
                    HOMETOWN REGION
                  </Text>
                  <Text style={[styles.docValue, { color: theme.text }]}>
                    {homeCity}, India
                  </Text>
                </View>
              ) : null}

              {email ? (
                <View style={styles.docField}>
                  <Text style={[styles.docLabel, { color: theme.textMuted }]}>
                    EMAIL
                  </Text>
                  <Text
                    style={[styles.docValue, styles.docEmail, { color: theme.text }]}
                    numberOfLines={1}
                  >
                    {email}
                  </Text>
                </View>
              ) : null}

              {bio ? (
                <View style={styles.docField}>
                  <Text style={[styles.docLabel, { color: theme.textMuted }]}>
                    BIO
                  </Text>
                  <Text style={[styles.docValue, { color: theme.text }]}>
                    {bio}
                  </Text>
                </View>
              ) : null}

              {memberSince ? (
                <Text style={[styles.memberSince, { color: theme.textMuted }]}>
                  Member since {new Date(memberSince).getFullYear()}
                </Text>
              ) : null}

              {/* Decorative stamp (no real data on it) */}
              <View style={styles.stampWrap}>
                <View style={styles.stamp}>
                  <Ionicons name="airplane" size={26} color={theme.primary} />
                  <Text style={[styles.stampText, { color: theme.primary }]}>
                    TRAVELER
                  </Text>
                </View>
              </View>
            </View>
          </View>

          {errorMessage ? (
            <View
              style={[
                styles.errorBox,
                { backgroundColor: theme.surface, borderColor: theme.border },
              ]}
            >
              <Text style={[styles.errorText, { color: theme.danger }]}>
                {errorMessage}
              </Text>

              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setLoading(true);
                  setErrorMessage("");

                  const reload = async () => {
                    if (!clerkId) return;

                    try {
                      const [profileRow, tripRows] = await Promise.all([
                        getProfileByClerkId(supabase, clerkId),
                        listUserTrips(supabase, clerkId),
                      ]);

                      setProfile(profileRow);
                      setTrips(tripRows.map(toTripSummary));
                    } catch (err) {
                      console.error("PROFILE LOAD ERROR:", err);
                      setErrorMessage("Could not load your profile.");
                    } finally {
                      setLoading(false);
                    }
                  };

                  void reload();
                }}
                style={({ pressed }) => [
                  styles.retryButton,
                  { backgroundColor: theme.primaryLight },
                  pressed && styles.buttonPressed,
                ]}
              >
                <Text style={[styles.retryText, { color: theme.primary }]}>
                  Retry
                </Text>
              </Pressable>
            </View>
          ) : null}

          {complete ? (
            /* Real stats, derived from the user's trips table. */
            <View
              style={[
                styles.statsCard,
                {
                  backgroundColor: theme.surface,
                  borderColor: theme.border,
                },
              ]}
            >
              <View style={styles.stat}>
                <Text style={[styles.statNumber, { color: theme.text }]}>
                  {totalTrips}
                </Text>
                <Text style={[styles.statLabel, { color: theme.textSecondary }]}>
                  Trips
                </Text>
              </View>

              <View style={[styles.statDivider, { backgroundColor: theme.border }]} />

              <View style={styles.stat}>
                <Text style={[styles.statNumber, { color: theme.primary }]}>
                  {activeTrips}
                </Text>
                <Text style={[styles.statLabel, { color: theme.textSecondary }]}>
                  Active
                </Text>
              </View>

              <View style={[styles.statDivider, { backgroundColor: theme.border }]} />

              <View style={styles.stat}>
                <Text style={[styles.statNumber, { color: theme.text }]}>
                  {completedTrips}
                </Text>
                <Text style={[styles.statLabel, { color: theme.textSecondary }]}>
                  Completed
                </Text>
              </View>
            </View>
          ) : (
            /* Incomplete profile prompt — no fake stats shown. */
            <View
              style={[
                styles.completeBanner,
                { backgroundColor: theme.primaryLight },
              ]}
            >
              <Ionicons name="create-outline" size={22} color={theme.primary} />

              <View style={styles.completeTextWrap}>
                <Text style={[styles.completeTitle, { color: theme.primaryDark }]}>
                  Complete your profile
                </Text>

                <Text style={[styles.completeHint, { color: theme.textSecondary }]}>
                  Add your name, username and home city to make your traveler
                  profile ready.
                </Text>
              </View>

              <Pressable
                accessibilityRole="button"
                onPress={() => openPage(ROUTES.editProfile)}
                style={({ pressed }) => [
                  styles.completeButton,
                  { backgroundColor: theme.primary },
                  pressed && styles.buttonPressed,
                ]}
              >
                <Text style={[styles.completeButtonText, { color: theme.onPrimary }]}>
                  Edit Profile
                </Text>
              </Pressable>
            </View>
          )}

          {/* MENU */}
          <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>MORE</Text>

          <View
            style={[
              styles.menuCard,
              {
                backgroundColor: theme.surface,
                borderColor: theme.border,
              },
            ]}
          >
            {MENU_ITEMS.map((item, index) => (
              <Pressable
                key={item.key}
                accessibilityRole="button"
                onPress={() => openPage(item.route)}
                style={({ pressed }) => [
                  styles.menuRow,
                  index > 0 && {
                    borderTopWidth: StyleSheet.hairlineWidth,
                    borderTopColor: theme.border,
                  },
                  pressed && styles.menuRowPressed,
                ]}
              >
                <View
                  style={[
                    styles.menuIcon,
                    { backgroundColor: theme.primaryLight },
                  ]}
                >
                  <Ionicons name={item.icon} size={19} color={theme.primary} />
                </View>

                <View style={styles.menuTextWrap}>
                  <Text style={[styles.menuLabel, { color: theme.text }]}>
                    {item.label}
                  </Text>

                  <Text style={[styles.menuHint, { color: theme.textSecondary }]}>
                    {item.hint}
                  </Text>
                </View>

                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={theme.textMuted}
                />
              </Pressable>
            ))}
          </View>

          <Text style={[styles.footerNote, { color: theme.textMuted }]}>
            Travel Saathi • Your travel companion
          </Text>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
  },

  brandLogo: {
    resizeMode: "contain",
  },

  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  loadingText: {
    marginTop: 12,
    fontSize: 14,
  },

  content: {
    width: "100%",
    maxWidth: 900,
    alignSelf: "center",
    padding: 20,
    paddingBottom: 40,
  },

  /* ---------- Identity card ---------- */

  identityCard: {
    borderRadius: 20,
    borderWidth: 1,
    overflow: "hidden",
    shadowColor: "#000000",
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },

  identityBand: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },

  bandEmblem: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },

  bandTitle: {
    flex: 1,
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 1.6,
  },

  bandMark: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
    opacity: 0.85,
  },

  identityBody: {
    padding: 20,
  },

  identityTop: {
    flexDirection: "row",
    alignItems: "center",
  },

  photoFrame: {
    width: 78,
    height: 96,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#00BC26",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },

  photo: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },

  photoPlaceholder: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },

  photoInitials: {
    fontSize: 24,
    fontWeight: "800",
  },

  nameBlock: {
    flex: 1,
    marginLeft: 16,
  },

  name: {
    fontSize: 21,
    fontWeight: "800",
    letterSpacing: -0.3,
  },

  username: {
    marginTop: 3,
    fontSize: 14,
    fontWeight: "600",
  },

  documentHint: {
    marginTop: 5,
    fontSize: 12,
    letterSpacing: 0.4,
  },

  docDivider: {
    marginTop: 18,
    borderTopWidth: 1.5,
    borderStyle: "dashed",
  },

  docGrid: {
    flexDirection: "row",
    marginTop: 14,
  },

  docField: {
    marginTop: 12,
  },

  docLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.4,
  },

  docValue: {
    marginTop: 3,
    fontSize: 15,
    fontWeight: "600",
  },

  docEmail: {
    fontSize: 13,
  },

  memberSince: {
    marginTop: 14,
    fontSize: 12,
  },

  stampWrap: {
    position: "absolute",
    right: 16,
    bottom: 14,
  },

  stamp: {
    width: 74,
    height: 74,
    borderRadius: 37,
    borderWidth: 2,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    opacity: 0.55,
  },

  stampText: {
    marginTop: 2,
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 1.2,
  },

  /* ---------- Error / retry ---------- */

  errorBox: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginTop: 16,
    flexDirection: "row",
    alignItems: "center",
  },

  errorText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
  },

  retryButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    marginLeft: 12,
  },

  retryText: {
    fontSize: 13,
    fontWeight: "800",
  },

  /* ---------- Stats ---------- */

  statsCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 18,
    borderWidth: 1,
    paddingVertical: 16,
    paddingHorizontal: 12,
    marginTop: 16,
  },

  stat: {
    flex: 1,
    alignItems: "center",
  },

  statNumber: {
    fontSize: 22,
    fontWeight: "800",
  },

  statLabel: {
    marginTop: 3,
    fontSize: 12,
  },

  statDivider: {
    width: 1,
    height: 34,
  },

  /* ---------- Complete profile prompt ---------- */

  completeBanner: {
    borderRadius: 18,
    padding: 16,
    marginTop: 16,
    flexDirection: "row",
    alignItems: "center",
  },

  completeTextWrap: {
    flex: 1,
    marginLeft: 10,
  },

  completeTitle: {
    fontSize: 15,
    fontWeight: "800",
  },

  completeHint: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 17,
  },

  completeButton: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 12,
    marginLeft: 10,
  },

  completeButtonText: {
    fontSize: 13,
    fontWeight: "800",
  },

  buttonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },

  /* ---------- Menu ---------- */

  sectionLabel: {
    marginTop: 24,
    marginBottom: 8,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.6,
  },

  menuCard: {
    borderRadius: 18,
    borderWidth: 1,
    overflow: "hidden",
  },

  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 13,
  },

  menuRowPressed: {
    opacity: 0.7,
  },

  menuIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },

  menuTextWrap: {
    flex: 1,
  },

  menuLabel: {
    fontSize: 15,
    fontWeight: "700",
  },

  menuHint: {
    marginTop: 2,
    fontSize: 12,
  },

  footerNote: {
    marginTop: 24,
    textAlign: "center",
    fontSize: 12,
  },
});