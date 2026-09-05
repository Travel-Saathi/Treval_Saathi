
import React, {
  useEffect,
  useRef,
  useState,
} from "react";

import { Ionicons } from "@expo/vector-icons";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

import { searchLocation } from "../../../services/locationApi";

interface LocationResult {
  id: string;
  name: string;
  formatted: string;
  latitude: number;
  longitude: number;
}

type PlaceType = {
  id: string;
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
};

const PLACE_TYPES: PlaceType[] = [
  {
    id: "hotel",
    title: "Hotels",
    icon: "bed-outline",
  },
  {
    id: "restaurant",
    title: "Restaurants",
    icon: "restaurant-outline",
  },
  {
    id: "hospital",
    title: "Hospitals",
    icon: "medkit-outline",
  },
  {
    id: "rest-stop",
    title: "Rest Stops",
    icon: "car-outline",
  },
  {
    id: "gas-station",
    title: "Gas Stations",
    icon: "car-sport-outline",
  },
  {
    id: "parking",
    title: "Parking",
    icon: "car-outline",
  },
  {
    id: "cafe",
    title: "Cafes",
    icon: "cafe-outline",
  },
  {
    id: "grocery",
    title: "Grocery Stores",
    icon: "cart-outline",
  },
  {
    id: "tourist-attraction",
    title: "Tourist Attractions",
    icon: "location-outline",
  },
  {
    id: "atm",
    title: "ATMs",
    icon: "cash-outline",
  },
  {
    id: "pharmacy",
    title: "Pharmacies",
    icon: "medical-outline",
  },
  {
    id: "car-service",
    title: "Car Services",
    icon: "construct-outline",
  },
];

export default function LocationSearchScreen() {
  // Keep the selected destination local to this screen.
  // This avoids depending on a store module that is not present in the project.
  const [selectedLocation, setSelectedLocation] =
    useState<LocationResult | null>(null);

  const [search, setSearch] = useState("");
  const [locations, setLocations] = useState<LocationResult[]>([]);
  const [loading, setLoading] = useState(false);

  const [selectedPlaceTypes, setSelectedPlaceTypes] =
    useState<string[]>([]);

  /*
   * Keeps track of the currently active request.
   * This prevents an older response from replacing
   * a newer search result.
   */
  const requestIdRef = useRef(0);

  /*
   * Allows the current API request to be cancelled
   * when the user changes the search text.
   */
  const abortControllerRef =
    useRef<AbortController | null>(null);

  const inputRef = useRef<TextInput>(null);

  /*
   * Debounced location search.
   *
   * Flow:
   * User types
   *      ↓
   * Wait 400ms
   *      ↓
   * Cancel previous request
   *      ↓
   * Start new request
   */
  useEffect(() => {
    const query = search.trim();

    if (query.length < 2) {
      setLocations([]);
      setLoading(false);

      abortControllerRef.current?.abort();
      abortControllerRef.current = null;

      return;
    }

    const timer = setTimeout(async () => {
      /*
       * Cancel previous request.
       */
      abortControllerRef.current?.abort();

      const controller = new AbortController();

      abortControllerRef.current = controller;

      /*
       * Increase request ID.
       */
      const requestId = ++requestIdRef.current;

      try {
        setLoading(true);

        /*
         * IMPORTANT:
         * This assumes your searchLocation function accepts
         * an optional AbortSignal.
         *
         * If your existing service currently only accepts
         * search text, see the service change below.
         */
        const results = await searchLocation(
          query,
          controller.signal
        );

        /*
         * Ignore stale responses.
         */
        if (
          requestId !== requestIdRef.current ||
          controller.signal.aborted
        ) {
          return;
        }

        setLocations(results);
      } catch (error: unknown) {
        /*
         * Abort errors are expected when a new search starts.
         */
        if (
          error instanceof Error &&
          error.name === "AbortError"
        ) {
          return;
        }

        console.error(
          "Location search error:",
          error
        );

        if (requestId === requestIdRef.current) {
          setLocations([]);
        }
      } finally {
        if (
          requestId === requestIdRef.current &&
          !controller.signal.aborted
        ) {
          setLoading(false);
        }
      }
    }, 400);

    return () => {
      clearTimeout(timer);
    };
  }, [search]);

  /*
   * Select a destination.
   */
  function selectLocation(location: LocationResult) {
    console.log(
      "SELECTED LOCATION:",
      location
    );

    console.log(
      "Latitude:",
      location.latitude
    );

    console.log(
      "Longitude:",
      location.longitude
    );

    /*
     * Save destination in Zustand.
     */
    setSelectedLocation(location);

    /*
     * Clear autocomplete state.
     */
    setLocations([]);

    /*
     * Stop loading.
     */
    setLoading(false);

    /*
     * Clear search text so the destination UI
     * becomes the main focus.
     */
    setSearch("");

    /*
     * Clear any previously selected categories.
     */
    setSelectedPlaceTypes([]);
  }

  /*
   * Toggle a category.
   */
  function togglePlaceType(id: string) {
    setSelectedPlaceTypes((current) =>
      current.includes(id)
        ? current.filter(
            (item) => item !== id
          )
        : [...current, id]
    );
  }

  /*
   * Change destination.
   */
  function changeDestination() {
    /*
     * Remove selected destination.
     */
    setSelectedLocation(null);

    /*
     * Remove selected categories.
     */
    setSelectedPlaceTypes([]);

    /*
     * Clear old search results.
     */
    setLocations([]);

    /*
     * Reset search.
     */
    setSearch("");

    /*
     * Focus input after the UI returns
     * to destination-search mode.
     */
    setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
  }

  /*
   * Continue to the next step.
   *
   * Carries the selected destination and place types
   * over to the Explore screen, which fetches and shows
   * the nearby places.
   */
  function handleContinue() {
    if (
      !selectedLocation ||
      selectedPlaceTypes.length === 0
    ) {
      return;
    }

    console.log(
      "DESTINATION:",
      selectedLocation
    );

    console.log(
      "SELECTED PLACE TYPES:",
      selectedPlaceTypes
    );

    const destinationRequest = {
      destination: {
        id: selectedLocation.id,
        name: selectedLocation.name,
        formatted: selectedLocation.formatted,
        latitude: selectedLocation.latitude,
        longitude: selectedLocation.longitude,
      },
      placeTypes: selectedPlaceTypes,
    };

    console.log(
      "DESTINATION REQUEST:",
      destinationRequest
    );

    router.push({
      pathname: "../explore",
      params: {
        destination: JSON.stringify(
          destinationRequest.destination
        ),
        placeTypes: JSON.stringify(
          destinationRequest.placeTypes
        ),
      },
    });
  }

  const canContinue =
    Boolean(selectedLocation) &&
    selectedPlaceTypes.length > 0;

  /*
   * Destination-selected UI
   */
  if (selectedLocation) {
    return (
      <SafeAreaView
        style={styles.safeArea}
        edges={[
          "top",
          "left",
          "right",
          "bottom",
        ]}
      >
        <View style={styles.container}>
          <FlatList
            data={PLACE_TYPES}
            keyExtractor={(item) => item.id}
            numColumns={2}
            showsVerticalScrollIndicator={false}
            columnWrapperStyle={
              styles.columnWrapper
            }
            contentContainerStyle={
              styles.categoryListContent
            }
            ListHeaderComponent={
              <>
                <Text style={styles.title}>
                  Your destination
                </Text>

                <Text style={styles.subtitle}>
                  Choose what you need to find
                  there.
                </Text>

                {/* Destination Card */}
                <View style={styles.destinationCard}>
                  <View
                    style={
                      styles.destinationIcon
                    }
                  >
                    <Ionicons
                      name="location"
                      size={22}
                      color="#00BC26"
                    />
                  </View>

                  <View
                    style={
                      styles.destinationInfo
                    }
                  >
                    <Text
                      style={
                        styles.destinationLabel
                      }
                    >
                      Destination
                    </Text>

                    <Text
                      style={
                        styles.destinationName
                      }
                      numberOfLines={2}
                    >
                      {selectedLocation.name}
                    </Text>

                    <Text
                      style={
                        styles.destinationAddress
                      }
                      numberOfLines={2}
                    >
                      {selectedLocation.formatted}
                    </Text>
                  </View>

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Change destination"
                    hitSlop={10}
                    onPress={
                      changeDestination
                    }
                    style={({ pressed }) => [
                      styles.changeButton,
                      pressed &&
                        styles.changeButtonPressed,
                    ]}
                  >
                    <Text
                      style={
                        styles.changeButtonText
                      }
                    >
                      Change
                    </Text>
                  </Pressable>
                </View>

                <Text
                  style={styles.sectionTitle}
                >
                  What are you looking for?
                </Text>

                <Text
                  style={
                    styles.categorySubtitle
                  }
                >
                  Select one or more options
                </Text>
              </>
            }
            renderItem={({ item }) => {
              const isSelected =
                selectedPlaceTypes.includes(
                  item.id
                );

              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{
                    selected: isSelected,
                  }}
                  onPress={() =>
                    togglePlaceType(item.id)
                  }
                  style={({ pressed }) => [
                    styles.categoryCard,
                    isSelected &&
                      styles.categoryCardSelected,
                    pressed &&
                      styles.categoryCardPressed,
                  ]}
                >
                  <View
                    style={[
                      styles.categoryIcon,
                      isSelected &&
                        styles.categoryIconSelected,
                    ]}
                  >
                    <Ionicons
                      name={item.icon}
                      size={23}
                      color={
                        isSelected
                          ? "#FFFFFF"
                          : "#00BC26"
                      }
                    />
                  </View>

                  <Text
                    style={[
                      styles.categoryTitle,
                      isSelected &&
                        styles.categoryTitleSelected,
                    ]}
                    numberOfLines={2}
                  >
                    {item.title}
                  </Text>

                  {isSelected && (
                    <View
                      style={
                        styles.selectedCheck
                      }
                    >
                      <Ionicons
                        name="checkmark"
                        size={14}
                        color="#FFFFFF"
                      />
                    </View>
                  )}
                </Pressable>
              );
            }}
            ListFooterComponent={
              <Pressable
                accessibilityRole="button"
                accessibilityState={{
                  disabled: !canContinue,
                }}
                disabled={!canContinue}
                onPress={handleContinue}
                style={({ pressed }) => [
                  styles.continueButton,
                  !canContinue &&
                    styles.continueButtonDisabled,
                  pressed &&
                    canContinue &&
                    styles.continueButtonPressed,
                ]}
              >
                <Text
                  style={
                    styles.continueButtonText
                  }
                >
                  Continue
                </Text>

                <Ionicons
                  name="arrow-forward"
                  size={20}
                  color="#FFFFFF"
                />
              </Pressable>
            }
          />
        </View>
      </SafeAreaView>
    );
  }

  /*
   * Destination search UI
   */
  return (
    <SafeAreaView
      style={styles.safeArea}
      edges={["top", "left", "right"]}
    >
      <View style={styles.container}>
        <Text style={styles.title}>
          Where do you want to go?
        </Text>

        <Text style={styles.subtitle}>
          Search for a city or destination to
          start planning.
        </Text>

        {/* Search Bar */}
        <View style={styles.searchBar}>
          <Ionicons
            name="search"
            size={20}
            color="#6B7280"
            style={styles.searchIcon}
          />

          <TextInput
            ref={inputRef}
            style={styles.input}
            placeholder="Search city or destination..."
            placeholderTextColor="#9CA1A9"
            value={search}
            onChangeText={setSearch}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
          />

          {loading && (
            <ActivityIndicator
              size="small"
              color="#00BC26"
              style={styles.inputLoader}
            />
          )}

          {search.length > 0 &&
            !loading && (
              <Pressable
                accessibilityLabel="Clear search"
                hitSlop={12}
                onPress={() => {
                  setSearch("");
                  setLocations([]);
                }}
                style={
                  styles.clearButton
                }
              >
                <Ionicons
                  name="close-circle"
                  size={18}
                  color="#B0B5BC"
                />
              </Pressable>
            )}
        </View>

        {loading ? (
          <View
            style={styles.loadingContainer}
          >
            <ActivityIndicator
              size="large"
              color="#00BC26"
            />

            <Text
              style={styles.loadingText}
            >
              Searching...
            </Text>
          </View>
        ) : (
          <FlatList
            data={locations}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={
              styles.listContent
            }
            ListEmptyComponent={
              <Text
                style={styles.emptyText}
              >
                {search.trim().length < 2
                  ? "Start typing to find a city or destination."
                  : "No locations found. Try another search."}
              </Text>
            }
            renderItem={({ item }) => (
              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  selectLocation(item)
                }
                style={({ pressed }) => [
                  styles.result,
                  pressed &&
                    styles.resultPressed,
                ]}
              >
                <View
                  style={styles.pinBadge}
                >
                  <Ionicons
                    name="location"
                    size={20}
                    color="#00BC26"
                  />
                </View>

                <View
                  style={styles.resultText}
                >
                  <Text
                    style={styles.name}
                  >
                    {item.name}
                  </Text>

                  <Text
                    style={styles.address}
                    numberOfLines={2}
                  >
                    {item.formatted}
                  </Text>
                </View>

                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color="#C3C7CD"
                />
              </Pressable>
            )}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#F7F7F9",
  },

  container: {
    flex: 1,
    paddingHorizontal: 20,
  },

  title: {
    fontSize: 26,
    fontWeight: "800",
    color: "#1C1C1E",
    letterSpacing: -0.4,
    marginTop: 20,
  },

  subtitle: {
    marginTop: 6,
    fontSize: 15,
    lineHeight: 21,
    color: "#6B7280",
  },

  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingHorizontal: 14,
    minHeight: 52,
    marginTop: 20,
    marginBottom: 14,
    shadowColor: "#000000",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: {
      width: 0,
      height: 4,
    },
    elevation: 2,
  },

  searchIcon: {
    marginRight: 10,
  },

  input: {
    flex: 1,
    height: 50,
    fontSize: 16,
    color: "#1C1C1E",
  },

  inputLoader: {
    marginLeft: 8,
  },

  clearButton: {
    marginLeft: 8,
  },

  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 60,
  },

  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: "#6B7280",
  },

  listContent: {
    paddingBottom: 24,
  },

  emptyText: {
    marginTop: 30,
    textAlign: "center",
    fontSize: 14,
    lineHeight: 20,
    color: "#9CA1A9",
    paddingHorizontal: 20,
  },

  result: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#F0F1F3",
    shadowColor: "#000000",
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: {
      width: 0,
      height: 3,
    },
    elevation: 1,
  },

  resultPressed: {
    backgroundColor: "#F3F4F6",
    transform: [
      {
        scale: 0.99,
      },
    ],
  },

  pinBadge: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#E7F9EB",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },

  resultText: {
    flex: 1,
  },

  name: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1C1C1E",
  },

  address: {
    marginTop: 3,
    fontSize: 13,
    lineHeight: 18,
    color: "#6B7280",
  },

  destinationCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 14,
    marginTop: 22,
    shadowColor: "#000000",
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: {
      width: 0,
      height: 3,
    },
    elevation: 1,
  },

  destinationIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#E7F9EB",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },

  destinationInfo: {
    flex: 1,
  },

  destinationLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6B7280",
    marginBottom: 2,
  },

  destinationName: {
    fontSize: 17,
    fontWeight: "800",
    color: "#1C1C1E",
  },

  destinationAddress: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 17,
    color: "#6B7280",
  },

  changeButton: {
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: "#E7F9EB",
    marginLeft: 8,
  },

  changeButtonPressed: {
    backgroundColor: "#D8F4DE",
    transform: [
      {
        scale: 0.96,
      },
    ],
  },

  changeButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#00BC26",
  },

  sectionTitle: {
    fontSize: 21,
    fontWeight: "800",
    color: "#1C1C1E",
    marginTop: 28,
  },

  categorySubtitle: {
    fontSize: 14,
    color: "#6B7280",
    marginTop: 4,
    marginBottom: 14,
  },

  categoryListContent: {
    paddingBottom: 30,
  },

  columnWrapper: {
    justifyContent: "space-between",
  },

  categoryCard: {
    width: "48.2%",
    minHeight: 116,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 14,
    marginBottom: 12,
    position: "relative",
    shadowColor: "#000000",
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: {
      width: 0,
      height: 3,
    },
    elevation: 1,
  },

  categoryCardSelected: {
    backgroundColor: "#E7F9EB",
    borderColor: "#00BC26",
    borderWidth: 1.5,
  },

  categoryCardPressed: {
    transform: [
      {
        scale: 0.97,
      },
    ],
  },

  categoryIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#E7F9EB",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },

  categoryIconSelected: {
    backgroundColor: "#00BC26",
  },

  categoryTitle: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "700",
    color: "#1C1C1E",
    paddingRight: 8,
  },

  categoryTitleSelected: {
    color: "#08751F",
  },

  selectedCheck: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 23,
    height: 23,
    borderRadius: 12,
    backgroundColor: "#00BC26",
    alignItems: "center",
    justifyContent: "center",
  },

  continueButton: {
    height: 54,
    borderRadius: 16,
    backgroundColor: "#00BC26",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
    marginBottom: 10,
    gap: 9,
  },

  continueButtonDisabled: {
    backgroundColor: "#B8DDBE",
  },

  continueButtonPressed: {
    transform: [
      {
        scale: 0.98,
      },
    ],
  },

  continueButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
  },
});