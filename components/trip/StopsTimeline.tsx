import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";

import { formatShortDate } from "../../lib/tripDates";

type IoniconName = keyof typeof Ionicons.glyphMap;

interface TimelineCity {
  key: string;
  name: string;
  kind: "source" | "stop" | "destination";
  arrival?: string | null;
  departure?: string | null;
  index?: number;
}

/**
 * Ordered journey timeline (source → intermediate stops → destination).
 * Every city name is tappable and opens the City Details screen.
 */
export default function StopsTimeline({
  source,
  destination,
  stops,
  onOpenCity,
}: {
  source: string;
  destination: string;
  stops: {
    id: string;
    city: string;
    arrival_date?: string | null;
    departure_date?: string | null;
  }[];
  onOpenCity: (city: string) => void;
}) {
  const cities: TimelineCity[] = [
    {
      key: "source",
      name: source,
      kind: "source",
    },
    ...stops.map((stop, index) => ({
      key: stop.id,
      name: stop.city,
      kind: "stop" as const,
      arrival: stop.arrival_date ?? null,
      departure: stop.departure_date ?? null,
      index: index + 1,
    })),
    {
      key: "destination",
      name: destination,
      kind: "destination",
    },
  ];

  return (
    <View style={styles.timeline}>
      {cities.map((city, index) => {
        const isLast = index === cities.length - 1;
        const icon: IoniconName =
          city.kind === "source"
            ? "navigate"
            : city.kind === "destination"
              ? "star"
              : "location";

        return (
          <View key={city.key} style={styles.row}>
            <View style={styles.rail}>
              <View style={styles.markerWrap}>
                <View
                  style={[
                    styles.marker,
                    city.kind === "destination" && styles.markerDestination,
                    city.kind === "stop" && styles.markerStop,
                  ]}
                >
                  <Ionicons
                    name={icon}
                    size={city.kind === "stop" ? 10 : 12}
                    color={
                      city.kind === "stop" ? "#00BC26" : "#FFFFFF"
                    }
                  />
                </View>
              </View>
              {!isLast ? <View style={styles.railLine} /> : null}
            </View>

            <View style={styles.cityRow}>
              <View style={styles.cityNameRow}>
                {city.kind === "stop" && city.index !== undefined ? (
                  <Text style={styles.stopOrder}>{city.index}</Text>
                ) : null}
                <Text
                  style={[
                    styles.cityName,
                    city.kind === "destination" && styles.cityNameStrong,
                  ]}
                  onPress={() => onOpenCity(city.name)}
                >
                  {city.name}
                </Text>
                <Text style={styles.cityTag}>
                  {city.kind === "source"
                    ? "SOURCE"
                    : city.kind === "destination"
                      ? "DESTINATION"
                      : "STOP"}
                </Text>
              </View>

              {city.arrival || city.departure ? (
                <Text style={styles.cityDates}>
                  {city.arrival ? `Arr ${formatShortDate(city.arrival)}` : ""}
                  {city.arrival && city.departure ? " • " : ""}
                  {city.departure ? `Dep ${formatShortDate(city.departure)}` : ""}
                </Text>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  timeline: {
    gap: 0,
  },
  row: {
    flexDirection: "row",
  },
  rail: {
    width: 32,
    alignItems: "center",
  },
  markerWrap: {
    width: 32,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  marker: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#0EA5E9",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  markerDestination: {
    backgroundColor: "#00BC26",
  },
  markerStop: {
    backgroundColor: "#FFFFFF",
    borderWidth: 3,
    borderColor: "#00BC26",
  },
  railLine: {
    width: 2,
    minHeight: 34,
    flex: 1,
    backgroundColor: "#D1FAE5",
  },
  cityRow: {
    flex: 1,
    paddingBottom: 18,
    paddingTop: 3,
  },
  cityNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  stopOrder: {
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#E7F9EB",
    textAlign: "center",
    lineHeight: 16,
    fontSize: 10,
    fontWeight: "700",
    color: "#007A1E",
    overflow: "hidden",
  },
  cityName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1C1C1E",
  },
  cityNameStrong: {
    fontWeight: "800",
    color: "#007A1E",
  },
  cityTag: {
    fontSize: 9,
    fontWeight: "700",
    color: "#9CA3AF",
    letterSpacing: 0.5,
  },
  cityDates: {
    marginTop: 3,
    fontSize: 12,
    color: "#71717A",
  },
});