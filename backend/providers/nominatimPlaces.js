/**
 * Nominatim (OpenStreetMap) place-search provider.
 *
 * Resolves a typed place name ("Lower Lake", "Taj-ul-Masajid", "Van Vihar")
 * into a concrete OSM feature: coordinates + `osm_type`/`osm_id`. It is the
 * name→place resolver for OSM Search in the Explore screen; the actual place
 * details are always fetched through the existing Overpass client, never
 * through a second OSM query pipeline.
 *
 *   - Search is biased (never bounded) to a viewbox around the current
 *     destination, so "Lower Lake" prefers Lower Lake, Bhopal over unrelated
 *     Lower Lakes elsewhere.
 *   - If the raw query returns nothing and the destination name is not
 *     already in the text, the search retries once with "<text> <city>".
 *   - A small in-memory cache (1h TTL) keeps repeat keystrokes from hitting
 *     Nominatim again; a User-Agent is always sent per the usage policy.
 */

const NOMINATIM_SEARCH_URL = "https://nominatim.openstreetmap.org/search";
const NOMINATIM_TIMEOUT_MS = 10000;
const CACHE_TTL_MS = 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 500;

/** Half-size of the destination viewbox, in degrees (~130 km bias). */
const VIEWBOX_HALF_LAT = 1.2;

const cache = new Map();

function clampInt(value, min, max, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, parsed));
}

const SEARCH_LIMIT = clampInt(
  process.env.NOMINATIM_SEARCH_LIMIT,
  3,
  20,
  8
);

/* --------------------------------------------------
   Cache helpers (mirrors the web-search service pattern)
-------------------------------------------------- */

function getCached(key) {
  const entry = cache.get(key);

  if (!entry) {
    return null;
  }

  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }

  return entry.payload;
}

function setCached(key, payload) {
  while (cache.size >= CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next().value;

    if (oldest === undefined) break;
    cache.delete(oldest);
  }

  cache.set(key, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    payload,
  });
}

function clonePayload(results) {
  return results.map((result) => ({ ...result }));
}

function clearNominatimCache() {
  cache.clear();
}

/* --------------------------------------------------
   Normalization
-------------------------------------------------- */

function normalizeNominatimResult(item) {
  const latitude = Number(item.lat);
  const longitude = Number(item.lon);

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude)
  ) {
    return null;
  }

  const address = item.address || {};
  const osmType = ["node", "way", "relation"].includes(item.osm_type)
    ? item.osm_type
    : null;
  const osmId = Number(item.osm_id);

  if (!osmType || !Number.isInteger(osmId) || osmId <= 0) {
    return null;
  }

  return {
    id: `osm-${osmType}-${osmId}`,
    name: item.name || address.name || null,
    displayName: item.display_name || null,
    latitude,
    longitude,
    osmType,
    osmId,
    /* Newer Nominatim API versions return `category` instead of `class`. */
    class: item.category || item.class || null,
    type: item.type || null,
    city:
      address.city ||
      address.town ||
      address.village ||
      address.municipality ||
      address.county ||
      null,
    state: address.state || null,
    country: address.country || null,
  };
}

function toList(value) {
  return Array.isArray(value) ? value : [];
}

/* --------------------------------------------------
   Request building
-------------------------------------------------- */

/**
 * A destination-anchored viewbox (minlon,minlat,maxlon,maxlat). Nominatim
 * treats it as a ranking bias: boxed candidates rank higher, out-of-box
 * results are still allowed.
 */
function buildViewbox(latitude, longitude) {
  const lonFactor = Math.max(
    0.35,
    Math.min(2.0, 1 / Math.cos((latitude * Math.PI) / 180))
  );
  const halfLon = VIEWBOX_HALF_LAT * lonFactor;

  return [
    (longitude - halfLon).toFixed(4),
    (latitude - VIEWBOX_HALF_LAT).toFixed(4),
    (longitude + halfLon).toFixed(4),
    (latitude + VIEWBOX_HALF_LAT).toFixed(4),
  ].join(",");
}

function buildSearchUrl(text, latitude, longitude, limit) {
  const params = new URLSearchParams({
    q: text,
    format: "jsonv2",
    addressdetails: "1",
    limit: String(limit),
    viewbox: buildViewbox(latitude, longitude),
    "accept-language": "en",
  });

  return `${NOMINATIM_SEARCH_URL}?${params.toString()}`;
}

/* --------------------------------------------------
   Search
-------------------------------------------------- */

async function fetchNominatim(url) {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    NOMINATIM_TIMEOUT_MS
  );

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "TravelSaathi/1.0",
        Accept: "application/json",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(
        `Nominatim search failed: ${response.status}`
      );
    }

    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function performSearch(text, latitude, longitude, limit) {
  const data = await fetchNominatim(
    buildSearchUrl(text, latitude, longitude, limit)
  );

  return toList(data)
    .map(normalizeNominatimResult)
    .filter(Boolean);
}

/**
 * Resolve a typed place name to OSM features near the destination.
 *
 * @param {object} input
 *   - text: the typed place name (required)
 *   - latitude / longitude: the current destination, used to bias results
 *   - city: optional destination name appended on a first-hit miss
 * @returns {Promise<Array>} provider-neutral Nominatim search results
 */
async function searchNominatimPlaces({ text, latitude, longitude, city }) {
  const query = String(text || "").trim();

  if (query.length < 2) {
    return [];
  }

  if (
    typeof latitude !== "number" ||
    !Number.isFinite(latitude) ||
    typeof longitude !== "number" ||
    !Number.isFinite(longitude)
  ) {
    throw new Error(
      "Latitude and longitude are required to bias the search"
    );
  }

  const key = [
    query,
    String(city || "").toLowerCase(),
    latitude.toFixed(3),
    longitude.toFixed(3),
    SEARCH_LIMIT,
  ]
    .join("|")
    .toLowerCase();

  const cached = getCached(key);

  if (cached) {
    return clonePayload(cached);
  }

  let results = await performSearch(
    query,
    latitude,
    longitude,
    SEARCH_LIMIT
  );

  /*
   * Bias: a plain "Lower Lake" query often surfaces unrelated lakes first,
   * even with a viewbox. Running a destination-pinned "<text> <city>"
   * search and merging its hits to the front guarantees the destination's
   * own features rank on top ("Lower Lake, Bhopal"), while keeping the
   * broader results as a fallback (bias, never bound).
   */
  const cityHint =
    city &&
    !query.toLowerCase().includes(String(city).toLowerCase())
      ? String(city).trim()
      : null;

  if (cityHint) {
    const cityResults = await performSearch(
      `${query} ${cityHint}`,
      latitude,
      longitude,
      SEARCH_LIMIT
    );

    if (cityResults.length > 0) {
      const seen = new Set(
        cityResults.map(
          (result) => `${result.osmType}/${result.osmId}`
        )
      );

      const fallback = results.filter(
        (result) =>
          !seen.has(`${result.osmType}/${result.osmId}`)
      );

      results = [...cityResults, ...fallback].slice(
        0,
        SEARCH_LIMIT
      );
    }
  }

  setCached(key, results);

  return results;
}

module.exports = {
  searchNominatimPlaces,
  clearNominatimCache,
};