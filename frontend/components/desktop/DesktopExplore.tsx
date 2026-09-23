import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import DesktopLayout from "./DesktopLayout";
import PlaceMap from "../PlaceMap";
import type { PlaceMapRegion } from "../PlaceMap.types";
import FunFactCard from "../trip/FunFactCard";
import PlacesSection from "../trip/PlacesSection";
import WeatherCard from "../trip/WeatherCard";
import { useSupabase } from "../../hook/usesupabase";
import { searchLocation } from "../../services/locationApi";
import { useAppTheme } from "../../src/theme/ThemeProvider";
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
import { displayCategory, placeMatchesAppCategory } from "../../services/placeCategories";
import { getPlaceDetails, type PlaceDetails } from "../../services/placeDetailsApi";

interface CityPoint {
  latitude: number;
  longitude: number;
  label?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
}

interface CitySearchResult {
  id: string;
  name: string;
  formatted: string;
  latitude: number;
  longitude: number;
  city?: string | null;
  state?: string | null;
  country?: string | null;
}

type PlaceSource = "database" | "osm";

const RADIUS_OPTIONS = [
  { label: "1 km", value: 1000 },
  { label: "2 km", value: 2000 },
  { label: "5 km", value: 5000 },
  { label: "10 km", value: 10000 },
];

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

function openingHoursText(openingHours: string | null): string | null {
  if (openingHours && openingHours.trim()) {
    return openingHours.trim();
  }

  return null;
}

export default function DesktopExplore() {
  const supabase = useSupabase();
  const { theme, dark } = useAppTheme();

  /* -----------------------------
     City search (search-first)
  ----------------------------- */

  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<CitySearchResult[]>([]);
  const searchRequestRef = useRef(0);
  const searchAbortRef = useRef<AbortController | null>(null);

  const [city, setCity] = useState<string | null>(null);

  useEffect(() => {
    const trimmed = query.trim();

    if (trimmed.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }

    const timer = setTimeout(async () => {
      searchAbortRef.current?.abort();

      const controller = new AbortController();
      searchAbortRef.current = controller;

      const requestId = ++searchRequestRef.current;

      try {
        setSearching(true);

        const located = await searchLocation(trimmed, controller.signal);

        if (
          requestId !== searchRequestRef.current ||
          controller.signal.aborted
        ) {
          return;
        }

        setResults(located);
      } catch (error: unknown) {
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }

        console.error("EXPLORE SEARCH ERROR:", error);

        if (requestId === searchRequestRef.current) {
          setResults([]);
        }
      } finally {
        if (
          requestId === searchRequestRef.current &&
          !controller.signal.aborted
        ) {
          setSearching(false);
        }
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [query, city]);

  function selectResult(location: CitySearchResult) {
    setCity(location.name);
    setQuery(location.name);
    setResults([]);

    setPoint({
      latitude: location.latitude,
      longitude: location.longitude,
      label: location.name,
      city: location.city ?? location.name,
      state: location.state,
      country: location.country,
    });
    setPointState("ready");
    resetExplore();
  }

  /* -----------------------------
     Exploration state
  ----------------------------- */

  const [point, setPoint] = useState<CityPoint | null>(null);
  const [pointState, setPointState] = useState<"loading" | "ready" | "error">(
    "loading"
  );

  const [placeSource, setPlaceSource] = useState<PlaceSource>("database");
  const [searchRadius, setSearchRadius] = useState(4000);
  const [activeFilter, setActiveFilter] = useState<string>("all");

  const [dbPlaces, setDbPlaces] = useState<TravelPlace[]>([]);
  const [osmPlaces, setOsmPlaces] = useState<TravelPlace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requestKey, setRequestKey] = useState(0);

  const [selectedPlace, setSelectedPlace] = useState<TravelPlace | null>(null);

  const [mapPanCenter, setMapPanCenter] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const mapDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [details, setDetails] = useState<PlaceDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [detailsVisible, setDetailsVisible] = useState(false);

  function resetExplore() {
    setPlaceSource("database");
    setSearchRadius(4000);
    setActiveFilter("all");
    setSelectedPlace(null);
    setMapPanCenter(null);
    setDbPlaces([]);
    setOsmPlaces([]);
    setError(null);
    setLoading(true);
  }

  const effectiveCategories = useMemo(() => CITY_CATEGORY_IDS, []);

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
      .then((data) => ({ ok: true, data }))
      .catch((fetchError: unknown) => {
        if (!cancelled) {
          console.error("NEARBY OSM ERROR:", fetchError);
        }
        return { ok: false, data: [] as TravelPlace[] };
      });

    const dbRequest = getNearbyDbPlaces(supabase, {
      latitude: point.latitude,
      longitude: point.longitude,
      categories: dbCategories,
      radiusMeters: searchRadius,
    })
      .then((rows) => ({
        ok: true,
        data: rows.map(nearbyDbPlaceToTravelPlace),
      }))
      .catch((fetchError: unknown) => {
        if (!cancelled) {
          console.error("POPULAR DB ERROR:", fetchError);
        }
        return { ok: false, data: [] as TravelPlace[] };
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
      searchAbortRef.current?.abort();
    };
  }, []);

  /* -----------------------------
     Derived state
  ----------------------------- */

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
     Place details
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

  return (
    <DesktopLayout
      title="Explore"
      subtitle="Discover real places around any city"
      activeKey="explore"
    >
      {/* Search-first picker */}
      <View style={styles.searchWrap}>
        <View
          style={[
            styles.searchBox,
            { backgroundColor: theme.surface, borderColor: theme.border },
          ]}
        >
          <Ionicons name="search" size={18} color={theme.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search a city to explore…"
            placeholderTextColor={theme.textMuted}
            style={[styles.searchInput, { color: theme.textPrimary }]}
          />
          {searching ? (
            <ActivityIndicator size="small" color={theme.primary} />
          ) : null}
        </View>

        {results.length > 0 ? (
          <View
            style={[
              styles.results,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
          >
            {results.map((location) => (
              <Pressable
                key={location.id}
                accessibilityRole="button"
                onPress={() => selectResult(location)}
                style={({ pressed }) => [
                  styles.resultRow,
                  { borderBottomColor: theme.border },
                  pressed && styles.pressed,
                ]}
              >
                <View style={styles.resultIcon}>
                  <Ionicons name="location" size={16} color={theme.primary} />
                </View>
                <View style={styles.resultTextWrap}>
                  <Text style={[styles.resultName, { color: theme.textPrimary }]}>
                    {location.name}
                  </Text>
                  {location.formatted ? (
                    <Text
                      style={[styles.resultFormatted, { color: theme.textMuted }]}
                      numberOfLines={1}
                    >
                      {location.formatted}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            ))}
          </View>
        ) : null}

        {city ? (
          <View
            style={[styles.cityChip, { backgroundColor: theme.primaryLight }]}
          >
            <Ionicons name="navigate" size={15} color={theme.primaryDark} />
            <Text style={[styles.cityChipText, { color: theme.primaryDark }]}>
              {city}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Change city"
              hitSlop={8}
              onPress={() => {
                setCity(null);
                setQuery("");
                setResults([]);
                resetExplore();
              }}
              style={({ pressed }) => pressed && styles.pressed}
            >
              <Ionicons name="close-circle" size={18} color={theme.primaryDark} />
            </Pressable>
          </View>
        ) : null}
      </View>

      {point ? (
        <>
          <View style={styles.mainRow}>
            {/* Left: map */}
            <View style={styles.mapColumn}>
              {pointState === "error" ? (
                <View style={styles.mapError}>
                  <Text style={[styles.mapErrorText, { color: theme.textSecondary }]}>
                    We could not locate &quot;{city}&quot; on the map.
                  </Text>
                </View>
              ) : (
                <View style={styles.mapWrap}>
                  <PlaceMap
                    places={mapPlaces}
                    destination={
                      point
                        ? {
                            name: point.label ?? city ?? "",
                            formatted: point.label ?? city ?? "",
                            latitude: point.latitude,
                            longitude: point.longitude,
                          }
                        : undefined
                    }
                    selectedPlace={selectedPlace}
                    onPlacePress={selectPlace}
                    onRegionChangeComplete={handleMapRegionComplete}
                    initialRegion={regionForPoint(point)}
                    recenterRegion={destinationRegion ?? undefined}
                  />
                </View>
              )}
            </View>

            {/* Right: filters + results */}
            <View style={styles.listColumn}>
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
                        { backgroundColor: theme.surface, borderColor: theme.border },
                        selected && {
                          backgroundColor: theme.primary,
                          borderColor: theme.primary,
                        },
                        pressed && styles.pressed,
                      ]}
                    >
                      <Text
                        style={[
                          styles.sourceChipText,
                          { color: selected ? theme.onPrimary : theme.textSecondary },
                        ]}
                      >
                        {SOURCE_LABELS[source]}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.filterRow}>
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
                        { backgroundColor: theme.surface, borderColor: theme.border },
                        selected && {
                          backgroundColor: theme.primary,
                          borderColor: theme.primary,
                        },
                        pressed && styles.pressed,
                      ]}
                    >
                      <Text
                        style={[
                          styles.filterChipText,
                          { color: selected ? theme.onPrimary : theme.textSecondary },
                        ]}
                      >
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.filterRow}>
                {["all", ...effectiveCategories].map((appCategoryId) => {
                  const selected = activeFilter === appCategoryId;
                  const label =
                    appCategoryId === "all"
                      ? "All"
                      : CITY_EXPLORE_CATEGORIES.find(
                          (config) => config.id === appCategoryId
                        )?.label ?? appCategoryId;

                  return (
                    <Pressable
                      key={appCategoryId}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      onPress={() => setActiveFilter(appCategoryId)}
                      style={({ pressed }) => [
                        styles.filterChip,
                        { backgroundColor: theme.surface, borderColor: theme.border },
                        selected && {
                          backgroundColor: theme.primary,
                          borderColor: theme.primary,
                        },
                        pressed && styles.pressed,
                      ]}
                    >
                      <Text
                        style={[
                          styles.filterChipText,
                          { color: selected ? theme.onPrimary : theme.textSecondary },
                        ]}
                      >
                        {label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {error ? (
                <View style={styles.centerState}>
                  <Text style={[styles.stateText, { color: theme.textSecondary }]}>
                    {error}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setRequestKey((value) => value + 1)}
                    style={({ pressed }) => [
                      styles.retry,
                      { backgroundColor: theme.primaryLight },
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={[styles.retryText, { color: theme.primaryDark }]}>
                      Retry
                    </Text>
                  </Pressable>
                </View>
              ) : isLoading ? (
                <View style={styles.centerState}>
                  <ActivityIndicator size="large" color={theme.primary} />
                  <Text style={[styles.stateText, { color: theme.textSecondary }]}>
                    Loading {SOURCE_LABELS[placeSource].toLowerCase()} places…
                  </Text>
                </View>
              ) : activePlaces.length === 0 ? (
                <View style={styles.centerState}>
                  <Ionicons name="search-outline" size={40} color={theme.textMuted} />
                  <Text style={[styles.stateTitle, { color: theme.textPrimary }]}>
                    No places found
                  </Text>
                  <Text style={[styles.stateText, { color: theme.textSecondary }]}>
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
                          {
                            backgroundColor: theme.surface,
                            borderColor: isSelected ? theme.primary : theme.border,
                          },
                          isSelected && dark
                            ? { backgroundColor: theme.primaryLight }
                            : null,
                          pressed && styles.pressed,
                        ]}
                      >
                        <View style={styles.cardHeader}>
                          <Text
                            style={[styles.cardName, { color: theme.textPrimary }]}
                            numberOfLines={2}
                          >
                            {place.name || "Unnamed place"}
                          </Text>

                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`View details for ${place.name || "this place"}`}
                            hitSlop={6}
                            onPress={() => openPlaceDetails(place)}
                            style={({ pressed }) => [
                              styles.detailsButton,
                              { backgroundColor: theme.primaryLight },
                              pressed && styles.pressed,
                            ]}
                          >
                            <Ionicons
                              name="information-circle-outline"
                              size={19}
                              color={theme.primaryDark}
                            />
                          </Pressable>
                        </View>

                        <Text style={[styles.cardCategory, { color: theme.primary }]}>
                          {category}
                        </Text>

                        {Boolean(shownAddress) ? (
                          <Text
                            style={[styles.cardAddress, { color: theme.textSecondary }]}
                            numberOfLines={2}
                          >
                            {shownAddress}
                          </Text>
                        ) : null}

                        <View style={styles.cardMeta}>
                          <Ionicons name="navigate" size={13} color={theme.primary} />
                          <Text style={[styles.distance, { color: theme.textPrimary }]}>
                            {distanceText}
                          </Text>
                        </View>

                        {Boolean(hours) ? (
                          <View style={styles.hoursBadge}>
                            <Ionicons
                              name="time-outline"
                              size={13}
                              color={theme.textMuted}
                            />
                            <Text
                              style={[styles.hoursText, { color: theme.textMuted }]}
                              numberOfLines={1}
                            >
                              {hours}
                            </Text>
                          </View>
                        ) : null}
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </View>
          </View>

          {/* Extras grid */}
          <View style={styles.extrasWrap}>
            <View style={styles.extraColumn}>
              <WeatherCard
                city={city ?? ""}
                coords={{ latitude: point.latitude, longitude: point.longitude }}
              />
            </View>
            <View style={styles.extraColumn}>
              <FunFactCard city={city ?? ""} />
            </View>
            <View style={styles.extraColumn}>
              <PlacesSection
                title="Attractions"
                categories={["tourist-attraction"]}
                city={city ?? ""}
                coords={{ latitude: point.latitude, longitude: point.longitude }}
              />
            </View>
          </View>
        </>
      ) : (
        <View style={styles.intro}>
          <View
            style={[
              styles.introCard,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
          >
            <Ionicons name="compass" size={42} color={theme.primary} />
            <Text style={[styles.introTitle, { color: theme.textPrimary }]}>
              Explore a city
            </Text>
            <Text style={[styles.introText, { color: theme.textSecondary }]}>
              Search any city above to discover temples, attractions,
              restaurants, hotels, cafés and fuel stops — every place is real
              data from the database and OpenStreetMap.
            </Text>
          </View>
        </View>
      )}

      <Modal
        visible={detailsVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closePlaceDetails}
      >
        <View style={[styles.detailSafe, { backgroundColor: theme.surface }]}>
          <View
            style={[styles.detailHeader, { borderBottomColor: theme.border }]}
          >
            <Text
              style={[styles.detailHeaderTitle, { color: theme.textPrimary }]}
              numberOfLines={1}
            >
              {selectedPlace?.name || details?.name || "Place details"}
            </Text>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close details"
              hitSlop={8}
              onPress={closePlaceDetails}
              style={({ pressed }) => [
                styles.detailCloseButton,
                { backgroundColor: theme.surfaceSecondary },
                pressed && styles.pressed,
              ]}
            >
              <Ionicons name="close" size={22} color={theme.text} />
            </Pressable>
          </View>

          <View style={styles.detailBody}>
            {detailsLoading ? (
              <View style={styles.detailCenter}>
                <ActivityIndicator size="large" color={theme.primary} />
                <Text style={[styles.detailStateText, { color: theme.textSecondary }]}>
                  Loading details…
                </Text>
              </View>
            ) : detailsError ? (
              <View style={styles.detailCenter}>
                <Ionicons name="cloud-offline-outline" size={40} color={theme.textMuted} />
                <Text style={[styles.detailStateTitle, { color: theme.textPrimary }]}>
                  {detailsError}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => selectedPlace && openPlaceDetails(selectedPlace)}
                  style={({ pressed }) => [
                    styles.websiteButton,
                    { backgroundColor: theme.primary },
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.websiteText}>Try Again</Text>
                </Pressable>
              </View>
            ) : details ? (
              <>
                <Text style={[styles.detailName, { color: theme.textPrimary }]}>
                  {details.name || selectedPlace?.name || "Place"}
                </Text>

                {selectedPlace ? (
                  <Text style={[styles.detailCategory, { color: theme.primary }]}>
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
                    <Text style={[styles.detailRatingText, { color: theme.textPrimary }]}>
                      {details.rating.toFixed(1)}
                      {details.ratingCount !== null
                        ? `  (${details.ratingCount} ratings)`
                        : ""}
                    </Text>
                  </View>
                ) : null}

                {selectedPlace?.distanceText ? (
                  <Text style={[styles.detailMeta, { color: theme.textPrimary }]}>
                    {selectedPlace.distanceText}
                  </Text>
                ) : null}

                {Boolean(selectedPlace?.formatted) ? (
                  <Text
                    style={[styles.detailAddress, { color: theme.textSecondary }]}
                    numberOfLines={2}
                  >
                    {selectedPlace?.formatted}
                  </Text>
                ) : null}

                {details.description ? (
                  <Text style={[styles.detailDescription, { color: theme.textPrimary }]}>
                    {details.description}
                  </Text>
                ) : null}

                {details.website ? (
                  <Pressable
                    accessibilityRole="link"
                    onPress={() =>
                      Linking.openURL(details.website ?? "").catch(() => {})
                    }
                    style={({ pressed }) => [
                      styles.websiteButton,
                      { backgroundColor: theme.primary },
                      pressed && styles.pressed,
                    ]}
                  >
                    <Ionicons name="globe-outline" size={16} color={theme.onPrimary} />
                    <Text style={styles.websiteText}>Open Website</Text>
                  </Pressable>
                ) : null}
              </>
            ) : (
              <View style={styles.detailCenter}>
                <Ionicons name="information-circle-outline" size={40} color={theme.textMuted} />
                <Text style={[styles.detailStateTitle, { color: theme.textPrimary }]}>
                  No details available
                </Text>
                <Text style={[styles.detailStateText, { color: theme.textSecondary }]}>
                  We could not find more information about this place.
                </Text>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </DesktopLayout>
  );
}

const styles = StyleSheet.create({
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
    marginBottom: 18,
    position: "relative",
  },
  searchBox: {
    flex: 1,
    minWidth: 260,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
  },
  results: {
    position: "absolute",
    top: 54,
    left: 0,
    right: 0,
    zIndex: 20,
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
    elevation: 6,
    shadowColor: "#000000",
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
  },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  resultIcon: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: "#E7F9EB",
    alignItems: "center",
    justifyContent: "center",
  },
  resultTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  resultName: {
    fontSize: 14,
    fontWeight: "700",
  },
  resultFormatted: {
    fontSize: 12,
    marginTop: 1,
  },
  cityChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderRadius: 999,
    paddingHorizontal: 13,
    paddingVertical: 8,
  },
  cityChipText: {
    fontSize: 13,
    fontWeight: "800",
  },
  mainRow: {
    flexDirection: "row",
    gap: 20,
    alignItems: "stretch",
    flexWrap: "wrap",
  },
  mapColumn: {
    flexGrow: 1,
    flexBasis: 460,
    minWidth: 420,
  },
  mapWrap: {
    height: 660,
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#E1E6E2",
    backgroundColor: "#EDEFF2",
  },
  mapError: {
    height: 660,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  mapErrorText: {
    fontSize: 14,
    textAlign: "center",
  },
  listColumn: {
    flexGrow: 1,
    flexBasis: 380,
    minWidth: 340,
    gap: 12,
  },
  sourceRow: {
    flexDirection: "row",
    gap: 10,
  },
  sourceChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
  },
  sourceChipText: {
    fontSize: 14,
    fontWeight: "700",
  },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 18,
    borderWidth: 1,
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: "600",
  },
  centerState: {
    alignItems: "center",
    paddingVertical: 36,
    gap: 8,
  },
  stateTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  stateText: {
    fontSize: 13,
    textAlign: "center",
  },
  retry: {
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  retryText: {
    fontSize: 13,
    fontWeight: "800",
  },
  listWrap: {
    gap: 12,
  },
  card: {
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
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
  },
  detailsButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  cardCategory: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: "600",
  },
  cardAddress: {
    marginTop: 6,
    fontSize: 13,
  },
  cardMeta: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  distance: {
    fontSize: 13,
    fontWeight: "600",
  },
  hoursBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 8,
  },
  hoursText: {
    fontSize: 12,
    flexShrink: 1,
  },
  extrasWrap: {
    flexDirection: "row",
    gap: 20,
    flexWrap: "wrap",
    marginTop: 28,
  },
  extraColumn: {
    flexGrow: 1,
    flexBasis: 320,
    minWidth: 280,
  },
  intro: {
    paddingVertical: 40,
  },
  introCard: {
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    paddingVertical: 46,
    paddingHorizontal: 28,
    gap: 12,
  },
  introTitle: {
    fontSize: 19,
    fontWeight: "800",
  },
  introText: {
    fontSize: 13,
    textAlign: "center",
    maxWidth: 460,
  },
  detailSafe: {
    flex: 1,
  },
  detailHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  detailHeaderTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: "700",
  },
  detailCloseButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  detailBody: {
    padding: 20,
  },
  detailCenter: {
    alignItems: "center",
    paddingVertical: 40,
    gap: 10,
  },
  detailStateTitle: {
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
  },
  detailStateText: {
    fontSize: 13,
    textAlign: "center",
  },
  detailName: {
    fontSize: 22,
    fontWeight: "800",
  },
  detailCategory: {
    marginTop: 6,
    fontSize: 14,
    fontWeight: "600",
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
  },
  detailMeta: {
    marginTop: 10,
    fontSize: 13,
  },
  detailAddress: {
    marginTop: 6,
    fontSize: 13,
  },
  detailDescription: {
    marginTop: 14,
    fontSize: 14,
    lineHeight: 21,
  },
  websiteButton: {
    marginTop: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 12,
    paddingVertical: 12,
  },
  websiteText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  pressed: {
    opacity: 0.75,
  },
});