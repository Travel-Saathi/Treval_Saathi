import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { SafeAreaView } from "react-native-safe-area-context";

import CitySearchSheet, {
  type CitySelection,
} from "../../components/CitySearchSheet";
import PageHeader from "../../components/PageHeader";
import PlaceMap, {
  type JourneyStopMarker,
  type PlaceMapRegion,
} from "../../components/PlaceMap";
import { useSupabase } from "../../hook/usesupabase";
import {
  getJourneyRoute,
  resolveCityCoordinates,
  validateStopAgainstRoute,
  type RoutePoint,
} from "../../services/routeApi";
import {
  type TripStop,
  type TripTransport,
  getTransport,
  listStops,
  removeStop,
  removeTransport,
  saveStopOrder,
  saveTransport,
  addStop as addStopRow,
  type SaveTransportInput,
} from "../../services/tripsApi";
import {
  MODE_LABELS,
  TRANSPORT_MODES,
  identifyTransportMode,
  searchTransportOptions,
  type TransportAvailability,
  type TransportMode,
  type TransportOption,
} from "../../services/transportApi";
import {
  getWeather as fetchWeather,
  type WeatherResponse,
} from "../../services/weatherApi";

const MONTH_LABELS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function formatDateDisplay(iso: string | null): string {
  if (!iso) {
    return "Not available";
  }

  const parts = iso.split("-").map(Number);

  if (parts.length !== 3) {
    return iso;
  }

  const [year, month, day] = parts;

  return `${day} ${MONTH_LABELS[month - 1].slice(0, 3)} ${year}`;
}

function formatMinutes(minutes: number | null): string {
  if (minutes === null) {
    return "Not available";
  }

  const rounded = Math.round(minutes);

  const hours = Math.floor(rounded / 60);
  const rest = rounded % 60;

  if (hours === 0) {
    return `${rest}m`;
  }

  if (rest === 0) {
    return `${hours}h`;
  }

  return `${hours}h ${rest}m`;
}

function formatKilometers(kilometers: number | null): string {
  if (kilometers === null) {
    return "Not available";
  }

  if (kilometers >= 100) {
    return `${kilometers.toFixed(0)} km`;
  }

  return `${kilometers.toFixed(1)} km`;
}

interface CityParam {
  id: string;
  name: string;
  formatted: string;
  latitude: number;
  longitude: number;
}

function parseCityParam(raw: string | undefined): CityParam | null {
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
      return parsed as CityParam;
    }
  } catch {
    /* Ignore malformed city params. */
  }

  return null;
}

function computeRegion(points: JourneyStopMarker[]): PlaceMapRegion {
  const valid = points.filter(
    (point) =>
      Number.isFinite(point.latitude) &&
      Number.isFinite(point.longitude)
  );

  if (valid.length === 0) {
    return {
      latitude: 23.0,
      longitude: 79.0,
      latitudeDelta: 12,
      longitudeDelta: 12,
    };
  }

  const latitudes = valid.map((point) => point.latitude);
  const longitudes = valid.map((point) => point.longitude);

  const minLat = Math.min(...latitudes);
  const maxLat = Math.max(...latitudes);
  const minLon = Math.min(...longitudes);
  const maxLon = Math.max(...longitudes);

  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLon + maxLon) / 2,
    latitudeDelta: Math.max(maxLat - minLat, 0.05) * 1.6,
    longitudeDelta: Math.max(maxLon - minLon, 0.05) * 1.6,
  };
}

interface FlashMessage {
  kind: "success" | "error";
  text: string;
}

interface TransportDraft {
  mode: TransportMode;
  transport_number: string;
  transport_name: string;
  departure_city: string;
  arrival_city: string;
  departure_date: string;
  departure_time: string;
  arrival_date: string;
  arrival_time: string;
  duration: string;
  price: string;
  deal_price: string;
  availability: string;
  route: string;
}

type LoadState = "loading" | "ready" | "missing" | "error";

export default function JourneySetupScreen() {
  const params = useLocalSearchParams<{
    tripId?: string;
    source?: string;
    destination?: string;
  }>();

  const tripId =
    typeof params.tripId === "string" ? params.tripId : null;

  const supabase = useSupabase();

  const sourceSeed = useMemo(
    () => (typeof params.source === "string" ? parseCityParam(params.source) : null),
    [params.source]
  );

  const destinationSeed = useMemo(
    () =>
      typeof params.destination === "string"
        ? parseCityParam(params.destination)
        : null,
    [params.destination]
  );

  const sourceSeedKey = sourceSeed
    ? `${sourceSeed.latitude},${sourceSeed.longitude}`
    : "none";

  const destinationSeedKey = destinationSeed
    ? `${destinationSeed.latitude},${destinationSeed.longitude}`
    : "none";

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [reloadKey, setReloadKey] = useState(0);

  const [trip, setTrip] = useState<{
    id: string;
    title: string | null;
    source_city: string | null;
    destination: string | null;
    start_date: string | null;
    end_date: string | null;
    budget: number | null;
    members: number | null;
    status: string | null;
  } | null>(null);

  const [stops, setStops] = useState<TripStop[]>([]);
  const [transport, setTransport] = useState<TripTransport | null>(null);

  const [flash, setFlash] = useState<FlashMessage | null>(null);

  // Transport section
  const [activeMode, setActiveMode] = useState<TransportMode>("train");
  const [transportAvailability, setTransportAvailability] =
    useState<TransportAvailability | null>(null);
  const [transportModalVisible, setTransportModalVisible] = useState(false);
  const [transportDetailsVisible, setTransportDetailsVisible] =
    useState(false);
  const [transportSaving, setTransportSaving] = useState(false);
  const [transportBusy, setTransportBusy] = useState(false);
  const [transportSearching, setTransportSearching] = useState(true);
  const [transportError, setTransportError] = useState<string | null>(null);
  const [draft, setDraft] = useState<TransportDraft | null>(null);

  // Stops
  const [stopSheetVisible, setStopSheetVisible] = useState(false);
  const [busyStopId, setBusyStopId] = useState<string | null>(null);

  // Route
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [route, setRoute] = useState<{
    distanceKilometers: number | null;
    durationMinutes: number | null;
  } | null>(null);
  const [routePoints, setRoutePoints] = useState<JourneyStopMarker[]>([]);
  const [routeCoordinates, setRouteCoordinates] = useState<
    RoutePoint[] | null
  >(null);

  // Weather
  const [weather, setWeather] = useState<WeatherResponse | null>(null);
  const [weatherError, setWeatherError] = useState(false);

  useEffect(() => {
    if (!flash) {
      return;
    }

    const timer = setTimeout(() => {
      setFlash(null);
    }, 4000);

    return () => clearTimeout(timer);
  }, [flash]);

  // Initial load: trip + stops + saved transport
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!tripId) {
        setLoadState("missing");
        return;
      }

      setLoadState("loading");

      try {
        const [tripData, stopData, transportData] = await Promise.all([
          supabase
            .from("trips")
            .select(
              "id, title, source_city, destination, start_date, end_date, budget, members, status"
            )
            .eq("id", tripId)
            .maybeSingle(),
          listStops(supabase, tripId),
          getTransport(supabase, tripId),
        ]);

        if (cancelled) {
          return;
        }

        if (tripData.error || !tripData.data) {
          console.error("TRIP LOAD ERROR:", tripData.error);
          setLoadState("missing");
          return;
        }

        setTrip(tripData.data);
        setStops(stopData);
        setTransport(transportData);
        setLoadState("ready");
      } catch (error) {
        console.error("JOURNEY LOAD ERROR:", error);

        if (!cancelled) {
          setLoadState("error");
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [tripId, supabase, reloadKey]);

  // Transport availability for the active mode (no live API yet).
  useEffect(() => {
    let cancelled = false;

    if (loadState !== "ready" || !trip) {
      return;
    }

    searchTransportOptions(activeMode, {
      source: trip.source_city ?? "",
      destination: trip.destination ?? "",
      date: trip.start_date,
    }).then((result) => {
      if (!cancelled) {
        setTransportAvailability(result);
        setTransportSearching(false);
      }
    });

    if (activeMode === "train") {
      setTransportSearching(true);
    }

    return () => {
      cancelled = true;
    };
  }, [activeMode, loadState, trip?.id, trip?.source_city, trip?.destination, trip?.start_date]);

  // Route calculation using source + stops + destination.
  const stopsKey = useMemo(
    () => stops.map((stop) => `${stop.id}:${stop.stop_order}`).join("|"),
    [stops]
  );

  useEffect(() => {
    if (loadState !== "ready" || !trip) {
      return;
    }

    let cancelled = false;

    const compute = async () => {
      setRouteLoading(true);
      setRouteError(null);

      try {
        const sourceCoord = sourceSeed
          ? { latitude: sourceSeed.latitude, longitude: sourceSeed.longitude }
          : await resolveCityCoordinates(trip.source_city ?? "");
        const destinationCoord = destinationSeed
          ? {
              latitude: destinationSeed.latitude,
              longitude: destinationSeed.longitude,
            }
          : await resolveCityCoordinates(trip.destination ?? "");

        const stopCoordinates = await Promise.all(
          stops.map((stop) => resolveCityCoordinates(stop.city))
        );

        const coordinates: RoutePoint[] = [
          sourceCoord,
          ...stopCoordinates,
          destinationCoord,
        ];

        const result = await getJourneyRoute(coordinates);

        if (cancelled) {
          return;
        }

        setRoute({
          distanceKilometers: result.distanceKilometers,
          durationMinutes: result.durationMinutes,
        });
        setRouteCoordinates(result.coordinates);

        const markers: JourneyStopMarker[] = [
          {
            key: "source",
            name: trip.source_city ?? "Source",
            latitude: sourceCoord.latitude,
            longitude: sourceCoord.longitude,
            kind: "source",
          },
          ...stops.map((stop, index) => ({
            key: `stop-${stop.id}`,
            name: stop.city,
            latitude: stopCoordinates[index].latitude,
            longitude: stopCoordinates[index].longitude,
            kind: "stop" as const,
          })),
          {
            key: "destination",
            name: trip.destination ?? "Destination",
            latitude: destinationCoord.latitude,
            longitude: destinationCoord.longitude,
            kind: "destination",
          },
        ];

        setRoutePoints(markers);
      } catch (error) {
        console.error("ROUTE CALCULATION ERROR:", error);

        if (!cancelled) {
          // Keep the previous valid route visible on failure.
          setRouteError(
            error instanceof Error
              ? error.message
              : "Unable to calculate the route."
          );
        }
      } finally {
        if (!cancelled) {
          setRouteLoading(false);
        }
      }
    };

    compute();

    return () => {
      cancelled = true;
    };
  }, [
    tripId,
    trip?.id,
    loadState,
    stopsKey,
    sourceSeedKey,
    destinationSeedKey,
    trip?.source_city,
    trip?.destination,
  ]);

  // Destination weather (secondary info, never blocks the page).
  useEffect(() => {
    if (loadState !== "ready" || !trip) {
      return;
    }

    let cancelled = false;

    const loadWeather = async () => {
      try {
        const coordinate = destinationSeed
          ? {
              latitude: destinationSeed.latitude,
              longitude: destinationSeed.longitude,
            }
          : await resolveCityCoordinates(trip.destination ?? "");

        const result = await fetchWeather(
          coordinate.latitude,
          coordinate.longitude
        );

        if (!cancelled) {
          setWeather(result);
          setWeatherError(false);
        }
      } catch (error) {
        console.error("WEATHER LOAD ERROR:", error);

        if (!cancelled) {
          setWeather(null);
          setWeatherError(true);
        }
      }
    };

    loadWeather();

    return () => {
      cancelled = true;
    };
  }, [loadState, trip?.id, trip?.destination, destinationSeedKey]);

  /* --------------------------------------------------
     Stops
  -------------------------------------------------- */

  const validateCandidate = useCallback(
    async (location: CitySelection): Promise<string | null> => {
      const coords = routeCoordinates;

      if (!coords || coords.length < 2) {
        return "Route information is unavailable. Please try again.";
      }

      const result = validateStopAgainstRoute(location, coords);

      if (result.valid) {
        return null;
      }

      switch (result.code) {
        case "before-source":
          return `${location.name} is before your starting point.`;

        case "after-destination":
          return `${location.name} is past your destination.`;

        case "too-far":
          return result.distanceKm !== null
            ? `${location.name} is ${Math.round(result.distanceKm)} km off your current route.`
            : `${location.name} isn't along your current route.`;

        default:
          return "Route information is unavailable. Please try again.";
      }
    },
    [routeCoordinates]
  );

  async function handleAddStop(location: CitySelection) {
    if (!tripId) {
      return;
    }

    const coords = routeCoordinates;

    if (!coords || coords.length < 2) {
      setFlash({
        kind: "error",
        text: "Route information is unavailable. Please try again.",
      });
      return;
    }

    const lower = location.name.toLowerCase();

    if (
      trip?.source_city &&
      lower === trip.source_city.toLowerCase()
    ) {
      setFlash({
        kind: "error",
        text: "The source city cannot be an intermediate stop.",
      });
      return;
    }

    if (
      trip?.destination &&
      lower === trip.destination.toLowerCase()
    ) {
      setFlash({
        kind: "error",
        text: "The destination cannot be an intermediate stop.",
      });
      return;
    }

    if (stops.some((stop) => stop.city.toLowerCase() === lower)) {
      setFlash({
        kind: "error",
        text: `${location.name} is already a stop.`,
      });
      return;
    }

    const validation = validateStopAgainstRoute(location, coords);

    if (!validation.valid || validation.fraction === null) {
      setFlash({
        kind: "error",
        text: `${location.name} isn't along your current route.`,
      });
      return;
    }

    setBusyStopId("__add__");

    try {
      // Find where this stop lies along the current route (0=source, 1=destination)
      // so it can be inserted at the correct position, not just appended.
      const existingWithFractions: {
        stop: TripStop;
        fraction: number;
      }[] = [];

      for (const stop of stops) {
        const coordinate = await resolveCityCoordinates(stop.city);

        const stopValidation = validateStopAgainstRoute(
          coordinate,
          coords
        );

        existingWithFractions.push({
          stop,
          fraction: stopValidation.fraction ?? 0,
        });
      }

      const row = await addStopRow(supabase, tripId, location.name, null, null);

      const ordered = [
        ...existingWithFractions,
        { stop: row, fraction: validation.fraction },
      ];

      ordered.sort((a, b) => a.fraction - b.fraction);

      const orderedStops = ordered.map((entry) => entry.stop);

      await saveStopOrder(
        supabase,
        orderedStops.map((stop, index) => ({
          id: stop.id,
          stop_order: index + 1,
        }))
      );

      setStops(orderedStops);
      setStopSheetVisible(false);

      setFlash({
        kind: "success",
        text: `${location.name} added to your route.`,
      });
    } catch (error) {
      console.error("ADD STOP ERROR:", error);

      setFlash({
        kind: "error",
        text: "Could not add that stop.",
      });
    } finally {
      setBusyStopId(null);
    }
  }

  async function handleRemoveStop(stopId: string) {
    if (!tripId) {
      return;
    }

    setBusyStopId(stopId);

    try {
      await removeStop(supabase, stopId);

      const remaining = await listStops(supabase, tripId);

      await saveStopOrder(
        supabase,
        remaining.map((stop, index) => ({
          id: stop.id,
          stop_order: index + 1,
        }))
      );

      setStops(remaining);

      setFlash({ kind: "success", text: "Stop removed." });
    } catch (error) {
      console.error("REMOVE STOP ERROR:", error);

      setFlash({
        kind: "error",
        text: "Could not remove that stop.",
      });
    } finally {
      setBusyStopId(null);
    }
  }

  async function handleMoveStop(index: number, direction: number) {
    const target = index + direction;

    if (target < 0 || target >= stops.length) {
      return;
    }

    if (!tripId) {
      return;
    }

    const stopId = stops[index].id;

    setBusyStopId(stopId);

    try {
      const next = [...stops];

      [next[index], next[target]] = [next[target], next[index]];

      const ordered = next.map((stop, i) => ({
        ...stop,
        stop_order: i + 1,
      }));

      await saveStopOrder(
        supabase,
        ordered.map((stop) => ({
          id: stop.id,
          stop_order: stop.stop_order,
        }))
      );

      setStops(ordered);
    } catch (error) {
      console.error("REORDER STOP ERROR:", error);

      setFlash({
        kind: "error",
        text: "Could not reorder the stop.",
      });
    } finally {
      setBusyStopId(null);
    }
  }

  /* --------------------------------------------------
     Transport
  -------------------------------------------------- */

  function openTransportModal() {
    setTransportError(null);

    setDraft({
      mode: activeMode,
      transport_number: "",
      transport_name: "",
      departure_city: trip?.source_city ?? "",
      arrival_city: trip?.destination ?? "",
      departure_date: trip?.start_date ?? "",
      departure_time: "",
      arrival_date: "",
      arrival_time: "",
      duration: "",
      price: "",
      deal_price: "",
      availability: "",
      route: "",
    });

    setTransportModalVisible(true);
  }

  function handleTransportNumberChange(text: string) {
    setDraft((current) =>
      current ? { ...current, transport_number: text } : current
    );

    const { mode } = identifyTransportMode(text);

    if (mode !== "unknown") {
      setDraft((current) =>
        current ? { ...current, mode } : current
      );
    }
  }

  async function handleSaveTransport() {
    if (!draft || !tripId) {
      return;
    }

    const transportNumber = draft.transport_number.trim();
    const transportName = draft.transport_name.trim();

    if (!transportNumber && !transportName) {
      setTransportError("Enter a transport number or name.");
      return;
    }

    setTransportSaving(true);
    setTransportError(null);

    const input: SaveTransportInput = {
      mode: draft.mode,
      transport_number: transportNumber || null,
      transport_name: transportName || null,
      departure_city: draft.departure_city.trim() || null,
      arrival_city: draft.arrival_city.trim() || null,
      departure_date: draft.departure_date.trim() || null,
      departure_time: draft.departure_time.trim() || null,
      arrival_date: draft.arrival_date.trim() || null,
      arrival_time: draft.arrival_time.trim() || null,
      duration: draft.duration.trim() || null,
      price: draft.price.trim() || null,
      deal_price: draft.deal_price.trim() || null,
      availability: draft.availability.trim() || null,
      route: draft.route.trim() || null,
    };

    try {
      const saved = await saveTransport(supabase, tripId, input);

      setTransport(saved);
      setTransportModalVisible(false);

      setFlash({
        kind: "success",
        text: `${MODE_LABELS[draft.mode]} details saved.`,
      });
    } catch (error) {
      console.error("TRANSPORT SAVE ERROR:", error);

      setTransportError("Could not save transport details.");
    } finally {
      setTransportSaving(false);
    }
  }

  async function handleSelectTransportOption(option: TransportOption) {
    if (option.mode !== "train") {
      if (option.mode !== "unknown") {
        setActiveMode(option.mode);
      }
      return;
    }

    if (!tripId) {
      return;
    }

    setTransportSaving(true);
    setTransportError(null);

    const input: SaveTransportInput = {
      mode: "train",
      transport_number: option.transport_number ?? null,
      transport_name: option.transport_name ?? null,
      departure_city: option.departure_city ?? null,
      arrival_city: option.arrival_city ?? null,
      departure_date: option.departure_date ?? null,
      departure_time: option.departure_time ?? null,
      arrival_date: option.arrival_date ?? null,
      arrival_time: option.arrival_time ?? null,
      duration: option.duration ?? null,
      price: option.price ?? null,
      deal_price: option.deal_price ?? null,
      availability: option.availability ?? null,
      route: option.route ?? null,
    };

    try {
      const saved = await saveTransport(supabase, tripId, input);

      setTransport(saved);

      setFlash({
        kind: "success",
        text: `${MODE_LABELS.train} ${
          option.transport_name ?? option.transport_number ?? "details"
        } selected.`,
      });
    } catch (error) {
      console.error("TRANSPORT SELECT SAVE ERROR:", error);

      setTransportError("Could not save the selected train.");
    } finally {
      setTransportSaving(false);
    }
  }

  async function handleRemoveTransport() {
    if (!tripId) {
      return;
    }

    setTransportBusy(true);

    try {
      await removeTransport(supabase, tripId);

      setTransport(null);

      setFlash({ kind: "success", text: "Transport removed." });
    } catch (error) {
      console.error("TRANSPORT REMOVE ERROR:", error);

      setFlash({
        kind: "error",
        text: "Could not remove transport.",
      });
    } finally {
      setTransportBusy(false);
    }
  }

  /* --------------------------------------------------
     Continue
  -------------------------------------------------- */

  function handleContinue() {
    if (!tripId) {
      return;
    }

    // The journey now flows into the LIVE TRIPS home (spec section 27):
    // the just-created trip appears instantly on the Live Trips tab.
    router.navigate("/(root)/(tabs)/live-trips");
  }

  const blocked =
    loadState !== "ready" ||
    busyStopId !== null ||
    transportBusy ||
    transportSaving;

  const region = useMemo(() => computeRegion(routePoints), [routePoints]);

  const weatherSummary = useMemo(() => {
    if (weatherError || !weather) {
      return null;
    }

    const current = weather.current;

    if (!current || current.temperature === null) {
      return null;
    }

    const code = current.weatherCode;

    if (code === null) {
      return null;
    }

    let condition = "Weather";

    if (code === 0) {
      condition = "Clear sky";
    } else if (code === 1 || code === 2) {
      condition = "Partly cloudy";
    } else if (code === 3) {
      condition = "Overcast";
    } else if (code >= 51 && code <= 67) {
      condition = "Rainy";
    } else if (code >= 71 && code <= 86) {
      condition = "Snowy";
    } else if (code >= 95) {
      condition = "Stormy";
    }

    return {
      temperature: `${Math.round(current.temperature)}°C`,
      condition,
    };
  }, [weather, weatherError]);

  /* --------------------------------------------------
     Render
  -------------------------------------------------- */

  if (loadState === "loading") {
    return (
      <SafeAreaView style={styles.screen}>
        <PageHeader
          title="Journey Setup"
          subtitle="Loading your journey..."
        />

        <View style={styles.centerState}>
          <ActivityIndicator size="large" color="#00BC26" />
          <Text style={styles.stateText}>Loading journey...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (loadState === "missing") {
    return (
      <SafeAreaView style={styles.screen}>
        <PageHeader title="Journey Setup" subtitle="Review your journey" />

        <View style={styles.centerState}>
          <Ionicons name="alert-circle-outline" size={44} color="#9CA1A9" />
          <Text style={styles.stateTitle}>Trip not found</Text>
          <Text style={styles.stateText}>
            This journey could not be loaded. Please go back and create a
            new journey.
          </Text>

          <Pressable
            accessibilityRole="button"
            onPress={() => {
              router.canGoBack() ? router.back() : router.replace("/");
            }}
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && styles.primaryButtonPressed,
            ]}
          >
            <Text style={styles.primaryButtonText}>Go Back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (loadState === "error" || !trip) {
    return (
      <SafeAreaView style={styles.screen}>
        <PageHeader title="Journey Setup" subtitle="Review your journey" />

        <View style={styles.centerState}>
          <Ionicons name="cloud-offline-outline" size={44} color="#9CA1A9" />
          <Text style={styles.stateTitle}>Could not load your journey</Text>
          <Text style={styles.stateText}>
            Something went wrong while loading this trip.
          </Text>

          <Pressable
            accessibilityRole="button"
            onPress={() => setReloadKey((current) => current + 1)}
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && styles.primaryButtonPressed,
            ]}
          >
            <Text style={styles.primaryButtonText}>Try Again</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={styles.screen}
      edges={["top", "left", "right", "bottom"]}
    >
      <PageHeader
        title="Journey Setup"
        subtitle={trip.title ?? "Review your journey before you start."}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {flash && (
          <View
            style={[
              styles.flash,
              flash.kind === "error"
                ? styles.flashError
                : styles.flashSuccess,
            ]}
          >
            <Ionicons
              name={
                flash.kind === "error"
                  ? "alert-circle-outline"
                  : "checkmark-circle-outline"
              }
              size={18}
              color={flash.kind === "error" ? "#B42318" : "#08751F"}
            />
            <Text
              style={[
                styles.flashText,
                flash.kind === "error"
                  ? styles.flashTextError
                  : styles.flashTextSuccess,
              ]}
            >
              {flash.text}
            </Text>
          </View>
        )}

        {/* Journey Summary */}
        <View style={styles.card}>
          <View style={styles.cityLine}>
            <View style={styles.cityPoint}>
              <Text style={styles.cityPointLabel}>FROM</Text>
              <Text style={styles.cityPointValue} numberOfLines={1}>
                {trip.source_city ?? "Not available"}
              </Text>
            </View>

            <View style={styles.cityArrow}>
              <Ionicons name="arrow-forward" size={18} color="#B0B5BC" />
            </View>

            <View style={styles.cityPoint}>
              <Text style={styles.cityPointLabel}>TO</Text>
              <Text style={styles.cityPointValue} numberOfLines={1}>
                {trip.destination ?? "Not available"}
              </Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Ionicons name="calendar-outline" size={17} color="#00BC26" />
              <Text style={styles.summaryLabel}>Travel Dates</Text>
              <Text style={styles.summaryValue} numberOfLines={1}>
                {formatDateDisplay(trip.start_date)} →{" "}
                {formatDateDisplay(trip.end_date)}
              </Text>
            </View>
          </View>

          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Ionicons name="people-outline" size={17} color="#00BC26" />
              <Text style={styles.summaryLabel}>Members</Text>
              <Text style={styles.summaryValue}>
                {trip.members ?? "Not available"}
              </Text>
            </View>

            <View style={styles.summaryItem}>
              <Ionicons name="wallet-outline" size={17} color="#00BC26" />
              <Text style={styles.summaryLabel}>Budget</Text>
              <Text style={styles.summaryValue}>
                {trip.budget != null ? `₹${trip.budget}` : "Not available"}
              </Text>
            </View>
          </View>
        </View>

        {/* Transport */}
        <Text style={styles.sectionTitle}>Transport</Text>
        <Text style={styles.sectionSubtitle}>
          Choose how you will travel.
        </Text>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.modeTabs}
        >
          {TRANSPORT_MODES.map((mode) => {
            const selected = mode.id === activeMode;

            return (
              <Pressable
                key={mode.id}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => setActiveMode(mode.id)}
                style={({ pressed }) => [
                  styles.modeTab,
                  selected && styles.modeTabActive,
                  pressed && styles.modeTabPressed,
                ]}
              >
                <Ionicons
                  name={mode.icon}
                  size={18}
                  color={selected ? "#FFFFFF" : "#1C1C1E"}
                />
                <Text
                  style={[
                    styles.modeTabText,
                    selected && styles.modeTabTextActive,
                  ]}
                >
                  {mode.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {transport && (
          <View style={styles.selectedTransportCard}>
            <View style={styles.selectedTransportHeader}>
              <Ionicons
                name={
                  TRANSPORT_MODES.find((mode) => mode.id === transport.mode)
                    ?.icon ?? "train-outline"
                }
                size={19}
                color="#00BC26"
              />
              <Text style={styles.selectedTransportMode}>
{MODE_LABELS[(transport.mode ?? "train") as TransportMode]}
              </Text>
            </View>

            <Text style={styles.selectedTransportName} numberOfLines={1}>
              {transport.transport_name ?? "Not available"}
            </Text>

            {transport.transport_number && (
              <Text style={styles.selectedTransportNumber}>
                {transport.transport_number}
              </Text>
            )}

            <View style={styles.selectedTransportCities}>
              <Text style={styles.selectedTransportCity}>
                {transport.departure_city ?? "Not available"}
              </Text>
              <Ionicons name="arrow-forward" size={14} color="#B0B5BC" />
              <Text style={styles.selectedTransportCity}>
                {transport.arrival_city ?? "Not available"}
              </Text>
            </View>

            <View style={styles.selectedTransportMeta}>
              <Ionicons name="time-outline" size={15} color="#6B7280" />
              <Text style={styles.selectedTransportMetaText}>
                {transport.departure_time?.trim()
                  ? `Departs ${transport.departure_time}`
                  : "Not available"}
                {transport.arrival_time?.trim()
                  ? `  ·  Arrives ${transport.arrival_time}`
                  : ""}
              </Text>
            </View>

            <View style={styles.selectedTransportPriceRow}>
              <View>
                {transport.deal_price ? (
                  <View style={styles.priceRowInline}>
                    <Text style={styles.selectedTransportPrice}>
                      ₹{transport.deal_price}
                    </Text>
                    {transport.price && (
                      <Text style={styles.selectedTransportPriceOld}>
                        ₹{transport.price}
                      </Text>
                    )}
                  </View>
                ) : transport.price ? (
                  <Text style={styles.selectedTransportPrice}>
                    ₹{transport.price}
                  </Text>
                ) : (
                  <Text style={styles.selectedTransportPriceUnavailable}>
                    Price not available
                  </Text>
                )}
              </View>
            </View>

            {transport.availability?.trim() ? (
              <View style={styles.selectedTransportMeta}>
                <Ionicons name="information-circle-outline" size={15} color="#6B7280" />
                <Text style={styles.selectedTransportMetaText}>
                  {transport.availability}
                </Text>
              </View>
            ) : null}

            <View style={styles.selectedTransportActions}>
              <Pressable
                accessibilityRole="button"
                onPress={() => setTransportDetailsVisible(true)}
                style={({ pressed }) => [
                  styles.transportActionButton,
                  pressed && styles.transportActionButtonPressed,
                ]}
              >
                <Text style={styles.transportActionText}>View Details</Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                onPress={openTransportModal}
                style={({ pressed }) => [
                  styles.transportActionButton,
                  pressed && styles.transportActionButtonPressed,
                ]}
              >
                <Text style={styles.transportActionText}>Change</Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                disabled={transportBusy}
                onPress={handleRemoveTransport}
                style={({ pressed }) => [
                  styles.transportActionButton,
                  styles.transportActionDanger,
                  pressed && styles.transportActionButtonPressed,
                  transportBusy && styles.actionDisabled,
                ]}
              >
                {transportBusy ? (
                  <ActivityIndicator size="small" color="#B42318" />
                ) : (
                  <Text style={styles.transportActionDangerText}>Remove</Text>
                )}
              </Pressable>
            </View>
          </View>
        )}

        {activeMode === "train" && transportSearching ? (
          <View style={styles.comingSoonCard}>
            <ActivityIndicator size="small" color="#6B7280" />
            <Text style={styles.comingSoonTitle}>Searching trains...</Text>
            <Text style={styles.comingSoonText}>
              Checking the railway enquiry service for your route.
            </Text>
          </View>
        ) : transportAvailability?.available &&
          transportAvailability.results.length > 0 ? (
          transportAvailability.results.map((option, index) => (
            <View key={`option-${index}`} style={styles.optionCard}>
              <View style={styles.optionHeader}>
                <View style={styles.optionNameBlock}>
                  <Text style={styles.optionName} numberOfLines={1}>
                    {option.transport_name ?? "Not available"}
                  </Text>
                  <Text style={styles.optionNumber}>
                    {option.transport_number ?? "Not available"}
                  </Text>
                </View>
                <Text style={styles.optionPrice}>
                  {option.price != null ? `₹${option.price}` : "Not available"}
                </Text>
              </View>

              <View style={styles.optionCities}>
                <Text style={styles.optionCity}>
                  {option.departure_city ?? "Not available"}
                </Text>
                <Ionicons name="arrow-forward" size={14} color="#B0B5BC" />
                <Text style={styles.optionCity}>
                  {option.arrival_city ?? "Not available"}
                </Text>
              </View>

              <View style={styles.optionMetaRow}>
                <Text style={styles.optionMeta}>
                  Departs{" "}
                  {option.departure_time
                    ? `${option.departure_date ?? ""} ${option.departure_time}`.trim()
                    : "Not available"}
                </Text>
                <Text style={styles.optionMeta}>
                  Arrives {option.arrival_time ?? "Not available"}
                  {option.duration ? ` (${option.duration})` : ""}
                </Text>
              </View>
              {option.availability ? (
                <View style={styles.optionMetaRow}>
                  <Text style={styles.optionMeta}>
                    {option.availability}
                  </Text>
                </View>
              ) : null}

              <Pressable
                accessibilityRole="button"
                disabled={transportSaving}
                onPress={() => handleSelectTransportOption(option)}
                style={({ pressed }) => [
                  styles.optionButton,
                  pressed && styles.optionButtonPressed,
                ]}
              >
                <Text style={styles.optionButtonText}>
                  {transportSaving ? "Saving..." : "Select"}
                </Text>
              </Pressable>
            </View>
          ))
        ) : (
          <View style={styles.comingSoonCard}>
            <Ionicons
              name={activeMode === "train" ? "train-outline" : "flask-outline"}
              size={22}
              color="#6B7280"
            />
            <Text style={styles.comingSoonTitle}>
              {activeMode === "train"
                ? "No train options right now"
                : `${MODE_LABELS[activeMode]} options are coming soon`}
            </Text>
            <Text style={styles.comingSoonText}>
              {activeMode === "train"
                ? (transportAvailability?.message ??
                  "No live train results could be loaded.")
                : "Live bus, flight and cab APIs are not available yet, so schedules and prices cannot be shown here. You can still add your travel details manually below."}
            </Text>

            <Pressable
              accessibilityRole="button"
              onPress={openTransportModal}
              style={({ pressed }) => [
                styles.addTransportButton,
                pressed && styles.addTransportButtonPressed,
              ]}
            >
              <Ionicons name="add-circle-outline" size={19} color="#FFFFFF" />
              <Text style={styles.addTransportButtonText}>
                Add Transport Manually
              </Text>
            </Pressable>
          </View>
        )}

        {/* Stops */}
        <Text style={styles.sectionTitle}>Journey Stops</Text>
        <Text style={styles.sectionSubtitle}>
          Add cities along your current route — only stops on the way are
          allowed.
        </Text>

        <View style={styles.card}>
          <View style={styles.stopRow}>
            <View style={styles.stopBadgeStop}>
              <Ionicons name="navigate" size={15} color="#FFFFFF" />
            </View>
            <View style={styles.stopInfo}>
              <Text style={styles.stopLabel}>SOURCE</Text>
              <Text style={styles.stopValue} numberOfLines={1}>
                {trip.source_city ?? "Not available"}
              </Text>
            </View>
          </View>

          {stops.map((stop, index) => {
            const busy = busyStopId === stop.id;

            return (
              <View key={stop.id} style={styles.stopRow}>
                <View style={styles.stopConnector}>
                  <View style={styles.connectorLine} />
                  <View style={styles.stopBadgeStop}>
                    <Text style={styles.stopBadgeNumber}>{index + 1}</Text>
                  </View>
                  <View style={styles.connectorLine} />
                </View>

                <View style={styles.stopInfoCompact}>
                  <Text style={styles.stopLabel}>STOP {index + 1}</Text>
                  <Text style={styles.stopValue} numberOfLines={1}>
                    {stop.city}
                  </Text>
                </View>

                <View style={styles.stopActions}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Move ${stop.city} up`}
                    disabled={busy || index === 0}
                    onPress={() => handleMoveStop(index, -1)}
                    style={({ pressed }) => [
                      styles.stopActionButton,
                      (busy || index === 0) && styles.actionDisabled,
                      pressed && styles.stopActionPressed,
                    ]}
                  >
                    <Ionicons name="chevron-up" size={17} color="#1C1C1E" />
                  </Pressable>

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Move ${stop.city} down`}
                    disabled={busy || index === stops.length - 1}
                    onPress={() => handleMoveStop(index, 1)}
                    style={({ pressed }) => [
                      styles.stopActionButton,
                      (busy || index === stops.length - 1) &&
                        styles.actionDisabled,
                      pressed && styles.stopActionPressed,
                    ]}
                  >
                    <Ionicons name="chevron-down" size={17} color="#1C1C1E" />
                  </Pressable>

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${stop.city}`}
                    disabled={busy}
                    onPress={() => handleRemoveStop(stop.id)}
                    style={({ pressed }) => [
                      styles.stopActionButton,
                      styles.stopActionDanger,
                      busy && styles.actionDisabled,
                      pressed && styles.stopActionPressed,
                    ]}
                  >
                    {busy ? (
                      <ActivityIndicator size="small" color="#B42318" />
                    ) : (
                      <Ionicons name="trash-outline" size={17} color="#B42318" />
                    )}
                  </Pressable>
                </View>
              </View>
            );
          })}

          {busyStopId === "__add__" ? (
            <View style={styles.stopRow}>
              <View style={styles.stopConnector}>
                <View style={styles.connectorLine} />
                <View style={styles.stopBadgeStop}>
                  <ActivityIndicator size="small" color="#00BC26" />
                </View>
                <View style={styles.connectorLine} />
              </View>
              <View style={styles.stopInfoCompact}>
                <Text style={styles.stopLabel}>ADDING STOP</Text>
                <Text style={styles.stopValue}>Please wait...</Text>
              </View>
            </View>
          ) : null}

          <View style={styles.stopRow}>
            <View style={styles.stopBadgeStop}>
              <Ionicons name="flag" size={15} color="#FFFFFF" />
            </View>
            <View style={styles.stopInfo}>
              <Text style={styles.stopLabel}>DESTINATION</Text>
              <Text style={styles.stopValue} numberOfLines={1}>
                {trip.destination ?? "Not available"}
              </Text>
            </View>
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={() => setStopSheetVisible(true)}
            style={({ pressed }) => [
              styles.addStopButton,
              pressed && styles.addStopButtonPressed,
            ]}
          >
            <Ionicons name="add-circle-outline" size={18} color="#00BC26" />
            <Text style={styles.addStopButtonText}>Add an intermediate stop</Text>
          </Pressable>
        </View>

        {/* Route Preview */}
        <Text style={styles.sectionTitle}>Route Preview</Text>
        <Text style={styles.sectionSubtitle}>
          Your journey route from source to destination.
        </Text>

        <View style={styles.card}>
          <View style={styles.mapContainer}>
            {routePoints.length > 1 ? (
              <PlaceMap
                places={[]}
                initialRegion={region}
                journeyStops={routePoints}
                routeCoordinates={routeCoordinates ?? undefined}
              />
            ) : (
              <>
                {routeLoading ? (
                  <ActivityIndicator size="large" color="#00BC26" />
                ) : (
                  <Ionicons name="map-outline" size={40} color="#C7CBD1" />
                )}
                <Text style={styles.mapPlaceholderText}>
                  {routeLoading
                    ? "Updating route..."
                    : "Add source and destination to plan your route."}
                </Text>
              </>
            )}
          </View>

          {routeLoading && (
            <View style={styles.routeLoadingBar}>
              <ActivityIndicator size="small" color="#00BC26" />
              <Text style={styles.routeLoadingText}>
                Calculating the best route...
              </Text>
            </View>
          )}

          {routeError && !routeLoading && (
            <Text style={styles.routeErrorText}>
              Route could not be updated: {routeError}
            </Text>
          )}

          <View style={styles.routeStats}>
            <View style={styles.routeStat}>
              <Text style={styles.routeStatLabel}>DISTANCE</Text>
              <Text style={styles.routeStatValue}>
                {formatKilometers(route?.distanceKilometers ?? null)}
              </Text>
            </View>

            <View style={styles.routeStatDivider} />

            <View style={styles.routeStat}>
              <Text style={styles.routeStatLabel}>DURATION</Text>
              <Text style={styles.routeStatValue}>
                {formatMinutes(route?.durationMinutes ?? null)}
              </Text>
            </View>
          </View>
        </View>

        {/* Weather */}
        {weatherSummary && (
          <View style={styles.card}>
            <View style={styles.weatherRow}>
              <Ionicons name="partly-sunny-outline" size={22} color="#00BC26" />
              <View style={styles.weatherInfo}>
                <Text style={styles.weatherTitle}>
                  Weather in {trip.destination ?? "destination"}
                </Text>
                <Text style={styles.weatherSubtitle}>
                  {weatherSummary.condition} · {weatherSummary.temperature}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Journey Summary */}
        <Text style={styles.sectionTitle}>Journey Summary</Text>
        <Text style={styles.sectionSubtitle}>
          A quick overview of your planned journey.
        </Text>

        <View style={styles.card}>
          <View style={styles.summaryTotalRow}>
            <Ionicons name="time-outline" size={17} color="#00BC26" />
            <View style={styles.summaryTotalInfo}>
              <Text style={styles.summaryTotalLabel}>Total Duration</Text>
              <Text style={styles.summaryTotalValue}>
                {formatMinutes(route?.durationMinutes ?? null)}
              </Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.summaryTotalRow}>
            <Ionicons name="speedometer-outline" size={17} color="#00BC26" />
            <View style={styles.summaryTotalInfo}>
              <Text style={styles.summaryTotalLabel}>Total Distance</Text>
              <Text style={styles.summaryTotalValue}>
                {formatKilometers(route?.distanceKilometers ?? null)}
              </Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.summaryTotalRow}>
            <Ionicons name="wallet-outline" size={17} color="#00BC26" />
            <View style={styles.summaryTotalInfo}>
              <Text style={styles.summaryTotalLabel}>Estimated Budget</Text>
              <Text style={styles.summaryTotalValue}>
                {trip.budget != null
                  ? `₹${trip.budget}`
                  : "Not available"}
              </Text>
            </View>
          </View>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: blocked }}
          disabled={blocked}
          onPress={handleContinue}
          style={({ pressed }) => [
            styles.continueButton,
            pressed && styles.continueButtonPressed,
            blocked && styles.actionDisabled,
          ]}
        >
          <Text style={styles.continueButtonText}>Continue Journey</Text>
          <Ionicons name="arrow-forward-circle" size={22} color="#FFFFFF" />
        </Pressable>
      </ScrollView>

      {/* City search for intermediate stops */}
      <CitySearchSheet
        visible={stopSheetVisible}
        title="Add a stop along your route"
        onClose={() => setStopSheetVisible(false)}
        onSelect={handleAddStop}
        validate={validateCandidate}
      />

      {/* Manual transport entry */}
      <Modal
        animationType="slide"
        transparent
        visible={transportModalVisible}
        onRequestClose={() => {
          if (!transportSaving) {
            setTransportModalVisible(false);
          }
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Add Transport</Text>
                <Text style={styles.modalSubtitle}>
                  Enter your travel details manually.
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close transport form"
                disabled={transportSaving}
                onPress={() => setTransportModalVisible(false)}
                style={styles.modalCloseButton}
              >
                <Ionicons name="close" size={22} color="#1C1C1E" />
              </Pressable>
            </View>

            {draft && (
              <ScrollView
                style={styles.modalScroll}
                contentContainerStyle={styles.modalContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                <Text style={styles.fieldLabel}>Mode</Text>
                <View style={styles.modeChipsRow}>
                  {TRANSPORT_MODES.map((mode) => {
                    const selected = mode.id === draft.mode;

                    return (
                      <Pressable
                        key={mode.id}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        onPress={() =>
                          setDraft({ ...draft, mode: mode.id })
                        }
                        style={({ pressed }) => [
                          styles.modeChip,
                          selected && styles.modeChipActive,
                          pressed && styles.modeChipPressed,
                        ]}
                      >
                        <Ionicons
                          name={mode.icon}
                          size={16}
                          color={selected ? "#FFFFFF" : "#1C1C1E"}
                        />
                        <Text
                          style={[
                            styles.modeChipText,
                            selected && styles.modeChipTextActive,
                          ]}
                        >
                          {mode.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <Text style={styles.fieldLabel}>Transport Number</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g. 12002"
                  placeholderTextColor="#9CA1A9"
                  value={draft.transport_number}
                  onChangeText={handleTransportNumberChange}
                  autoCapitalize="characters"
                  editable={!transportSaving}
                />
                <Text style={styles.fieldHint}>
                  Tip: 4-5 digits suggests a train, a 2-3 letter prefix a
                  flight, and a plate number a bus.
                </Text>

                <Text style={styles.fieldLabel}>Transport Name</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g. Bhopal Shatabdi Express"
                  placeholderTextColor="#9CA1A9"
                  value={draft.transport_name}
                  onChangeText={(text) =>
                    setDraft({ ...draft, transport_name: text })
                  }
                  editable={!transportSaving}
                />

                <View style={styles.fieldRow}>
                  <View style={styles.fieldHalf}>
                    <Text style={styles.fieldLabel}>Departure City</Text>
                    <TextInput
                      style={styles.textInput}
                      value={draft.departure_city}
                      onChangeText={(text) =>
                        setDraft({ ...draft, departure_city: text })
                      }
                      placeholder="City"
                      placeholderTextColor="#9CA1A9"
                      editable={!transportSaving}
                    />
                  </View>
                  <View style={styles.fieldHalf}>
                    <Text style={styles.fieldLabel}>Arrival City</Text>
                    <TextInput
                      style={styles.textInput}
                      value={draft.arrival_city}
                      onChangeText={(text) =>
                        setDraft({ ...draft, arrival_city: text })
                      }
                      placeholder="City"
                      placeholderTextColor="#9CA1A9"
                      editable={!transportSaving}
                    />
                  </View>
                </View>

                <Text style={styles.fieldLabel}>Departure Date</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor="#9CA1A9"
                  value={draft.departure_date}
                  onChangeText={(text) =>
                    setDraft({ ...draft, departure_date: text })
                  }
                  editable={!transportSaving}
                />

                <View style={styles.fieldRow}>
                  <View style={styles.fieldHalf}>
                    <Text style={styles.fieldLabel}>Departure Time</Text>
                    <TextInput
                      style={styles.textInput}
                      placeholder="e.g. 06:00"
                      placeholderTextColor="#9CA1A9"
                      value={draft.departure_time}
                      onChangeText={(text) =>
                        setDraft({ ...draft, departure_time: text })
                      }
                      editable={!transportSaving}
                    />
                  </View>
                  <View style={styles.fieldHalf}>
                    <Text style={styles.fieldLabel}>Arrival Time</Text>
                    <TextInput
                      style={styles.textInput}
                      placeholder="e.g. 13:45"
                      placeholderTextColor="#9CA1A9"
                      value={draft.arrival_time}
                      onChangeText={(text) =>
                        setDraft({ ...draft, arrival_time: text })
                      }
                      editable={!transportSaving}
                    />
                  </View>
                </View>

                <Text style={styles.fieldLabel}>Duration</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g. 7h 45m"
                  placeholderTextColor="#9CA1A9"
                  value={draft.duration}
                  onChangeText={(text) =>
                    setDraft({ ...draft, duration: text })
                  }
                  editable={!transportSaving}
                />

                <View style={styles.fieldRow}>
                  <View style={styles.fieldHalf}>
                    <Text style={styles.fieldLabel}>Price</Text>
                    <TextInput
                      style={styles.textInput}
                      placeholder="e.g. 1250"
                      placeholderTextColor="#9CA1A9"
                      value={draft.price}
                      onChangeText={(text) =>
                        setDraft({ ...draft, price: text })
                      }
                      keyboardType="numeric"
                      editable={!transportSaving}
                    />
                  </View>
                  <View style={styles.fieldHalf}>
                    <Text style={styles.fieldLabel}>Deal Price</Text>
                    <TextInput
                      style={styles.textInput}
                      placeholder="e.g. 1125"
                      placeholderTextColor="#9CA1A9"
                      value={draft.deal_price}
                      onChangeText={(text) =>
                        setDraft({ ...draft, deal_price: text })
                      }
                      keyboardType="numeric"
                      editable={!transportSaving}
                    />
                  </View>
                </View>

                <Text style={styles.fieldLabel}>Availability</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g. 42 seats available"
                  placeholderTextColor="#9CA1A9"
                  value={draft.availability}
                  onChangeText={(text) =>
                    setDraft({ ...draft, availability: text })
                  }
                  editable={!transportSaving}
                />

                <Text style={styles.fieldLabel}>Route</Text>
                <TextInput
                  style={[styles.textInput, styles.textInputMultiline]}
                  placeholder="e.g. Bhopal – Jhansi – Agra – New Delhi"
                  placeholderTextColor="#9CA1A9"
                  value={draft.route}
                  onChangeText={(text) =>
                    setDraft({ ...draft, route: text })
                  }
                  multiline
                  numberOfLines={3}
                  editable={!transportSaving}
                />

                {transportError && (
                  <Text style={styles.formErrorText}>
                    {transportError}
                  </Text>
                )}

                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{
                    disabled: transportSaving,
                  }}
                  disabled={transportSaving}
                  onPress={handleSaveTransport}
                  style={({ pressed }) => [
                    styles.saveTransportButton,
                    pressed && styles.saveTransportButtonPressed,
                    transportSaving && styles.actionDisabled,
                  ]}
                >
                  {transportSaving ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.saveTransportButtonText}>
                      Save Transport
                    </Text>
                  )}
                </Pressable>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Transport details */}
      <Modal
        animationType="fade"
        transparent
        visible={transportDetailsVisible}
        onRequestClose={() => setTransportDetailsVisible(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setTransportDetailsVisible(false)}
        >
          <Pressable
            style={styles.detailsSheet}
            onPress={() => undefined}
          >
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Transport Details</Text>
                <Text style={styles.modalSubtitle}>
                  {MODE_LABELS[(transport?.mode ?? "train") as TransportMode]}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close details"
                onPress={() => setTransportDetailsVisible(false)}
                style={styles.modalCloseButton}
              >
                <Ionicons name="close" size={22} color="#1C1C1E" />
              </Pressable>
            </View>

            {transport && (
              <View style={styles.detailsList}>
                <DetailRow
                  label="Mode"
                  value={MODE_LABELS[(transport.mode ?? "train") as TransportMode]}
                />
                <DetailRow
                  label="Transport Name"
                  value={transport.transport_name}
                />
                <DetailRow
                  label="Transport Number"
                  value={transport.transport_number}
                />
                <DetailRow
                  label="Departure City"
                  value={transport.departure_city}
                />
                <DetailRow
                  label="Arrival City"
                  value={transport.arrival_city}
                />
                <DetailRow
                  label="Departure Date"
                  value={transport.departure_date}
                />
                <DetailRow
                  label="Departure Time"
                  value={transport.departure_time}
                />
                <DetailRow
                  label="Arrival Date"
                  value={transport.arrival_date}
                />
                <DetailRow
                  label="Arrival Time"
                  value={transport.arrival_time}
                />
                <DetailRow label="Duration" value={transport.duration} />
                <DetailRow label="Price" value={transport.price} />
                <DetailRow
                  label="Deal Price"
                  value={transport.deal_price}
                />
                <DetailRow
                  label="Availability"
                  value={transport.availability}
                />
                <DetailRow label="Route" value={transport.route} />
              </View>
            )}

            <Pressable
              accessibilityRole="button"
              onPress={() => setTransportDetailsVisible(false)}
              style={({ pressed }) => [
                styles.saveTransportButton,
                pressed && styles.saveTransportButtonPressed,
              ]}
            >
              <Text style={styles.saveTransportButtonText}>Close</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function DetailRow({ label, value }: { label: string; value: string | null }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text
        style={[
          styles.detailValue,
          value?.trim() ? null : styles.detailValueUnavailable,
        ]}
      >
        {value?.trim() ? value : "Not available"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#F7F7F9",
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 12,
  },
  stateTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#1C1C1E",
    marginTop: 4,
    textAlign: "center",
  },
  stateText: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 20,
  },
  flash: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 14,
  },
  flashSuccess: {
    backgroundColor: "#E7F9EB",
  },
  flashError: {
    backgroundColor: "#FDECEA",
  },
  flashText: {
    fontSize: 13,
    fontWeight: "600",
    flex: 1,
  },
  flashTextSuccess: {
    color: "#08751F",
  },
  flashTextError: {
    color: "#B42318",
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#F0F1F3",
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#1C1C1E",
    marginTop: 6,
    marginBottom: 2,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: "#6B7280",
    marginBottom: 12,
  },
  primaryButton: {
    marginTop: 16,
    backgroundColor: "#00BC26",
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 28,
  },
  primaryButtonPressed: {
    opacity: 0.9,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
  divider: {
    height: 1,
    backgroundColor: "#F0F1F3",
    marginVertical: 12,
  },
  cityLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  cityPoint: {
    flex: 1,
  },
  cityPointLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#9CA1A9",
    letterSpacing: 1,
    marginBottom: 3,
  },
  cityPointValue: {
    fontSize: 18,
    fontWeight: "800",
    color: "#1C1C1E",
  },
  cityArrow: {
    alignItems: "center",
  },
  summaryRow: {
    flexDirection: "row",
    gap: 12,
  },
  summaryItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
  },
  summaryLabel: {
    fontSize: 13,
    color: "#6B7280",
    flexBasis: "100%",
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1C1C1E",
  },
  modeTabs: {
    gap: 8,
    paddingBottom: 2,
  },
  modeTab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  modeTabActive: {
    backgroundColor: "#00BC26",
    borderColor: "#00BC26",
  },
  modeTabPressed: {
    opacity: 0.85,
  },
  modeTabText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1C1C1E",
  },
  modeTabTextActive: {
    color: "#FFFFFF",
  },
  comingSoonCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#F0F1F3",
    borderStyle: "dashed",
    padding: 18,
    marginBottom: 16,
    alignItems: "center",
    gap: 8,
  },
  comingSoonTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#1C1C1E",
    textAlign: "center",
  },
  comingSoonText: {
    fontSize: 13,
    color: "#6B7280",
    lineHeight: 19,
    textAlign: "center",
    marginBottom: 2,
  },
  addTransportButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#00BC26",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 22,
    marginTop: 4,
  },
  addTransportButtonPressed: {
    opacity: 0.9,
  },
  addTransportButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  selectedTransportCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#F0F1F3",
    padding: 16,
    marginBottom: 16,
  },
  selectedTransportHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginBottom: 8,
  },
  selectedTransportMode: {
    fontSize: 12,
    fontWeight: "800",
    color: "#00BC26",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  selectedTransportName: {
    fontSize: 18,
    fontWeight: "800",
    color: "#1C1C1E",
  },
  selectedTransportNumber: {
    fontSize: 13,
    fontWeight: "600",
    color: "#6B7280",
    marginTop: 2,
  },
  selectedTransportCities: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
  },
  selectedTransportCity: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1C1C1E",
    flexShrink: 1,
  },
  selectedTransportMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
  },
  selectedTransportMetaText: {
    fontSize: 13,
    color: "#6B7280",
    flex: 1,
  },
  selectedTransportPriceRow: {
    marginTop: 12,
  },
  priceRowInline: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  selectedTransportPrice: {
    fontSize: 19,
    fontWeight: "800",
    color: "#00BC26",
  },
  selectedTransportPriceOld: {
    fontSize: 14,
    color: "#9CA1A9",
    textDecorationLine: "line-through",
  },
  selectedTransportPriceUnavailable: {
    fontSize: 14,
    color: "#6B7280",
  },
  selectedTransportActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
    marginTop: 14,
    borderTopWidth: 1,
    borderTopColor: "#F0F1F3",
    paddingTop: 12,
  },
  transportActionButton: {
    flex: 1,
    alignItems: "center",
    borderRadius: 10,
    paddingVertical: 10,
  },
  transportActionButtonPressed: {
    backgroundColor: "#F7F7F9",
  },
  transportActionText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#00BC26",
  },
  transportActionDanger: {
    backgroundColor: "#FDECEA",
  },
  transportActionDangerText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#B42318",
  },
  actionDisabled: {
    opacity: 0.55,
  },
  optionCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#F0F1F3",
    padding: 16,
    marginBottom: 12,
  },
  optionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  optionNameBlock: {
    flex: 1,
  },
  optionName: {
    fontSize: 15,
    fontWeight: "800",
    color: "#1C1C1E",
  },
  optionNumber: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6B7280",
    marginTop: 2,
  },
  optionPrice: {
    fontSize: 17,
    fontWeight: "800",
    color: "#00BC26",
  },
  optionCities: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
  },
  optionCity: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1C1C1E",
    flexShrink: 1,
  },
  optionMetaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
    marginTop: 8,
  },
  optionMeta: {
    fontSize: 12,
    color: "#6B7280",
    flexShrink: 1,
  },
  optionButton: {
    marginTop: 12,
    borderRadius: 10,
    backgroundColor: "#E7F9EB",
    paddingVertical: 10,
    alignItems: "center",
  },
  optionButtonPressed: {
    opacity: 0.85,
  },
  optionButtonText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#08751F",
  },
  stopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 8,
  },
  stopConnector: {
    flexDirection: "row",
    alignItems: "center",
  },
  connectorLine: {
    width: 16,
    height: 1,
    backgroundColor: "#DDE1E6",
  },
  stopBadgeStop: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#00BC26",
    alignItems: "center",
    justifyContent: "center",
  },
  stopBadgeNumber: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
  },
  stopInfo: {
    flex: 1,
  },
  stopInfoCompact: {
    flex: 1,
  },
  stopLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#9CA1A9",
    letterSpacing: 1,
  },
  stopValue: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1C1C1E",
    marginTop: 2,
  },
  stopActions: {
    flexDirection: "row",
    gap: 6,
  },
  stopActionButton: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  stopActionDanger: {
    borderColor: "#FDECEA",
    backgroundColor: "#FDECEA",
  },
  stopActionPressed: {
    opacity: 0.8,
  },
  addStopButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    marginTop: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#00BC26",
    borderStyle: "dashed",
    paddingVertical: 13,
  },
  addStopButtonPressed: {
    backgroundColor: "#E7F9EB",
  },
  addStopButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#00BC26",
  },
  mapContainer: {
    height: 240,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: "#EDEFF2",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  mapPlaceholderText: {
    fontSize: 13,
    color: "#6B7280",
    textAlign: "center",
    paddingHorizontal: 24,
  },
  routeLoadingBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 12,
  },
  routeLoadingText: {
    fontSize: 13,
    color: "#6B7280",
  },
  routeErrorText: {
    fontSize: 13,
    color: "#B42318",
    marginTop: 12,
    lineHeight: 18,
  },
  routeStats: {
    flexDirection: "row",
    marginTop: 14,
    borderTopWidth: 1,
    borderTopColor: "#F0F1F3",
    paddingTop: 14,
  },
  routeStat: {
    flex: 1,
  },
  routeStatDivider: {
    width: 1,
    backgroundColor: "#F0F1F3",
    marginHorizontal: 16,
  },
  routeStatLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#9CA1A9",
    letterSpacing: 1,
  },
  routeStatValue: {
    fontSize: 16,
    fontWeight: "800",
    color: "#1C1C1E",
    marginTop: 4,
  },
  weatherRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  weatherInfo: {
    flex: 1,
  },
  weatherTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#1C1C1E",
  },
  weatherSubtitle: {
    fontSize: 13,
    color: "#6B7280",
    marginTop: 2,
  },
  summaryTotalRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  summaryTotalInfo: {
    flex: 1,
  },
  summaryTotalLabel: {
    fontSize: 13,
    color: "#6B7280",
  },
  summaryTotalValue: {
    fontSize: 15,
    fontWeight: "800",
    color: "#1C1C1E",
    marginTop: 2,
  },
  continueButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#00BC26",
    borderRadius: 16,
    paddingVertical: 16,
    marginTop: 4,
  },
  continueButtonPressed: {
    opacity: 0.9,
  },
  continueButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(17, 24, 39, 0.55)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "90%",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F1F3",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#1C1C1E",
  },
  modalSubtitle: {
    fontSize: 13,
    color: "#6B7280",
    marginTop: 2,
  },
  modalCloseButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#F0F1F3",
    alignItems: "center",
    justifyContent: "center",
  },
  modalScroll: {
    maxHeight: "100%",
  },
  modalContent: {
    padding: 20,
    paddingBottom: 40,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1C1C1E",
    marginTop: 14,
    marginBottom: 6,
  },
  fieldHint: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 6,
    lineHeight: 17,
  },
  textInput: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: "#1C1C1E",
    backgroundColor: "#FFFFFF",
  },
  textInputMultiline: {
    textAlignVertical: "top",
    minHeight: 76,
  },
  fieldRow: {
    flexDirection: "row",
    gap: 12,
  },
  fieldHalf: {
    flex: 1,
  },
  modeChipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  modeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  modeChipActive: {
    backgroundColor: "#00BC26",
    borderColor: "#00BC26",
  },
  modeChipPressed: {
    opacity: 0.85,
  },
  modeChipText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#1C1C1E",
  },
  modeChipTextActive: {
    color: "#FFFFFF",
  },
  formErrorText: {
    fontSize: 13,
    color: "#B42318",
    marginTop: 14,
    fontWeight: "600",
  },
  saveTransportButton: {
    backgroundColor: "#00BC26",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 20,
    minHeight: 48,
    flexDirection: "row",
    gap: 8,
  },
  saveTransportButtonPressed: {
    opacity: 0.9,
  },
  saveTransportButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
  },
  detailsSheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 32,
    maxHeight: "90%",
  },
  detailsList: {
    paddingHorizontal: 20,
    paddingVertical: 6,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F6F7F9",
  },
  detailLabel: {
    fontSize: 13,
    color: "#6B7280",
  },
  detailValue: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1C1C1E",
    flex: 1,
    textAlign: "right",
  },
  detailValueUnavailable: {
    color: "#9CA1A9",
    fontWeight: "600",
  },
});