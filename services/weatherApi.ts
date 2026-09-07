import { API_BASE_URL } from "./locationApi";

/**
 * Provider-independent Travel Saathi weather model.
 *
 * Mirrors the normalized shape returned by the backend
 * GET /api/weather endpoint, which never exposes raw
 * Open-Meteo data.
 */

export interface WeatherLocation {
  latitude: number;
  longitude: number;
  elevation: number | null;
  timezone: string | null;
  utcOffsetSeconds: number | null;
}

export interface CurrentWeather {
  time: string | null;

  temperature: number | null;
  apparentTemperature: number | null;

  weatherCode: number | null;

  precipitation: number | null;
  rain: number | null;

  windSpeed: number | null;
  windDirection: number | null;
}

export interface HourlyWeather {
  time: string;

  temperature: number | null;
  apparentTemperature: number | null;

  precipitationProbability: number | null;
  precipitation: number | null;

  weatherCode: number | null;

  windSpeed: number | null;
  windDirection: number | null;
}

export interface DailyWeather {
  date: string;

  weatherCode: number | null;

  temperatureMax: number | null;
  temperatureMin: number | null;

  precipitationProbabilityMax: number | null;
  precipitationSum: number | null;

  windSpeedMax: number | null;

  sunrise: string | null;
  sunset: string | null;
}

export interface WeatherResponse {
  location: WeatherLocation;
  current: CurrentWeather;
  hourly: HourlyWeather[];
  daily: DailyWeather[];
}

/**
 * Fetch and normalized weather for a coordinate from the
 * backend GET /api/weather endpoint.
 */
export async function getWeather(
  latitude: number,
  longitude: number
): Promise<WeatherResponse> {
  const query = new URLSearchParams({
    lat: String(latitude),
    lon: String(longitude),
  });

  let response: Response;

  try {
    response = await fetch(
      `${API_BASE_URL}/api/weather?${query.toString()}`
    );
  } catch (error) {
    throw new Error(
      "Could not reach the weather service. Is the backend running?"
    );
  }

  if (!response.ok) {
    throw new Error(
      `Weather request failed: ${response.status}`
    );
  }

  const data: unknown = await response.json();

  if (
    !data ||
    typeof data !== "object" ||
    !("current" in data) ||
    !("hourly" in data) ||
    !("daily" in data)
  ) {
    throw new Error(
      "Weather service returned an unexpected response"
    );
  }

  return data as WeatherResponse;
}