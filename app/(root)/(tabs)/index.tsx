import { useUser } from "@clerk/expo";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
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

import { useSupabase } from "../../../hook/usesupabase";
import {
  dayDifference,
  daysUntil,
  formatDateRange,
  todayIso,
} from "../../../lib/tripDates";
import {
  listUserTrips,
  toTripSummary,
  type TripSummaryCard,
} from "../../../services/liveTripsApi";
import { searchLocation } from "../../../services/locationApi";
import { getJourneyRoute } from "../../../services/routeApi";
import { searchTransportOptions } from "../../../services/transportApi";
import { createTrip } from "../../../services/tripsApi";
import { getWeather } from "../../../services/weatherApi";
import { useLocationStore } from "../../../store/locationStore";
import { useUserStore } from "../../../store/userStore";

const THEME = {
  screenBg: "#F0FAF2",
  card: "#FFFFFF",
  cardBorder: "#E3EFE6",
  radius: 16,
  borderWidth: 1,
  textPrimary: "#14231A",
  textSecondary: "#5B6B60",
  accent: "#00BC26",
  accentTint: "#E3F6E8",
  accentText: "#0B6B24",
  danger: "#B3261E",
};

interface CitySelection {
  id: string;
  name: string;
  formatted: string;
  latitude: number;
  longitude: number;
}

type CityField = "from" | "to";
type DateField = "start" | "end";

const STATIC_CITIES: Record<string, CitySelection> = {
  Bhopal: {
    id: "static-bhopal",
    name: "Bhopal",
    formatted: "Bhopal, Madhya Pradesh, India",
    latitude: 23.2599,
    longitude: 77.4126,
  },
  Indore: {
    id: "static-indore",
    name: "Indore",
    formatted: "Indore, Madhya Pradesh, India",
    latitude: 22.7196,
    longitude: 75.8577,
  },
  Delhi: {
    id: "static-delhi",
    name: "Delhi",
    formatted: "New Delhi, Delhi, India",
    latitude: 28.6139,
    longitude: 77.209,
  },
  Goa: {
    id: "static-goa",
    name: "Goa",
    formatted: "Panaji, Goa, India",
    latitude: 15.4909,
    longitude: 73.8278,
  },
  Manali: {
    id: "static-manali",
    name: "Manali",
    formatted: "Manali, Himachal Pradesh, India",
    latitude: 32.2396,
    longitude: 77.1887,
  },
};

const POPULAR_DESTINATIONS = ["Indore", "Delhi", "Goa", "Manali"];

interface LivePreviewData {
  distance: string;
  duration: string;
  weather: string;
  trains: string;
}

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

const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function isoDate(year: number, month: number, day: number): string {
  return `${year}-${pad2(month + 1)}-${pad2(day)}`;
}

function formatDateDisplay(iso: string | null): string {
  if (!iso) {
    return "";
  }

  const parts = iso.split("-").map(Number);

  if (parts.length !== 3) {
    return iso;
  }

  const [year, month, day] = parts;

  return `${day} ${MONTH_LABELS[month - 1].slice(0, 3)} ${year}`;
}

function weatherCodeToLabel(code: number | null): string {
  if (code === null || code === undefined) return "Clear";
  if (code === 0) return "Clear";
  if (code === 1 || code === 2 || code === 3) return "Partly cloudy";
  if (code === 45 || code === 48) return "Foggy";
  if (code >= 51 && code <= 67) return "Rain";
  if (code >= 71 && code <= 77) return "Snow";
  if (code >= 80 && code <= 82) return "Showers";
  if (code >= 95) return "Thunderstorm";
  return "Clear";
}

function formatIndianNumber(value: string): string {
  const digits = value.replace(/[^0-9]/g, "");
  if (!digits) return "";
  const num = Number(digits);
  return Number.isFinite(num) ? num.toLocaleString("en-IN") : digits;
}

interface DatePickerModalProps {
  visible: boolean;
  title: string;
  selected: string | null;
  minDate: string | null;
  onSelect: (iso: string) => void;
  onClose: () => void;
}

function DatePickerModal({
  visible,
  title,
  selected,
  minDate,
  onSelect,
  onClose,
}: DatePickerModalProps) {
  const today = new Date();

  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  useEffect(() => {
    if (!visible) {
      return;
    }

    if (selected) {
      const parts = selected.split("-").map(Number);

      if (parts.length === 3) {
        setViewYear(parts[0]);
        setViewMonth(parts[1] - 1);
        return;
      }
    }

    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth());
  }, [visible, selected]);

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstWeekday = new Date(viewYear, viewMonth, 1).getDay();

  const cells: (number | null)[] = [];

  for (let i = 0; i < firstWeekday; i++) {
    cells.push(null);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    cells.push(day);
  }

  const rows: (number | null)[][] = [];

  for (let i = 0; i < cells.length; i += 7) {
    rows.push(cells.slice(i, i + 7));
  }

  function selectDay(day: number) {
    onSelect(isoDate(viewYear, viewMonth, day));
  }

  function showPrevMonth() {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(viewYear - 1);
    } else {
      setViewMonth(viewMonth - 1);
    }
  }

  function showNextMonth() {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(viewYear + 1);
    } else {
      setViewMonth(viewMonth + 1);
    }
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.dateSheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{title}</Text>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close date picker"
              hitSlop={10}
              onPress={onClose}
              style={({ pressed }) => [
                styles.sheetCloseButton,
                pressed && styles.sheetClosePressed,
              ]}
            >
              <Ionicons name="close" size={20} color={THEME.textPrimary} />
            </Pressable>
          </View>

          <View style={styles.monthNav}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Previous month"
              hitSlop={8}
              onPress={showPrevMonth}
              style={({ pressed }) => [
                styles.monthNavButton,
                pressed && styles.monthNavButtonPressed,
              ]}
            >
              <Ionicons name="chevron-back" size={20} color={THEME.textPrimary} />
            </Pressable>

            <Text style={styles.monthLabel}>
              {MONTH_LABELS[viewMonth]} {viewYear}
            </Text>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Next month"
              hitSlop={8}
              onPress={showNextMonth}
              style={({ pressed }) => [
                styles.monthNavButton,
                pressed && styles.monthNavButtonPressed,
              ]}
            >
              <Ionicons name="chevron-forward" size={20} color={THEME.textPrimary} />
            </Pressable>
          </View>

          <View style={styles.weekdayRow}>
            {WEEKDAY_LABELS.map((label, index) => (
              <Text
                key={`${label}-${index}`}
                style={styles.weekdayLabel}
              >
                {label}
              </Text>
            ))}
          </View>

          <View style={styles.calendarGrid}>
            {rows.map((row, rowIndex) => (
              <View key={`row-${rowIndex}`} style={styles.calendarRow}>
                {row.map((day, index) => {
                  if (day === null) {
                    return (
                      <View
                        key={`empty-${rowIndex}-${index}`}
                        style={styles.dayCell}
                      />
                    );
                  }

                  const iso = isoDate(viewYear, viewMonth, day);
                  const disabled = Boolean(minDate && iso < minDate);
                  const isSelected = iso === selected;

                  return (
                    <Pressable
                      key={iso}
                      accessibilityRole="button"
                      accessibilityState={{
                        selected: isSelected,
                        disabled,
                      }}
                      disabled={disabled}
                      onPress={() => selectDay(day)}
                      style={({ pressed }) => [
                        styles.dayCell,
                        isSelected && styles.dayCellSelected,
                        pressed &&
                          !disabled &&
                          styles.dayCellPressed,
                      ]}
                    >
                      <Text
                        style={[
                          styles.dayText,
                          isSelected && styles.dayTextSelected,
                          disabled && styles.dayTextDisabled,
                        ]}
                      >
                        {day}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            style={({ pressed }) => [
              styles.dateCancelButton,
              pressed && styles.dateCancelButtonPressed,
            ]}
          >
            <Text style={styles.dateCancelText}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

export default function HomeScreen() {
  const { user } = useUser();
  const supabase = useSupabase();
  const displayName = user?.firstName || user?.fullName || "User";

  // TODO: userStore currently contains no profile avatar field; falling back to Clerk user.imageUrl
  useUserStore();
  const { selectedLocation } = useLocationStore();
  const currentCityName = selectedLocation?.name || "Bhopal";

  const [sourceCity, setSourceCity] = useState<CitySelection | null>(null);
  const [destination, setDestination] = useState<CitySelection | null>(null);
  const [startDate, setStartDate] = useState<string | null>(null);
  const [endDate, setEndDate] = useState<string | null>(null);
  const [rawBudget, setRawBudget] = useState("");
  const [members, setMembers] = useState(1);
  const [formError, setFormError] = useState<string | null>(null);
  const [savingTrip, setSavingTrip] = useState(false);

  // Upcoming trip state
  const [upcomingTrip, setUpcomingTrip] = useState<TripSummaryCard | null>(null);
  const [upcomingLoading, setUpcomingLoading] = useState(true);

  // Live preview state
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewData, setPreviewData] = useState<LivePreviewData | null>(null);
  const previewCacheRef = useRef<Map<string, LivePreviewData>>(new Map());
  const previewReqIdRef = useRef(0);
  const previewAbortRef = useRef<AbortController | null>(null);

  // City modal state
  const [cityField, setCityField] = useState<CityField | null>(null);
  const [citySearch, setCitySearch] = useState("");
  const [cityResults, setCityResults] = useState<CitySelection[]>([]);
  const [cityLoading, setCityLoading] = useState(false);
  const cityRequestIdRef = useRef(0);
  const cityAbortRef = useRef<AbortController | null>(null);

  const [dateField, setDateField] = useState<DateField | null>(null);

  // Load upcoming trip
  useEffect(() => {
    let isMounted = true;

    async function loadUpcoming() {
      if (!user?.id) {
        setUpcomingLoading(false);
        return;
      }

      try {
        const trips = await listUserTrips(supabase, user.id);
        if (!isMounted) return;

        const today = todayIso();
        const futureTrips = trips
          .filter((t) => t.start_date && t.start_date >= today)
          .sort((a, b) => (a.start_date! > b.start_date! ? 1 : -1));

        if (futureTrips.length > 0) {
          setUpcomingTrip(toTripSummary(futureTrips[0]));
        } else {
          setUpcomingTrip(null);
        }
      } catch (err) {
        if (isMounted) setUpcomingTrip(null);
      } finally {
        if (isMounted) setUpcomingLoading(false);
      }
    }

    loadUpcoming();

    return () => {
      isMounted = false;
    };
  }, [user?.id, supabase]);

  // City autocomplete search
  useEffect(() => {
    const query = citySearch.trim();

    if (query.length < 2) {
      setCityResults([]);
      setCityLoading(false);
      cityAbortRef.current?.abort();
      cityAbortRef.current = null;
      return;
    }

    const timer = setTimeout(async () => {
      cityAbortRef.current?.abort();
      const controller = new AbortController();
      cityAbortRef.current = controller;
      const requestId = ++cityRequestIdRef.current;

      try {
        setCityLoading(true);
        const results = await searchLocation(query, controller.signal);

        if (
          requestId !== cityRequestIdRef.current ||
          controller.signal.aborted
        ) {
          return;
        }

        setCityResults(results);
      } catch (error: unknown) {
        if (
          error instanceof Error &&
          error.name === "AbortError"
        ) {
          return;
        }

        if (requestId === cityRequestIdRef.current) {
          setCityResults([]);
        }
      } finally {
        if (
          requestId === cityRequestIdRef.current &&
          !controller.signal.aborted
        ) {
          setCityLoading(false);
        }
      }
    }, 400);

    return () => {
      clearTimeout(timer);
    };
  }, [citySearch]);

  // Live preview fetch with parallel Promise.allSettled
  useEffect(() => {
    if (!sourceCity || !destination) {
      setPreviewData(null);
      setPreviewLoading(false);
      previewAbortRef.current?.abort();
      return;
    }

    const cacheKey = `${sourceCity.name}-${destination.name}-${startDate || "none"}`;
    if (previewCacheRef.current.has(cacheKey)) {
      setPreviewData(previewCacheRef.current.get(cacheKey)!);
      setPreviewLoading(false);
      return;
    }

    setPreviewLoading(true);

    const timer = setTimeout(async () => {
      previewAbortRef.current?.abort();
      const controller = new AbortController();
      previewAbortRef.current = controller;
      const requestId = ++previewReqIdRef.current;

      try {
        const [routeRes, weatherRes, trainRes] = await Promise.allSettled([
          getJourneyRoute(
            [
              { latitude: sourceCity.latitude, longitude: sourceCity.longitude },
              { latitude: destination.latitude, longitude: destination.longitude },
            ],
            controller.signal
          ),
          getWeather(destination.latitude, destination.longitude),
          searchTransportOptions(
            "train",
            {
              source: sourceCity.name,
              destination: destination.name,
              date: startDate,
            },
            controller.signal
          ),
        ]);

        if (
          requestId !== previewReqIdRef.current ||
          controller.signal.aborted
        ) {
          return;
        }

        let distance = "—";
        let duration = "—";
        let weather = "—";
        let trains = "—";

        if (routeRes.status === "fulfilled" && routeRes.value) {
          const km = routeRes.value.distanceKilometers;
          if (km !== null && Number.isFinite(km)) {
            distance = `${Math.round(km)} km`;
          }

          const mins = routeRes.value.durationMinutes;
          if (mins !== null && Number.isFinite(mins)) {
            const hours = Math.floor(mins / 60);
            const remMins = Math.round(mins % 60);
            duration = hours > 0 ? `${hours}h ${remMins}m` : `${remMins}m`;
          }
        }

        if (weatherRes.status === "fulfilled" && weatherRes.value?.current) {
          const temp = weatherRes.value.current.temperature;
          const condition = weatherCodeToLabel(
            weatherRes.value.current.weatherCode
          );
          if (temp !== null && Number.isFinite(temp)) {
            weather = `${Math.round(temp)}°C · ${condition}`;
          }
        }

        if (trainRes.status === "fulfilled" && trainRes.value) {
          const count = trainRes.value.results?.length ?? 0;
          if (count === 0) {
            trains = "No direct trains";
          } else if (count === 1) {
            trains = "1 direct train";
          } else {
            trains = `${count} direct trains`;
          }
        }

        const data: LivePreviewData = {
          distance,
          duration,
          weather,
          trains,
        };

        previewCacheRef.current.set(cacheKey, data);
        setPreviewData(data);
      } catch {
        // Fallback gracefully
      } finally {
        if (
          requestId === previewReqIdRef.current &&
          !controller.signal.aborted
        ) {
          setPreviewLoading(false);
        }
      }
    }, 400);

    return () => {
      clearTimeout(timer);
    };
  }, [sourceCity, destination, startDate]);

  function openCityPicker(field: CityField) {
    setFormError(null);
    setCityField(field);
  }

  function closeCityPicker() {
    setCityField(null);
    setCitySearch("");
    setCityResults([]);
    setCityLoading(false);
    cityAbortRef.current?.abort();
  }

  function selectCity(location: CitySelection) {
    if (cityField === "from") {
      setSourceCity(location);
    } else if (cityField === "to") {
      setDestination(location);
    }
    setFormError(null);
    closeCityPicker();
  }

  function handleSwapCities() {
    const temp = sourceCity;
    setSourceCity(destination);
    setDestination(temp);
    setFormError(null);
  }

  function openDatePicker(field: DateField) {
    setFormError(null);
    setDateField(field);
  }

  function handleDateSelect(iso: string) {
    if (dateField === "start") {
      setStartDate(iso);
      if (endDate && iso > endDate) {
        setEndDate(null);
      }
    } else if (dateField === "end") {
      setEndDate(iso);
    }
    setDateField(null);
  }

  function handleBudgetChange(text: string) {
    const raw = text.replace(/[^0-9]/g, "");
    setRawBudget(raw);
  }

  function updateMembers(delta: number) {
    setMembers((current) => Math.min(10, Math.max(1, current + delta)));
  }

  function handleSelectPopular(destName: string) {
    const sourceObj = selectedLocation || STATIC_CITIES["Bhopal"];
    const destObj = STATIC_CITIES[destName] || {
      id: `static-${destName.toLowerCase()}`,
      name: destName,
      formatted: `${destName}, India`,
      latitude: 23.2599,
      longitude: 77.4126,
    };
    setSourceCity(sourceObj);
    setDestination(destObj);
    setFormError(null);
  }

  async function handleSearchJourney() {
    setFormError(null);

    if (!sourceCity) {
      setFormError("Enter a source city");
      return;
    }

    if (!destination) {
      setFormError("Select a destination");
      return;
    }

    if (!startDate) {
      setFormError("Select a start date");
      return;
    }

    if (!endDate) {
      setFormError("Select an end date");
      return;
    }

    if (endDate < startDate) {
      setFormError("End date is before start date");
      return;
    }

    if (!user?.id) {
      setFormError("Sign in to plan a journey");
      return;
    }

    setSavingTrip(true);
    setFormError(null);

    try {
      const budgetNumber = rawBudget.trim() ? Number(rawBudget) : NaN;
      const parsedBudget = Number.isFinite(budgetNumber) ? budgetNumber : null;

      const trip = await createTrip(supabase, {
        created_by: user.id,
        title: `${sourceCity.name} to ${destination.name}`,
        source_city: sourceCity.name,
        destination: destination.name,
        description: null,
        start_date: startDate,
        end_date: endDate,
        budget: parsedBudget,
        members,
        status: "planned",
      });

      router.push({
        pathname: "../journey-setup",
        params: {
          tripId: trip.id,
          source: JSON.stringify(sourceCity),
          destination: JSON.stringify(destination),
        },
      });
    } catch (error) {
      console.error("TRIP CREATE ERROR:", error);
      setFormError("Could not save your journey");
    } finally {
      setSavingTrip(false);
    }
  }

  // Derived trip duration text and date error
  let tripDurationText: string | null = null;
  let dateInlineError: string | null = null;
  if (startDate && endDate) {
    if (endDate < startDate) {
      dateInlineError = "End date is before start date";
    } else {
      const diff = dayDifference(startDate, endDate);
      if (diff === 0) {
        tripDurationText = "Same day trip";
      } else if (diff === 1) {
        tripDurationText = "1 night";
      } else {
        tripDurationText = `${diff} nights`;
      }
    }
  }

  const membersAtMin = members <= 1;
  const membersAtMax = members >= 10;
  const bothCitiesSelected = Boolean(sourceCity && destination);

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.webContainer}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.brandGroup}>
            <Image
              source={require("../../../assets/images/2logo.png")}
              style={styles.brandLogo}
            />
            <View style={styles.greetingContainer}>
              <Text style={styles.greeting}>Hi, {displayName}</Text>
              <View style={styles.locationRow}>
                <Ionicons
                  name="location-sharp"
                  size={13}
                  color={THEME.accent}
                />
                <Text style={styles.locationText}>{currentCityName}</Text>
              </View>
            </View>
          </View>

          <View style={styles.actions}>
            <Pressable
              accessibilityLabel="Notifications"
              style={({ pressed }) => [
                styles.iconButton,
                pressed && styles.iconPressed,
              ]}
            >
              <Ionicons
                name="notifications-outline"
                size={24}
                color={THEME.textPrimary}
              />
            </Pressable>

            <Pressable
              accessibilityLabel="Open profile"
              onPress={() => router.push("/(root)/(tabs)/profile")}
              style={({ pressed }) => [
                styles.avatarButton,
                pressed && styles.avatarPressed,
              ]}
            >
              {user?.imageUrl ? (
                <Image source={{ uri: user.imageUrl }} style={styles.avatar} />
              ) : (
                <View style={styles.avatarFallback}>
                  <Text style={styles.avatarInitial}>
                    {displayName.charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}
            </Pressable>
          </View>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* UPCOMING TRIP SECTION */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Upcoming trip</Text>
            <Text style={styles.sectionSubtitle}>
              Stay ready for your next adventure.
            </Text>

            {upcomingLoading ? (
              <View style={styles.upcomingCard}>
                <ActivityIndicator size="small" color={THEME.accent} />
              </View>
            ) : upcomingTrip ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Upcoming trip to ${upcomingTrip.destination || "destination"}`}
                onPress={() =>
                  router.push({
                    pathname: "../trip-details",
                    params: { tripId: upcomingTrip.id },
                  })
                }
                style={({ pressed }) => [
                  styles.upcomingCard,
                  pressed && styles.cardPressed,
                ]}
              >
                <View style={styles.upcomingTopRow}>
                  <View style={styles.upcomingDestinationGroup}>
                    <Text style={styles.upcomingDestination}>
                      {upcomingTrip.destination || "Upcoming journey"}
                    </Text>
                    <Text style={styles.upcomingDateRange}>
                      {formatDateRange(
                        upcomingTrip.start_date,
                        upcomingTrip.end_date
                      )}
                    </Text>
                  </View>

                  <View style={styles.pillContainer}>
                    <Text style={styles.pillText}>
                      {upcomingTrip.daysUntilStart === 0
                        ? "Starts today"
                        : upcomingTrip.daysUntilStart === 1
                          ? "in 1 day"
                          : `in ${upcomingTrip.daysUntilStart ?? daysUntil(upcomingTrip.start_date) ?? 0} days`}
                    </Text>
                  </View>
                </View>

                <View style={styles.upcomingFooter}>
                  <View style={styles.upcomingMetaItem}>
                    <Ionicons
                      name="people-outline"
                      size={15}
                      color={THEME.textSecondary}
                    />
                    <Text style={styles.upcomingMetaText}>
                      {upcomingTrip.members || 1}{" "}
                      {upcomingTrip.members === 1 ? "member" : "members"}
                    </Text>
                  </View>

                  <View style={styles.viewDetailsRow}>
                    <Text style={styles.viewDetailsText}>View details</Text>
                    <Ionicons
                      name="chevron-forward"
                      size={15}
                      color={THEME.accentText}
                    />
                  </View>
                </View>
              </Pressable>
            ) : (
              <View style={styles.upcomingCard}>
                <View style={styles.emptyIconCircle}>
                  <Ionicons
                    name="calendar-outline"
                    size={20}
                    color={THEME.accentText}
                  />
                </View>
                <View style={styles.emptyBody}>
                  <Text style={styles.emptyTitle}>Plan your first trip</Text>
                  <Text style={styles.emptySubtitle}>
                    Create a journey below to see your schedule, weather, and stops here.
                  </Text>
                </View>
              </View>
            )}
          </View>

          {/* MY JOURNEY PLAN FORM */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>My journey plan</Text>
            <Text style={styles.sectionSubtitle}>
              Plan your trip, your way.
            </Text>

            <View style={styles.journeyCard}>
              {/* From / Swap / To */}
              <View style={styles.tripRow}>
                <View style={styles.tripField}>
                  <Text style={styles.fieldLabel}>From</Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Select source city"
                    onPress={() => openCityPicker("from")}
                    style={({ pressed }) => [
                      styles.cityFieldShell,
                      pressed && styles.fieldPressed,
                    ]}
                  >
                    <Ionicons
                      name="navigate-outline"
                      size={17}
                      color={THEME.accent}
                      style={styles.fieldIcon}
                    />
                    <Text
                      style={[
                        styles.fieldValue,
                        !sourceCity && styles.fieldPlaceholder,
                      ]}
                      numberOfLines={1}
                    >
                      {sourceCity ? sourceCity.name : "Select source city"}
                    </Text>
                  </Pressable>
                </View>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Swap source and destination"
                  onPress={handleSwapCities}
                  style={({ pressed }) => [
                    styles.swapButton,
                    pressed && styles.swapButtonPressed,
                  ]}
                >
                  <Ionicons
                    name="swap-horizontal"
                    size={16}
                    color={THEME.accentText}
                  />
                </Pressable>

                <View style={styles.tripField}>
                  <Text style={styles.fieldLabel}>To</Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Select destination"
                    onPress={() => openCityPicker("to")}
                    style={({ pressed }) => [
                      styles.cityFieldShell,
                      pressed && styles.fieldPressed,
                    ]}
                  >
                    <Ionicons
                      name="location-outline"
                      size={17}
                      color={THEME.accent}
                      style={styles.fieldIcon}
                    />
                    <Text
                      style={[
                        styles.fieldValue,
                        !destination && styles.fieldPlaceholder,
                      ]}
                      numberOfLines={1}
                    >
                      {destination ? destination.name : "Select destination"}
                    </Text>
                  </Pressable>
                </View>
              </View>

              {/* Start / End dates */}
              <View style={styles.tripRow}>
                <View style={styles.tripField}>
                  <Text style={styles.fieldLabel}>Start date</Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Select start date"
                    onPress={() => openDatePicker("start")}
                    style={({ pressed }) => [
                      styles.dateFieldShell,
                      pressed && styles.fieldPressed,
                    ]}
                  >
                    <Ionicons
                      name="calendar-outline"
                      size={17}
                      color={THEME.accent}
                      style={styles.fieldIcon}
                    />
                    <Text
                      style={[
                        styles.fieldValue,
                        !startDate && styles.fieldPlaceholder,
                      ]}
                      numberOfLines={1}
                    >
                      {startDate ? formatDateDisplay(startDate) : "Select date"}
                    </Text>
                  </Pressable>
                </View>

                <View style={styles.tripField}>
                  <Text style={styles.fieldLabel}>End date</Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Select end date"
                    onPress={() => openDatePicker("end")}
                    style={({ pressed }) => [
                      styles.dateFieldShell,
                      pressed && styles.fieldPressed,
                    ]}
                  >
                    <Ionicons
                      name="calendar-outline"
                      size={17}
                      color={THEME.accent}
                      style={styles.fieldIcon}
                    />
                    <Text
                      style={[
                        styles.fieldValue,
                        !endDate && styles.fieldPlaceholder,
                      ]}
                      numberOfLines={1}
                    >
                      {endDate ? formatDateDisplay(endDate) : "Select date"}
                    </Text>
                  </Pressable>
                </View>
              </View>

              {/* Date duration text / inline error */}
              {dateInlineError ? (
                <View style={styles.dateInlineErrorBox}>
                  <Ionicons
                    name="alert-circle-outline"
                    size={14}
                    color={THEME.danger}
                  />
                  <Text style={styles.dateInlineErrorText}>
                    {dateInlineError}
                  </Text>
                </View>
              ) : tripDurationText ? (
                <View style={styles.tripLengthRow}>
                  <Ionicons
                    name="time-outline"
                    size={14}
                    color={THEME.accentText}
                  />
                  <Text style={styles.tripLengthText}>{tripDurationText}</Text>
                </View>
              ) : null}

              {/* Budget / Members */}
              <View style={styles.tripRow}>
                <View style={styles.tripField}>
                  <Text style={styles.fieldLabel}>Budget (optional)</Text>
                  <View style={styles.budgetShell}>
                    <Text style={styles.budgetSymbol}>₹</Text>
                    <TextInput
                      style={styles.budgetInput}
                      placeholder="Amount"
                      placeholderTextColor="#9CA1A9"
                      value={formatIndianNumber(rawBudget)}
                      onChangeText={handleBudgetChange}
                      keyboardType="number-pad"
                      maxLength={12}
                    />
                  </View>
                </View>

                <View style={styles.tripField}>
                  <Text style={styles.fieldLabel}>Members</Text>
                  <View style={styles.membersShell}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Decrease members"
                      accessibilityState={{ disabled: membersAtMin }}
                      disabled={membersAtMin}
                      onPress={() => updateMembers(-1)}
                      style={({ pressed }) => [
                        styles.stepperButton,
                        pressed && styles.stepperButtonPressed,
                      ]}
                    >
                      <Ionicons
                        name="remove"
                        size={18}
                        color={membersAtMin ? "#B8DDBE" : THEME.accent}
                      />
                    </Pressable>

                    <Text style={styles.membersValue}>{members}</Text>

                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Increase members"
                      accessibilityState={{ disabled: membersAtMax }}
                      disabled={membersAtMax}
                      onPress={() => updateMembers(1)}
                      style={({ pressed }) => [
                        styles.stepperButton,
                        pressed && styles.stepperButtonPressed,
                      ]}
                    >
                      <Ionicons
                        name="add"
                        size={18}
                        color={membersAtMax ? "#B8DDBE" : THEME.accent}
                      />
                    </Pressable>
                  </View>
                </View>
              </View>

              {/* LIVE PREVIEW STRIP */}
              <View style={styles.previewSection}>
                <Text style={styles.previewTitle}>Live preview</Text>

                {!bothCitiesSelected ? (
                  <Text style={styles.previewMutedText}>
                    Pick two cities to see distance, weather, and trains before you search.
                  </Text>
                ) : previewLoading ? (
                  <View style={styles.previewGrid}>
                    {[1, 2, 3, 4].map((i) => (
                      <View key={i} style={styles.previewCardSkeleton}>
                        <ActivityIndicator size="small" color={THEME.accent} />
                      </View>
                    ))}
                  </View>
                ) : previewData ? (
                  <View style={styles.previewGrid}>
                    <View style={styles.previewCard}>
                      <View style={styles.previewIconCircle}>
                        <Ionicons
                          name="speedometer-outline"
                          size={14}
                          color={THEME.accentText}
                        />
                      </View>
                      <Text style={styles.previewLabel}>Distance</Text>
                      <Text style={styles.previewValue}>
                        {previewData.distance}
                      </Text>
                    </View>

                    <View style={styles.previewCard}>
                      <View style={styles.previewIconCircle}>
                        <Ionicons
                          name="car-outline"
                          size={14}
                          color={THEME.accentText}
                        />
                      </View>
                      <Text style={styles.previewLabel}>Drive time</Text>
                      <Text style={styles.previewValue}>
                        {previewData.duration}
                      </Text>
                    </View>

                    <View style={styles.previewCard}>
                      <View style={styles.previewIconCircle}>
                        <Ionicons
                          name="partly-sunny-outline"
                          size={14}
                          color={THEME.accentText}
                        />
                      </View>
                      <Text style={styles.previewLabel}>Weather</Text>
                      <Text style={styles.previewValue}>
                        {previewData.weather}
                      </Text>
                    </View>

                    <View style={styles.previewCard}>
                      <View style={styles.previewIconCircle}>
                        <Ionicons
                          name="train-outline"
                          size={14}
                          color={THEME.accentText}
                        />
                      </View>
                      <Text style={styles.previewLabel}>Trains</Text>
                      <Text style={styles.previewValue}>
                        {previewData.trains}
                      </Text>
                    </View>
                  </View>
                ) : null}
              </View>

              {formError ? (
                <View style={styles.errorBox}>
                  <Ionicons
                    name="alert-circle-outline"
                    size={16}
                    color={THEME.danger}
                  />
                  <Text style={styles.errorText}>{formError}</Text>
                </View>
              ) : null}

              <Pressable
                accessibilityRole="button"
                accessibilityState={{
                  disabled: savingTrip,
                }}
                disabled={savingTrip}
                onPress={handleSearchJourney}
                style={({ pressed }) => [
                  styles.searchButton,
                  pressed && styles.searchButtonPressed,
                  savingTrip && styles.searchButtonDisabled,
                ]}
              >
                {savingTrip ? (
                  <>
                    <ActivityIndicator size="small" color="#FFFFFF" />
                    <Text style={styles.searchButtonText}>
                      Saving journey...
                    </Text>
                  </>
                ) : (
                  <>
                    <Text style={styles.searchButtonText}>Search journey</Text>
                    <Ionicons name="search" size={19} color="#FFFFFF" />
                  </>
                )}
              </Pressable>
            </View>
          </View>

          {/* POPULAR ROUTES */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              Popular from {currentCityName}
            </Text>
            <Text style={styles.sectionSubtitle}>
              Top destinations travellers love visiting.
            </Text>

            <View style={styles.chipsRow}>
              {POPULAR_DESTINATIONS.map((destName) => {
                const isSelected = destination?.name === destName;
                return (
                  <Pressable
                    key={destName}
                    accessibilityRole="button"
                    accessibilityLabel={`Choose route to ${destName}`}
                    onPress={() => handleSelectPopular(destName)}
                    style={({ pressed }) => [
                      styles.popularChip,
                      isSelected && styles.popularChipSelected,
                      pressed && styles.chipPressed,
                    ]}
                  >
                    <Ionicons
                      name="location-outline"
                      size={14}
                      color={isSelected ? THEME.accentText : THEME.textSecondary}
                    />
                    <Text
                      style={[
                        styles.popularChipText,
                        isSelected && styles.popularChipTextSelected,
                      ]}
                    >
                      {destName}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </ScrollView>
      </View>

      {/* City picker modal */}
      <Modal
        visible={cityField !== null}
        transparent
        animationType="slide"
        onRequestClose={closeCityPicker}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.citySheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>
                {cityField === "from"
                  ? "Select source city"
                  : "Select destination city"}
              </Text>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close city picker"
                hitSlop={10}
                onPress={closeCityPicker}
                style={({ pressed }) => [
                  styles.sheetCloseButton,
                  pressed && styles.sheetClosePressed,
                ]}
              >
                <Ionicons name="close" size={20} color={THEME.textPrimary} />
              </Pressable>
            </View>

            <View style={styles.searchBar}>
              <Ionicons
                name="search"
                size={20}
                color={THEME.textSecondary}
                style={styles.searchIcon}
              />

              <TextInput
                style={styles.searchInput}
                placeholder="Search city or place..."
                placeholderTextColor="#9CA1A9"
                value={citySearch}
                onChangeText={setCitySearch}
                autoCapitalize="words"
                autoCorrect={false}
                returnKeyType="search"
                autoFocus
              />

              {cityLoading && (
                <ActivityIndicator
                  size="small"
                  color={THEME.accent}
                  style={styles.searchLoader}
                />
              )}

              {citySearch.length > 0 && !cityLoading && (
                <Pressable
                  accessibilityLabel="Clear search"
                  hitSlop={12}
                  onPress={() => {
                    setCitySearch("");
                    setCityResults([]);
                  }}
                  style={styles.clearButton}
                >
                  <Ionicons
                    name="close-circle"
                    size={18}
                    color="#B0B5BC"
                  />
                </Pressable>
              )}
            </View>

            {cityLoading ? (
              <View style={styles.cityLoading}>
                <ActivityIndicator size="large" color={THEME.accent} />
                <Text style={styles.cityLoadingText}>Searching...</Text>
              </View>
            ) : (
              <FlatList
                data={cityResults}
                keyExtractor={(item) => item.id}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                style={styles.cityList}
                contentContainerStyle={styles.cityListContent}
                ListEmptyComponent={
                  <Text style={styles.cityEmpty}>
                    {citySearch.trim().length < 2
                      ? "Start typing to find a city or place."
                      : "No cities found. Try another search."}
                  </Text>
                }
                renderItem={({ item }) => (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => selectCity(item)}
                    style={({ pressed }) => [
                      styles.cityResult,
                      pressed && styles.cityResultPressed,
                    ]}
                  >
                    <View style={styles.cityPin}>
                      <Ionicons
                        name="location"
                        size={20}
                        color={THEME.accent}
                      />
                    </View>

                    <View style={styles.cityResultText}>
                      <Text style={styles.cityName}>{item.name}</Text>
                      <Text
                        style={styles.cityAddress}
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
        </View>
      </Modal>

      {/* Date picker modal */}
      <DatePickerModal
        visible={dateField !== null}
        title={
          dateField === "start" ? "Select start date" : "Select end date"
        }
        selected={dateField === "start" ? startDate : endDate}
        minDate={dateField === "end" ? startDate : null}
        onSelect={handleDateSelect}
        onClose={() => setDateField(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: THEME.screenBg,
  },
  webContainer: {
    flex: 1,
    width: "100%",
    maxWidth: 720,
    alignSelf: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  brandGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  brandLogo: {
    width: 36,
    height: 36,
    resizeMode: "contain",
  },
  greetingContainer: {
    justifyContent: "center",
  },
  greeting: {
    fontSize: 17,
    fontWeight: "700",
    color: THEME.textPrimary,
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginTop: 2,
  },
  locationText: {
    fontSize: 12,
    fontWeight: "600",
    color: THEME.textSecondary,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  iconButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  iconPressed: {
    opacity: 0.6,
  },
  avatarButton: {
    borderRadius: 20,
  },
  avatarPressed: {
    opacity: 0.7,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
  },
  avatarFallback: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 19,
    backgroundColor: THEME.accentTint,
  },
  avatarInitial: {
    fontSize: 17,
    fontWeight: "700",
    color: THEME.accentText,
  },

  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 32,
    gap: 20,
  },

  section: {},
  sectionTitle: {
    fontSize: 19,
    fontWeight: "800",
    color: THEME.textPrimary,
    letterSpacing: -0.2,
  },
  sectionSubtitle: {
    marginTop: 2,
    fontSize: 13,
    lineHeight: 18,
    color: THEME.textSecondary,
  },

  // Upcoming card
  upcomingCard: {
    marginTop: 10,
    backgroundColor: THEME.card,
    borderRadius: THEME.radius,
    borderWidth: THEME.borderWidth,
    borderColor: THEME.cardBorder,
    padding: 16,
    flexDirection: "column",
    gap: 12,
  },
  cardPressed: {
    opacity: 0.9,
  },
  upcomingTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  upcomingDestinationGroup: {
    flex: 1,
    marginRight: 10,
  },
  upcomingDestination: {
    fontSize: 16,
    fontWeight: "700",
    color: THEME.textPrimary,
  },
  upcomingDateRange: {
    marginTop: 3,
    fontSize: 13,
    color: THEME.textSecondary,
  },
  pillContainer: {
    backgroundColor: THEME.accentTint,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  pillText: {
    fontSize: 12,
    fontWeight: "700",
    color: THEME.accentText,
  },
  upcomingFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: THEME.cardBorder,
  },
  upcomingMetaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  upcomingMetaText: {
    fontSize: 13,
    fontWeight: "500",
    color: THEME.textSecondary,
  },
  viewDetailsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  viewDetailsText: {
    fontSize: 13,
    fontWeight: "700",
    color: THEME.accentText,
  },

  // Empty upcoming
  emptyIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: THEME.accentTint,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  emptyBody: {
    flex: 1,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: THEME.textPrimary,
  },
  emptySubtitle: {
    marginTop: 2,
    fontSize: 13,
    color: THEME.textSecondary,
    lineHeight: 18,
  },

  // Journey Card Form
  journeyCard: {
    marginTop: 10,
    backgroundColor: THEME.card,
    borderRadius: THEME.radius,
    borderWidth: THEME.borderWidth,
    borderColor: THEME.cardBorder,
    padding: 16,
  },
  tripRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    marginBottom: 12,
  },
  tripField: {
    flex: 1,
  },
  swapButton: {
    width: 34,
    height: 46,
    borderRadius: 17,
    backgroundColor: THEME.accentTint,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 1,
  },
  swapButtonPressed: {
    transform: [{ scale: 0.92 }],
  },

  fieldLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: THEME.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 6,
  },
  cityFieldShell: {
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    backgroundColor: "#FAFCFA",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
  },
  fieldPressed: {
    backgroundColor: "#F0FAF2",
    transform: [{ scale: 0.99 }],
  },
  fieldIcon: {
    marginRight: 8,
  },
  fieldValue: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: THEME.textPrimary,
  },
  fieldPlaceholder: {
    color: "#9CA1A9",
    fontWeight: "500",
  },

  dateFieldShell: {
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    backgroundColor: "#FAFCFA",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
  },
  tripLengthRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: -4,
    marginBottom: 10,
    marginLeft: 2,
  },
  tripLengthText: {
    fontSize: 12,
    fontWeight: "600",
    color: THEME.accentText,
  },
  dateInlineErrorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: -4,
    marginBottom: 10,
    marginLeft: 2,
  },
  dateInlineErrorText: {
    fontSize: 12,
    fontWeight: "600",
    color: THEME.danger,
  },

  budgetShell: {
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    backgroundColor: "#FAFCFA",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
  },
  budgetSymbol: {
    fontSize: 15,
    fontWeight: "700",
    color: THEME.accentText,
    marginRight: 6,
  },
  budgetInput: {
    flex: 1,
    height: 46,
    fontSize: 14,
    fontWeight: "600",
    color: THEME.textPrimary,
  },

  membersShell: {
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    backgroundColor: "#FAFCFA",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 6,
  },
  stepperButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: THEME.accentTint,
    alignItems: "center",
    justifyContent: "center",
  },
  stepperButtonPressed: {
    transform: [{ scale: 0.94 }],
  },
  membersValue: {
    minWidth: 28,
    textAlign: "center",
    fontSize: 15,
    fontWeight: "700",
    color: THEME.textPrimary,
  },

  // Live preview
  previewSection: {
    marginVertical: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: THEME.cardBorder,
  },
  previewTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: THEME.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 8,
  },
  previewMutedText: {
    fontSize: 13,
    color: THEME.textSecondary,
    lineHeight: 18,
    paddingVertical: 4,
  },
  previewGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  previewCard: {
    width: "48%",
    flexGrow: 1,
    backgroundColor: "#F7FAF8",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    padding: 10,
  },
  previewCardSkeleton: {
    width: "48%",
    flexGrow: 1,
    height: 64,
    backgroundColor: "#F7FAF8",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  previewIconCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: THEME.accentTint,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  previewLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: THEME.textSecondary,
  },
  previewValue: {
    fontSize: 13,
    fontWeight: "700",
    color: THEME.textPrimary,
    marginTop: 2,
  },

  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#FFF4F1",
    borderWidth: 1,
    borderColor: "#FFD8D2",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 12,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: THEME.danger,
  },

  searchButton: {
    height: 52,
    borderRadius: 14,
    backgroundColor: THEME.accent,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  searchButtonPressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.9,
  },
  searchButtonDisabled: {
    opacity: 0.7,
  },
  searchButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },

  // Popular routes chips
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
  },
  popularChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: THEME.card,
    borderRadius: 20,
    borderWidth: THEME.borderWidth,
    borderColor: THEME.cardBorder,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  popularChipSelected: {
    backgroundColor: THEME.accentTint,
    borderColor: THEME.accent,
  },
  chipPressed: {
    transform: [{ scale: 0.96 }],
  },
  popularChipText: {
    fontSize: 13,
    fontWeight: "600",
    color: THEME.textPrimary,
  },
  popularChipTextSelected: {
    color: THEME.accentText,
    fontWeight: "700",
  },

  // Modal Sheet Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  citySheet: {
    backgroundColor: THEME.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "85%",
    paddingTop: 18,
    paddingHorizontal: 18,
    paddingBottom: 28,
  },
  dateSheet: {
    backgroundColor: THEME.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 18,
    paddingHorizontal: 18,
    paddingBottom: 24,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: THEME.textPrimary,
    letterSpacing: -0.2,
  },
  sheetCloseButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  sheetClosePressed: {
    backgroundColor: "#E8EAEC",
  },

  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FAFCFA",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    paddingHorizontal: 12,
    minHeight: 46,
    marginBottom: 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    height: 44,
    fontSize: 14,
    color: THEME.textPrimary,
  },
  searchLoader: {
    marginLeft: 8,
  },
  clearButton: {
    marginLeft: 8,
  },
  cityLoading: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
  },
  cityLoadingText: {
    marginTop: 10,
    fontSize: 13,
    color: THEME.textSecondary,
  },
  cityList: {
    flexGrow: 0,
  },
  cityListContent: {
    paddingBottom: 8,
  },
  cityEmpty: {
    textAlign: "center",
    fontSize: 13,
    lineHeight: 18,
    color: THEME.textSecondary,
    paddingVertical: 24,
    paddingHorizontal: 16,
  },
  cityResult: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: THEME.card,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: "#F0F3F1",
  },
  cityResultPressed: {
    backgroundColor: "#F0FAF2",
  },
  cityPin: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: THEME.accentTint,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  cityResultText: {
    flex: 1,
  },
  cityName: {
    fontSize: 14,
    fontWeight: "700",
    color: THEME.textPrimary,
  },
  cityAddress: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 16,
    color: THEME.textSecondary,
  },

  monthNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  monthNavButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  monthNavButtonPressed: {
    backgroundColor: "#E8EAEC",
    transform: [{ scale: 0.95 }],
  },
  monthLabel: {
    fontSize: 15,
    fontWeight: "800",
    color: THEME.textPrimary,
  },
  weekdayRow: {
    flexDirection: "row",
    marginBottom: 6,
  },
  weekdayLabel: {
    flex: 1,
    textAlign: "center",
    fontSize: 12,
    fontWeight: "700",
    color: THEME.textSecondary,
  },
  calendarGrid: {
    marginBottom: 14,
  },
  calendarRow: {
    flexDirection: "row",
  },
  dayCell: {
    flex: 1,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    margin: 2,
  },
  dayCellSelected: {
    backgroundColor: THEME.accent,
  },
  dayCellPressed: {
    backgroundColor: THEME.accentTint,
  },
  dayText: {
    fontSize: 13,
    fontWeight: "600",
    color: THEME.textPrimary,
  },
  dayTextSelected: {
    color: "#FFFFFF",
    fontWeight: "800",
  },
  dayTextDisabled: {
    color: "#C7CBCF",
    fontWeight: "500",
  },
  dateCancelButton: {
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    backgroundColor: THEME.card,
    alignItems: "center",
    justifyContent: "center",
  },
  dateCancelButtonPressed: {
    backgroundColor: "#F3F4F6",
  },
  dateCancelText: {
    fontSize: 14,
    fontWeight: "600",
    color: THEME.textPrimary,
  },
});