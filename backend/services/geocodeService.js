/**
 * Lightweight geocoding provider backed by the existing Geoapify geocoder
 * (built on OpenStreetMap data), which the project already uses for
 * GET /api/location/search. Provider-agnostic: callers only ever see
 * normalized `{ name, formatted, latitude, longitude, city, ... }` results.
 *
 * Used by the route-attractions pipeline to enrich/validate web-search
 * attraction results with real coordinates. It is NOT a discovery source.
 */

const GEOAPIFY_GEOCODE_URL =
  "https://api.geoapify.com/v1/geocode/search";
const GEOAPIFY_REVERSE_URL =
  "https://api.geoapify.com/v1/geocode/reverse";
const GEOCODE_TIMEOUT_MS = 8000;

function normalizeLocation(item) {
  return {
    id: item.place_id ?? null,
    name:
      item.name ||
      item.city ||
      item.state ||
      item.country ||
      null,
    city: item.city || null,
    state: item.state || null,
    country: item.country || null,
    formatted: item.formatted || null,
    latitude:
      typeof item.lat === "number" && Number.isFinite(item.lat)
        ? item.lat
        : null,
    longitude:
      typeof item.lon === "number" && Number.isFinite(item.lon)
        ? item.lon
        : null,
  };
}

async function fetchGeoapify(url) {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    GEOCODE_TIMEOUT_MS
  );

  try {
    const response = await fetch(url, {
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(
        `Geoapify geocoding failed: ${response.status}`
      );
    }

    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function buildGeocodeUrl(text, limit) {
  return (
    `${GEOAPIFY_GEOCODE_URL}` +
    `?text=${encodeURIComponent(String(text).trim())}` +
    `&limit=${Number(limit) > 0 ? Number(limit) : 10}` +
    `&format=json` +
    `&apiKey=${process.env.GEOAPIFY_API_KEY}`
  );
}

/**
 * Search for a place by free text. Returns [] on missing/short input,
 * and [] (never throws) when geocoding itself fails so callers treating
 * enrichment as best-effort do not blow up the whole pipeline.
 */
async function geocodeSearch({ text, limit = 10 }) {
  if (!text || String(text).trim().length < 2) {
    return [];
  }

  const data = await fetchGeoapify(
    buildGeocodeUrl(text, limit)
  );

  return (data.results || [])
    .map(normalizeLocation)
    .filter(
      (item) =>
        item.latitude !== null && item.longitude !== null
    );
}

/**
 * Resolve the nearest named place (usually the city) for a coordinate.
 * Returns null when nothing resolves.
 */
async function reverseGeocode({ latitude, longitude }) {
  if (
    typeof latitude !== "number" ||
    !Number.isFinite(latitude) ||
    typeof longitude !== "number" ||
    !Number.isFinite(longitude)
  ) {
    return null;
  }

  const url =
    `${GEOAPIFY_REVERSE_URL}` +
    `?lat=${latitude}&lon=${longitude}` +
    `&format=json` +
    `&apiKey=${process.env.GEOAPIFY_API_KEY}`;

  const data = await fetchGeoapify(url);

  const first = (data.results || [])[0];

  if (!first) return null;

  const place = normalizeLocation(first);

  if (place.latitude === null || place.longitude === null) {
    return null;
  }

  return place;
}

module.exports = {
  geocodeSearch,
  reverseGeocode,
};