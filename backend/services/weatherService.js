/**
 * Lightweight Open-Meteo weather service.
 *
 * Fetches current weather, an hourly forecast and a daily
 * forecast from Open-Meteo and normalizes everything into a
 * provider-independent shape.
 *
 * The route layer and frontend only ever see the normalized
 * payload, so a different weather provider can replace
 * Open-Meteo later without changing any callers.
 *
 * All network calls use fetch + AbortController so a slow or
 * unreachable provider fails fast instead of hanging.
 */

/* --------------------------------------------------
   Endpoint defaults
-------------------------------------------------- */

const OPEN_METEO_BASE_URL =
  process.env.OPEN_METEO_BASE_URL ||
  "https://api.open-meteo.com/v1/forecast";

const REQUEST_TIMEOUT_MS = 10000;

const FORECAST_DAYS = 7;

/* --------------------------------------------------
   Request variables
-------------------------------------------------- */

/*
 * Open-Meteo variable names are tied to that provider; the
 * normalizers below translate them into app-facing names.
 */

const CURRENT_VARIABLES = [
  "temperature_2m",
  "apparent_temperature",
  "precipitation",
  "rain",
  "weather_code",
  "wind_speed_10m",
  "wind_direction_10m",
];

const HOURLY_VARIABLES = [
  "temperature_2m",
  "apparent_temperature",
  "precipitation_probability",
  "precipitation",
  "weather_code",
  "wind_speed_10m",
  "wind_direction_10m",
];

const DAILY_VARIABLES = [
  "weather_code",
  "temperature_2m_max",
  "temperature_2m_min",
  "precipitation_probability_max",
  "precipitation_sum",
  "wind_speed_10m_max",
  "sunrise",
  "sunset",
];

/* --------------------------------------------------
   Open-Meteo request helpers
-------------------------------------------------- */

function buildRequestParams({ latitude, longitude }) {
  return {
    latitude,
    longitude,

    current: CURRENT_VARIABLES.join(","),
    hourly: HOURLY_VARIABLES.join(","),
    daily: DAILY_VARIABLES.join(","),

    timezone: "auto",
    forecast_days: FORECAST_DAYS,
  };
}

/**
 * Perform a GET request against the Open-Meteo forecast API.
 * Throws a controlled error on non-OK or unparsable responses.
 */
async function fetchOpenMeteo(params) {
  const controller = new AbortController();

  const timer = setTimeout(() => {
    controller.abort();
  }, REQUEST_TIMEOUT_MS);

  try {
    const query = new URLSearchParams(params);

    const url = `${OPEN_METEO_BASE_URL}?${query.toString()}`;

    const response = await fetch(url, {
      method: "GET",

      headers: {
        Accept: "application/json",
        "User-Agent": "TrevalSaathi/1.0",
      },

      signal: controller.signal,
    });

    const text = await response.text();

    if (!response.ok) {
      throw new Error(
        `Open-Meteo HTTP ${response.status}: ${text.slice(0, 200)}`
      );
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error("Invalid JSON from Open-Meteo");
    }

    return data;
  } finally {
    clearTimeout(timer);
  }
}

/* --------------------------------------------------
   Normalization
-------------------------------------------------- */

/*
 * Normalize the current-weather block. Never invents
 * values: every missing field becomes null.
 */
function normalizeCurrent(current) {
  return {
    time: current?.time ?? null,

    temperature: current?.temperature_2m ?? null,

    apparentTemperature:
      current?.apparent_temperature ?? null,

    weatherCode: current?.weather_code ?? null,

    precipitation: current?.precipitation ?? null,
    rain: current?.rain ?? null,

    windSpeed: current?.wind_speed_10m ?? null,
    windDirection: current?.wind_direction_10m ?? null,
  };
}

/*
 * Normalize the hourly forecast arrays of values into an
 * array of hourly objects indexed by time.
 */
function normalizeHourly(hourly) {
  if (!hourly || !Array.isArray(hourly.time)) {
    return [];
  }

  return hourly.time.map((time, index) => ({
    time,

    temperature:
      hourly.temperature_2m?.[index] ?? null,

    apparentTemperature:
      hourly.apparent_temperature?.[index] ?? null,

    precipitationProbability:
      hourly.precipitation_probability?.[index] ?? null,

    precipitation:
      hourly.precipitation?.[index] ?? null,

    weatherCode:
      hourly.weather_code?.[index] ?? null,

    windSpeed: hourly.wind_speed_10m?.[index] ?? null,

    windDirection:
      hourly.wind_direction_10m?.[index] ?? null,
  }));
}

/*
 * Normalize the daily forecast arrays of values into an
 * array of daily objects indexed by date.
 */
function normalizeDaily(daily) {
  if (!daily || !Array.isArray(daily.time)) {
    return [];
  }

  return daily.time.map((date, index) => ({
    date,

    weatherCode: daily.weather_code?.[index] ?? null,

    temperatureMax:
      daily.temperature_2m_max?.[index] ?? null,

    temperatureMin:
      daily.temperature_2m_min?.[index] ?? null,

    precipitationProbabilityMax:
      daily.precipitation_probability_max?.[index] ?? null,

    precipitationSum:
      daily.precipitation_sum?.[index] ?? null,

    windSpeedMax:
      daily.wind_speed_10m_max?.[index] ?? null,

    sunrise: daily.sunrise?.[index] ?? null,
    sunset: daily.sunset?.[index] ?? null,
  }));
}

/* --------------------------------------------------
   Main lookup
-------------------------------------------------- */

/**
 * Fetch and normalize weather for a given coordinate.
 *
 * @param {object} args
 * @param {number} args.latitude
 * @param {number} args.longitude
 */
async function getWeather({ latitude, longitude }) {
  const params = buildRequestParams({ latitude, longitude });

  const data = await fetchOpenMeteo(params);

  return {
    location: {
      latitude: data.latitude ?? latitude,
      longitude: data.longitude ?? longitude,
      elevation: data.elevation ?? null,
      timezone: data.timezone ?? null,
      utcOffsetSeconds: data.utc_offset_seconds ?? null,
    },

    current: normalizeCurrent(data.current),
    hourly: normalizeHourly(data.hourly),
    daily: normalizeDaily(data.daily),
  };
}

module.exports = {
  getWeather,
};