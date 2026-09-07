import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
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

export interface CitySelection {
  id: string;
  name: string;
  formatted: string;
  latitude: number;
  longitude: number;
}

interface CitySearchSheetProps {
  visible: boolean;
  title: string;
  onClose: () => void;
  onSelect: (location: CitySelection) => void;
}

/**
 * Bottom-sheet city/place search modal.
 *
 * Mirrors the search used elsewhere in the app: debounced search
 * against the existing location service with request cancellation.
 */
export default function CitySearchSheet({
  visible,
  title,
  onClose,
  onSelect,
}: CitySearchSheetProps) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<CitySelection[]>([]);
  const [loading, setLoading] = useState(false);

  const requestIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!visible) {
      setSearch("");
      setResults([]);
      setLoading(false);

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

  function handleClose() {
    abortRef.current?.abort();
    onClose();
  }

  function handleSelect(location: CitySelection) {
    abortRef.current?.abort();
    onSelect(location);
  }

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
              <Ionicons name="close" size={20} color="#1C1C1E" />
            </Pressable>
          </View>

          <View style={styles.searchBar}>
            <Ionicons
              name="search"
              size={20}
              color="#6B7280"
              style={styles.searchIcon}
            />

            <TextInput
              style={styles.searchInput}
              placeholder="Search city or place..."
              placeholderTextColor="#9CA1A9"
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
                color="#00BC26"
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
                <Ionicons name="close-circle" size={18} color="#B0B5BC" />
              </Pressable>
            )}
          </View>

          {loading ? (
            <View style={styles.loadingState}>
              <ActivityIndicator size="large" color="#00BC26" />
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
              ListEmptyComponent={
                <Text style={styles.empty}>
                  {search.trim().length < 2
                    ? "Start typing to find a city or place."
                    : "No cities found. Try another search."}
                </Text>
              }
              renderItem={({ item }) => (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => handleSelect(item)}
                  style={({ pressed }) => [
                    styles.result,
                    pressed && styles.resultPressed,
                  ]}
                >
                  <View style={styles.resultIcon}>
                    <Ionicons name="location" size={20} color="#00BC26" />
                  </View>

                  <View style={styles.resultBody}>
                    <Text style={styles.resultName}>{item.name}</Text>
                    <Text style={styles.resultAddress} numberOfLines={2}>
                      {item.formatted}
                    </Text>
                  </View>

                  <Ionicons name="chevron-forward" size={18} color="#C3C7CD" />
                </Pressable>
              )}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },

  sheet: {
    backgroundColor: "#FFFFFF",
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
    color: "#1C1C1E",
    letterSpacing: -0.3,
  },

  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },

  closeButtonPressed: {
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

  loadingState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },

  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: "#6B7280",
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
    color: "#9CA1A9",
    paddingVertical: 30,
    paddingHorizontal: 20,
  },

  result: {
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

  resultPressed: {
    backgroundColor: "#F3F4F6",
  },

  resultIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#E7F9EB",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },

  resultBody: {
    flex: 1,
  },

  resultName: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1C1C1E",
  },

  resultAddress: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 17,
    color: "#6B7280",
  },
});