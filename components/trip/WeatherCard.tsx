import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { weatherConditionLabel, dailyWeatherSummary } from "../../lib/weatherLabels";
import { formatShortDate } from "../../lib/tripDates";
import { resolveCityCoordinates } from "../../services/routeApi";
import type { WeatherResponse } from "../../services/weatherApi";
import { getWeather } from "../../services/weatherApi";
import {
  BlockError,
  BlockLoading,
  SectionTitle,
} from "./primitives";

interface CityCoords {
  latitude: number;
  longitude: number;
}

/**
 * Self-contained weather block. It owns its loading/error state so a
 * weather outage never affects the rest of the page. The city name is
 * clickable and opens City Details.
 */
export default function WeatherCard({
  city,
  coords,
  onOpenCity,
}: {
  city: string;
  coords?: CityCoords | null;
  onOpenCity?: (city: string) => void;
}) {
  const [state, setState] = useState<"loading" | "ready" | "error">(
    "loading"
  );
  const [weather, setWeather] = useState<WeatherResponse | null>(null);
  const [attempt, setAttempt] = useState(0);

  const load = useCallback(async () => {
    setState("loading");

    try {
      const point =
        coords ??
        (await resolveCityCoordinates(city));

      const result = await getWeather(
        point.latitude,
        point.longitude
      );

      if (result.current) {
        setWeather(result);
        setState("ready");
      } else {
        setState("error");
      }
    } catch {
      setState("error");
    }
  }, [city, coords]);

  useEffect(() => {
    load();
  }, [load, attempt]);

  function retry() {
    setAttempt((value) => value + 1);
  }

  const current = weather?.current ?? null;
  const today = weather?.daily?.[0] ?? null;
  const upcomingDays = weather?.daily?.slice(1, 4) ?? [];

  return (
    <View>
      <SectionTitle
        icon="partly-sunny"
        title="Weather"
        subtitle={city}
      />

      {state === "loading" ? <BlockLoading label="Loading weather…" /> : null}

      {state === "error" ? (
        <BlockError
          message="Weather could not be loaded for this city."
          onRetry={retry}
        />
      ) : null}

      {state === "ready" && current ? (
        <View style={styles.card}>
          <View style={styles.nowRow}>
            <View style={styles.tempBlock}>
              <Text style={styles.temp}>
                {current.temperature !== null
                  ? `${Math.round(current.temperature)}°`
                  : "—"}
              </Text>
              {today?.temperatureMax !== null && today?.temperatureMin !== null ? (
                <Text style={styles.hiLo}>
                  {Math.round(today?.temperatureMax ?? 0)}° /{" "}
                  {Math.round(today?.temperatureMin ?? 0)}°
                </Text>
              ) : null}
            </View>
            <View style={styles.conditionBlock}>
              <Text style={styles.condition}>
                {current.weatherCode === null
                  ? "Weather"
                  : weatherConditionLabel(current.weatherCode)}
              </Text>
              <Text style={styles.feelsLike}>
                {current.apparentTemperature !== null
                  ? `Feels like ${Math.round(current.apparentTemperature)}°`
                  : "Current conditions"}
              </Text>
            </View>
            {onOpenCity ? (
              <Pressable
                onPress={() => onOpenCity(city)}
                style={({ pressed }) => pressed && styles.pressed}
              >
                <Text style={styles.cityLink}>City →</Text>
              </Pressable>
            ) : null}
          </View>

          {upcomingDays.length > 0 ? (
            <View style={styles.forecastRow}>
              {upcomingDays.map((day) => {
                const summary = dailyWeatherSummary(day);
                return (
                  <View key={day.date} style={styles.forecastItem}>
                    <Text style={styles.forecastDay}>
                      {formatShortDate(day.date)}
                    </Text>
                    <Text
                      style={styles.forecastSummary}
                      numberOfLines={1}
                    >
                      {summary ?? "—"}
                    </Text>
                  </View>
                );
              })}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 16,
  },
  nowRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  tempBlock: {
    minWidth: 90,
  },
  temp: {
    fontSize: 40,
    fontWeight: "800",
    color: "#1C1C1E",
    lineHeight: 44,
  },
  hiLo: {
    fontSize: 12,
    color: "#71717A",
  },
  conditionBlock: {
    flex: 1,
    paddingLeft: 10,
  },
  condition: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1C1C1E",
  },
  feelsLike: {
    fontSize: 12,
    color: "#71717A",
    marginTop: 2,
  },
  cityLink: {
    fontSize: 13,
    fontWeight: "700",
    color: "#00BC26",
  },
  pressed: {
    opacity: 0.7,
  },
  forecastRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#F1F3F5",
  },
  forecastItem: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 10,
    backgroundColor: "#F9FAFB",
    alignItems: "center",
  },
  forecastDay: {
    fontSize: 11,
    fontWeight: "700",
    color: "#52525B",
    marginBottom: 3,
  },
  forecastSummary: {
    fontSize: 11,
    color: "#3F3F46",
    textAlign: "center",
  },
});