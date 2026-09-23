import { Ionicons } from "@expo/vector-icons";
import { useUser } from "@clerk/expo";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import CitySearchSheet, {
  type CitySelection,
} from "../CitySearchSheet";
import DesktopDatePicker, { formatShortDate } from "./DesktopDatePicker";
import { useSupabase } from "../../hook/usesupabase";
import { createTrip } from "../../services/tripsApi";
import { useAppTheme } from "../../src/theme/ThemeProvider";

type CityField = "from" | "to";
type DateField = "start" | "end";

/**
 * Shared "My Journey Plan" form used by the desktop Home and Plan Trip
 * screens. Mirrors the mobile journey form behaviour (city picker, date
 * picker, budget, members) and navigates into journey setup once a trip
 * has been created.
 */
export default function DesktopPlanForm({
  onPlanChange,
}: {
  onPlanChange?: (plan: {
    source: string | null;
    destination: string | null;
  }) => void;
}) {
  const { user } = useUser();
  const supabase = useSupabase();
  const { theme } = useAppTheme();

  const [sourceCity, setSourceCity] = useState<CitySelection | null>(null);
  const [destination, setDestination] = useState<CitySelection | null>(null);
  const [startDate, setStartDate] = useState<string | null>(null);
  const [endDate, setEndDate] = useState<string | null>(null);
  const [budget, setBudget] = useState("");
  const [members, setMembers] = useState(1);
  const [formError, setFormError] = useState<string | null>(null);
  const [savingTrip, setSavingTrip] = useState(false);

  const [cityField, setCityField] = useState<CityField | null>(null);
  const [dateField, setDateField] = useState<DateField | null>(null);

  useEffect(() => {
    onPlanChange?.({
      source: sourceCity ? sourceCity.name : null,
      destination: destination ? destination.name : null,
    });
  }, [sourceCity, destination, onPlanChange]);

  function openCityPicker(field: CityField) {
    setFormError(null);
    setCityField(field);
  }

  function selectCity(location: CitySelection) {
    if (cityField === "from") {
      setSourceCity(location);
    } else if (cityField === "to") {
      setDestination(location);
    }

    setFormError(null);
    setCityField(null);
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
    setMembers((current) => Math.min(20, Math.max(1, current + delta)));
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
        pathname: "/(root)/journey-setup",
        params: {
          tripId: trip.id,
          source: JSON.stringify(sourceCity),
          destination: JSON.stringify(destination),
        },
      });
    } catch (error) {
      console.error("TRIP CREATE ERROR:", error);

      setFormError("Could not save your journey. Please try again.");
    } finally {
      setSavingTrip(false);
    }
  }

  const membersAtMin = members <= 1;
  const membersAtMax = members >= 20;

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.surface, borderColor: theme.border },
      ]}
    >
      <View style={styles.fieldsGrid}>
        <View style={styles.field}>
          <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>
            From
          </Text>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Select source city"
            onPress={() => openCityPicker("from")}
            style={({ pressed }) => [
              styles.fieldShell,
              { backgroundColor: theme.inputBg, borderColor: theme.border },
              pressed && styles.fieldPressed,
            ]}
          >
            <Ionicons name="navigate-outline" size={17} color="#00BC26" />
            <Text
              style={[
                styles.fieldValue,
                !sourceCity && styles.fieldPlaceholder,
                { color: theme.textPrimary },
              ]}
              numberOfLines={1}
            >
              {sourceCity ? sourceCity.name : "Select source city"}
            </Text>
          </Pressable>
        </View>

        <View style={styles.field}>
          <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>
            To
          </Text>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Select destination"
            onPress={() => openCityPicker("to")}
            style={({ pressed }) => [
              styles.fieldShell,
              { backgroundColor: theme.inputBg, borderColor: theme.border },
              pressed && styles.fieldPressed,
            ]}
          >
            <Ionicons name="location-outline" size={17} color="#00BC26" />
            <Text
              style={[
                styles.fieldValue,
                !destination && styles.fieldPlaceholder,
                { color: theme.textPrimary },
              ]}
              numberOfLines={1}
            >
              {destination ? destination.name : "Select destination"}
            </Text>
          </Pressable>
        </View>

        <View style={styles.field}>
          <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>
            Start date
          </Text>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Select start date"
            onPress={() => openDatePicker("start")}
            style={({ pressed }) => [
              styles.fieldShell,
              { backgroundColor: theme.inputBg, borderColor: theme.border },
              pressed && styles.fieldPressed,
            ]}
          >
            <Ionicons name="calendar-outline" size={17} color="#00BC26" />
            <Text
              style={[
                styles.fieldValue,
                !startDate && styles.fieldPlaceholder,
                { color: theme.textPrimary },
              ]}
              numberOfLines={1}
            >
              {startDate ? formatShortDate(startDate) : "Select date"}
            </Text>
          </Pressable>
        </View>

        <View style={styles.field}>
          <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>
            End date
          </Text>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Select end date"
            onPress={() => openDatePicker("end")}
            style={({ pressed }) => [
              styles.fieldShell,
              { backgroundColor: theme.inputBg, borderColor: theme.border },
              pressed && styles.fieldPressed,
            ]}
          >
            <Ionicons name="calendar-outline" size={17} color="#00BC26" />
            <Text
              style={[
                styles.fieldValue,
                !endDate && styles.fieldPlaceholder,
                { color: theme.textPrimary },
              ]}
              numberOfLines={1}
            >
              {endDate ? formatShortDate(endDate) : "Select date"}
            </Text>
          </Pressable>
        </View>

        <View style={styles.field}>
          <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>
            Budget
          </Text>

          <View
            style={[
              styles.fieldShell,
              { backgroundColor: theme.inputBg, borderColor: theme.border },
            ]}
          >
            <Text style={[styles.budgetPrefix, { color: theme.textMuted }]}>
              ₹
            </Text>
            <TextInput
              value={budget}
              onChangeText={setBudget}
              placeholder="Optional"
              placeholderTextColor={theme.textMuted}
              keyboardType="numeric"
              style={[styles.fieldInput, { color: theme.textPrimary }]}
            />
          </View>
        </View>

        <View style={styles.field}>
          <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>
            Members
          </Text>

          <View
            style={[
              styles.membersShell,
              { backgroundColor: theme.inputBg, borderColor: theme.border },
            ]}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Remove member"
              disabled={membersAtMin}
              onPress={() => updateMembers(-1)}
              style={({ pressed }) => [
                styles.stepperButton,
                membersAtMin && styles.stepperDisabled,
                pressed && styles.fieldPressed,
              ]}
            >
              <Ionicons
                name="remove"
                size={18}
                color={membersAtMin ? theme.textMuted : theme.text}
              />
            </Pressable>

            <Text style={[styles.membersValue, { color: theme.textPrimary }]}>
              {members}
            </Text>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add member"
              disabled={membersAtMax}
              onPress={() => updateMembers(1)}
              style={({ pressed }) => [
                styles.stepperButton,
                membersAtMax && styles.stepperDisabled,
                pressed && styles.fieldPressed,
              ]}
            >
              <Ionicons
                name="add"
                size={18}
                color={membersAtMax ? theme.textMuted : theme.text}
              />
            </Pressable>
          </View>
        </View>
      </View>

      {formError ? (
        <View style={[styles.errorBox, { backgroundColor: theme.primaryLight }]}>
          <Ionicons name="alert-circle-outline" size={16} color="#B42318" />
          <Text style={styles.errorText}>{formError}</Text>
        </View>
      ) : null}

      <View style={styles.submitRow}>
        <Text style={[styles.helper, { color: theme.textMuted }]}>
          We&apos;ll build a route, stops and transport for your journey.
        </Text>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Plan journey"
          disabled={savingTrip}
          onPress={handleSearchJourney}
          style={({ pressed }) => [
            styles.submitButton,
            { backgroundColor: theme.primary },
            pressed && styles.submitPressed,
            savingTrip && styles.submitDisabled,
          ]}
        >
          {savingTrip ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <Ionicons name="search" size={18} color="#FFFFFF" />
              <Text style={styles.submitText}>Search Journey</Text>
            </>
          )}
        </Pressable>
      </View>

      <CitySearchSheet
        visible={cityField !== null}
        title={cityField === "from" ? "Select source city" : "Select destination"}
        onClose={() => setCityField(null)}
        onSelect={selectCity}
      />

      <DesktopDatePicker
        visible={dateField !== null}
        title={dateField === "start" ? "Select start date" : "Select end date"}
        selected={dateField === "start" ? startDate : endDate}
        minDate={dateField === "end" ? startDate : null}
        onSelect={handleDateSelect}
        onClose={() => setDateField(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 20,
  },
  fieldsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
  },
  field: {
    flexGrow: 1,
    flexBasis: 220,
    minWidth: 200,
    gap: 6,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "700",
  },
  fieldShell: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
  },
  fieldInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    paddingVertical: 12,
  },
  fieldValue: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
  },
  fieldPlaceholder: {
    color: "#9AA1A9",
    fontWeight: "500",
  },
  fieldPressed: {
    opacity: 0.7,
  },
  budgetPrefix: {
    fontSize: 15,
    fontWeight: "700",
  },
  membersShell: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 6,
  },
  stepperButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  stepperDisabled: {
    opacity: 0.35,
  },
  membersValue: {
    fontSize: 15,
    fontWeight: "800",
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 16,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: "#B42318",
  },
  submitRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    marginTop: 20,
    flexWrap: "wrap",
  },
  helper: {
    flex: 1,
    minWidth: 220,
    fontSize: 12,
  },
  submitButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 12,
    paddingHorizontal: 22,
    paddingVertical: 13,
  },
  submitPressed: {
    opacity: 0.85,
  },
  submitDisabled: {
    opacity: 0.6,
  },
  submitText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
  },
});