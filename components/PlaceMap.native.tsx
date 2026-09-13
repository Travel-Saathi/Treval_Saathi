import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import MapView, { Marker, Polyline } from "react-native-maps";

import type {
  PlaceMapProps,
  PlaceMapStyle,
  RouteLeg,
  RouteLegState,
} from "./PlaceMap.types";
import { useAppTheme } from "../src/theme/ThemeProvider";

const ROUTE_GREEN = "#00BC26";
const ROUTE_GREEN_DARK = "#007A1E";
const ROUTE_GREEN_UPCOMING = "#46D37A";
const ROUTE_COMPLETED = "rgba(0, 188, 38, 0.32)";
const ROUTE_CASING = "#FFFFFF";
const CURRENT_LOCATION_BLUE = "#1287F5";

const LEG_COLORS: Record<RouteLegState, string> = {
  completed: ROUTE_COMPLETED,
  active: ROUTE_GREEN,
  upcoming: ROUTE_GREEN_UPCOMING,
};

const LEG_OUTLINES: Record<RouteLegState, string> = {
  completed: "rgba(80, 140, 100, 0.3)",
  active: ROUTE_GREEN_DARK,
  upcoming: ROUTE_GREEN_DARK,
};

const ROUTE_UNDERLAY_WIDTH = 11;
const ROUTE_CASING_WIDTH = 8.5;
const ROUTE_MAIN_WIDTH = 6;

const CONTROL_TOP = 12;
const CONTROL_GAP = 46;
const ZOOM_TOP = CONTROL_TOP + CONTROL_GAP;
const LOCATE_TOP = ZOOM_TOP + CONTROL_GAP + 6;

function hasUsableCoordinates(leg: RouteLeg): boolean {
  return leg.coordinates.length > 1;
}

export default function PlaceMap({
  places,
  destination,
  selectedPlace,
  initialRegion,
  onPlacePress,
  journeyStops,
  routeCoordinates,
  routeLegs,
  attractions,
  onAttractionPress,
  mapStyle = "road",
  onMapStyleChange,
  recenterRegion,
  nextStopLabel = false,
  topInset = 0,
  bottomInset = 0,
}: PlaceMapProps) {
  const mapRef = useRef<MapView>(null);
  const { theme } = useAppTheme();

  const journeyMode = Array.isArray(journeyStops) && journeyStops.length > 0;
  const satellite = mapStyle === "satellite";

  const controlTones = useMemo(
    () => ({
      surface: theme.surface,
      border: theme.border,
      text: theme.text,
      textSecondary: theme.textSecondary,
      pillBg: satellite ? "#FFFFFF" : theme.surface,
    }),
    [theme, satellite]
  );

  const legs = useMemo<RouteLeg[]>(() => {
    if (hasRouteLegs(routeLegs)) return routeLegs;
    if (Array.isArray(routeCoordinates) && routeCoordinates.length > 1) {
      return [{ id: "route", coordinates: routeCoordinates, state: "active" as const }];
    }
    return [];
  }, [routeLegs, routeCoordinates]);

  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!journeyMode) return;

    const loop = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: 2400,
        useNativeDriver: true,
      })
    );

    loop.start();

    return () => loop.stop();
  }, [journeyMode, pulse]);

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

  const handleRecenter = useCallback(() => {
    const target =
      recenterRegion ??
      (Number.isFinite(initialRegion.latitude) ? initialRegion : null);

    if (!target) return;

    mapRef.current?.animateToRegion(
      {
        latitude: target.latitude,
        longitude: target.longitude,
        latitudeDelta: target.latitudeDelta || 0.05,
        longitudeDelta: target.longitudeDelta || 0.05,
      },
      450
    );
  }, [recenterRegion, initialRegion]);

  const recenterKey = useMemo(() => {
    if (!recenterRegion) return null;
    return [
      recenterRegion.latitude,
      recenterRegion.longitude,
      recenterRegion.latitudeDelta,
      recenterRegion.longitudeDelta,
    ].join("|");
  }, [recenterRegion]);

  useEffect(() => {
    if (recenterKey) handleRecenter();
  }, [recenterKey, handleRecenter]);

  function handleZoomStep(step: number) {
    const map = mapRef.current;

    if (
      !map ||
      typeof map.getCamera !== "function" ||
      typeof map.animateCamera !== "function"
    ) {
      return;
    }

    map
      .getCamera()
      .then((camera) => {
        if (!camera || typeof camera.zoom !== "number") return;

        const zoom = Math.max(3, Math.min(19, camera.zoom + step));

        map.animateCamera({ ...camera, zoom }, { duration: 250 });
      })
      .catch(() => {});
  }

  function selectStyle(style: PlaceMapStyle) {
    onMapStyleChange?.(style);
  }

  const sourceScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.65],
  });
  const sourceOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.45, 0],
  });

  const drawLegs = legs.filter(hasUsableCoordinates);

  return (
    <View style={styles.fill}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        initialRegion={initialRegion}
        mapType={satellite ? "hybrid" : "standard"}
      >
        {journeyMode && drawLegs.length > 0 && (
          <>
            {drawLegs.map((leg) => (
              <Polyline
                key={`${leg.id}-casing`}
                coordinates={leg.coordinates}
                strokeColor={ROUTE_CASING}
                strokeWidth={ROUTE_CASING_WIDTH}
                lineCap="round"
                lineJoin="round"
              />
            ))}

            {drawLegs.map((leg) => (
              <Polyline
                key={`${leg.id}-main`}
                coordinates={leg.coordinates}
                strokeColor={LEG_COLORS[leg.state]}
                strokeWidth={ROUTE_MAIN_WIDTH}
                lineCap="round"
                lineJoin="round"
              />
            ))}

            {drawLegs.map((leg) => (
              <Polyline
                key={`${leg.id}-underlay`}
                coordinates={leg.coordinates}
                strokeColor={LEG_OUTLINES[leg.state]}
                strokeWidth={ROUTE_UNDERLAY_WIDTH}
                lineCap="round"
                lineJoin="round"
                zIndex={-1}
              />
            ))}
          </>
        )}

        {journeyMode &&
          attractions &&
          attractions.map((attraction) => {
            if (
              !Number.isFinite(attraction.latitude) ||
              !Number.isFinite(attraction.longitude)
            ) {
              return null;
            }

            const description = [
              attraction.category,
              attraction.distanceText,
            ]
              .filter(Boolean)
              .join(" • ");

            return (
              <Marker
                key={attraction.id}
                coordinate={{
                  latitude: attraction.latitude as number,
                  longitude: attraction.longitude as number,
                }}
                title={attraction.name ?? "Point of interest"}
                description={description}
                onPress={() => onAttractionPress?.(attraction)}
                anchor={{ x: 0.5, y: 0.5 }}
              >
                <View style={styles.attractionMarkerWrap}>
                  <View style={styles.attractionMarker}>
                    <Ionicons name="camera" size={15} color="#FFFFFF" />
                  </View>
                </View>
              </Marker>
            );
          })}

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
                    <Animated.View
                      style={[
                        styles.sourceHalo,
                        {
                          opacity: sourceOpacity,
                          transform: [{ scale: sourceScale }],
                        },
                      ]}
                    />
                    <View style={styles.sourceMarker}>
                      <View style={styles.sourceDot} />
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
                      <Ionicons name="star" size={17} color="#FFFFFF" />
                    </View>
                    <View
                      style={[
                        styles.destinationLabel,
                        { backgroundColor: controlTones.pillBg },
                      ]}
                    >
                      <Text style={[styles.destinationLabelText, { color: controlTones.text }]}>
                        {nextStopLabel ? "Next Stop" : "Destination"}
                      </Text>
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
                  <Ionicons name="star" size={17} color="#FFFFFF" />
                </View>
                <View
                  style={[
                    styles.destinationLabel,
                    { backgroundColor: controlTones.pillBg },
                  ]}
                >
                  <Text style={[styles.destinationLabelText, { color: controlTones.text }]}>
                    Destination
                  </Text>
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

      {/* Map style control */}
      <View
        style={[
          styles.stylePill,
          {
            top: CONTROL_TOP + topInset,
            backgroundColor: controlTones.pillBg,
            borderColor: controlTones.border,
          },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Road map"
          accessibilityState={{ selected: !satellite }}
          onPress={() => selectStyle("road")}
          style={({ pressed }) => [
            styles.styleOption,
            !satellite && styles.styleOptionActive,
            pressed && styles.pressed,
          ]}
        >
          {!satellite ? (
            <Ionicons name="map" size={13} color="#FFFFFF" />
          ) : (
            <Ionicons name="map-outline" size={13} color={controlTones.text} />
          )}
          <Text style={[styles.styleOptionText, !satellite && styles.styleOptionTextActive, { color: !satellite ? "#FFFFFF" : controlTones.text }]}>
            Road
          </Text>
        </Pressable>
        <View style={[styles.styleDivider, { backgroundColor: controlTones.border }]} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Satellite map"
          accessibilityState={{ selected: satellite }}
          onPress={() => selectStyle("satellite")}
          style={({ pressed }) => [
            styles.styleOption,
            satellite && styles.styleOptionActive,
            pressed && styles.pressed,
          ]}
        >
          {satellite ? (
            <Ionicons name="earth" size={13} color="#FFFFFF" />
          ) : (
            <Ionicons name="earth-outline" size={13} color={controlTones.text} />
          )}
          <Text style={[styles.styleOptionText, satellite && styles.styleOptionTextActive, { color: satellite ? "#FFFFFF" : controlTones.text }]}>
            Satellite
          </Text>
        </Pressable>
      </View>

      {/* Zoom controls */}
      <View
        style={[
          styles.zoomControls,
          {
            top: ZOOM_TOP + topInset,
            backgroundColor: controlTones.pillBg,
            borderColor: controlTones.border,
          },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Zoom in"
          onPress={() => handleZoomStep(1)}
          style={({ pressed }) => [
            styles.zoomButton,
            pressed && styles.locateButtonPressed,
          ]}
        >
          <Ionicons name="add" size={18} color={controlTones.text} />
        </Pressable>

        <View style={[styles.zoomDivider, { backgroundColor: controlTones.border }]} />

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Zoom out"
          onPress={() => handleZoomStep(-1)}
          style={({ pressed }) => [
            styles.zoomButton,
            pressed && styles.locateButtonPressed,
          ]}
        >
          <Ionicons name="remove" size={18} color={controlTones.text} />
        </Pressable>
      </View>

      {/* My location / re-centre */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="My location"
        onPress={handleRecenter}
        style={({ pressed }) => [
          styles.locateButton,
          {
            top: LOCATE_TOP + topInset,
            backgroundColor: controlTones.pillBg,
            borderColor: controlTones.border,
          },
          pressed && styles.locateButtonPressed,
        ]}
      >
        <Ionicons name="locate" size={18} color="#00BC26" />
        <View style={styles.locatePing} />
      </Pressable>
    </View>
  );
}

function hasRouteLegs(routeLegs: RouteLeg[] | undefined): routeLegs is RouteLeg[] {
  return Array.isArray(routeLegs) && routeLegs.length > 0;
}

const styles = StyleSheet.create({
  fill: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
  },
  destinationMarkerWrap: {
    alignItems: "center",
  },
  destinationMarker: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#00BC26",
    borderWidth: 3,
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000000",
    shadowOpacity: 0.28,
    shadowRadius: 6,
    shadowOffset: {
      width: 0,
      height: 3,
    },
    elevation: 5,
  },
  destinationLabel: {
    marginTop: 3,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
  },
  destinationLabelText: {
    fontSize: 10,
    fontWeight: "700",
  },
  sourceMarkerWrap: {
    width: 54,
    height: 54,
    alignItems: "center",
    justifyContent: "center",
  },
  sourceHalo: {
    position: "absolute",
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: "rgba(18, 135, 245, 0.45)",
  },
  sourceMarker: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: CURRENT_LOCATION_BLUE,
    borderWidth: 3,
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000000",
    shadowOpacity: 0.28,
    shadowRadius: 6,
    shadowOffset: {
      width: 0,
      height: 3,
    },
    elevation: 5,
  },
  sourceDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#FFFFFF",
  },
  stopMarkerWrap: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  stopMarker: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    borderWidth: 3,
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
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: "#00BC26",
  },
  attractionMarkerWrap: {
    alignItems: "center",
  },
  attractionMarker: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#F59E0B",
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
  stylePill: {
    position: "absolute",
    left: 12,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    padding: 3,
    shadowColor: "#000000",
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: {
      width: 0,
      height: 3,
    },
    elevation: 4,
  },
  styleOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 9,
  },
  styleOptionActive: {
    backgroundColor: "#00BC26",
  },
  styleOptionText: {
    fontSize: 12,
    fontWeight: "700",
  },
  styleOptionTextActive: {
    color: "#FFFFFF",
  },
  styleDivider: {
    width: 1,
    height: 16,
  },
  zoomControls: {
    position: "absolute",
    right: 12,
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
    shadowColor: "#000000",
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: {
      width: 0,
      height: 3,
    },
    elevation: 4,
  },
  zoomButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  zoomDivider: {
    height: 1,
    marginHorizontal: 4,
  },
  locateButton: {
    position: "absolute",
    right: 12,
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000000",
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: {
      width: 0,
      height: 3,
    },
    elevation: 4,
  },
  locateButtonPressed: {
    opacity: 0.75,
  },
  locatePing: {
    position: "absolute",
    right: 7,
    top: 7,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#00BC26",
  },
  pressed: {
    opacity: 0.75,
  },
});