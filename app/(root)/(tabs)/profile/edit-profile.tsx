import { useUser } from "@clerk/expo";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import PageHeader from "../../../../components/PageHeader";
import { useSupabase } from "../../../../hook/usesupabase";
import { searchLocation } from "../../../../services/locationApi";
import {
  getProfileByClerkId,
  updateProfile,
  type ProfileRow,
} from "../../../../services/profilesApi";
import { useAppTheme } from "../../../../src/theme/ThemeProvider";

interface LocationResult {
  id: string;
  name: string;
  formatted: string;
  latitude: number;
  longitude: number;
}

export default function EditProfileScreen() {
  const { user } = useUser();
  const supabase = useSupabase();
  const { theme } = useAppTheme();

  const clerkId = user?.id ?? null;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [bio, setBio] = useState("");
  const [age, setAge] = useState("");
  const [homeCity, setHomeCity] = useState("");

  const [cityModalVisible, setCityModalVisible] = useState(false);
  const [citySearch, setCitySearch] = useState("");
  const [cityResults, setCityResults] = useState<LocationResult[]>([]);
  const [searchingCity, setSearchingCity] = useState(false);

  const cityRequestRef = useRef(0);
  const cityAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadProfile = async () => {
      if (!clerkId) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        const profile: ProfileRow | null = await getProfileByClerkId(
          supabase,
          clerkId
        );

        if (cancelled) return;

        setFullName(profile?.full_name ?? "");
        setUsername(profile?.username ?? "");
        setAvatarUrl(profile?.avatar_url ?? "");
        setBio(profile?.bio ?? "");
        setAge(profile?.age != null ? String(profile.age) : "");
        setHomeCity(profile?.home_city ?? "");
      } catch (error) {
        console.error("EDIT PROFILE LOAD ERROR:", error);

        if (!cancelled) {
          setErrorMessage("Could not load your profile.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadProfile();

    return () => {
      cancelled = true;
    };
  }, [clerkId, supabase]);

  // Debounced city search on the real geocoding endpoint.
  useEffect(() => {
    const query = citySearch.trim();

    if (query.length < 2) {
      setCityResults([]);
      setSearchingCity(false);
      cityAbortRef.current?.abort();
      cityAbortRef.current = null;
      return;
    }

    const timer = setTimeout(async () => {
      cityAbortRef.current?.abort();

      const controller = new AbortController();
      cityAbortRef.current = controller;
      const requestId = ++cityRequestRef.current;

      try {
        setSearchingCity(true);

        const results = await searchLocation(query, controller.signal);

        if (
          requestId !== cityRequestRef.current ||
          controller.signal.aborted
        ) {
          return;
        }

        setCityResults(results);
      } catch (error: unknown) {
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }

        console.error("CITY SEARCH ERROR:", error);

        if (requestId === cityRequestRef.current) {
          setCityResults([]);
        }
      } finally {
        if (
          requestId === cityRequestRef.current &&
          !controller.signal.aborted
        ) {
          setSearchingCity(false);
        }
      }
    }, 400);

    return () => {
      clearTimeout(timer);
    };
  }, [citySearch]);

  const selectCity = (location: LocationResult) => {
    setHomeCity(location.name);
    setCityModalVisible(false);
    setCitySearch("");
    setCityResults([]);
  };

  const handleSave = async () => {
    if (!clerkId) {
      setErrorMessage("You are not signed in.");
      return;
    }

    const trimmedFullName = fullName.trim();
    const trimmedUsername = username.trim();
    const trimmedBio = bio.trim();
    const trimmedAvatarUrl = avatarUrl.trim();
    const trimmedHomeCity = homeCity.trim();

    if (!trimmedFullName) {
      setErrorMessage("Please enter your full name.");
      return;
    }

    if (!trimmedUsername) {
      setErrorMessage("Please enter a username.");
      return;
    }

    let ageValue: number | null = null;

    if (age.trim()) {
      const parsed = Number(age);

      if (!Number.isInteger(parsed) || parsed < 13 || parsed > 120) {
        setErrorMessage("Please enter a valid age.");
        return;
      }

      ageValue = parsed;
    }

    try {
      setSaving(true);
      setErrorMessage("");

      await updateProfile(supabase, clerkId, {
        full_name: trimmedFullName,
        username: trimmedUsername,
        avatar_url: trimmedAvatarUrl || null,
        bio: trimmedBio || null,
        age: ageValue,
        home_city: trimmedHomeCity || null,
      });

      router.back();
    } catch (error) {
      console.error("EDIT PROFILE SAVE ERROR:", error);
      setErrorMessage("Failed to save your profile.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView
        style={[styles.screen, { backgroundColor: theme.background }]}
        edges={["top", "left", "right", "bottom"]}
      >
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
            Loading profile...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: theme.background }]}
      edges={["top", "left", "right", "bottom"]}
    >
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <PageHeader title="Edit Profile" subtitle="Update your traveler details" />

          {/* Avatar preview */}
          <View style={[styles.avatarCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={[styles.photoFrame, { borderColor: theme.primary }]}>
              {avatarUrl.trim() ? (
                <Image source={{ uri: avatarUrl.trim() }} style={styles.photo} />
              ) : (
                <View style={[styles.photoPlaceholder, { backgroundColor: theme.primaryLight }]}>
                  <Ionicons name="person" size={30} color={theme.primary} />
                </View>
              )}
            </View>

            <Text style={[styles.avatarHint, { color: theme.textSecondary }]}>
              Enter an image URL below to change your photo.
            </Text>
          </View>

          {errorMessage ? (
            <View style={[styles.errorBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text style={[styles.errorText, { color: theme.danger }]}>
                {errorMessage}
              </Text>
            </View>
          ) : null}

          <View style={[styles.formCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            {/* FULL NAME */}
            <View style={styles.field}>
              <Text style={[styles.label, { color: theme.text }]}>Full Name</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.inputBackground, borderColor: theme.border, color: theme.text }]}
                value={fullName}
                onChangeText={setFullName}
                placeholder="Your full name"
                placeholderTextColor={theme.textMuted}
                autoCapitalize="words"
                autoCorrect={false}
              />
            </View>

            {/* USERNAME */}
            <View style={styles.field}>
              <Text style={[styles.label, { color: theme.text }]}>Username</Text>
              <View style={[styles.usernameRow, { backgroundColor: theme.inputBackground, borderColor: theme.border }]}>
                <Text style={[styles.usernameAt, { color: theme.textMuted }]}>@</Text>
                <TextInput
                  style={[styles.usernameInput, { color: theme.text }]}
                  value={username}
                  onChangeText={setUsername}
                  placeholder="username"
                  placeholderTextColor={theme.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            </View>

            {/* HOME CITY */}
            <View style={styles.field}>
              <Text style={[styles.label, { color: theme.text }]}>Home City</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setCitySearch("");
                  setCityResults([]);
                  setCityModalVisible(true);
                }}
                style={({ pressed }) => [
                  styles.citySelector,
                  { backgroundColor: theme.inputBackground, borderColor: theme.border },
                  pressed && styles.pressed,
                ]}
              >
                <Ionicons name="location-outline" size={18} color={theme.primary} />
                <Text
                  style={[
                    styles.cityValue,
                    { color: homeCity ? theme.text : theme.textMuted },
                  ]}
                  numberOfLines={1}
                >
                  {homeCity || "Select your home city"}
                </Text>
                <Ionicons name="chevron-down" size={16} color={theme.textMuted} />
              </Pressable>
            </View>

            {/* AGE */}
            <View style={styles.field}>
              <Text style={[styles.label, { color: theme.text }]}>Age</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.inputBackground, borderColor: theme.border, color: theme.text }]}
                value={age}
                onChangeText={setAge}
                placeholder="Enter age"
                placeholderTextColor={theme.textMuted}
                keyboardType="number-pad"
              />
            </View>

            {/* BIO */}
            <View style={styles.field}>
              <Text style={[styles.label, { color: theme.text }]}>Bio</Text>
              <TextInput
                style={[
                  styles.input,
                  styles.bioInput,
                  { backgroundColor: theme.inputBackground, borderColor: theme.border, color: theme.text },
                ]}
                value={bio}
                onChangeText={setBio}
                placeholder="Tell people a little about yourself"
                placeholderTextColor={theme.textMuted}
                multiline
                textAlignVertical="top"
              />
            </View>

            {/* AVATAR URL */}
            <View style={styles.field}>
              <Text style={[styles.label, { color: theme.text }]}>Profile Photo URL</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.inputBackground, borderColor: theme.border, color: theme.text }]}
                value={avatarUrl}
                onChangeText={setAvatarUrl}
                placeholder="https://..."
                placeholderTextColor={theme.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
              />
            </View>

            {/* ACTIONS */}
            <View style={styles.actions}>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.back()}
                disabled={saving}
                style={({ pressed }) => [
                  styles.cancelButton,
                  { borderColor: theme.border },
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.cancelText, { color: theme.text }]}>Cancel</Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                onPress={() => void handleSave()}
                disabled={saving}
                style={({ pressed }) => [
                  styles.saveButton,
                  { backgroundColor: theme.primary },
                  (pressed || saving) && styles.pressed,
                  saving && styles.disabled,
                ]}
              >
                {saving ? (
                  <ActivityIndicator color={theme.onPrimary} />
                ) : (
                  <Text style={[styles.saveText, { color: theme.onPrimary }]}>
                    Save Changes
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        </ScrollView>

        {/* CITY PICKER */}
        <Modal
          visible={cityModalVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setCityModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.citySheet, { backgroundColor: theme.surface }]}>
              <View style={styles.modalHeader}>
                <View>
                  <Text style={[styles.modalTitle, { color: theme.text }]}>
                    Select Home City
                  </Text>

                  <Text style={[styles.modalSubtitle, { color: theme.textSecondary }]}>
                    Search for your home city
                  </Text>
                </View>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                  hitSlop={10}
                  onPress={() => setCityModalVisible(false)}
                  style={({ pressed }) => [
                    styles.closeButton,
                    { backgroundColor: theme.surfaceSecondary },
                    pressed && styles.pressed,
                  ]}
                >
                  <Ionicons name="close" size={20} color={theme.text} />
                </Pressable>
              </View>

              <View style={[styles.searchBar, { backgroundColor: theme.inputBackground, borderColor: theme.border }]}>
                <Ionicons name="search" size={20} color={theme.textMuted} />
                <TextInput
                  style={[styles.searchInput, { color: theme.text }]}
                  value={citySearch}
                  onChangeText={setCitySearch}
                  placeholder="Search city..."
                  placeholderTextColor={theme.textMuted}
                  autoCorrect={false}
                  autoCapitalize="words"
                  autoFocus
                />

                {searchingCity ? (
                  <ActivityIndicator size="small" color={theme.primary} />
                ) : null}

                {citySearch.length > 0 && !searchingCity ? (
                  <Pressable
                    accessibilityLabel="Clear search"
                    hitSlop={12}
                    onPress={() => {
                      setCitySearch("");
                      setCityResults([]);
                    }}
                  >
                    <Ionicons name="close-circle" size={18} color={theme.textMuted} />
                  </Pressable>
                ) : null}
              </View>

              <ScrollView
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.cityList}
              >
                {searchingCity ? (
                  <Text style={[styles.cityStatus, { color: theme.textSecondary }]}>
                    Searching...
                  </Text>
                ) : cityResults.length === 0 ? (
                  <Text style={[styles.cityStatus, { color: theme.textMuted }]}>
                    {citySearch.trim().length < 2
                      ? "Type at least 2 characters to search."
                      : "No cities found. Try another search."}
                  </Text>
                ) : (
                  cityResults.map((location) => {
                    const selected = homeCity === location.name;

                    return (
                      <Pressable
                        key={location.id}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        onPress={() => selectCity(location)}
                        style={({ pressed }) => [
                          styles.cityRow,
                          { borderColor: theme.border },
                          pressed && styles.pressed,
                        ]}
                      >
                        <View
                          style={[
                            styles.cityPin,
                            { backgroundColor: theme.primaryLight },
                          ]}
                        >
                          <Ionicons name="location" size={18} color={theme.primary} />
                        </View>

                        <View style={styles.cityTextWrap}>
                          <Text style={[styles.cityName, { color: theme.text }]}>
                            {location.name}
                          </Text>

                          <Text
                            style={[styles.cityFormatted, { color: theme.textSecondary }]}
                            numberOfLines={2}
                          >
                            {location.formatted}
                          </Text>
                        </View>

                        {selected ? (
                          <Ionicons name="checkmark-circle" size={20} color={theme.primary} />
                        ) : (
                          <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
                        )}
                      </Pressable>
                    );
                  })
                )}
              </ScrollView>
            </View>
          </View>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },

  flex: {
    flex: 1,
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

  avatarCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    alignItems: "center",
    marginBottom: 16,
  },

  photoFrame: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 2,
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

  avatarHint: {
    marginTop: 10,
    fontSize: 12,
  },

  errorBox: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 16,
  },

  errorText: {
    fontSize: 13,
    fontWeight: "600",
  },

  formCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 18,
  },

  field: {
    marginBottom: 16,
  },

  label: {
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 7,
  },

  input: {
    minHeight: 50,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 15,
  },

  usernameRow: {
    minHeight: 50,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
  },

  usernameAt: {
    fontSize: 16,
    fontWeight: "700",
    marginRight: 4,
  },

  usernameInput: {
    flex: 1,
    fontSize: 15,
  },

  citySelector: {
    minHeight: 50,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    gap: 8,
  },

  cityValue: {
    flex: 1,
    fontSize: 15,
  },

  bioInput: {
    height: 100,
    paddingTop: 12,
  },

  actions: {
    flexDirection: "row",
    marginTop: 6,
    gap: 12,
  },

  cancelButton: {
    flex: 1,
    minHeight: 50,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  cancelText: {
    fontSize: 15,
    fontWeight: "700",
  },

  saveButton: {
    flex: 1.4,
    minHeight: 50,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },

  saveText: {
    fontSize: 15,
    fontWeight: "800",
  },

  disabled: {
    opacity: 0.6,
  },

  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },

  /* ---------- City modal ---------- */

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },

  citySheet: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: 20,
    paddingBottom: 30,
    maxHeight: "80%",
  },

  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },

  modalTitle: {
    fontSize: 20,
    fontWeight: "800",
  },

  modalSubtitle: {
    marginTop: 3,
    fontSize: 13,
  },

  closeButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },

  searchBar: {
    minHeight: 50,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    gap: 10,
    marginBottom: 8,
  },

  searchInput: {
    flex: 1,
    fontSize: 15,
  },

  cityList: {
    paddingBottom: 12,
  },

  cityStatus: {
    marginTop: 20,
    textAlign: "center",
    fontSize: 13,
    paddingHorizontal: 20,
  },

  cityRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 8,
  },

  cityPin: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },

  cityTextWrap: {
    flex: 1,
  },

  cityName: {
    fontSize: 15,
    fontWeight: "700",
  },

  cityFormatted: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 16,
  },
});