import type { DailyWeather } from "../services/weatherApi";

/**
 * Human-readable labels for Open-Meteo weather codes. The backend
 * normalizes the payload but keeps the provider's numeric code, so the
 * mapping stays client-side (same mapping used by Journey Setup).
 */
export function weatherConditionLabel(code: number): string {
  if (code === 0) {
    return "Clear sky";
  }

  if (code === 1 || code === 2) {
    return "Partly cloudy";
  }

  if (code === 3) {
    return "Overcast";
  }

  if (code >= 45 && code <= 48) {
    return "Foggy";
  }

  if (code >= 51 && code <= 67) {
    return "Rainy";
  }

  if (code >= 71 && code <= 86) {
    return "Snowy";
  }

  if (code >= 95) {
    return "Stormy";
  }

  return "Weather";
}

/**
 * Short forecast line for a daily entry, e.g. "24°/18° • Partly cloudy".
 * Returns null when the day has no usable data.
 */
export function dailyWeatherSummary(
  day: DailyWeather | undefined
): string | null {
  if (!day) {
    return null;
  }

  const max = day.temperatureMax;
  const min = day.temperatureMin;

  if (max === null && min === null) {
    return null;
  }

  const temps =
    max !== null && min !== null
      ? `${Math.round(max)}°/${Math.round(min)}°`
      : `${Math.round((max ?? min) ?? 0)}°`;

  const condition =
    day.weatherCode === null ? null : weatherConditionLabel(day.weatherCode);

  return condition ? `${temps} • ${condition}` : `${temps}`;
}