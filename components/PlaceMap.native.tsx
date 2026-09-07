import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef } from "react";
import { StyleSheet, Text, View } from "react-native";
import MapView, { Marker, Polyline } from "react-native-maps";

import type {
  JourneyStopMarker,
  PlaceMapProps,
} from "./PlaceMap.types";

export default function PlaceMap({
  places,
  destination,
  selectedPlace,
  initialRegion,
  onPlacePress,
  journeyStops,
  routeCoordinates,
}: PlaceMapProps) {
  const mapRef = useRef<MapView>(null);

  const journeyMode = Array.isArray(journeyStops) && journeyStops.length > 0;

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
      {journeyMode && routeCoordinates && routeCoordinates.length > 1 && (
        <Polyline
          coordinates={routeCoordinates}
          strokeColor="#00BC26"
          strokeWidth={4}
          lineCap="round"
          lineJoin="round"
        />
      )}

      {journeyMode &&
        journeyStops.map((stop) => {
          if (
            !Number.isFinite(stop.latitude) ||
            !Number.isFinite(stop.longitude)
          ) {
            return null;
          }

          if (stop.kind === "source") {
            return (
              <Marker
                key={stop.key}
                coordinate={{
                  latitude: stop.latitude,
                  longitude: stop.longitude,
                }}
                title={stop.name}
                anchor={{ x: 0.5, y: 0.5 }}
              >
                <View style={styles.sourceMarkerWrap}>
                  <View style={styles.sourceMarker}>
                    <Ionicons
                      name="navigate"
                      size={16}
                      color="#FFFFFF"
                    />
                  </View>
                </View>
              </Marker>
            );
          }

          if (stop.kind === "destination") {
            return (
              <Marker
                key={stop.key}
                coordinate={{
                  latitude: stop.latitude,
                  longitude: stop.longitude,
                }}
                title={stop.name}
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
            );
          }

          return (
            <Marker
              key={stop.key}
              coordinate={{
                latitude: stop.latitude,
                longitude: stop.longitude,
              }}
              title={stop.name}
              anchor={{ x: 0.5, y: 0.5 }}
            >
              <View style={styles.stopMarkerWrap}>
                <View style={styles.stopMarker}>
                  <View style={styles.stopMarkerDot} />
                </View>
              </View>
            </Marker>
          );
        })}

      {!journeyMode && destination &&
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

      {!journeyMode &&
        places.map((place) => {
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
  sourceMarkerWrap: {
    alignItems: "center",
  },
  sourceMarker: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#0EA5E9",
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
  stopMarkerWrap: {
    alignItems: "center",
  },
  stopMarker: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#FFFFFF",
    borderWidth: 4,
    borderColor: "#00BC26",
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
  stopMarkerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#00BC26",
  },
});