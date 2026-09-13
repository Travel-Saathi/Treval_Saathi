import { useAuth, useUser } from "@clerk/expo";
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { SafeAreaView } from "react-native-safe-area-context";

import { useSupabase } from "../../../hook/usesupabase";
import { useAppTheme } from "../../../src/theme/ThemeProvider";

const CITIES = [
  {
    region: "Madhya Pradesh",
    cities: ["Bhopal", "Indore"],
  },
  {
    region: "Maharashtra",
    cities: ["Mumbai", "Pune", "Nagpur"],
  },
  {
    region: "Delhi",
    cities: ["Delhi"],
  },
  {
    region: "Karnataka",
    cities: ["Bengaluru"],
  },
  {
    region: "Telangana",
    cities: ["Hyderabad"],
  },
  {
    region: "Rajasthan",
    cities: ["Jaipur"],
  },
  {
    region: "Uttar Pradesh",
    cities: ["Lucknow", "Noida", "Varanasi"],
  },
  {
    region: "Gujarat",
    cities: ["Ahmedabad", "Surat"],
  },
  {
    region: "Tamil Nadu",
    cities: ["Chennai", "Coimbatore"],
  },
  {
    region: "West Bengal",
    cities: ["Kolkata"],
  },
];

export default function ProfileScreen() {
  const { user } = useUser();
  const { getToken, signOut } = useAuth();
  const supabase = useSupabase();

  const { dark, mode, setMode } = useAppTheme();

  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const [errorMessage, setErrorMessage] = useState("");

  const [username, setUsername] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [bio, setBio] = useState("");
  const [age, setAge] = useState("");
  const [homeCity, setHomeCity] = useState("");

  const [cityModalVisible, setCityModalVisible] = useState(false);
  const [citySearch, setCitySearch] = useState("");

  const filteredCities = useMemo(() => {
    const search = citySearch.trim().toLowerCase();

    return CITIES.map((group) => ({
      ...group,
      cities: group.cities.filter((city) =>
        city.toLowerCase().includes(search)
      ),
    })).filter((group) => group.cities.length > 0);
  }, [citySearch]);

  useEffect(() => {
    let cancelled = false;

    const loadProfile = async () => {
      if (!user?.id) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setErrorMessage("");

        const token = await getToken();

        if (!token) {
          setErrorMessage("Could not get authentication token.");
          return;
        }

        const { data, error } = await supabase
          .from("profiles")
          .select("username, avatar_url, bio, age, home_city")
          .eq("clerk_id", user.id)
          .maybeSingle();

        if (error) {
          console.error("PROFILE LOAD ERROR:", error);

          if (!cancelled) {
            setErrorMessage("Could not load your profile.");
          }

          return;
        }

        if (cancelled) return;

        if (data) {
          setUsername(data.username ?? "");
          setAvatarUrl(data.avatar_url ?? "");
          setBio(data.bio ?? "");
          setAge(data.age != null ? String(data.age) : "");
          setHomeCity(data.home_city ?? "");
        }
      } catch (error) {
        console.error("PROFILE LOAD FAILED:", error);

        if (!cancelled) {
          setErrorMessage("Failed to load your profile.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadProfile();

    return () => {
      cancelled = true;
    };
  }, [user?.id, supabase]);

  const handleEdit = () => {
    setErrorMessage("");
    setEditing(true);
  };

  const handleCancel = () => {
    setErrorMessage("");
    setEditing(false);
  };

  const handleSave = async () => {
    if (!user?.id) {
      setErrorMessage("You are not signed in.");
      return;
    }

    const trimmedUsername = username.trim();
    const trimmedBio = bio.trim();
    const trimmedAvatarUrl = avatarUrl.trim();
    const trimmedHomeCity = homeCity.trim();

    if (!trimmedUsername) {
      setErrorMessage("Please enter a username.");
      return;
    }

    if (age.trim()) {
      const ageNumber = Number(age);

      if (
        !Number.isInteger(ageNumber) ||
        ageNumber < 13 ||
        ageNumber > 120
      ) {
        setErrorMessage("Please enter a valid age.");
        return;
      }
    }

    try {
      setSaving(true);
      setErrorMessage("");

      const token = await getToken();

      if (!token) {
        setErrorMessage("Could not get authentication token.");
        return;
      }

      const ageValue = age.trim() ? Number(age) : null;

      const { error } = await supabase
        .from("profiles")
        .update({
          username: trimmedUsername,
          avatar_url: trimmedAvatarUrl || null,
          bio: trimmedBio || null,
          age: ageValue,
          home_city: trimmedHomeCity || null,
        })
        .eq("clerk_id", user.id);

      if (error) {
        console.error("PROFILE SAVE ERROR:", error);
        setErrorMessage(error.message);
        return;
      }

      console.log("PROFILE SAVED: true");

      setEditing(false);
    } catch (error) {
      console.error("PROFILE SAVE FAILED:", error);
      setErrorMessage("Failed to save your profile.");
    } finally {
      setSaving(false);
    }
  };

  // YOUR SIGN-OUT FEATURE - LEFT UNCHANGED

const handleSignOut = async () => {
  if (signingOut) return;

  setSigningOut(true);

  try {
    console.log("[AUTH_DEBUG] SIGN_OUT_START");

    await signOut();

    console.log("[AUTH_DEBUG] SIGN_OUT_COMPLETE");

    // Let Clerk finish updating its auth state before navigating.
    await new Promise((resolve) => setTimeout(resolve, 100));

    console.log("[AUTH_DEBUG] SIGN_OUT_NAVIGATE");

    router.replace("/(auth)/sign-in");
  } catch (error) {
    console.error("[AUTH_DEBUG] SIGN_OUT_ERROR:", error);
  } finally {
    setSigningOut(false);
  }
};


  if (loading) {
    return (
      <SafeAreaView
        style={[
          styles.container,
          dark && styles.containerDark,
        ]}
      >
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" />

          <Text
            style={[
              styles.loadingText,
              dark && styles.textDark,
            ]}
          >
            Loading profile...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const displayName =
    user?.fullName ||
    user?.firstName ||
    "Your Name";

  const email =
    user?.primaryEmailAddress?.emailAddress ||
    "No email";

  const initials = displayName
    .split(" ")
    .map((part) => part.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <SafeAreaView
      style={[
        styles.container,
        dark && styles.containerDark,
      ]}
    >
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={
          Platform.OS === "ios"
            ? "padding"
            : undefined
        }
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* PAGE HEADER */}

          <View style={styles.topBar}>
            <Text
              style={[
                styles.pageTitle,
                dark && styles.textDark,
              ]}
            >
              Profile
            </Text>
          </View>

          {/* PROFILE HEADER */}

          <View
            style={[
              styles.profileCard,
              dark && styles.cardDark,
            ]}
          >
            <View style={styles.avatarWrapper}>
              <View style={styles.avatarRing}>
                {avatarUrl ? (
                  <Image
                    source={{ uri: avatarUrl }}
                    style={styles.avatar}
                  />
                ) : (
                  <View
                    style={[
                      styles.avatar,
                      styles.avatarPlaceholder,
                    ]}
                  >
                    <Text style={styles.initials}>
                      {initials}
                    </Text>
                  </View>
                )}
              </View>

              {editing && (
                <TouchableOpacity
                  style={styles.cameraButton}
                  onPress={() =>
                    setErrorMessage(
                      "Enter an image URL below to change your photo."
                    )
                  }
                >
                  <Text style={styles.cameraIcon}>
                    📷
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            <Text
              style={[
                styles.name,
                dark && styles.textDark,
              ]}
            >
              {displayName}
            </Text>

            {username ? (
              <Text style={styles.username}>
                @{username}
              </Text>
            ) : null}

            {!editing && (
              <Text
                style={[
                  styles.bio,
                  dark && styles.secondaryTextDark,
                ]}
              >
                {bio ||
                  "Add a short bio to tell people about yourself."}
              </Text>
            )}

            {!editing && (
              <View style={styles.actions}>
                <TouchableOpacity
                  style={styles.editButton}
                  onPress={handleEdit}
                >
                  <Text style={styles.editIcon}>
                    ✏️
                  </Text>

                  <Text style={styles.editButtonText}>
                    Edit Profile
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.signOutButton,
                    signingOut &&
                      styles.buttonDisabled,
                  ]}
                  onPress={handleSignOut}
                  disabled={signingOut}
                >
                  {signingOut ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <>
                      <Text style={styles.logoutIcon}>
                        ↪
                      </Text>

                      <Text style={styles.signOutText}>
                        Sign Out
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>

          {errorMessage ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>
                {errorMessage}
              </Text>
            </View>
          ) : null}

          {/* EDIT MODE */}

          {editing ? (
            <View
              style={[
                styles.sectionCard,
                dark && styles.cardDark,
              ]}
            >
              <Text
                style={[
                  styles.sectionTitle,
                  dark && styles.textDark,
                ]}
              >
                Edit Profile
              </Text>

              <Text
                style={[
                  styles.editingSubtitle,
                  dark && styles.secondaryTextDark,
                ]}
              >
                Update your profile information.
              </Text>

              {/* NAME */}

              <View style={styles.field}>
                <Text
                  style={[
                    styles.label,
                    dark && styles.textDark,
                  ]}
                >
                  Full Name
                </Text>

                <View
                  style={[
                    styles.readOnlyInput,
                    dark && styles.inputDark,
                  ]}
                >
                  <Text
                    style={[
                      styles.readOnlyText,
                      dark && styles.textDark,
                    ]}
                  >
                    {displayName}
                  </Text>
                </View>

                <Text style={styles.helperText}>
                  Your name comes from your account.
                </Text>
              </View>

              {/* USERNAME */}

              <View style={styles.field}>
                <Text
                  style={[
                    styles.label,
                    dark && styles.textDark,
                  ]}
                >
                  Username
                </Text>

                <TextInput
                  style={[
                    styles.input,
                    dark && styles.inputDark,
                    dark && styles.textDark,
                  ]}
                  value={username}
                  onChangeText={setUsername}
                  placeholder="Enter username"
                  placeholderTextColor={
                    dark ? "#777" : "#999"
                  }
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              {/* BIO */}

              <View style={styles.field}>
                <Text
                  style={[
                    styles.label,
                    dark && styles.textDark,
                  ]}
                >
                  Bio
                </Text>

                <TextInput
                  style={[
                    styles.input,
                    styles.bioInput,
                    dark && styles.inputDark,
                    dark && styles.textDark,
                  ]}
                  value={bio}
                  onChangeText={setBio}
                  placeholder="Tell people about yourself"
                  placeholderTextColor={
                    dark ? "#777" : "#999"
                  }
                  multiline
                  textAlignVertical="top"
                />
              </View>

              {/* CITY SELECTOR */}

              <View style={styles.field}>
                <Text
                  style={[
                    styles.label,
                    dark && styles.textDark,
                  ]}
                >
                  City
                </Text>

                <TouchableOpacity
                  activeOpacity={0.8}
                  style={[
                    styles.citySelector,
                    dark && styles.inputDark,
                  ]}
                  onPress={() => {
                    setCitySearch("");
                    setCityModalVisible(true);
                  }}
                >
                  <View style={styles.cityLeft}>
                    <View style={styles.locationIcon}>
                      <Text style={styles.locationIconText}>
                        📍
                      </Text>
                    </View>

                    <Text
                      style={[
                        styles.cityValue,
                        !homeCity &&
                          styles.cityPlaceholder,
                        dark && styles.textDark,
                      ]}
                    >
                      {homeCity ||
                        "Select your city"}
                    </Text>
                  </View>

                  <Text
                    style={[
                      styles.chevron,
                      dark &&
                        styles.secondaryTextDark,
                    ]}
                  >
                    ›
                  </Text>
                </TouchableOpacity>
              </View>

              {/* AGE */}

              <View style={styles.field}>
                <Text
                  style={[
                    styles.label,
                    dark && styles.textDark,
                  ]}
                >
                  Age
                </Text>

                <TextInput
                  style={[
                    styles.input,
                    dark && styles.inputDark,
                    dark && styles.textDark,
                  ]}
                  value={age}
                  onChangeText={setAge}
                  placeholder="Enter age"
                  placeholderTextColor={
                    dark ? "#777" : "#999"
                  }
                  keyboardType="number-pad"
                />
              </View>

              {/* AVATAR */}

              <View style={styles.field}>
                <Text
                  style={[
                    styles.label,
                    dark && styles.textDark,
                  ]}
                >
                  Profile Photo URL
                </Text>

                <TextInput
                  style={[
                    styles.input,
                    dark && styles.inputDark,
                    dark && styles.textDark,
                  ]}
                  value={avatarUrl}
                  onChangeText={setAvatarUrl}
                  placeholder="https://..."
                  placeholderTextColor={
                    dark ? "#777" : "#999"
                  }
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                />
              </View>

              {/* SAVE / CANCEL */}

              <View style={styles.editActions}>
                <TouchableOpacity
                  style={[
                    styles.cancelButton,
                    dark &&
                      styles.cancelButtonDark,
                  ]}
                  onPress={handleCancel}
                  disabled={saving}
                >
                  <Text
                    style={[
                      styles.cancelText,
                      dark && styles.textDark,
                    ]}
                  >
                    Cancel
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.saveButton,
                    saving &&
                      styles.buttonDisabled,
                  ]}
                  onPress={handleSave}
                  disabled={saving}
                >
                  {saving ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.saveText}>
                      Save Changes
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <>
              {/* ABOUT */}

              <View
                style={[
                  styles.sectionCard,
                  dark && styles.cardDark,
                ]}
              >
                <Text
                  style={[
                    styles.sectionTitle,
                    dark && styles.textDark,
                  ]}
                >
                  About
                </Text>

                <View style={styles.infoRow}>
                  <View style={styles.infoIcon}>
                    <Text>📍</Text>
                  </View>

                  <View style={styles.infoContent}>
                    <Text style={styles.infoLabel}>
                      Location
                    </Text>

                    <Text
                      style={[
                        styles.infoValue,
                        dark && styles.textDark,
                      ]}
                    >
                      {homeCity || "Not added"}
                    </Text>
                  </View>
                </View>

                <View style={styles.infoRow}>
                  <View style={styles.infoIcon}>
                    <Text>📧</Text>
                  </View>

                  <View style={styles.infoContent}>
                    <Text style={styles.infoLabel}>
                      Email
                    </Text>

                    <Text
                      style={[
                        styles.infoValue,
                        dark && styles.textDark,
                      ]}
                    >
                      {email}
                    </Text>
                  </View>
                </View>

                <View style={styles.infoRow}>
                  <View style={styles.infoIcon}>
                    <Text>🎂</Text>
                  </View>

                  <View style={styles.infoContent}>
                    <Text style={styles.infoLabel}>
                      Age
                    </Text>

                    <Text
                      style={[
                        styles.infoValue,
                        dark && styles.textDark,
                      ]}
                    >
                      {age || "Not added"}
                    </Text>
                  </View>
                </View>

                <View style={styles.infoRow}>
                  <View style={styles.infoIcon}>
                    <Text>🌐</Text>
                  </View>

                  <View style={styles.infoContent}>
                    <Text style={styles.infoLabel}>
                      Website
                    </Text>

                    <Text
                      style={[
                        styles.infoValue,
                        dark && styles.textDark,
                      ]}
                    >
                      Not added
                    </Text>
                  </View>
                </View>
              </View>

              {/* ACTIVITY */}

              <View
                style={[
                  styles.sectionCard,
                  dark && styles.cardDark,
                ]}
              >
                <Text
                  style={[
                    styles.sectionTitle,
                    dark && styles.textDark,
                  ]}
                >
                  Activity
                </Text>

                <View style={styles.statsRow}>
                  <View style={styles.stat}>
                    <Text
                      style={[
                        styles.statNumber,
                        dark && styles.textDark,
                      ]}
                    >
                      0
                    </Text>

                    <Text style={styles.statLabel}>
                      Posts
                    </Text>
                  </View>

                  <View style={styles.stat}>
                    <Text
                      style={[
                        styles.statNumber,
                        dark && styles.textDark,
                      ]}
                    >
                      0
                    </Text>

                    <Text style={styles.statLabel}>
                      Followers
                    </Text>
                  </View>

                  <View style={styles.stat}>
                    <Text
                      style={[
                        styles.statNumber,
                        dark && styles.textDark,
                      ]}
                    >
                      0
                    </Text>

                    <Text style={styles.statLabel}>
                      Following
                    </Text>
                  </View>
                </View>
              </View>

              {/* APPEARANCE */}
              <View
                style={[
                  styles.sectionCard,
                  dark && styles.cardDark,
                ]}
              >
                <Text
                  style={[
                    styles.sectionTitle,
                    dark && styles.textDark,
                  ]}
                >
                  Appearance
                </Text>

                <Text
                  style={[
                    styles.editingSubtitle,
                    dark && styles.secondaryTextDark,
                  ]}
                >
                  Choose how the app looks.
                </Text>

                <View style={styles.appearanceRow}>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    style={[
                      styles.appearanceOption,
                      mode === "light" &&
                        styles.appearanceOptionSelected,
                    ]}
                    onPress={() => setMode("light")}
                  >
                    <Text style={styles.appearanceEmoji}>☀️</Text>
                    <Text
                      style={[
                        styles.appearanceLabel,
                        dark && styles.textDark,
                        mode === "light" &&
                          styles.appearanceLabelSelected,
                      ]}
                    >
                      Light
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={0.8}
                    style={[
                      styles.appearanceOption,
                      mode === "dark" &&
                        styles.appearanceOptionSelected,
                    ]}
                    onPress={() => setMode("dark")}
                  >
                    <Text style={styles.appearanceEmoji}>🌙</Text>
                    <Text
                      style={[
                        styles.appearanceLabel,
                        dark && styles.textDark,
                        mode === "dark" &&
                          styles.appearanceLabelSelected,
                      ]}
                    >
                      Dark
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </>
          )}
        </ScrollView>

        {/* CITY SELECTOR */}

        <Modal
          visible={cityModalVisible}
          transparent
          animationType="slide"
          onRequestClose={() =>
            setCityModalVisible(false)
          }
        >
          <View style={styles.modalOverlay}>
            <View
              style={[
                styles.cityModal,
                dark && styles.cityModalDark,
              ]}
            >
              <View style={styles.modalHeader}>
                <View>
                  <Text
                    style={[
                      styles.modalTitle,
                      dark && styles.textDark,
                    ]}
                  >
                    Select City
                  </Text>

                  <Text
                    style={[
                      styles.modalSubtitle,
                      dark &&
                        styles.secondaryTextDark,
                    ]}
                  >
                    Choose your city
                  </Text>
                </View>

                <TouchableOpacity
                  style={[
                    styles.closeButton,
                    dark &&
                      styles.closeButtonDark,
                  ]}
                  onPress={() =>
                    setCityModalVisible(false)
                  }
                >
                  <Text
                    style={[
                      styles.closeText,
                      dark && styles.textDark,
                    ]}
                  >
                    ×
                  </Text>
                </TouchableOpacity>
              </View>

              {/* SEARCH */}

              <View
                style={[
                  styles.searchContainer,
                  dark &&
                    styles.searchContainerDark,
                ]}
              >
                <Text style={styles.searchIcon}>
                  🔍
                </Text>

                <TextInput
                  style={[
                    styles.searchInput,
                    dark && styles.textDark,
                  ]}
                  value={citySearch}
                  onChangeText={setCitySearch}
                  placeholder="Search city..."
                  placeholderTextColor={
                    dark ? "#777" : "#999"
                  }
                  autoCorrect={false}
                  autoCapitalize="words"
                  autoFocus
                />
              </View>

              {/* CITY LIST */}

              <ScrollView
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={
                  styles.cityList
                }
              >
                {filteredCities.map((group) => (
                  <View
                    key={group.region}
                    style={styles.regionGroup}
                  >
                    <Text
                      style={[
                        styles.regionTitle,
                        dark &&
                          styles.secondaryTextDark,
                      ]}
                    >
                      {group.region}
                    </Text>

                    {group.cities.map((city) => {
                      const selected =
                        homeCity === city;

                      return (
                        <TouchableOpacity
                          key={city}
                          activeOpacity={0.7}
                          style={[
                            styles.cityOption,
                            selected &&
                              styles.cityOptionSelected,
                            selected &&
                              dark &&
                              styles.cityOptionSelectedDark,
                          ]}
                          onPress={() => {
                            setHomeCity(city);
                            setCityModalVisible(
                              false
                            );
                            setCitySearch("");
                          }}
                        >
                          <View
                            style={
                              styles.cityOptionLeft
                            }
                          >
                            <View
                              style={[
                                styles.cityDot,
                                selected &&
                                  styles.cityDotSelected,
                              ]}
                            >
                              <Text
                                style={styles.cityPin}
                              >
                                📍
                              </Text>
                            </View>

                            <Text
                              style={[
                                styles.cityOptionText,
                                dark &&
                                  styles.textDark,
                              ]}
                            >
                              {city}
                            </Text>
                          </View>

                          {selected && (
                            <Text
                              style={styles.checkmark}
                            >
                              ✓
                            </Text>
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ))}

                {filteredCities.length === 0 && (
                  <View style={styles.noResults}>
                    <Text style={styles.noResultsIcon}>
                      📍
                    </Text>

                    <Text
                      style={[
                        styles.noResultsTitle,
                        dark && styles.textDark,
                      ]}
                    >
                      No city found
                    </Text>

                    <Text style={styles.noResultsText}>
                      Try searching for another city.
                    </Text>
                  </View>
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
  flex: {
    flex: 1,
  },

  container: {
    flex: 1,
    backgroundColor: "#F7F8FA",
  },

  containerDark: {
    backgroundColor: "#101114",
  },

  content: {
    width: "100%",
    maxWidth: 900,
    alignSelf: "center",
    padding: 20,
    paddingBottom: 50,
  },

  topBar: {
    marginBottom: 20,
  },

  pageTitle: {
    fontSize: 30,
    fontWeight: "800",
    color: "#111111",
  },

  textDark: {
    color: "#FFFFFF",
  },

  secondaryTextDark: {
    color: "#AAAAAA",
  },

  profileCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 28,
    alignItems: "center",
    marginBottom: 18,

    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 4,
  },

  cardDark: {
    backgroundColor: "#191B20",
  },

  avatarWrapper: {
    position: "relative",
    marginBottom: 18,
  },

  avatarRing: {
    width: 126,
    height: 126,
    borderRadius: 63,
    padding: 4,
    borderWidth: 2,
    borderColor: "#7C5CFC",
  },

  avatar: {
    width: 114,
    height: 114,
    borderRadius: 57,
  },

  avatarPlaceholder: {
    backgroundColor: "#E9E5FF",
    justifyContent: "center",
    alignItems: "center",
  },

  initials: {
    fontSize: 38,
    fontWeight: "800",
    color: "#6046D8",
  },

  cameraButton: {
    position: "absolute",
    right: 0,
    bottom: 2,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#111111",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 3,
    borderColor: "#FFFFFF",
  },

  cameraIcon: {
    fontSize: 17,
  },

  name: {
    fontSize: 26,
    fontWeight: "800",
    color: "#111111",
    textAlign: "center",
  },

  username: {
    fontSize: 15,
    color: "#7C5CFC",
    marginTop: 4,
    fontWeight: "600",
  },

  bio: {
    marginTop: 12,
    color: "#666666",
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
    maxWidth: 500,
  },

  actions: {
    flexDirection: "row",
    width: "100%",
    maxWidth: 520,
    gap: 12,
    marginTop: 24,
  },

  editButton: {
    flex: 1,
    backgroundColor: "#111111",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },

  editIcon: {
    fontSize: 16,
  },

  editButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },

  signOutButton: {
    flex: 1,
    backgroundColor: "#E53935",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },

  logoutIcon: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "700",
  },

  signOutText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },

  errorBox: {
    backgroundColor: "#FFECEC",
    borderRadius: 12,
    padding: 14,
    marginBottom: 18,
  },

  errorText: {
    color: "#C00000",
    fontSize: 14,
  },

  sectionCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 22,
    marginBottom: 18,

    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 5,
    },
    shadowOpacity: 0.05,
    shadowRadius: 15,
    elevation: 2,
  },

  sectionTitle: {
    fontSize: 19,
    fontWeight: "800",
    color: "#111111",
    marginBottom: 20,
  },

  editingSubtitle: {
    marginTop: -12,
    marginBottom: 22,
    color: "#666666",
    fontSize: 14,
  },

  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 18,
  },

  infoIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: "#F2F2F4",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 14,
  },

  infoContent: {
    flex: 1,
  },

  infoLabel: {
    fontSize: 12,
    color: "#888888",
    marginBottom: 3,
  },

  infoValue: {
    fontSize: 15,
    color: "#222222",
    fontWeight: "600",
  },

  statsRow: {
    flexDirection: "row",
    justifyContent: "space-around",
  },

  stat: {
    alignItems: "center",
    flex: 1,
  },

  statNumber: {
    fontSize: 22,
    fontWeight: "800",
    color: "#111111",
  },

  statLabel: {
    fontSize: 13,
    color: "#888888",
    marginTop: 4,
  },

  field: {
    marginBottom: 18,
  },

  label: {
    fontSize: 14,
    fontWeight: "700",
    color: "#222222",
    marginBottom: 8,
  },

  input: {
    borderWidth: 1,
    borderColor: "#D8D8DC",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 16,
    backgroundColor: "#FFFFFF",
    color: "#111111",
  },

  inputDark: {
    backgroundColor: "#111317",
    borderColor: "#33363D",
  },

  readOnlyInput: {
    borderWidth: 1,
    borderColor: "#E1E1E4",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    backgroundColor: "#F5F5F6",
  },

  readOnlyText: {
    fontSize: 16,
    color: "#555555",
  },

  helperText: {
    fontSize: 12,
    color: "#999999",
    marginTop: 5,
  },

  bioInput: {
    minHeight: 110,
  },

  /* CITY */

  citySelector: {
    minHeight: 56,
    borderWidth: 1,
    borderColor: "#D8D8DC",
    borderRadius: 14,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFFFFF",
  },

  cityLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },

  locationIcon: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: "#F1EEFF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },

  locationIconText: {
    fontSize: 17,
  },

  cityValue: {
    fontSize: 16,
    fontWeight: "600",
    color: "#222222",
  },

  cityPlaceholder: {
    color: "#999999",
    fontWeight: "500",
  },

  chevron: {
    fontSize: 28,
    color: "#888888",
  },

  /* EDIT ACTIONS */

  editActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 5,
  },

  cancelButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#D5D5D8",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },

  cancelButtonDark: {
    borderColor: "#44474E",
  },

  cancelText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#222222",
  },

  saveButton: {
    flex: 1,
    backgroundColor: "#111111",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },

  saveText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },

  buttonDisabled: {
    opacity: 0.6,
  },

  /* APPEARANCE */

  appearanceRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 4,
  },

  appearanceOption: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E1E1E4",
    backgroundColor: "#F7F8FA",
  },

  appearanceOptionSelected: {
    backgroundColor: "#E7F9EB",
    borderColor: "#00BC26",
  },

  appearanceEmoji: {
    fontSize: 18,
  },

  appearanceLabel: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1C1C1E",
  },

  appearanceLabelSelected: {
    color: "#007A1E",
  },

  /* CITY MODAL */

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },

  cityModal: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: "88%",
    paddingTop: 22,
    paddingHorizontal: 20,
    paddingBottom: 30,
  },

  cityModalDark: {
    backgroundColor: "#191B20",
  },

  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 18,
  },

  modalTitle: {
    fontSize: 23,
    fontWeight: "800",
    color: "#111111",
  },

  modalSubtitle: {
    marginTop: 4,
    fontSize: 13,
    color: "#888888",
  },

  closeButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#F2F2F4",
    alignItems: "center",
    justifyContent: "center",
  },

  closeButtonDark: {
    backgroundColor: "#292C32",
  },

  closeText: {
    fontSize: 27,
    lineHeight: 29,
    color: "#222222",
  },

  searchContainer: {
    height: 52,
    borderRadius: 14,
    backgroundColor: "#F4F4F6",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    marginBottom: 18,
  },

  searchContainerDark: {
    backgroundColor: "#111317",
  },

  searchIcon: {
    fontSize: 17,
    marginRight: 8,
  },

  searchInput: {
    flex: 1,
    fontSize: 16,
    color: "#111111",
  },

  cityList: {
    paddingBottom: 20,
  },

  regionGroup: {
    marginBottom: 20,
  },

  regionTitle: {
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    color: "#888888",
    marginBottom: 8,
  },

  cityOption: {
    minHeight: 58,
    borderRadius: 14,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },

  cityOptionSelected: {
    backgroundColor: "#F1EEFF",
  },

  cityOptionSelectedDark: {
    backgroundColor: "#29233F",
  },

  cityOptionLeft: {
    flexDirection: "row",
    alignItems: "center",
  },

  cityDot: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#F4F4F6",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },

  cityDotSelected: {
    backgroundColor: "#E5DEFF",
  },

  cityPin: {
    fontSize: 16,
  },

  cityOptionText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#222222",
  },

  checkmark: {
    fontSize: 22,
    fontWeight: "800",
    color: "#6C4FF7",
    marginRight: 8,
  },

  noResults: {
    alignItems: "center",
    paddingTop: 50,
  },

  noResultsIcon: {
    fontSize: 36,
    marginBottom: 12,
  },

  noResultsTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#222222",
  },

  noResultsText: {
    fontSize: 14,
    color: "#888888",
    marginTop: 5,
  },

  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },

  loadingText: {
    marginTop: 12,
    fontSize: 15,
    color: "#666666",
  },
});