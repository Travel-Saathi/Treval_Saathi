import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import PlaceMap from "./PlaceMap";
import type {
  JourneyStopMarker,
  PlaceMapRegion,
  PlaceMapStyle,
  PlaceMapDestination,
  RouteLeg,
  RouteSegment,
} from "./PlaceMap.types";
import type { RouteAttraction } from "../services/placesApi";
import { useAppTheme } from "../src/theme/ThemeProvider";

export interface CentralMapData {
  markers: JourneyStopMarker[];
  region: PlaceMapRegion;
  routeCoordinates?: import("./PlaceMap.types").RouteCoordinate[];
  routeLegs?: RouteLeg[];
  routeSegments?: RouteSegment[] | null;
  routeStats?: {
    distanceKilometers: number | null;
    durationMinutes: number | null;
  } | null;
  nextStopName?: string | null;
  warnings?: string[];
  routeLabel?: string | null;
  destination?: PlaceMapDestination | null;
}

export interface CentralMapProps {
  data: CentralMapData;
  height?: number;
  topInset?: number;
  bottomInset?: number;
  mapStyle?: PlaceMapStyle;
  onMapStyleChange?: (style: PlaceMapStyle) => void;
  onAttractionPress?: (attraction: RouteAttraction) => void;
  attractions?: RouteAttraction[];
  nextStopLabel?: boolean;
  onToggleMapMode?: () => void;
  onToggleMapModeLabel?: string;
}

/**
 * CentralMap is the SINGLE map entry point of the app. Every feature page
 * supplies normalized `data` (markers, region, route legs/segments built by
 * the transport route API) and CentralMap owns the only PlaceMap instance in
 * the tree. It never fetches from OSRM / live-train APIs itself and never
 * invents coordinates: when route segments are missing/empty it still renders
 * the markers + region and surfaces the caller's truthful `warnings`.
 */
export default function CentralMap({
  data,
  height = 320,
  topInset = 10,
  bottomInset = 10,
  mapStyle = "road",
  onMapStyleChange,
  onAttractionPress,
  attractions = [],
  nextStopLabel = false,
  onToggleMapMode,
  onToggleMapModeLabel,
}: CentralMapProps) {
  const [style, setStyle] = useState<PlaceMapStyle>(mapStyle);
  const [recenterRegion, setRecenterRegion] = useState<PlaceMapRegion | null>(null);
  const recenterKey = `${data.region.latitude.toFixed(4)}|${data.region.longitude.toFixed(4)}`;
  const appliedRef = useRef<string | null>(null);
  const { theme, dark } = useAppTheme();

  useEffect(() => {
    setStyle(mapStyle);
  }, [mapStyle]);

  const handleStyleChange = useCallback(
    (next: PlaceMapStyle) => {
      setStyle(next);
      onMapStyleChange?.(next);
    },
    [onMapStyleChange]
  );

  const handleRecenter = useCallback(() => {
    setRecenterRegion(data.region);
  }, [data.region]);

  useEffect(() => {
    if (appliedRef.current !== recenterKey) {
      appliedRef.current = recenterKey;
      setRecenterRegion(data.region);
    }
  }, [recenterKey, data.region]);

  const warnings = data.warnings ?? [];

  return (
    <View>
      <View style={[styles.mapWrap, { backgroundColor: theme.surfaceSecondary }]}>
        <PlaceMap
          places={[]}
          destination={data.destination ?? null}
          initialRegion={data.region}
          journeyStops={data.markers}
          routeCoordinates={data.routeCoordinates ?? []}
          routeLegs={data.routeLegs ?? []}
          routeSegments={data.routeSegments ?? undefined}
          attractions={attractions}
          onAttractionPress={onAttractionPress}
          mapStyle={style}
          onMapStyleChange={handleStyleChange}
          recenterRegion={recenterRegion}
          topInset={topInset}
          bottomInset={bottomInset}
          nextStopLabel={nextStopLabel}
        />
      </View>

      {warnings.length > 0 ? (
        <View style={styles.warningsWrap}>
          {warnings.map((warning, index) => (
            <View
              key={`warning-${index}`}
              style={[
                styles.warningChip,
                {
                  backgroundColor: dark
                    ? "rgba(248, 113, 113, 0.12)"
                    : "#FFE9E6",
                  borderColor: dark
                    ? "rgba(248, 113, 113, 0.35)"
                    : "#D93B1E33",
                },
              ]}
            >
              <Ionicons
                name="warning-outline"
                size={13}
                color={dark ? theme.danger : "#B42318"}
              />
              <Text
                style={[
                  styles.warningText,
                  { color: dark ? "#FDECEA" : "#B42318" },
                ]}
                numberOfLines={2}
              >
                {warning}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {onToggleMapMode ? (
        <Pressable
          accessibilityRole="button"
          onPress={onToggleMapMode}
          style={({ pressed }) => [
            styles.toggleButton,
            {
              borderColor: dark
                ? "rgba(96, 165, 250, 0.3)"
                : "#1287F533",
              backgroundColor: dark
                ? "rgba(96, 165, 250, 0.12)"
                : "#1287F511",
            },
            pressed && { opacity: 0.7 },
          ]}
        >
          <Ionicons
            name="git-branch-outline"
            size={14}
            color={dark ? "#60A5FA" : "#1287F5"}
          />
          <Text
            style={[
              styles.toggleText,
              { color: dark ? "#60A5FA" : "#1287F5" },
            ]}
          >
            {onToggleMapModeLabel ?? "Show Full Route"}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  mapWrap: {
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: "#EDEFF2",
  },
  warningsWrap: {
    gap: 6,
    paddingTop: 10,
  },
  warningChip: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "#FFE9E6",
    borderWidth: 1,
    borderColor: "#D93B1E33",
  },
  warningText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    color: "#B42318",
  },
  toggleButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#1287F533",
    backgroundColor: "#1287F511",
  },
  toggleText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1287F5",
  },
});
