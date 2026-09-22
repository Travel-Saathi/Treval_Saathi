import { useUser } from "@clerk/expo";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";

import { SafeAreaView } from "react-native-safe-area-context";

import NotificationBell from "../../../components/NotificationBell";
import SaathiHeaderButton from "../../../components/SaathiHeaderButton";
import { useSupabase } from "../../../hook/usesupabase";
import { searchLocation } from "../../../services/locationApi";
import { createTrip } from "../../../services/tripsApi";
import { useAppTheme } from "../../../src/theme/ThemeProvider";
import { useNotificationsStore } from "../../../store/notificationsStore";

interface CitySelection {
  id: string;
  name: string;
  formatted: string;
  latitude: number;
  longitude: number;
}

type CityField = "from" | "to";
type DateField = "start" | "end";

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

  const { theme } = useAppTheme();

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
        <View style={[styles.dateSheet, { backgroundColor: theme.surface }]}>
          <View style={styles.sheetHeader}>
            <Text style={[styles.sheetTitle, { color: theme.text }]}>{title}</Text>

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
              <Ionicons name="close" size={20} color={theme.text} />
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
                { backgroundColor: theme.surfaceSecondary },
                pressed && { backgroundColor: theme.border },
              ]}
            >
              <Ionicons name="chevron-back" size={20} color={theme.text} />
            </Pressable>

            <Text style={[styles.monthLabel, { color: theme.text }]}>
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
                { backgroundColor: theme.surfaceSecondary },
                pressed && { backgroundColor: theme.border },
              ]}
            >
              <Ionicons name="chevron-forward" size={20} color={theme.text} />
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
                  { color: theme.text },
                  disabled && { color: theme.textMuted },
                  isSelected && styles.dayTextSelected,
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
              { backgroundColor: theme.surface, borderColor: theme.border },
              pressed && { backgroundColor: theme.surfaceSecondary },
            ]}
          >
            <Text style={[styles.dateCancelText, { color: theme.text }]}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

export default function HomeScreen() {
  const { user } = useUser();
  const supabase = useSupabase();
  const { theme } = useAppTheme();
  const { width: screenWidth } = useWindowDimensions();
  const brandLogoWidth = screenWidth >= 768 ? 140 : 100;
  const brandLogoHeight = brandLogoWidth / 3;
  const unreadCount = useNotificationsStore((state) => state.unreadCount);
  const displayName = user?.firstName || user?.fullName || "User";

  console.log("[AUTH_DEBUG] HOME_MOUNT");

  const [sourceCity, setSourceCity] = useState<CitySelection | null>(null);
  const [destination, setDestination] = useState<CitySelection | null>(null);
  const [startDate, setStartDate] = useState<string | null>(null);
  const [endDate, setEndDate] = useState<string | null>(null);
  const [budget, setBudget] = useState("");
  const [members, setMembers] = useState(1);
  const [formError, setFormError] = useState<string | null>(null);
  const [savingTrip, setSavingTrip] = useState(false);

  const [cityField, setCityField] = useState<CityField | null>(null);
  const [citySearch, setCitySearch] = useState("");
  const [cityResults, setCityResults] = useState<CitySelection[]>([]);
  const [cityLoading, setCityLoading] = useState(false);
  const cityRequestIdRef = useRef(0);
  const cityAbortRef = useRef<AbortController | null>(null);

  const [dateField, setDateField] = useState<DateField | null>(null);

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

        console.error("City search error:", error);

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

  function updateMembers(delta: number) {
    setMembers((current) =>
      Math.min(20, Math.max(1, current + delta))
    );
  }

  async function handleSearchJourney() {
    setFormError(null);

    if (!sourceCity) {
      setFormError("Please select your source city.");
      return;
    }

    if (!destination) {
      setFormError("Please select your destination.");
      return;
    }

    if (!startDate) {
      setFormError("Please select a start date.");
      return;
    }

    if (!endDate) {
      setFormError("Please select an end date.");
      return;
    }

    if (endDate < startDate) {
      setFormError("End date cannot be before the start date.");
      return;
    }

    if (!user?.id) {
      setFormError("Please sign in to plan a journey.");
      return;
    }

    setSavingTrip(true);
    setFormError(null);

    try {
      const budgetNumber = budget.trim() ? Number(budget) : NaN;
      const parsedBudget = Number.isFinite(budgetNumber)
        ? budgetNumber
        : null;

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

      setFormError(
        "Could not save your journey. Please try again."
      );
    } finally {
      setSavingTrip(false);
    }
  }

  const membersAtMin = members <= 1;
  const membersAtMax = members >= 20;

  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: theme.background }]}
    >
      <View style={[styles.header, { backgroundColor: theme.headerBg }]}>
        <View style={styles.brandGroup}>
          <Image
            source={require("../../../assets/images/2logo.png")}
            style={[
              styles.brandLogo,
              { width: brandLogoWidth, height: brandLogoHeight },
            ]}
          />
          <Text
            style={[styles.greeting, { color: theme.headerText }]}
            numberOfLines={1}
          >
            Hi, {displayName}
          </Text>
          <Ionicons name="location-outline" size={18} color={theme.headerText} />
        </View>

        <View style={styles.actions}>
          <SaathiHeaderButton />
          <NotificationBell
            unreadCount={unreadCount}
            color={theme.headerText}
          />
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* MY JOURNEY PLAN */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>My Journey Plan</Text>

          <Text style={[styles.sectionSubtitle, { color: theme.textSecondary }]}>
            Plan your trip, your way.
          </Text>

          <View
            style={[
              styles.journeyCard,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
          >
            {/* From / To */}
            <View style={styles.tripRow}>
              <View style={styles.tripField}>
                <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>From</Text>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Select source city"
                  onPress={() => openCityPicker("from")}
                  style={({ pressed }) => [
                    styles.cityFieldShell,
                    pressed && styles.fieldPressed,
                    { backgroundColor: theme.inputBg, borderColor: theme.border },
                  ]}
                >
                  <Ionicons
                    name="navigate-outline"
                    size={17}
                    color="#00BC26"
                    style={styles.fieldIcon}
                  />

                  <Text
                    style={[
                      styles.fieldValue,
                      !sourceCity && styles.fieldPlaceholder,
                      { color: theme.text },
                    ]}
                    numberOfLines={1}
                  >
                    {sourceCity ? sourceCity.name : "Select source city"}
                  </Text>
                </Pressable>
              </View>

              <View style={styles.tripArrow}>
                <Ionicons
                  name="arrow-forward"
                  size={16}
                  color="#B0B5BC"
                />
              </View>

              <View style={styles.tripField}>
                <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>To</Text>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Select destination"
                  onPress={() => openCityPicker("to")}
                  style={({ pressed }) => [
                    styles.cityFieldShell,
                    pressed && styles.fieldPressed,
                    { backgroundColor: theme.inputBg, borderColor: theme.border },
                  ]}
                >
                  <Ionicons
                    name="location-outline"
                    size={17}
                    color="#00BC26"
                    style={styles.fieldIcon}
                  />

                  <Text
                    style={[
                      styles.fieldValue,
                      !destination && styles.fieldPlaceholder,
                      { color: theme.text },
                    ]}
                    numberOfLines={1}
                  >
                    {destination
                      ? destination.name
                      : "Select destination"}
                  </Text>
                </Pressable>
              </View>
            </View>

            {/* Start / End dates */}
            <View style={styles.tripRow}>
              <View style={styles.tripField}>
                <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Start date</Text>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Select start date"
                  onPress={() => openDatePicker("start")}
                  style={({ pressed }) => [
                    styles.dateFieldShell,
                    pressed && styles.fieldPressed,
                    { backgroundColor: theme.inputBg, borderColor: theme.border },
                  ]}
                >
                  <Ionicons
                    name="calendar-outline"
                    size={17}
                    color="#00BC26"
                    style={styles.fieldIcon}
                  />

                  <Text
                    style={[
                      styles.fieldValue,
                      !startDate && styles.fieldPlaceholder,
                      { color: theme.text },
                    ]}
                    numberOfLines={1}
                  >
                    {startDate
                      ? formatDateDisplay(startDate)
                      : "Select date"}
                  </Text>
                </Pressable>
              </View>

              <View style={styles.tripField}>
                <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>End date</Text>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Select end date"
                  onPress={() => openDatePicker("end")}
                  style={({ pressed }) => [
                    styles.dateFieldShell,
                    pressed && styles.fieldPressed,
                    { backgroundColor: theme.inputBg, borderColor: theme.border },
                  ]}
                >
                  <Ionicons
                    name="calendar-outline"
                    size={17}
                    color="#00BC26"
                    style={styles.fieldIcon}
                  />

                  <Text
                    style={[
                      styles.fieldValue,
                      !endDate && styles.fieldPlaceholder,
                      { color: theme.text },
                    ]}
                    numberOfLines={1}
                  >
                    {endDate
                      ? formatDateDisplay(endDate)
                      : "Select date"}
                  </Text>
                </Pressable>
              </View>
            </View>

            {/* Budget / Members */}
            <View style={styles.tripRow}>
              <View style={styles.tripField}>
                <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Budget (optional)</Text>

                <View
                  style={[
                    styles.budgetShell,
                    { backgroundColor: theme.inputBg, borderColor: theme.border },
                  ]}
                >
                  <Text style={styles.budgetSymbol}>₹</Text>

                  <TextInput
                    style={[styles.budgetInput, { color: theme.text }]}
                    placeholder="Amount"
                    placeholderTextColor={theme.textMuted}
                    value={budget}
                    onChangeText={setBudget}
                    keyboardType="number-pad"
                    maxLength={9}
                  />
                </View>
              </View>

              <View style={styles.tripField}>
                <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Members</Text>

                <View
                  style={[
                    styles.membersShell,
                    { backgroundColor: theme.inputBg, borderColor: theme.border },
                  ]}
                >
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
                      color={membersAtMin ? "#B8DDBE" : "#00BC26"}
                    />
                  </Pressable>

                  <Text style={[styles.membersValue, { color: theme.text }]}>{members}</Text>

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
                      color={membersAtMax ? "#B8DDBE" : "#00BC26"}
                    />
                  </Pressable>
                </View>
              </View>
            </View>

            {formError ? (
              <View style={styles.errorBox}>
                <Ionicons
                  name="alert-circle-outline"
                  size={16}
                  color="#B42318"
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
                  <Text style={styles.searchButtonText}>
                    Search Journey
                  </Text>
                  <Ionicons
                    name="search"
                    size={19}
                    color="#FFFFFF"
                  />
                </>
              )}
            </Pressable>
          </View>
        </View>

        {/* EXPLORE GROUPS */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>
            Explore Groups
          </Text>

          <Text style={[styles.sectionSubtitle, { color: theme.textSecondary }]}>
            Join groups, share experiences, make memories.
          </Text>

          <View
            style={[
              styles.placeholderCard,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
          >
            <View style={styles.placeholderIcon}>
              <Ionicons
                name="people-outline"
                size={24}
                color="#00BC26"
              />
            </View>

            <View style={styles.placeholderBody}>
              <Text style={[styles.placeholderTitle, { color: theme.text }]}>
                Group journeys coming soon
              </Text>

              <Text style={[styles.placeholderText, { color: theme.textSecondary }]}>
                Join fellow travellers, share experiences and plan
                trips together.
              </Text>
            </View>
          </View>
        </View>

        {/* CITY PLANS & NEARBY */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>
            City Plans & Nearby
          </Text>

          <Text style={[styles.sectionSubtitle, { color: theme.textSecondary }]}>
            Discover city plans and nearby getaways.
          </Text>

          <View
            style={[
              styles.placeholderCard,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
          >
            <View style={styles.placeholderIcon}>
              <Ionicons
                name="map-outline"
                size={24}
                color="#00BC26"
              />
            </View>

            <View style={styles.placeholderBody}>
              <Text style={[styles.placeholderTitle, { color: theme.text }]}>
                City plans are on the way
              </Text>

              <Text style={[styles.placeholderText, { color: theme.textSecondary }]}>
                Explore curated city plans and nearby destinations
                soon.
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* City picker */}
      <Modal
        visible={cityField !== null}
        transparent
        animationType="slide"
        onRequestClose={closeCityPicker}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.citySheet, { backgroundColor: theme.surface }]}>
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: theme.text }]}>
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
                <Ionicons name="close" size={20} color={theme.text} />
              </Pressable>
            </View>

            <View
              style={[
                styles.searchBar,
                { backgroundColor: theme.inputBg, borderColor: theme.border },
              ]}
            >
              <Ionicons
                name="search"
                size={20}
                color={theme.textSecondary}
                style={styles.searchIcon}
              />

              <TextInput
                style={[styles.searchInput, { color: theme.text }]}
                placeholder="Search city or place..."
                placeholderTextColor={theme.textMuted}
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
                  color="#00BC26"
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
                <ActivityIndicator
                  size="large"
                  color="#00BC26"
                />

                <Text style={[styles.cityLoadingText, { color: theme.textSecondary }]}>
                  Searching...
                </Text>
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
                  <Text style={[styles.cityEmpty, { color: theme.textMuted }]}>
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
                      { backgroundColor: theme.surface, borderColor: theme.border },
                    ]}
                  >
                    <View style={styles.cityPin}>
                      <Ionicons
                        name="location"
                        size={20}
                        color="#00BC26"
                      />
                    </View>

                    <View style={styles.cityResultText}>
                      <Text style={[styles.cityName, { color: theme.text }]}>
                        {item.name}
                      </Text>

                      <Text
                        style={[styles.cityAddress, { color: theme.textSecondary }]}
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

      {/* Date picker */}
      <DatePickerModal
        visible={dateField !== null}
        title={
          dateField === "start"
            ? "Select start date"
            : "Select end date"
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
    backgroundColor: "#FFFFFF",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  brandGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flexShrink: 1,
  },
  brandLogo: {
    resizeMode: "contain",
  },
  greeting: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1C1C1E",
    flexShrink: 1,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  iconButton: {
    width: 32,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarButton: {
    borderRadius: 24,
  },
  avatarPressed: {
    opacity: 0.7,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  avatarFallback: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
    backgroundColor: "#E5E5EA",
  },
  avatarInitial: {
    fontSize: 20,
    fontWeight: "700",
    color: "#3A3A3C",
  },

  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 40,
  },

  section: {
    marginBottom: 28,
  },
  sectionTitle: {
    fontSize: 21,
    fontWeight: "800",
    color: "#1C1C1E",
    letterSpacing: -0.3,
  },
  sectionSubtitle: {
    marginTop: 4,
    fontSize: 14,
    lineHeight: 20,
    color: "#6B7280",
  },

  journeyCard: {
    marginTop: 16,
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 16,
    shadowColor: "#000000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: {
      width: 0,
      height: 4,
    },
    elevation: 2,
  },

  tripRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    marginBottom: 14,
  },
  tripField: {
    flex: 1,
  },
  tripArrow: {
    width: 22,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 1,
  },

  fieldLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#6B7280",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 7,
  },

  cityFieldShell: {
    minHeight: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#F7F9F8",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
  },
  fieldPressed: {
    backgroundColor: "#F0F2F1",
    transform: [
      {
        scale: 0.99,
      },
    ],
  },
  fieldIcon: {
    marginRight: 8,
  },

  dateFieldShell: {
    minHeight: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#F7F9F8",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
  },
  fieldValue: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
    color: "#1C1C1E",
  },
  fieldPlaceholder: {
    color: "#9CA1A9",
    fontWeight: "500",
  },

  budgetShell: {
    minHeight: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#F7F9F8",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
  },
  budgetSymbol: {
    fontSize: 15,
    fontWeight: "800",
    color: "#08751F",
    marginRight: 6,
  },
  budgetInput: {
    flex: 1,
    height: 46,
    fontSize: 15,
    fontWeight: "600",
    color: "#1C1C1E",
  },

  membersShell: {
    minHeight: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#F7F9F8",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
  },
  stepperButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#E7F9EB",
    alignItems: "center",
    justifyContent: "center",
  },
  stepperButtonPressed: {
    transform: [
      {
        scale: 0.94,
      },
    ],
  },
  membersValue: {
    minWidth: 34,
    textAlign: "center",
    fontSize: 16,
    fontWeight: "800",
    color: "#1C1C1E",
  },

  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FFF4F1",
    borderWidth: 1,
    borderColor: "#FFD8D2",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: "#B42318",
  },

  searchButton: {
    height: 54,
    borderRadius: 16,
    backgroundColor: "#00BC26",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    shadowColor: "#00BC26",
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: {
      width: 0,
      height: 6,
    },
    elevation: 3,
  },
  searchButtonPressed: {
    transform: [
      {
        scale: 0.98,
      },
    ],
  },
  searchButtonDisabled: {
    opacity: 0.7,
  },
  searchButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
  },

  placeholderCard: {
    marginTop: 16,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 16,
    gap: 14,
    shadowColor: "#000000",
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: {
      width: 0,
      height: 3,
    },
    elevation: 1,
  },
  placeholderIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "#E7F9EB",
    alignItems: "center",
    justifyContent: "center",
  },
  placeholderBody: {
    flex: 1,
  },
  placeholderTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#1C1C1E",
  },
  placeholderText: {
    marginTop: 3,
    fontSize: 13,
    lineHeight: 19,
    color: "#6B7280",
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },

  citySheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: "88%",
    paddingTop: 20,
    paddingHorizontal: 20,
    paddingBottom: 30,
  },

  dateSheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 20,
    paddingHorizontal: 20,
    paddingBottom: 24,
  },

  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  sheetTitle: {
    fontSize: 19,
    fontWeight: "800",
    color: "#1C1C1E",
    letterSpacing: -0.3,
  },
  sheetCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
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
    backgroundColor: "#F6F8F6",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E3EAE5",
    paddingHorizontal: 14,
    minHeight: 50,
    marginBottom: 14,
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    height: 48,
    fontSize: 15,
    color: "#1C1C1E",
  },
  searchLoader: {
    marginLeft: 8,
  },
  clearButton: {
    marginLeft: 8,
  },

  cityLoading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },
  cityLoadingText: {
    marginTop: 12,
    fontSize: 14,
    color: "#6B7280",
  },

  cityList: {
    flexGrow: 0,
  },
  cityListContent: {
    paddingBottom: 8,
  },
  cityEmpty: {
    textAlign: "center",
    fontSize: 14,
    lineHeight: 20,
    color: "#9CA1A9",
    paddingVertical: 30,
    paddingHorizontal: 20,
  },

  cityResult: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#F0F1F3",
  },
  cityResultPressed: {
    backgroundColor: "#F3F4F6",
  },
  cityPin: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#E7F9EB",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  cityResultText: {
    flex: 1,
  },
  cityName: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1C1C1E",
  },
  cityAddress: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 17,
    color: "#6B7280",
  },

  monthNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  monthNavButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  monthNavButtonPressed: {
    backgroundColor: "#E8EAEC",
    transform: [
      {
        scale: 0.95,
      },
    ],
  },
  monthLabel: {
    fontSize: 16,
    fontWeight: "800",
    color: "#1C1C1E",
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
    color: "#9CA1A9",
  },

  calendarGrid: {
    marginBottom: 16,
  },
  calendarRow: {
    flexDirection: "row",
  },
  dayCell: {
    flex: 1,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    margin: 2,
  },
  dayCellSelected: {
    backgroundColor: "#00BC26",
  },
  dayCellPressed: {
    backgroundColor: "#E7F9EB",
  },
  dayText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1C1C1E",
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
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  dateCancelButtonPressed: {
    backgroundColor: "#F3F4F6",
  },
  dateCancelText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1C1C1E",
  },
});