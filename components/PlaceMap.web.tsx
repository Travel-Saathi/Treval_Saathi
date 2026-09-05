import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";

import type { PlaceMapProps } from "./PlaceMap.types";

export default function PlaceMap({
  places: _places,
  destination: _destination,
  selectedPlace: _selectedPlace,
  initialRegion: _initialRegion,
  onPlacePress: _onPlacePress,
}: PlaceMapProps) {
  return (
    <View style={styles.webMap}>
      <Ionicons name="map-outline" size={42} color="#9CA1A9" />
      <Text style={styles.title}>Map view is unavailable on web</Text>
      <Text style={styles.subtitle}>Switch to List view to browse places.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  webMap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 24,
  },
  title: {
    marginTop: 12,
    fontSize: 16,
    fontWeight: "700",
    color: "#1C1C1E",
    textAlign: "center",
  },
  subtitle: {
    marginTop: 6,
    fontSize: 13,
    color: "#6B7280",
    textAlign: "center",
  },
});