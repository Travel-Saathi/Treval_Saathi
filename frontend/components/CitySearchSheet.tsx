import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { searchLocation } from "../services/locationApi";
import { useAppTheme } from "../src/theme/ThemeProvider";
import type { ThemeTokens } from "../src/theme/tokens";

export interface CitySelection {
  id: string;
  name: string;
  formatted: string;
  latitude: number;
  longitude: number;
}

/**
 * Optional validator used on each search result.
 * Return `null` when the location is acceptable (e.g. "on your route"),
 * otherwise return a short human-readable reason (e.g. "Mumbai isn't
 * along your current route.").
 */
export type CitySelectionValidator = (
  location: CitySelection
) => Promise<string | null>;

interface CitySearchSheetProps {
  visible: boolean;
  title: string;
  onClose: () => void;
  onSelect: (location: CitySelection) => void;
  validate?: CitySelectionValidator;
  /**
   * Optional smart suggestions shown when the search box is empty.
   * Expected to be generated dynamically (route-corridor aware), never
   * a hardcoded list of cities.
   */
  recommendations?: CitySelection[];
  /**
   * When true, off-route results stay selectable and are annotated with a
   * warning instead of being locked. Defaults to false (blocking behavior).
   */
  allowOffRouteSelect?: boolean;
}

interface ValidationRecord {
  ok: boolean;
  reason: string | null;
}

/**
 * Bottom-sheet city/place search modal.
 *
 * Mirrors the search used elsewhere in the app: debounced search
 * against the existing location service with request cancellation.
 * When a `validate` prop is provided, every result row is checked and
 * annotated ("On your route" / reason), and invalid rows cannot be
 * selected.
 */
export default function CitySearchSheet({
  visible,
  title,
  onClose,
  onSelect,
  validate,
  recommendations = [],
  allowOffRouteSelect = false,
}: CitySearchSheetProps) {
  const { theme, dark } = useAppTheme();
  const styles = useMemo(() => createStyles(theme, dark), [theme, dark]);

  const [search, setSearch] = useState("");
  const [results, setResults] = useState<CitySelection[]>([]);
  const [loading, setLoading] = useState(false);
  const [validationRecords, setValidationRecords] = useState<
    Record<string, ValidationRecord>
  >({});

  const requestIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const validationRunRef = useRef(0);

  useEffect(() => {
    if (!visible) {
      setSearch("");
      setResults([]);
      setLoading(false);
      setValidationRecords({});

      abortRef.current?.abort();
      abortRef.current = null;

      return;
    }

    const query = search.trim();

    if (query.length < 2) {
      setResults([]);
      setLoading(false);

      abortRef.current?.abort();
      abortRef.current = null;

      return;
    }

    const timer = setTimeout(async () => {
      abortRef.current?.abort();

      const controller = new AbortController();

      abortRef.current = controller;

      const requestId = ++requestIdRef.current;

      try {
        setLoading(true);

        const items = await searchLocation(query, controller.signal);

        if (
          requestId !== requestIdRef.current ||
          controller.signal.aborted
        ) {
          return;
        }

        setResults(items);
      } catch (error: unknown) {
        if (
          error instanceof Error &&
          error.name === "AbortError"
        ) {
          return;
        }

        console.error("CITY SEARCH ERROR:", error);

        if (requestId === requestIdRef.current) {
          setResults([]);
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
  }, [visible, search]);

  // Validate every fresh result row against the optional validator.
  useEffect(() => {
    if (!visible || !validate) {
      return;
    }

    const run = ++validationRunRef.current;

    setValidationRecords({});

    for (const item of results) {
      validate(item)
        .then((reason) => {
          if (run !== validationRunRef.current) {
            return;
          }

          setValidationRecords((current) => ({
            ...current,
            [item.id]: { ok: reason === null, reason },
          }));
        })
        .catch((error: unknown) => {
          console.error("STOP VALIDATION ERROR:", error);

          if (run !== validationRunRef.current) {
            return;
          }

          setValidationRecords((current) => ({
            ...current,
            [item.id]: {
              ok: false,
              reason: "Could not verify this location against your route.",
            },
          }));
        });
    }
  }, [visible, results, validate]);

  function handleClose() {
    abortRef.current?.abort();
    onClose();
  }

  function handleSelect(location: CitySelection) {
    abortRef.current?.abort();
    onSelect(location);
  }

  const showRecommendations =
    visible &&
    search.trim().length < 2 &&
    recommendations.length > 0;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              hitSlop={10}
              onPress={handleClose}
              style={({ pressed }) => [
                styles.closeButton,
                pressed && styles.closeButtonPressed,
              ]}
            >
              <Ionicons name="close" size={20} color={theme.icon} />
            </Pressable>
          </View>

          <View style={styles.searchBar}>
            <Ionicons
              name="search"
              size={20}
              color={theme.textSecondary}
              style={styles.searchIcon}
            />

            <TextInput
              style={styles.searchInput}
              placeholder="Search city or place..."
              placeholderTextColor={theme.textMuted}
              value={search}
              onChangeText={setSearch}
              autoCapitalize="words"
              autoCorrect={false}
              returnKeyType="search"
              autoFocus
            />

            {loading && (
              <ActivityIndicator
                size="small"
                color={theme.primary}
                style={styles.searchLoader}
              />
            )}

            {search.length > 0 && !loading && (
              <Pressable
                accessibilityLabel="Clear search"
                hitSlop={12}
                onPress={() => {
                  setSearch("");
                  setResults([]);
                }}
                style={styles.clearButton}
              >
                <Ionicons name="close-circle" size={18} color={theme.textMuted} />
              </Pressable>
            )}
          </View>

          {loading ? (
            <View style={styles.loadingState}>
              <ActivityIndicator size="large" color={theme.primary} />
              <Text style={styles.loadingText}>Searching...</Text>
            </View>
          ) : (
            <FlatList
              data={results}
              keyExtractor={(item) => item.id}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              style={styles.list}
              contentContainerStyle={styles.listContent}
              ListHeaderComponent={
                showRecommendations ? (
                  <View style={styles.recommendationsBlock}>
                    <Text style={styles.recommendationsTitle}>
                      Recommended Stops Along Your Route
                    </Text>

                    {recommendations.map((item) => (
                      <Pressable
                        key={item.id}
                        accessibilityRole="button"
                        onPress={() => handleSelect(item)}
                        style={({ pressed }) => [
                          styles.result,
                          pressed && styles.resultPressed,
                        ]}
                      >
<View style={styles.recommendationIcon}>
                            <Ionicons
                              name="star"
                              size={18}
                              color={theme.warning}
                            />
                          </View>

                          <View style={styles.resultBody}>
                            <Text style={styles.resultName}>{item.name}</Text>

                            <Text
                              style={styles.resultAddress}
                              numberOfLines={2}
                            >
                              {item.formatted}
                            </Text>

                            <View style={styles.validationBadge}>
                              <Ionicons
                                name="checkmark-circle"
                                size={14}
                                color={theme.primaryDark}
                              />
                              <Text style={styles.validationOk}>
                                On your route
                              </Text>
                            </View>
                          </View>

                        <Ionicons
                          name="chevron-forward"
                          size={18}
                          color={theme.textMuted}
                        />
                      </Pressable>
                    ))}

                    <View style={styles.searchAnotherRow}>
                      <Ionicons
                        name="search-outline"
                        size={16}
                        color={theme.textSecondary}
                      />
                      <Text style={styles.searchAnotherText}>
                        Search another city
                      </Text>
                    </View>
                  </View>
                ) : null
              }
              ListEmptyComponent={
                <Text style={styles.empty}>
                  {search.trim().length < 2
                    ? showRecommendations
                      ? "Or type to find any city or place."
                      : "Start typing to find a city or place."
                    : "No cities found. Try another search."}
                </Text>
              }
              renderItem={({ item }) => {
                const record = validationRecords[item.id];
                const pending = Boolean(validate) && !record;
                const ok = !validate || (record ? record.ok : false);
                const reason = record ? record.reason : null;
                const locked = !ok && !allowOffRouteSelect;

                return (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ disabled: locked }}
                    disabled={locked}
                    onPress={() => handleSelect(item)}
                    style={({ pressed }) => [
                      styles.result,
                      locked && styles.resultDisabled,
                      pressed && !locked && styles.resultPressed,
                    ]}
                  >
                    <View
                      style={[
                        styles.resultIcon,
                        !ok && styles.resultIconDisabled,
                      ]}
                    >
                      <Ionicons
                        name={
                          ok
                            ? "location"
                            : allowOffRouteSelect
                              ? "warning-outline"
                              : "close"
                        }
                        size={20}
                        color={
                          ok
                            ? theme.primary
                            : allowOffRouteSelect
                              ? theme.warning
                              : theme.textMuted
                        }
                      />
                    </View>

                    <View style={styles.resultBody}>
                      <Text style={styles.resultName}>{item.name}</Text>

                      <Text style={styles.resultAddress} numberOfLines={2}>
                        {item.formatted}
                      </Text>

                      {validate ? (
                        pending ? (
                          <View style={styles.validationBadge}>
                            <ActivityIndicator
                              size="small"
                              color={theme.textSecondary}
                            />
                            <Text style={styles.validationPending}>
                              Checking your route...
                            </Text>
                          </View>
                        ) : ok ? (
                          <View style={styles.validationBadge}>
                            <Ionicons
                              name="checkmark-circle"
                              size={14}
                              color="#08751F"
                            />
                            <Text style={styles.validationOk}>
                              On your route
                            </Text>
                          </View>
                        ) : (
                          <View style={styles.validationBadge}>
                            <Ionicons
                              name="alert-circle"
                              size={14}
                              color={theme.danger}
                            />
                            <Text style={styles.validationNo}>
                              {reason ?? "Not on your route"}
                            </Text>
                          </View>
                        )
                      ) : null}
                    </View>

                    <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
                  </Pressable>
                );
              }}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (theme: ThemeTokens, dark: boolean) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: theme.overlay,
    justifyContent: "flex-end",
  },

  sheet: {
    backgroundColor: theme.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: "88%",
    paddingTop: 20,
    paddingHorizontal: 20,
    paddingBottom: 30,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },

  title: {
    fontSize: 19,
    fontWeight: "800",
    color: theme.text,
    letterSpacing: -0.3,
  },

  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.background,
    alignItems: "center",
    justifyContent: "center",
  },

  closeButtonPressed: {
    backgroundColor: theme.surfaceSecondary,
  },

  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.surfaceSecondary,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.border,
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
    color: theme.text,
  },

  searchLoader: {
    marginLeft: 8,
  },

  clearButton: {
    marginLeft: 8,
  },

  loadingState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },

  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: theme.textSecondary,
  },

  list: {
    flexGrow: 0,
  },

  listContent: {
    paddingBottom: 8,
  },

  empty: {
    textAlign: "center",
    fontSize: 14,
    lineHeight: 20,
    color: theme.textMuted,
    paddingVertical: 30,
    paddingHorizontal: 20,
  },

  result: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.surface,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: theme.border,
  },

  resultPressed: {
    backgroundColor: theme.background,
  },

  resultDisabled: {
    opacity: 0.65,
  },

  resultIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.primaryLight,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },

  resultIconDisabled: {
    backgroundColor: theme.surfaceSecondary,
  },

  resultBody: {
    flex: 1,
  },

  resultName: {
    fontSize: 15,
    fontWeight: "700",
    color: theme.text,
  },

  resultAddress: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 17,
    color: theme.textSecondary,
  },

  validationBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 6,
  },

  validationPending: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.textSecondary,
  },

  validationOk: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.primaryDark,
  },

  recommendationsBlock: {
    marginBottom: 8,
  },

  recommendationsTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: theme.text,
    marginBottom: 10,
  },

  recommendationIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: dark ? "rgba(245,158,11,0.14)" : "#FEF3C7",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },

  searchAnotherRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    marginTop: 2,
    borderTopWidth: 1,
    borderTopColor: theme.border,
  },

  searchAnotherText: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.textSecondary,
  },

  validationNo: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.danger,
    flexShrink: 1,
  },
});