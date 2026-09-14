import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import PageHeader from "../../components/PageHeader";
import PlaceMap from "../../components/PlaceMap";
import type { PlaceMapRegion } from "../../components/PlaceMap.types";
import FunFactCard from "../../components/trip/FunFactCard";
import PlacesSection from "../../components/trip/PlacesSection";
import WeatherCard from "../../components/trip/WeatherCard";
import { BlockError, BlockLoading } from "../../components/trip/primitives";
import { useSupabase } from "../../hook/usesupabase";
import { useAppTheme } from "../../src/theme/ThemeProvider";
import type { ThemeTokens } from "../../src/theme/tokens";
import { CITY_EXPLORE_CATEGORIES } from "../../services/cityDiscoveryApi";
import {
  getNearbyDbPlaces,
  nearbyDbPlaceToTravelPlace,
} from "../../services/dbPlacesApi";
import {
  calculateDistanceMeters,
  getOsmPlacesForCategories,
  type TravelPlace,
} from "../../services/placesApi";
import {
  displayCategory,
  placeMatchesAppCategory,
} from "../../services/placeCategories";
import {
  getPlaceDetails,
  type PlaceDetails,
} from "../../services/placeDetailsApi";
import { resolveCityCoordinates } from "../../services/routeApi";

interface CityPoint {
  latitude: number;
  longitude: number;
  label?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
}

/**
 * Which places provider feeds the current results.
 * "database" = the existing Supabase `places` table (Popular);
 * "osm" = OpenStreetMap/Overpass (Nearby).
 */
type PlaceSource = "database" | "osm";

/*
 * Selectable nearby-place search radii in meters. The default is 4 km
 * (4000), matching the OSM endpoint default. Shared by both providers.
 */
const RADIUS_OPTIONS = [
  { label: "1 km", value: 1000 },
  { label: "2 km", value: 2000 },
  { label: "5 km", value: 5000 },
  { label: "10 km", value: 10000 },
];

/*
 * Default categories when no placeTypes are handed over (e.g. the trip
 * city-card flow): [All] [Temples] [Attractions] [Restaurants] [Hotels]
 * [Cafes] [Fuel]. Each id already maps to both providers.
 */
const CITY_CATEGORY_IDS = CITY_EXPLORE_CATEGORIES.map(
  (config) => config.id
);

const SOURCE_LABELS: Record<PlaceSource, string> = {
  database: "Popular",
  osm: "Nearby",
};

function regionForPoint(point: CityPoint): PlaceMapRegion {
  return {
    latitude: point.latitude,
    longitude: point.longitude,
    latitudeDelta: 0.06,
    longitudeDelta: 0.06,
  };
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

function openingHoursText(openingHours: string | null): string | null {
  if (openingHours && openingHours.trim()) {
    return openingHours.trim();
  }

  return null;
}

export default function CityDetailsScreen() {
  const params = useLocalSearchParams<{
    city?: string;
    tripId?: string;
    lat?: string;
    lon?: string;
    state?: string;
    country?: string;
    placeTypes?: string;
  }>();

  const { theme, dark } = useAppTheme();
  const styles = useMemo(() => createStyles(theme, dark), [theme, dark]);

  const city =
    typeof params.city === "string" && params.city.trim()
      ? params.city.trim()
      : null;

  const tripId =
    typeof params.tripId === "string" && params.tripId
      ? params.tripId
      : null;

  /*
   * Optional coords handed over by the trip/testsearch flows. When absent
   * the city is resolved once below through the existing geocoder (cached
   * in-session), which also gives us the state/country for the details query.
   */
  const coords: CityPoint | null = useMemo(
    () =>
      typeof params.lat === "string" &&
      typeof params.lon === "string" &&
      Number.isFinite(Number(params.lat)) &&
      Number.isFinite(Number(params.lon))
        ? {
            latitude: Number(params.lat),
            longitude: Number(params.lon),
            state:
              typeof params.state === "string" && params.state.trim()
                ? params.state.trim()
                : null,
            country:
              typeof params.country === "string" && params.country.trim()
                ? params.country.trim()
                : null,
          }
        : null,
    [params.lat, params.lon, params.state, params.country]
  );

  const placeTypesFromParams = useMemo(
    () => parsePlaceTypes(params.placeTypes),
    [params.placeTypes]
  );

  const supabase = useSupabase();

  const [point, setPoint] = useState<CityPoint | null>(coords);
  const [pointState, setPointState] = useState<"loading" | "ready" | "error">(
    coords ? "ready" : "loading"
  );
  const [pointAttempt, setPointAttempt] = useState(0);

  const [placeSource, setPlaceSource] = useState<PlaceSource>("database");
  const [searchRadius, setSearchRadius] = useState(4000);
  const [activeFilter, setActiveFilter] = useState<string>("all");

  const [dbPlaces, setDbPlaces] = useState<TravelPlace[]>([]);
  const [osmPlaces, setOsmPlaces] = useState<TravelPlace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requestKey, setRequestKey] = useState(0);

  const [selectedPlace, setSelectedPlace] = useState<TravelPlace | null>(null);

  /*
   * Center the user panned the Nearby (OSM) map to. When non-null the OSM
   * fetch re-runs around it (debounced, see handleMapRegionComplete). The
   * Popular (database) source always stays centred on the destination.
   */
  const [mapPanCenter, setMapPanCenter] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const mapDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Factual place details (single OpenSERP-backed service).
  const [details, setDetails] = useState<PlaceDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [detailsVisible, setDetailsVisible] = useState(false);

  /*
   * Resolve the city once. Uses the passed coords when available (trip /
   * testsearch flows) and the existing cached geocoder otherwise.
   */
  const loadPoint = useCallback(async () => {
    setPointState("loading");

    try {
      const resolved = coords ?? (await resolveCityCoordinates(city ?? ""));

      setPoint(resolved);
      setPointState("ready");
    } catch {
      setPointState("error");
    }
  }, [city, coords]);

  useEffect(() => {
    loadPoint();
  }, [loadPoint, pointAttempt]);

  /*
   * Effective category set for both the fetch and the filter row. The trip
   * city-card flow carries no pre-selected placeTypes, so it falls back to
   * the city default set below; the destination-and-categories flow
   * (testsearch) keeps exactly what the user picked.
   */
  const effectiveCategories = useMemo(
    () =>
      placeTypesFromParams.length > 0
        ? placeTypesFromParams
        : CITY_CATEGORY_IDS,
    [placeTypesFromParams]
  );

  useEffect(() => {
    if (
      activeFilter !== "all" &&
      !effectiveCategories.includes(activeFilter)
    ) {
      setActiveFilter("all");
    }
  }, [activeFilter, effectiveCategories]);

  /* -----------------------------
     Places fetch (both providers)
  ----------------------------- */

  useEffect(() => {
    if (!point) {
      return;
    }

    let cancelled = false;

    /*
     * Nearby (OSM) results re-centre on the panned map region; Popular
     * (database) results always follow the destination.
     */
    const fetchCenter = mapPanCenter ?? {
      latitude: point.latitude,
      longitude: point.longitude,
    };

    const osmCategories =
      activeFilter === "all" ? effectiveCategories : [activeFilter];
    const dbCategories =
      activeFilter === "all" ? undefined : [activeFilter];

    setLoading(true);
    setError(null);

    const osmRequest = getOsmPlacesForCategories({
      latitude: fetchCenter.latitude,
      longitude: fetchCenter.longitude,
      categories: osmCategories,
      radius: searchRadius,
    })
      .then(
        (data): { ok: boolean; data: TravelPlace[] } => ({
          ok: true,
          data,
        })
      )
      .catch((fetchError: unknown) => {
        if (!cancelled) {
          console.error("NEARBY OSM ERROR:", fetchError);
        }

        return { ok: false, data: [] };
      });

    const dbRequest = getNearbyDbPlaces(supabase, {
      latitude: point.latitude,
      longitude: point.longitude,
      categories: dbCategories,
      radiusMeters: searchRadius,
    })
      .then(
        (rows): { ok: boolean; data: TravelPlace[] } => ({
          ok: true,
          data: rows.map(nearbyDbPlaceToTravelPlace),
        })
      )
      .catch((fetchError: unknown) => {
        if (!cancelled) {
          console.error("POPULAR DB ERROR:", fetchError);
        }

        return { ok: false, data: [] };
      });

    Promise.all([dbRequest, osmRequest]).then(([db, osm]) => {
      if (cancelled) {
        return;
      }

      setDbPlaces(db.data);
      setOsmPlaces(osm.data);

      if (!db.ok && !osm.ok) {
        setError("Unable to load places. Please try again.");
      }

      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [
    point,
    activeFilter,
    effectiveCategories,
    searchRadius,
    mapPanCenter,
    requestKey,
    supabase,
  ]);

  /*
   * Debounced Nearby refetch when the user pans/zooms the map. Only OSM
   * results refresh from the new viewport center, and only after the map
   * settled and moved far enough (>= 800 m) to be a deliberate relocation.
   */
  const handleMapRegionComplete = useCallback(
    (region: PlaceMapRegion) => {
      if (placeSource !== "osm" || !point) {
        return;
      }

      const base = mapPanCenter ?? {
        latitude: point.latitude,
        longitude: point.longitude,
      };

      const movedMeters = calculateDistanceMeters(
        base.latitude,
        base.longitude,
        region.latitude,
        region.longitude
      );

      if (movedMeters < 800) {
        return;
      }

      if (mapDebounceRef.current) {
        clearTimeout(mapDebounceRef.current);
      }

      mapDebounceRef.current = setTimeout(() => {
        setMapPanCenter({
          latitude: region.latitude,
          longitude: region.longitude,
        });
        setRequestKey((current) => current + 1);
      }, 700);
    },
    [placeSource, point, mapPanCenter]
  );

  useEffect(() => {
    return () => {
      if (mapDebounceRef.current) {
        clearTimeout(mapDebounceRef.current);
      }
    };
  }, []);

  /* -----------------------------
     Derived state
  ----------------------------- */

  /** Markers from BOTH providers, de-duplicated by id. */
  const mapPlaces = useMemo(() => {
    const byId = new Map<string, TravelPlace>();

    for (const place of [...dbPlaces, ...osmPlaces]) {
      byId.set(place.id, place);
    }

    return Array.from(byId.values());
  }, [dbPlaces, osmPlaces]);

  const activePlaces = placeSource === "database" ? dbPlaces : osmPlaces;
  const isLoading = loading && activePlaces.length === 0;

  const destinationRegion = point ? regionForPoint(point) : null;

  /* -----------------------------
     Selection sync (map <-> cards)
  ----------------------------- */

  /**
   * Select a place and keep it visible both in the card list and on the
   * map. PlaceMap zooms to `selectedPlace` automatically; switching the
   * provider/filter ensures the tapped place is in the visible list.
   */
  function selectPlace(place: TravelPlace) {
    setSelectedPlace(place);

    if (place.source === "database" || place.source === "osm") {
      setPlaceSource(place.source);
    }

    if (
      activeFilter !== "all" &&
      !placeMatchesAppCategory(place.category, activeFilter)
    ) {
      setActiveFilter("all");
    }
  }

  /* -----------------------------
     Place details (factual only)
  ----------------------------- */

  function closePlaceDetails() {
    setDetailsVisible(false);
    setDetails(null);
    setDetailsError(null);
  }

  async function openPlaceDetails(place: TravelPlace) {
    setDetailsVisible(true);
    setDetails(null);
    setDetailsError(null);
    setDetailsLoading(true);

    try {
      const result = await getPlaceDetails({
        name: place.name || "Unknown place",
        city: point?.city ?? point?.label ?? null,
        state: point?.state ?? null,
        country: point?.country ?? null,
        latitude: point?.latitude ?? null,
        longitude: point?.longitude ?? null,
      });

      setDetails(result);
    } catch (detailError) {
      console.error("PLACE DETAILS ERROR:", detailError);
      setDetailsError("Could not load place details. Please try again.");
    } finally {
      setDetailsLoading(false);
    }
  }

  function retryPoint() {
    setPointAttempt((value) => value + 1);
  }

  function retryLoad() {
    setRequestKey((current) => current + 1);
  }

  if (!city) {
    return (
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <PageHeader title="City" />
        <View style={styles.center}>
          <Text style={styles.centerTitle}>No city selected</Text>
        </View>
      </SafeAreaView>
    );
  }

  const detailWebsite = details?.website ?? null;

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <PageHeader title={city} subtitle="City guide" />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
      >
        {tripId ? (
          <View style={styles.tripContext}>
            <Ionicons name="map-outline" size={18} color="#00BC26" />
            <Text style={styles.tripContextText}>
              Part of one of your trips.
            </Text>
            <Pressable
              onPress={() =>
                router.push({
                  pathname: "/(root)/trip-details",
                  params: { tripId },
                })
              }
              style={({ pressed }) => pressed && styles.pressed}
            >
              <Text style={styles.tripContextLink}>Open Trip →</Text>
            </Pressable>
          </View>
        ) : null}

        {/* Existing city map, now shared as the POI map */}
        <View style={styles.block}>
          {pointState === "loading" ? (
            <BlockLoading label="Locating city…" />
          ) : pointState === "error" || !point ? (
            <BlockError
              message={`We could not locate "${city}" on the map.`}
              onRetry={retryPoint}
            />
          ) : (
            <View style={styles.mapWrap}>
              <PlaceMap
                places={mapPlaces}
                destination={{
                  name: point.label ?? city,
                  formatted: point.label ?? city,
                  latitude: point.latitude,
                  longitude: point.longitude,
                }}
                selectedPlace={selectedPlace}
                onPlacePress={selectPlace}
                onRegionChangeComplete={handleMapRegionComplete}
                initialRegion={regionForPoint(point)}
                recenterRegion={destinationRegion ?? undefined}
              />
            </View>
          )}
        </View>

        {/* POI exploration */}
        <View style={styles.block}>
          <View style={styles.sourceRow}>
            {(Object.keys(SOURCE_LABELS) as PlaceSource[]).map((source) => {
              const selected = placeSource === source;

              return (
                <Pressable
                  key={source}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => {
                    setPlaceSource(source);
                    setSelectedPlace(null);
                    setError(null);
                  }}
                  style={({ pressed }) => [
                    styles.sourceChip,
                    selected && styles.sourceChipActive,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text
                    style={[
                      styles.sourceChipText,
                      selected && styles.sourceChipTextActive,
                    ]}
                  >
                    {SOURCE_LABELS[source]}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.filterWrap}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterContent}
            >
              {RADIUS_OPTIONS.map((option) => {
                const selected = searchRadius === option.value;

                return (
                  <Pressable
                    key={option.value}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => setSearchRadius(option.value)}
                    style={({ pressed }) => [
                      styles.filterChip,
                      selected && styles.filterChipActive,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text
                      style={[
                        styles.filterChipText,
                        selected && styles.filterChipTextActive,
                      ]}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          <View style={styles.filterWrap}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterContent}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: activeFilter === "all" }}
                onPress={() => setActiveFilter("all")}
                style={({ pressed }) => [
                  styles.filterChip,
                  activeFilter === "all" && styles.filterChipActive,
                  pressed && styles.pressed,
                ]}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    activeFilter === "all" && styles.filterChipTextActive,
                  ]}
                >
                  All
                </Text>
              </Pressable>

              {effectiveCategories.map((appCategoryId) => {
                const selected = activeFilter === appCategoryId;

                return (
                  <Pressable
                    key={appCategoryId}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => setActiveFilter(appCategoryId)}
                    style={({ pressed }) => [
                      styles.filterChip,
                      selected && styles.filterChipActive,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text
                      style={[
                        styles.filterChipText,
                        selected && styles.filterChipTextActive,
                      ]}
                    >
                      {CITY_EXPLORE_CATEGORIES.find(
                        (config) => config.id === appCategoryId
                      )?.label ?? appCategoryId}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          {error ? (
            <BlockError message={error} onRetry={retryLoad} />
          ) : isLoading ? (
            <View style={styles.centerState}>
              <ActivityIndicator size="large" color="#00BC26" />
              <Text style={styles.stateText}>
                Loading {SOURCE_LABELS[placeSource].toLowerCase()} places…
              </Text>
            </View>
          ) : activePlaces.length === 0 ? (
            <View style={styles.centerState}>
              <Ionicons name="search-outline" size={40} color={theme.textMuted} />
              <Text style={styles.stateTitle}>No places found</Text>
              <Text style={styles.stateText}>
                Try another category or search area.
              </Text>
            </View>
          ) : (
            <View style={styles.listWrap}>
              {activePlaces.map((place) => {
                const isSelected = selectedPlace?.id === place.id;
                const category = displayCategory(
                  place.category,
                  place.religion,
                  effectiveCategories
                );

                const addressLine = place.formatted
                  ? [place.formatted]
                  : [place.city, place.state].filter(Boolean);

                const shownAddress =
                  addressLine.join(", ") || place.name || "";

                const distanceText =
                  place.distanceText || "Distance unavailable";

                const hours = openingHoursText(place.opening_hours);

                return (
                  <Pressable
                    key={place.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    onPress={() => selectPlace(place)}
                    style={({ pressed }) => [
                      styles.card,
                      isSelected && styles.cardSelected,
                      pressed && styles.cardPressed,
                    ]}
                  >
                    <View style={styles.cardHeader}>
                      <Text style={styles.cardName} numberOfLines={2}>
                        {place.name || "Unnamed place"}
                      </Text>

                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`View details for ${place.name || "this place"}`}
                        hitSlop={6}
                        onPress={() => openPlaceDetails(place)}
                        style={({ pressed }) => [
                          styles.detailsButton,
                          pressed && styles.detailsButtonPressed,
                        ]}
                      >
                        <Ionicons
                          name="information-circle-outline"
                          size={20}
                          color="#00BC26"
                        />
                      </Pressable>
                    </View>

                    <Text style={styles.cardCategory}>{category}</Text>

                    {Boolean(shownAddress) && (
                      <Text
                        style={styles.cardAddress}
                        numberOfLines={2}
                      >
                        {shownAddress}
                      </Text>
                    )}

                    <View style={styles.cardMeta}>
                      <Text style={styles.distance}>{distanceText}</Text>
                    </View>

                    {Boolean(hours) && (
                      <View style={styles.hoursBadge}>
                        <Ionicons
                          name="time-outline"
                          size={13}
                          color={theme.textMuted}
                        />
                        <Text style={styles.hoursText} numberOfLines={1}>
                          {hours}
                        </Text>
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>

        <View style={styles.block}>
          <WeatherCard
            city={city}
            coords={
              point
                ? { latitude: point.latitude, longitude: point.longitude }
                : coords
            }
          />
        </View>

        <View style={styles.block}>
          <FunFactCard city={city} />
        </View>

        <View style={styles.block}>
          <PlacesSection
            title="Attractions"
            categories={["tourist-attraction"]}
            city={city}
            coords={
              point
                ? { latitude: point.latitude, longitude: point.longitude }
                : coords
            }
          />
        </View>

        <View style={styles.block}>
          <PlacesSection
            title="Restaurants"
            categories={["restaurant"]}
            city={city}
            coords={
              point
                ? { latitude: point.latitude, longitude: point.longitude }
                : coords
            }
          />
        </View>

        <View style={styles.block}>
          <PlacesSection
            title="Hotels"
            categories={["hotel"]}
            city={city}
            coords={
              point
                ? { latitude: point.latitude, longitude: point.longitude }
                : coords
            }
          />
        </View>
      </ScrollView>

      <Modal
        visible={detailsVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closePlaceDetails}
      >
        <SafeAreaView style={styles.detailSafe}>
          <View style={styles.detailHeader}>
            <Text style={styles.detailHeaderTitle} numberOfLines={1}>
              {selectedPlace?.name || details?.name || "Place details"}
            </Text>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close details"
              hitSlop={8}
              onPress={closePlaceDetails}
              style={({ pressed }) => [
                styles.detailCloseButton,
                pressed && styles.detailCloseButtonPressed,
              ]}
            >
              <Ionicons name="close" size={22} color={theme.text} />
            </Pressable>
          </View>

          <ScrollView
            style={styles.detailScroll}
            contentContainerStyle={styles.detailScrollContent}
          >
            {detailsLoading ? (
              <View style={styles.detailCenter}>
                <ActivityIndicator size="large" color="#00BC26" />
                <Text style={styles.detailStateText}>
                  Loading details…
                </Text>
              </View>
            ) : detailsError ? (
              <View style={styles.detailCenter}>
                <Ionicons
                  name="cloud-offline-outline"
                  size={40}
                  color={theme.textMuted}
                />
                <Text style={styles.detailStateTitle}>{detailsError}</Text>

                <Pressable
                  accessibilityRole="button"
                  onPress={() =>
                    selectedPlace && openPlaceDetails(selectedPlace)
                  }
                  style={({ pressed }) => [
                    styles.detailWebsiteButton,
                    pressed && styles.detailCloseButtonPressed,
                  ]}
                >
                  <Text style={styles.detailWebsiteText}>Try Again</Text>
                </Pressable>
              </View>
            ) : details ? (
              <>
                <Text style={styles.detailName}>
                  {details.name || selectedPlace?.name || "Place"}
                </Text>

                {selectedPlace ? (
                  <Text style={styles.detailCategory}>
                    {displayCategory(
                      selectedPlace.category,
                      selectedPlace.religion,
                      effectiveCategories
                    )}
                  </Text>
                ) : null}

                {details.rating !== null ? (
                  <View style={styles.detailRatingRow}>
                    <Ionicons name="star" size={14} color="#F59E0B" />
                    <Text style={styles.detailRatingText}>
                      {details.rating.toFixed(1)}
                      {details.ratingCount !== null
                        ? `  (${details.ratingCount} ratings)`
                        : ""}
                    </Text>
                  </View>
                ) : null}

                {selectedPlace?.distanceText ? (
                  <Text style={styles.detailMeta}>
                    {selectedPlace.distanceText}
                  </Text>
                ) : null}

                {Boolean(selectedPlace?.formatted) && (
                  <Text style={styles.detailAddress} numberOfLines={2}>
                    {selectedPlace?.formatted}
                  </Text>
                )}

                {details.description ? (
                  <Text style={styles.detailDescription}>
                    {details.description}
                  </Text>
                ) : null}

                {detailWebsite ? (
                  <Pressable
                    accessibilityRole="link"
                    onPress={() =>
                      Linking.openURL(detailWebsite).catch(() => {})
                    }
                    style={({ pressed }) => [
                      styles.detailWebsiteButton,
                      pressed && styles.detailCloseButtonPressed,
                    ]}
                  >
                    <Ionicons
                      name="globe-outline"
                      size={16}
                      color={theme.onPrimary}
                    />
                    <Text style={styles.detailWebsiteText}>
                      Open Website
                    </Text>
                  </Pressable>
                ) : null}
              </>
            ) : (
              <View style={styles.detailCenter}>
                <Ionicons
                  name="information-circle-outline"
                  size={40}
                  color={theme.textMuted}
                />
                <Text style={styles.detailStateTitle}>
                  No details available
                </Text>
                <Text style={styles.detailStateText}>
                  We could not find more information about this place.
                </Text>
              </View>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const createStyles = (theme: ThemeTokens, dark: boolean) =>
  StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: theme.background,
    },
    scroll: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: 16,
      paddingBottom: 40,
    },
    block: {
      marginTop: 22,
    },
    tripContext: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: theme.primaryLight,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 11,
      marginTop: 4,
    },
    tripContextText: {
      flex: 1,
      fontSize: 13,
      color: theme.text,
    },
    tripContextLink: {
      fontSize: 13,
      fontWeight: "700",
      color: theme.primaryDark,
    },
    mapWrap: {
      height: 260,
      borderRadius: 16,
      overflow: "hidden",
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: dark ? "#1A221C" : "#EDEFF2",
    },
    sourceRow: {
      flexDirection: "row",
      gap: 10,
      marginBottom: 12,
    },
    sourceChip: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
      alignItems: "center",
    },
    sourceChipActive: {
      backgroundColor: theme.primary,
      borderColor: theme.primary,
    },
    sourceChipText: {
      fontSize: 14,
      fontWeight: "600",
      color: theme.textSecondary,
    },
    sourceChipTextActive: {
      color: theme.onPrimary,
    },
    filterWrap: {
      marginBottom: 12,
    },
    filterContent: {
      gap: 8,
      paddingRight: 8,
    },
    filterChip: {
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
    },
    filterChipActive: {
      backgroundColor: theme.primary,
      borderColor: theme.primary,
    },
    filterChipText: {
      fontSize: 13,
      fontWeight: "600",
      color: theme.textSecondary,
    },
    filterChipTextActive: {
      color: theme.onPrimary,
    },
    center: {
      padding: 28,
    },
    centerTitle: {
      fontSize: 17,
      fontWeight: "600",
      color: theme.textSecondary,
    },
    centerState: {
      alignItems: "center",
      paddingVertical: 36,
      gap: 8,
    },
    stateTitle: {
      fontSize: 16,
      fontWeight: "600",
      color: theme.text,
    },
    stateText: {
      fontSize: 13,
      color: theme.textSecondary,
      textAlign: "center",
    },
    listWrap: {
      gap: 12,
    },
    card: {
      backgroundColor: theme.surface,
      borderRadius: 14,
      padding: 14,
      borderWidth: 1,
      borderColor: theme.border,
    },
    cardSelected: {
      borderColor: theme.primary,
      backgroundColor: dark ? theme.primaryLight : "#F0FDF4",
    },
    cardPressed: {
      opacity: 0.85,
    },
    cardHeader: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 8,
    },
    cardName: {
      flex: 1,
      fontSize: 16,
      fontWeight: "700",
      color: theme.text,
    },
    detailsButton: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.primaryLight,
    },
    detailsButtonPressed: {
      opacity: 0.7,
    },
    cardCategory: {
      marginTop: 4,
      fontSize: 13,
      fontWeight: "600",
      color: theme.primary,
    },
    cardAddress: {
      marginTop: 6,
      fontSize: 13,
      color: theme.textSecondary,
    },
    cardMeta: {
      marginTop: 8,
      flexDirection: "row",
      alignItems: "center",
    },
    distance: {
      fontSize: 13,
      color: theme.text,
    },
    hoursBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      marginTop: 8,
    },
    hoursText: {
      fontSize: 12,
      color: theme.textMuted,
      flexShrink: 1,
    },
    pressed: {
      opacity: 0.7,
    },
    detailSafe: {
      flex: 1,
      backgroundColor: theme.surface,
    },
    detailHeader: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 20,
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    detailHeaderTitle: {
      flex: 1,
      fontSize: 16,
      fontWeight: "700",
      color: theme.text,
    },
    detailCloseButton: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.surfaceSecondary,
    },
    detailCloseButtonPressed: {
      opacity: 0.7,
    },
    detailScroll: {
      flex: 1,
    },
    detailScrollContent: {
      padding: 20,
    },
    detailCenter: {
      alignItems: "center",
      paddingVertical: 40,
      gap: 10,
    },
    detailStateTitle: {
      fontSize: 16,
      fontWeight: "600",
      color: theme.text,
      textAlign: "center",
    },
    detailStateText: {
      fontSize: 13,
      color: theme.textSecondary,
      textAlign: "center",
    },
    detailName: {
      fontSize: 22,
      fontWeight: "800",
      color: theme.text,
    },
    detailCategory: {
      marginTop: 6,
      fontSize: 14,
      fontWeight: "600",
      color: theme.primary,
    },
    detailRatingRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      marginTop: 10,
    },
    detailRatingText: {
      fontSize: 14,
      fontWeight: "600",
      color: theme.text,
    },
    detailMeta: {
      marginTop: 10,
      fontSize: 13,
      color: theme.text,
    },
    detailAddress: {
      marginTop: 6,
      fontSize: 13,
      color: theme.textSecondary,
    },
    detailDescription: {
      marginTop: 14,
      fontSize: 14,
      lineHeight: 21,
      color: theme.text,
    },
    detailWebsiteButton: {
      marginTop: 20,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      backgroundColor: theme.primary,
      borderRadius: 12,
      paddingVertical: 12,
    },
    detailWebsiteText: {
      fontSize: 15,
      fontWeight: "700",
      color: theme.onPrimary,
    },
  });