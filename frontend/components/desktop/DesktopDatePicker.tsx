import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { useAppTheme } from "../../src/theme/ThemeProvider";

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

export function isoDate(year: number, month: number, day: number): string {
  return `${year}-${pad2(month + 1)}-${pad2(day)}`;
}

export function formatShortDate(iso: string): string {
  const parts = iso.split("-").map(Number);

  if (parts.length !== 3) {
    return iso;
  }

  const [year, month, day] = parts;

  return `${day} ${MONTH_LABELS[month - 1].slice(0, 3)} ${year}`;
}

interface DesktopDatePickerProps {
  visible: boolean;
  title: string;
  selected: string | null;
  minDate: string | null;
  onSelect: (iso: string) => void;
  onClose: () => void;
}

/**
 * Desktop-friendly calendar popup. Same month/day grid logic as the mobile
 * date picker so the behaviour (and min-date rules) stay identical.
 */
export default function DesktopDatePicker({
  visible,
  title,
  selected,
  minDate,
  onSelect,
  onClose,
}: DesktopDatePickerProps) {
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

  for (let i = 0; i < firstWeekday; i += 1) {
    cells.push(null);
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
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
      <View style={styles.overlay}>
        <View
          style={[
            styles.sheet,
            { backgroundColor: theme.surface, borderColor: theme.border },
          ]}
        >
          <View style={styles.sheetHeader}>
            <Text style={[styles.sheetTitle, { color: theme.textPrimary }]}>
              {title}
            </Text>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close date picker"
              hitSlop={10}
              onPress={onClose}
              style={({ pressed }) => [
                styles.closeButton,
                { backgroundColor: theme.surfaceSecondary },
                pressed && { backgroundColor: theme.border },
              ]}
            >
              <Ionicons name="close" size={18} color={theme.text} />
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
                { backgroundColor: theme.surfaceSecondary },
                pressed && { backgroundColor: theme.border },
              ]}
            >
              <Ionicons name="chevron-back" size={20} color={theme.text} />
            </Pressable>

            <Text style={[styles.monthLabel, { color: theme.textPrimary }]}>
              {MONTH_LABELS[viewMonth]} {viewYear}
            </Text>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Next month"
              hitSlop={8}
              onPress={showNextMonth}
              style={({ pressed }) => [
                styles.monthNavButton,
                { backgroundColor: theme.surfaceSecondary },
                pressed && { backgroundColor: theme.border },
              ]}
            >
              <Ionicons name="chevron-forward" size={20} color={theme.text} />
            </Pressable>
          </View>

          <View style={styles.weekdayRow}>
            {WEEKDAY_LABELS.map((label, index) => (
              <Text key={`${label}-${index}`} style={[styles.weekdayLabel, { color: theme.textMuted }]}>
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
                        isSelected && { backgroundColor: theme.primary },
                        pressed && !disabled && styles.dayCellPressed,
                      ]}
                    >
                      <Text
                        style={[
                          styles.dayText,
                          { color: theme.textPrimary },
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
              styles.doneButton,
              { backgroundColor: theme.surface, borderColor: theme.border },
              pressed && { backgroundColor: theme.surfaceSecondary },
            ]}
          >
            <Text style={[styles.doneText, { color: theme.textSecondary }]}>
              Done
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  sheet: {
    width: 360,
    maxWidth: "100%",
    borderRadius: 18,
    borderWidth: 1,
    padding: 18,
    shadowColor: "#000000",
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: "800",
  },
  closeButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  monthNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  monthNavButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  monthLabel: {
    fontSize: 15,
    fontWeight: "700",
  },
  weekdayRow: {
    flexDirection: "row",
    marginBottom: 4,
  },
  weekdayLabel: {
    flex: 1,
    textAlign: "center",
    fontSize: 11,
    fontWeight: "700",
  },
  calendarGrid: {
    gap: 2,
    marginBottom: 14,
  },
  calendarRow: {
    flexDirection: "row",
    gap: 2,
  },
  dayCell: {
    flex: 1,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  dayCellPressed: {
    backgroundColor: "#E8F6EC",
  },
  dayText: {
    fontSize: 14,
    fontWeight: "600",
  },
  dayTextSelected: {
    color: "#FFFFFF",
    fontWeight: "800",
  },
  doneButton: {
    alignSelf: "center",
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 28,
    paddingVertical: 10,
  },
  doneText: {
    fontSize: 14,
    fontWeight: "700",
  },
});