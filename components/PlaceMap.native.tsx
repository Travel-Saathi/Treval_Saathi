import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef } from "react";
import { StyleSheet, Text, View } from "react-native";
import MapView, { Marker } from "react-native-maps";

import type { PlaceMapProps } from "./PlaceMap.types";

export default function PlaceMap({
  places,
  destination,
  selectedPlace,
  initialRegion,
  onPlacePress,
}: PlaceMapProps) {
  const mapRef = useRef<MapView>(null);

  useEffect(() => {
    if (!selectedPlace) return;

    const timer = setTimeout(() => {
      mapRef.current?.animateToRegion(
        {
          latitude: selectedPlace.latitude,
          longitude: selectedPlace.longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        },
        600
      );
    }, 250);

    return () => clearTimeout(timer);
  }, [selectedPlace]);

  return (
    <MapView
      ref={mapRef}
      style={StyleSheet.absoluteFillObject}
      initialRegion={initialRegion}
    >
      {destination &&
        Number.isFinite(destination.latitude) &&
        Number.isFinite(destination.longitude) && (
          <Marker
            coordinate={{
              latitude: destination.latitude,
              longitude: destination.longitude,
            }}
            title={destination.name}
            description={destination.formatted}
          >
            <View style={styles.destinationMarkerWrap}>
              <View style={styles.destinationMarker}>
                <Ionicons name="star" size={15} color="#FFFFFF" />
              </View>
              <View style={styles.destinationLabel}>
                <Text style={styles.destinationLabelText}>Destination</Text>
              </View>
            </View>
          </Marker>
        )}

      {places.map((place) => {
        if (
          !Number.isFinite(place.latitude) ||
          !Number.isFinite(place.longitude)
        ) {
          return null;
        }

        return (
          <Marker
            key={place.id}
            coordinate={{
              latitude: place.latitude,
              longitude: place.longitude,
            }}
            onPress={() => onPlacePress?.(place)}
            pinColor={
              selectedPlace && place.id === selectedPlace.id
                ? "#00BC26"
                : "#64748B"
            }
          />
        );
      })}
    </MapView>
  );
}

const styles = StyleSheet.create({
  destinationMarkerWrap: {
    alignItems: "center",
  },
  destinationMarker: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#00BC26",
    borderWidth: 2,
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000000",
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    elevation: 3,
  },
  destinationLabel: {
    marginTop: 2,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: "rgba(255, 255, 255, 0.94)",
  },
  destinationLabelText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#1C1C1E",
  },
});