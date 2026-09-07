import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
    FlatList,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import PlaceMap, {
    type PlaceMapRegion,
} from "../../components/PlaceMap";
import { getOsmPlaces, type TravelPlace } from "../../services/placesApi";

interface SelectedLocation {
  id: string;
  name: string;
  formatted: string;
  latitude: number;
  longitude: number;
}

/*
 * Selectable nearby-place search radii in meters.
 * The default is 4 km (4000).
 */
const RADIUS_OPTIONS = [
  { label: "1 km", value: 1000 },
  { label: "2 km", value: 2000 },
  { label: "4 km", value: 4000 },
  { label: "5 km", value: 5000 },
  { label: "10 km", value: 10000 },
];

const CATEGORY_LABELS: Record<string, string> = {
  hotel: "Hotel",
  restaurant: "Restaurant",
  hospital: "Hospital",
  "rest-stop": "Rest Stop",
  "gas-station": "Gas Station",
  parking: "Parking",
  cafe: "Cafe",
  grocery: "Grocery Store",
  "tourist-attraction": "Tourist Attraction",
  atm: "ATM",
  pharmacy: "Pharmacy",
  "car-service": "Car Service",
};

/*
 * Fallback used when a place does not match any selected app category.
 * "tourism.attraction" -> "Attraction", "parking" -> "Parking".
 */
function humanizeCategory(category: string | null): string {
  if (!category) {
    return "Place";
  }

  const segments = category.split(".");
  const primary = segments.length > 1 ? segments[1] : segments[0];

  const readable = primary
    .split("-")
    .map(
      (word) =>
        word.charAt(0).toUpperCase() + word.slice(1)
    )
    .join(" ");

  return readable || "Place";
}

/*
 * OSM category values produced by normalizeOsmPlace that belong to
 * each app category. Used by the filter chips and category label.
 */
const OSM_CATEGORY_MATCH: Record<string, string[]> = {
  hotel: ["hotel", "hostel", "guest_house"],
  restaurant: ["restaurant"],
  cafe: ["cafe"],
  hospital: ["hospital"],
  pharmacy: ["pharmacy"],
  "gas-station": ["fuel"],
  parking: ["parking"],
  "tourist-attraction": [
    "tourism",
    "historic",
    "attraction",
    "museum",
    "gallery",
    "viewpoint",
    "artwork",
    "monument",
    "memorial",
    "castle",
    "ruins",
  ],
};

/*
 * A place matches an app category when its OSM category value
 * is one of the ones the app category represents.
 */
function osmPlaceMatchesAppCategory(
  place: TravelPlace,
  appCategoryId: string
): boolean {
  const accepted = OSM_CATEGORY_MATCH[appCategoryId];

  if (!accepted) {
    return false;
  }

  return accepted.includes((place.category || "").toLowerCase());
}

const OSM_CATEGORY_LABELS: Record<string, string> = {
  tourism: "Tourist Attraction",
  attraction: "Tourist Attraction",
  museum: "Tourist Attraction",
  gallery: "Tourist Attraction",
  viewpoint: "Tourist Attraction",
  artwork: "Tourist Attraction",
  monument: "Monument",
  memorial: "Memorial",
  historic: "Historic Place",
  hotel: "Hotel",
  hostel: "Hotel",
  guest_house: "Hotel",
  restaurant: "Restaurant",
  cafe: "Cafe",
  hospital: "Hospital",
  pharmacy: "Pharmacy",
  fuel: "Gas Station",
  parking: "Parking",
  railway_station: "Railway Station",
  bus_station: "Bus Station",
};

function worshipLabel(religion: string | null): string {
  if (religion === "hindu") {
    return "Temple";
  }

  if (religion === "muslim") {
    return "Mosque";
  }

  if (religion === "christian") {
    return "Church";
  }

  return "Place of Worship";
}

/*
 * Human-readable label for a raw OSM category value.
 */
function osmCategoryLabel(
  category: string | null,
  religion: string | null
): string {
  const key = (category || "").toLowerCase();

  if (key === "place_of_worship") {
    return worshipLabel(religion);
  }

  return (
    OSM_CATEGORY_LABELS[key] ??
    humanizeCategory(category) ??
    "Place"
  );
}

function displayCategory(
  place: TravelPlace,
  selectedCategories: string[]
): string {
  for (const appCategoryId of selectedCategories) {
    if (osmPlaceMatchesAppCategory(place, appCategoryId)) {
      return (
        CATEGORY_LABELS[appCategoryId] ?? appCategoryId
      );
    }
  }

  return osmCategoryLabel(place.category, place.religion);
}

function openingHoursText(
  openingHours: string | null
): string | null {
  if (openingHours && openingHours.trim()) {
    return openingHours.trim();
  }

  return null;
}

function parseDestination(raw: string | undefined): SelectedLocation | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(raw);

    if (
      parsed &&
      typeof parsed === "object" &&
      "name" in parsed &&
      typeof parsed.name === "string" &&
      "latitude" in parsed &&
      typeof parsed.latitude === "number" &&
      "longitude" in parsed &&
      typeof parsed.longitude === "number"
    ) {
      return parsed as SelectedLocation;
    }
  } catch {
    /* Ignore malformed destination params. */
  }

  return null;
}

function parsePlaceTypes(raw: string | undefined): string[] {
  if (!raw) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(raw);

    if (Array.isArray(parsed)) {
      return parsed.filter(
        (item): item is string => typeof item === "string"
      );
    }
  } catch {
    /* Ignore malformed place type params. */
  }

  return [];
}

export default function ExploreScreen() {
  const params = useLocalSearchParams<{
    destination?: string;
    placeTypes?: string;
  }>();

  const destination = useMemo(
    () => parseDestination(params.destination),
    [params.destination]
  );

  const placeTypes = useMemo(
    () => parsePlaceTypes(params.placeTypes),
    [params.placeTypes]
  );

  const [places, setPlaces] = useState<TravelPlace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requestKey, setRequestKey] = useState(0);
  const [searchRadius, setSearchRadius] = useState(4000);
  const [activeFilter, setActiveFilter] = useState<string>("all");
  const [activeView, setActiveView] = useState<"list" | "map">("list");
  const [selectedPlace, setSelectedPlace] =
    useState<TravelPlace | null>(null);
  // Map view is available on both native (react-native-maps) and web
  // (PlaceMap.web.tsx, an OpenStreetMap based renderer).
  const supportsMap = true;
  const listRef = useRef<FlatList<TravelPlace>>(null);

  useEffect(() => {
    if (!destination || placeTypes.length === 0) {
      setLoading(false);
      setError("Destination or place categories are missing.");
      return;
    }

    let cancelled = false;

    setLoading(true);
    setError(null);
    setPlaces([]);
    setSelectedPlace(null);

    getOsmPlaces({
      latitude: destination.latitude,
      longitude: destination.longitude,
      categories: placeTypes,
      radius: searchRadius,
    })
      .then((results) => {
        if (cancelled) {
          return;
        }

        setPlaces(results);

        console.log("EXPLORE PLACES:", results);

        for (const place of results) {
          console.log("PLACE:", {
            name: place.name,
            latitude: place.latitude,
            longitude: place.longitude,
            distanceText: place.distanceText,
          });
        }
      })
      .catch((fetchError: unknown) => {
        if (cancelled) {
          return;
        }

        console.error("EXPLORE PLACES ERROR:", fetchError);

        setError("Unable to load places.");
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [destination, placeTypes, searchRadius, requestKey]);

  const filteredPlaces = useMemo(() => {
    if (activeFilter === "all") {
      return places;
    }

    return places.filter((place) =>
      osmPlaceMatchesAppCategory(place, activeFilter)
    );
  }, [places, activeFilter]);

  /*
   * Initial region for the map.
   *
   * Preferred: the selected destination coordinates.
   * Fallback: bounds of the loaded places (when destination is missing).
   * Last resort: a neutral India-wide view (UI fallback, not a place).
   */
  const initialMapRegion = useMemo<PlaceMapRegion>(() => {
    if (
      destination &&
      Number.isFinite(destination.latitude) &&
      Number.isFinite(destination.longitude)
    ) {
      return {
        latitude: destination.latitude,
        longitude: destination.longitude,
        latitudeDelta: 0.06,
        longitudeDelta: 0.06,
      };
    }

    const coords = places.filter(
      (place) =>
        Number.isFinite(place.latitude) &&
        Number.isFinite(place.longitude)
    );

    if (coords.length === 0) {
      return {
        latitude: 23.0,
        longitude: 79.0,
        latitudeDelta: 12,
        longitudeDelta: 12,
      };
    }

    const latitudes = coords.map((place) => place.latitude);
    const longitudes = coords.map((place) => place.longitude);

    const minLat = Math.min(...latitudes);
    const maxLat = Math.max(...latitudes);
    const minLon = Math.min(...longitudes);
    const maxLon = Math.max(...longitudes);

    const latDelta = Math.max(maxLat - minLat, 0.003);
    const lonDelta = Math.max(maxLon - minLon, 0.003);

    return {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLon + maxLon) / 2,
      latitudeDelta: latDelta * 1.8,
      longitudeDelta: lonDelta * 1.8,
    };
  }, [destination, places]);

  /*
   * Select a place and switch to the Map view centered on it.
   */
  function selectPlace(place: TravelPlace) {
    setSelectedPlace(place);

    if (supportsMap) {
      setActiveView("map");
    }
  }

  /*
   * When the List is visible and a place is selected (Map marker,
   * or a List tap on platforms without a Map), scroll the selected
   * place into view. Uses the same selectedPlace state as the Map.
   */
  useEffect(() => {
    if (
      activeView !== "list" ||
      !selectedPlace ||
      filteredPlaces.length === 0
    ) {
      return;
    }

    const index = filteredPlaces.findIndex(
      (place) => place.id === selectedPlace.id
    );

    if (index < 0) {
      return;
    }

    listRef.current?.scrollToIndex({
      index,
      viewPosition: 0.5,
      animated: true,
    });
  }, [activeView, selectedPlace, filteredPlaces]);

  function retry() {
    setRequestKey((current) => current + 1);
  }

  const canGoBack = router.canGoBack();

  const destinationName = destination?.name || "Places";
  const destinationSubtitle = destination?.formatted || "";

  return (
    <SafeAreaView
      style={styles.safeArea}
      edges={["top", "left", "right", "bottom"]}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={10}
            onPress={() =>
              canGoBack ? router.back() : router.replace("/")
            }
            style={({ pressed }) => [
              styles.backButton,
              pressed && styles.backButtonPressed,
            ]}
          >
            <Ionicons
              name="arrow-back"
              size={24}
              color="#1C1C1E"
            />
          </Pressable>

          <View style={styles.headerText}>
            <Text style={styles.title}>
              Explore {destinationName}
            </Text>

            {Boolean(destinationSubtitle) && (
              <Text
                style={styles.subtitle}
                numberOfLines={1}
              >
                {destinationSubtitle}
              </Text>
            )}
          </View>
        </View>

        {loading ? (
          <View style={styles.centerState}>
            <ActivityIndicator
              size="large"
              color="#00BC26"
            />

            <Text style={styles.stateText}>
              Loading places...
            </Text>
          </View>
        ) : !destination || placeTypes.length === 0 ? (
          <View style={styles.centerState}>
            <Ionicons
              name="location-outline"
              size={40}
              color="#9CA1A9"
            />

            <Text style={styles.stateTitle}>
              No destination selected
            </Text>

            <Text style={styles.stateText}>
              Go back and search for a destination
              first.
            </Text>

            <Pressable
              accessibilityRole="button"
              onPress={() =>
                canGoBack ? router.back() : router.replace("/")
              }
              style={({ pressed }) => [
                styles.retryButton,
                pressed && styles.retryButtonPressed,
              ]}
            >
              <Text style={styles.retryButtonText}>
                Go Back
              </Text>
            </Pressable>
          </View>
        ) : error ? (
          <View style={styles.centerState}>
            <Ionicons
              name="cloud-offline-outline"
              size={40}
              color="#9CA1A9"
            />

            <Text style={styles.stateTitle}>
              Unable to load places.
            </Text>

            <Text style={styles.stateText}>
              Please check your connection and try
              again.
            </Text>

            <Pressable
              accessibilityRole="button"
              onPress={retry}
              style={({ pressed }) => [
                styles.retryButton,
                pressed && styles.retryButtonPressed,
              ]}
            >
              <Text style={styles.retryButtonText}>
                Try Again
              </Text>
            </Pressable>
          </View>
        ) : (
          <>
            {supportsMap && (
              <View style={styles.viewToggle}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{
                    selected: activeView === "map",
                  }}
                  onPress={() => setActiveView("map")}
                  style={({ pressed }) => [
                    styles.viewToggleButton,
                    activeView === "map" &&
                      styles.viewToggleButtonActive,
                    pressed && styles.viewToggleButtonPressed,
                  ]}
                >
                  <Ionicons
                    name="map-outline"
                    size={16}
                    color={
                      activeView === "map"
                        ? "#FFFFFF"
                        : "#1C1C1E"
                    }
                  />
                  <Text
                    style={[
                      styles.viewToggleText,
                      activeView === "map" &&
                        styles.viewToggleTextActive,
                    ]}
                  >
                    Map
                  </Text>
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{
                    selected: activeView === "list",
                  }}
                  onPress={() => setActiveView("list")}
                  style={({ pressed }) => [
                    styles.viewToggleButton,
                    activeView === "list" &&
                      styles.viewToggleButtonActive,
                    pressed && styles.viewToggleButtonPressed,
                  ]}
                >
                  <Ionicons
                    name="list-outline"
                    size={16}
                    color={
                      activeView === "list"
                        ? "#FFFFFF"
                        : "#1C1C1E"
                    }
                  />
                  <Text
                    style={[
                      styles.viewToggleText,
                      activeView === "list" &&
                        styles.viewToggleTextActive,
                    ]}
                  >
                    List
                  </Text>
                </Pressable>
              </View>
            )}

            {activeView === "map" ? (
              <View style={styles.mapContainer}>
                <PlaceMap
                  places={places}
                  destination={destination}
                  selectedPlace={selectedPlace}
                  initialRegion={initialMapRegion}
                  onPlacePress={setSelectedPlace}
                />

                {selectedPlace && (
                  <View style={styles.bottomCard}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Dismiss selected place"
                      hitSlop={10}
                      onPress={() => setSelectedPlace(null)}
                      style={styles.bottomCloseButton}
                    >
                      <Ionicons
                        name="close"
                        size={18}
                        color="#6B7280"
                      />
                    </Pressable>

                    <Text
                      style={styles.bottomCardName}
                      numberOfLines={1}
                    >
                      {selectedPlace.name || "Unnamed place"}
                    </Text>

                    <Text style={styles.bottomCardCategory}>
                      {displayCategory(
                        selectedPlace,
                        placeTypes
                      )}
                    </Text>

                    <Text style={styles.bottomCardMeta}>
                      {selectedPlace.distanceText ||
                        "Distance unavailable"}
                      {selectedPlace.travelTimeText
                        ? `  •  ${selectedPlace.travelTimeText}`
                        : ""}
                    </Text>

                    {Boolean(selectedPlace.formatted) && (
                      <Text
                        style={styles.bottomCardAddress}
                        numberOfLines={1}
                      >
                        {selectedPlace.formatted}
                      </Text>
                    )}

                    <Pressable
                      accessibilityRole="button"
                      onPress={() =>
                        console.log(
                          "SELECTED PLACE:",
                          selectedPlace
                        )
                      }
                      style={({ pressed }) => [
                        styles.bottomDetailsButton,
                        pressed &&
                          styles.bottomDetailsButtonPressed,
                      ]}
                    >
                      <Text style={styles.bottomDetailsText}>
                        View Details
                      </Text>
                      <Ionicons
                        name="arrow-forward"
                        size={16}
                        color="#FFFFFF"
                      />
                    </Pressable>
                  </View>
                )}
              </View>
            ) : (
            <>
            {/* Search radius */}
            <View style={styles.radiusWrap}>
              <Text style={styles.radiusLabel}>
                Search radius
              </Text>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={
                  styles.filterContent
                }
              >
                {RADIUS_OPTIONS.map((option) => {
                  const selected =
                    option.value === searchRadius;

                  return (
                    <Pressable
                      key={option.value}
                      accessibilityRole="button"
                      accessibilityState={{
                        selected,
                      }}
                      onPress={() =>
                        setSearchRadius(option.value)
                      }
                      style={({ pressed }) => [
                        styles.filterChip,
                        selected && styles.filterChipActive,
                        pressed && styles.filterChipPressed,
                      ]}
                    >
                      <Text
                        style={[
                          styles.filterChipText,
                          selected &&
                            styles.filterChipTextActive,
                        ]}
                      >
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>

            {/* Category filter */}
            {placeTypes.length > 0 && (
              <View style={styles.filterWrap}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={
                    styles.filterContent
                  }
                >
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{
                      selected: activeFilter === "all",
                    }}
                    onPress={() =>
                      setActiveFilter("all")
                    }
                    style={({ pressed }) => [
                      styles.filterChip,
                      activeFilter === "all" &&
                        styles.filterChipActive,
                      pressed && styles.filterChipPressed,
                    ]}
                  >
                    <Text
                      style={[
                        styles.filterChipText,
                        activeFilter === "all" &&
                          styles.filterChipTextActive,
                      ]}
                    >
                      All
                    </Text>
                  </Pressable>

                  {placeTypes.map((appCategoryId) => (
                    <Pressable
                      key={appCategoryId}
                      accessibilityRole="button"
                      accessibilityState={{
                        selected:
                          activeFilter === appCategoryId,
                      }}
                      onPress={() =>
                        setActiveFilter(appCategoryId)
                      }
                      style={({ pressed }) => [
                        styles.filterChip,
                        activeFilter === appCategoryId &&
                          styles.filterChipActive,
                        pressed &&
                          styles.filterChipPressed,
                      ]}
                    >
                      <Text
                        style={[
                          styles.filterChipText,
                          activeFilter === appCategoryId &&
                            styles.filterChipTextActive,
                        ]}
                      >
                        {CATEGORY_LABELS[appCategoryId] ??
                          appCategoryId}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            )}

            <FlatList
              ref={listRef}
              data={filteredPlaces}
              keyExtractor={(item, index) =>
                item.id ?? `${item.name}-${index}`
              }
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.listContent}
              onScrollToIndexFailed={(info) => {
                listRef.current?.scrollToOffset({
                  offset: info.averageItemLength * info.index,
                  animated: true,
                });
              }}
              ListEmptyComponent={
                <View style={styles.centerState}>
                  <Ionicons
                    name="search-outline"
                    size={40}
                    color="#9CA1A9"
                  />

                  <Text style={styles.stateTitle}>
                    No places found
                  </Text>

                  <Text style={styles.stateText}>
                    Try another category or search area.
                  </Text>
                </View>
              }
              renderItem={({ item }) => {
                const category =
                  displayCategory(item, placeTypes);

                const addressLine = item.formatted
                  ? [item.formatted]
                  : [item.city, item.state].filter(Boolean);

                const shownAddress =
                  addressLine.join(", ") ||
                  item.name ||
                  "";

                const distanceText =
                  item.distanceText ||
                  "Distance unavailable";

                const travelTime =
                  item.travelTimeText || "—";

                const hours = openingHoursText(
                  item.opening_hours
                );

                return (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => selectPlace(item)}
                    style={({ pressed }) => [
                      styles.card,
                      pressed && styles.cardPressed,
                    ]}
                  >
                    <Text
                      style={styles.cardName}
                      numberOfLines={2}
                    >
                      {item.name || "Unnamed place"}
                    </Text>

                    <Text style={styles.cardCategory}>
                      {category}
                    </Text>

                    {Boolean(shownAddress) && (
                      <Text
                        style={styles.cardAddress}
                        numberOfLines={2}
                      >
                        {shownAddress}
                      </Text>
                    )}

                    <View style={styles.cardMeta}>
                      <Text style={styles.distance}>
                        {distanceText}
                      </Text>

                      <Text style={styles.metaSeparator}>
                        •
                      </Text>

                      <Text style={styles.metaTravelTime}>
                        {travelTime}
                      </Text>
                    </View>

                    {Boolean(hours) && (
                      <View style={styles.hoursBadge}>
                        <Ionicons
                          name="time-outline"
                          size={13}
                          color="#6B7280"
                        />

                        <Text
                          style={styles.hoursText}
                          numberOfLines={1}
                        >
                          {hours}
                        </Text>
                      </View>
                    )}
                  </Pressable>
                );
              }}
            />
            </>
            )}
          </>
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

  header: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    marginBottom: 14,
  },

  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
    shadowColor: "#000000",
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: {
      width: 0,
      height: 3,
    },
    elevation: 1,
  },

  backButtonPressed: {
    backgroundColor: "#F3F4F6",
    transform: [
      {
        scale: 0.96,
      },
    ],
  },

  headerText: {
    flex: 1,
  },

  title: {
    fontSize: 24,
    fontWeight: "800",
    color: "#1C1C1E",
    letterSpacing: -0.3,
  },

  subtitle: {
    marginTop: 3,
    fontSize: 13,
    color: "#6B7280",
  },

  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingBottom: 60,
  },

  stateTitle: {
    marginTop: 14,
    fontSize: 17,
    fontWeight: "800",
    color: "#1C1C1E",
    textAlign: "center",
  },

  stateText: {
    marginTop: 6,
    fontSize: 14,
    lineHeight: 20,
    color: "#6B7280",
    textAlign: "center",
  },

  retryButton: {
    marginTop: 22,
    height: 48,
    paddingHorizontal: 28,
    borderRadius: 14,
    backgroundColor: "#00BC26",
    alignItems: "center",
    justifyContent: "center",
  },

  retryButtonPressed: {
    transform: [
      {
        scale: 0.97,
      },
    ],
  },

  retryButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
  },

  filterWrap: {
    marginBottom: 14,
  },

  radiusWrap: {
    marginBottom: 14,
  },

  radiusLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#6B7280",
    marginBottom: 8,
    marginLeft: 2,
  },

  viewToggle: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 14,
  },

  viewToggleButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 16,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },

  viewToggleButtonActive: {
    backgroundColor: "#00BC26",
    borderColor: "#00BC26",
  },

  viewToggleButtonPressed: {
    transform: [
      {
        scale: 0.96,
      },
    ],
  },

  viewToggleText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1C1C1E",
  },

  viewToggleTextActive: {
    color: "#FFFFFF",
  },

  mapContainer: {
    flex: 1,
    borderRadius: 16,
    overflow: "hidden",
  },

  destinationMarkerWrap: {
    alignItems: "center",
  },

  destinationMarker: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#00BC26",
    borderWidth: 2,
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000000",
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    elevation: 3,
  },

  destinationLabel: {
    marginTop: 2,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: "rgba(255, 255, 255, 0.94)",
  },

  destinationLabelText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#1C1C1E",
  },

  bottomCard: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 12,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#F0F1F3",
    paddingHorizontal: 16,
    paddingVertical: 14,
    shadowColor: "#000000",
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: {
      width: 0,
      height: 4,
    },
    elevation: 4,
  },

  bottomCloseButton: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },

  bottomCardName: {
    fontSize: 17,
    fontWeight: "800",
    color: "#1C1C1E",
    letterSpacing: -0.2,
    paddingRight: 28,
  },

  bottomCardCategory: {
    marginTop: 3,
    fontSize: 13,
    fontWeight: "700",
    color: "#00BC26",
  },

  bottomCardMeta: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: "700",
    color: "#1C1C1E",
  },

  bottomCardAddress: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 17,
    color: "#6B7280",
  },

  bottomDetailsButton: {
    marginTop: 12,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#00BC26",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },

  bottomDetailsButtonPressed: {
    transform: [
      {
        scale: 0.98,
      },
    ],
  },

  bottomDetailsText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },

  filterContent: {
    gap: 8,
    paddingVertical: 2,
  },

  filterChip: {
    paddingHorizontal: 14,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    alignItems: "center",
    justifyContent: "center",
  },

  filterChipActive: {
    backgroundColor: "#00BC26",
    borderColor: "#00BC26",
  },

  filterChipPressed: {
    transform: [
      {
        scale: 0.96,
      },
    ],
  },

  filterChipText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1C1C1E",
  },

  filterChipTextActive: {
    color: "#FFFFFF",
  },

  listContent: {
    paddingBottom: 24,
  },

  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#F0F1F3",
    paddingHorizontal: 16,
    paddingVertical: 15,
    marginBottom: 12,
    shadowColor: "#000000",
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: {
      width: 0,
      height: 3,
    },
    elevation: 1,
  },

  cardPressed: {
    backgroundColor: "#F3F4F6",
    transform: [
      {
        scale: 0.99,
      },
    ],
  },

  cardName: {
    fontSize: 17,
    fontWeight: "800",
    color: "#1C1C1E",
    letterSpacing: -0.2,
  },

  cardCategory: {
    marginTop: 3,
    fontSize: 13,
    fontWeight: "700",
    color: "#00BC26",
  },

  cardAddress: {
    marginTop: 5,
    fontSize: 13,
    lineHeight: 18,
    color: "#6B7280",
  },

  cardMeta: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
  },

  hoursBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 10,
  },

  hoursText: {
    fontSize: 12,
    color: "#6B7280",
    flexShrink: 1,
  },

  distance: {
    fontSize: 13,
    fontWeight: "700",
    color: "#00BC26",
  },

  metaSeparator: {
    fontSize: 13,
    fontWeight: "700",
    color: "#B0B5BC",
  },

  metaTravelTime: {
    fontSize: 13,
    fontWeight: "600",
    color: "#6B7280",
  },
});