/**
 * City discovery service ("Explore City").
 *
 * OpenSERP — through the provider-agnostic webSearchService — is the PRIMARY
 * discovery source for every category (hotels, attractions, restaurants,
 * cafes, fuel, temples, custom categories, ...). It never queries Overpass,
 * and it never uses geographic data as the first step:
 *
 *   cityDiscoveryService
 *        |-> webSearchService (provider-agnostic) -> OpenSERP
 *        |-> geocodeService (optional OSM/GIS enrichment only)
 *        |-> normalize + dedupe + rank
 *        +-> existing UI
 *
 * GIS/OSM is used only for optional coordinate enrichment and geographic
 * validation of already-discovered places (see the OSM USAGE section of the
 * feature spec). Coordinates are never fabricated: a valid result without a
 * resolved coordinate still appears in the list, only without a map marker.
 *
 * The query is always built as "<category phrase> in <city>", so the selected
 * category directly drives the search. Custom categories are sanitized and,
 * when the input reads better pluralized (e.g. "dhaba" -> "dhabas"), a best
 * effort pluralization is applied before building the query.
 */

const {
  searchWeb,
} = require("./webSearchService");

const {
  geocodeSearch,
} = require("./geocodeService");

const {
  stripTitleNoise,
  isListicleTitle,
  isNonPlaceResult,
  isUrlLike,
  extractSnippetNames,
  geocodeAttraction,
  normalizeName,
  haversineKm,
} = require("./attractionsAlongRouteService");

const DEFAULT_MAX_RESULTS = 20;
const WEB_SEARCH_LIMIT = 20;
const WEB_SEARCH_QUERY_TIMEOUT_MS =
  Number(process.env.WEB_SEARCH_QUERY_TIMEOUT_MS) > 0
    ? Number(process.env.WEB_SEARCH_QUERY_TIMEOUT_MS)
    : 45000;
const GEOCODE_BATCH_SIZE = 4;
const MAX_GEOCODE_CANDIDATES = 24;
const GEOCODE_PROXIMITY_MERGE_KM = 1.5;
const MAX_CITY_DISTANCE_KM = 200;

/**
 * Central category configuration. Adding a new preset category is a single
 * one-line entry here — no new backend/API needed. Custom categories are
 * handled generically and do not need an entry at all.
 */
const CATEGORY_QUERY_TERMS = {
  temple: "temples",
  temples: "temples",
  "tourist-attraction": "tourist attractions",
  attraction: "tourist attractions",
  attractions: "tourist attractions",
  restaurant: "restaurants",
  restaurants: "restaurants",
  hotel: "hotels",
  hotels: "hotels",
  cafe: "cafes",
  cafes: "cafes",
  "gas-station": "fuel stations",
  fuel: "fuel stations",
  "petrol-pump": "petrol pumps",
  petrolpump: "petrol pumps",
  museum: "museums",
  museums: "museums",
  "art-gallery": "art galleries",
  park: "parks and gardens",
  parks: "parks and gardens",
  shopping: "shopping",
  mall: "shopping malls",
  market: "local markets",
  hospital: "hospitals",
  hospitals: "hospitals",
  pharmacy: "pharmacies",
  pharmacies: "pharmacies",
  dhaba: "dhabas",
  dhabas: "dhabas",
  parking: "parking",
  "ev-charging": "EV charging stations",
  "bus-station": "bus stations",
  busstation: "bus stations",
  "railway-station": "railway stations",
  railwaystation: "railway stations",
  "tourist-guide": "tourist guides",
  "bike-rental": "bike rentals",
  "bike-rentals": "bike rentals",
};

/**
 * Custom single-word categories whose conventional search term is not a
 * pluralized form of the typed word (e.g. "mandir", "gurudwara"). These are
 * kept verbatim in the query.
 */
const CUSTOM_NEVER_PLURALIZE = new Set([
  "mandir",
  "gurudwara",
  "mosque",
  "church",
  "ashram",
  "gurudwara sahib",
]);

/* --------------------------------------------------
   Input sanitization
-------------------------------------------------- */

function sanitizeText(value) {
  return String(value || "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/[%_\\/;:"'{}[\]|]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

/**
 * Best-effort singular -> search-friendly pluralization for a single custom
 * category word. Multi-word phrases and already-plural/generic nouns are left
 * untouched, which keeps "street food", "bike rental", "parking" natural.
 */
function pluralizeCustomCategory(term) {
  const value = String(term || "").trim();

  if (!value) {
    return value;
  }

  const lower = value.toLowerCase();

  if (CUSTOM_NEVER_PLURALIZE.has(lower)) {
    return value;
  }

  const words = value.split(/\s+/);

  if (words.length > 1) {
    return value;
  }

  if (/(ing|s|x|z|ss|sh|ch|ee)$/i.test(value)) {
    return value;
  }

  if (/[bcdfghjklmnpqrstvwxyz]y$/i.test(value)) {
    return `${value.slice(0, -1)}ies`;
  }

  return `${value}s`;
}

/**
 * Build the natural search query for a category + city combination.
 *
 *   buildCitySearchQuery({ category: "hotel", city: "New Delhi" })
 *     => "hotels in New Delhi"
 *
 *   buildCitySearchQuery({ custom: "mandir", city: "New Delhi" })
 *     => "mandir in New Delhi"
 *
 * Works for any city, preset or custom category.
 */
function buildCitySearchQuery({ category, custom, city }) {
  const cleanCity = sanitizeText(city);

  if (cleanCity === "" || (category === "" && custom === "")) {
    return null;
  }

  const customTerm = sanitizeText(custom);

  if (customTerm !== "") {
    const term = pluralizeCustomCategory(customTerm);
    return `${term} in ${cleanCity}`;
  }

  const cleanCategory = sanitizeText(category);

  if (cleanCategory === "") {
    return null;
  }

  const term =
    CATEGORY_QUERY_TERMS[cleanCategory.toLowerCase()] ||
    cleanCategory;

  return `${term} in ${cleanCity}`;
}

function resolveCategoryLabel({ category, custom }) {
  const customTerm = sanitizeText(custom);

  if (customTerm !== "") {
    return pluralizeCustomCategory(customTerm);
  }

  const cleanCategory = sanitizeText(category).toLowerCase();

  return (
    CATEGORY_QUERY_TERMS[cleanCategory] ||
    cleanCategory ||
    "places"
  );
}

/* --------------------------------------------------
   Helpers
-------------------------------------------------- */

function formatDistanceText(meters) {
  if (typeof meters !== "number" || !Number.isFinite(meters)) {
    return null;
  }

  if (meters < 1000) {
    return `${Math.round(meters)} m away`;
  }

  return `${(meters / 1000).toFixed(1)} km away`;
}

function cleanWebsiteUrl(url) {
  const value = String(url || "").trim();

  if (!value) {
    return null;
  }

  try {
    const host = new URL(value).hostname.toLowerCase();

    if (
      host === "google.com" ||
      host.endsWith(".google.com") ||
      host.includes("google.com/goto")
    ) {
      return null;
    }
  } catch {
    return null;
  }

  return value;
}

function rankPlace(place) {
  let score = 0;

  if (place.latitude !== null && place.longitude !== null) score += 3;
  if (place.description) score += 2;
  if (place.website) score += 1;
  if (place.rating && Number(place.rating) > 0) score += 2;
  if (place.ratingCount && Number(place.ratingCount) > 0) score += 1;
  if (place.address) score += 1;
  if (place.distanceMeters !== null) score += 1;
  if (!place.listicle) score += 1;

  return score;
}

function mergePlaces(target, source) {
  target.name = target.name || source.name;
  target.description = target.description || source.description;
  target.website = target.website || source.website;
  target.rating = target.rating || source.rating;
  target.ratingCount = target.ratingCount || source.ratingCount;
  target.address = target.address || source.address;
  target.sourceUrl = target.sourceUrl || source.sourceUrl;

  if (target.latitude === null || target.longitude === null) {
    target.latitude = source.latitude;
    target.longitude = source.longitude;
    target.distanceMeters = source.distanceMeters;
    target.distanceText = source.distanceText;
  }

  if (target.description && source.description) {
    target.description =
      target.description.length >= source.description.length
        ? target.description
        : source.description;
  }
}

function deduplicate(places) {
  const unique = [];
  const byName = new Map();

  for (const place of places) {
    const name = normalizeName(place.name);

    if (name && byName.has(name)) {
      mergePlaces(byName.get(name), place);
      continue;
    }

    const existingNear = unique.find(
      (candidate) =>
        candidate.latitude !== null &&
        place.latitude !== null &&
        haversineKm(
          { latitude: candidate.latitude, longitude: candidate.longitude },
          { latitude: place.latitude, longitude: place.longitude }
        ) <= GEOCODE_PROXIMITY_MERGE_KM &&
        (name.includes(normalizeName(candidate.name)) ||
          normalizeName(candidate.name).includes(name))
    );

    if (existingNear) {
      mergePlaces(existingNear, place);
      continue;
    }

    if (name) {
      byName.set(name, place);
    }

    unique.push(place);
  }

  return unique;
}

function shapePlace(entry, index) {
  return {
    id: `city-place-${index + 1}`,
    name: entry.name || null,
    category: entry.categoryKey || null,
    categoryLabel: entry.categoryLabel || null,
    description: entry.description || null,
    address: entry.address || null,
    city: entry.city || null,
    state: entry.state || null,
    country: entry.country || null,
    latitude: entry.latitude,
    longitude: entry.longitude,
    website: entry.website || null,
    phone: entry.phone || null,
    imageUrl: null,
    sourceUrl: entry.sourceUrl || null,
    rating: entry.rating || null,
    ratingCount: entry.ratingCount || null,
    distanceMeters: entry.distanceMeters,
    distanceText: entry.distanceText,
  };
}

/* --------------------------------------------------
   Main entry point
-------------------------------------------------- */

/**
 * Search places of a given category / custom category inside a city.
 *
 * Accepts:
 *   { city, category, custom, limit, lat, lon }
 *
 * - `city`     required city name (the primary search context).
 * - `category` preset category id (e.g. "hotel", "tourist-attraction").
 * - `custom`   free-form custom category (e.g. "dhaba", "street food").
 * - `lat`/`lon` optional reference point used ONLY to prioritise/annotate
 *               already-discovered places with real distances.
 */
async function findCityPlaces({
  city,
  category = "",
  custom = "",
  limit = DEFAULT_MAX_RESULTS,
  lat,
  lon,
}) {
  const maxResults =
    Number(limit) > 0 && Number.isFinite(Number(limit))
      ? Math.min(Math.round(Number(limit)), 50)
      : DEFAULT_MAX_RESULTS;

  const query = buildCitySearchQuery({ category, custom, city });

  if (!query) {
    const error = new Error("A city and a category are required.");
    error.code = "missing-params";
    throw error;
  }

  const categoryLabel = resolveCategoryLabel({ category, custom });

  const stats = {
    query,
    rawResults: 0,
    snippetCandidates: 0,
    normalized: 0,
    enrichmentAttempted: 0,
    enriched: 0,
    coordinatesDropped: 0,
    deduplicated: 0,
    returned: 0,
  };

  console.log(`[CityDiscovery] query: "${query}"`);

  let response;

  try {
    response = await Promise.race([
      searchWeb(query, { num: WEB_SEARCH_LIMIT }),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error("web search timed out")),
          WEB_SEARCH_QUERY_TIMEOUT_MS
        )
      ),
    ]);
  } catch (error) {
    console.error(
      `[CityDiscovery] search failed for "${query}": ${error.message}`
    );

    const searchError = new Error(
      "City places are temporarily unavailable."
    );
    searchError.code = "search-error";
    throw searchError;
  }

  const rawResults = Array.isArray(response.results) ? response.results : [];
  stats.rawResults = rawResults.length;

  /* 1. Normalize web results into named places ---------------------
     Listicle pages ("10 best hotels in Delhi") are never added as rows
     themselves, but their numbered snippets still yield real place
     names. Pure list/tag pages are skipped entirely. */

  const normalized = [];

  const addCandidate = (candidate) => {
    normalized.push({
      name: candidate.name,
      categoryKey: category || custom || categoryLabel,
      categoryLabel,
      description: candidate.description || null,
      website: candidate.website || null,
      rating: candidate.rating || null,
      ratingCount: candidate.ratingCount || null,
      address: null,
      city: null,
      state: null,
      country: null,
      latitude: null,
      longitude: null,
      phone: null,
      sourceUrl: candidate.sourceUrl || null,
      listicle: candidate.listicle || false,
      index: Number.isFinite(candidate.index) ? candidate.index : 0,
    });
  };

  for (const result of rawResults) {
    const rawTitle = String(result.title || "").trim();
    const description = String(result.description || "");

    for (const snippetName of extractSnippetNames(description)) {
      if (stats.snippetCandidates >= MAX_GEOCODE_CANDIDATES) break;
      if (isNonPlaceResult(snippetName, "")) continue;

      stats.snippetCandidates += 1;

      addCandidate({
        name: snippetName,
        description: null,
        website: null,
        index: normalized.length,
      });
    }

    if (!rawTitle) continue;
    if (isUrlLike(rawTitle)) continue;

    if (isNonPlaceResult(rawTitle, description)) {
      continue;
    }

    const name = stripTitleNoise(rawTitle);

    if (!name) continue;

    const listicle = isListicleTitle(rawTitle);

    if (listicle) {
      // Listicle pages are never real rows; their snippet names above carry the places.
      continue;
    }

    addCandidate({
      name,
      listicle: false,
      description: description.slice(0, 400) || null,
      website: cleanWebsiteUrl(result.website),
      rating: result.rating || null,
      ratingCount: result.ratingCount || null,
      sourceUrl: result.website || null,
      index: normalized.length,
    });
  }

  stats.normalized = normalized.length;

  if (normalized.length === 0) {
    console.log(`[CityDiscovery] no usable place names for "${query}"`);

    return {
      query,
      places: [],
      stats,
    };
  }

  /* 2. Optional GIS enrichment (never discovery) --------------------
     Resolve real coordinates for named places via the existing
     OpenStreetMap-based geocoder. Coordinates only ever come from the
     geocoder — nothing is invented. */

  const referencePoint = resolveReferencePoint({ city, lat, lon });

  let reference = null;

  try {
    reference = await referencePoint;
  } catch {
    reference = null;
  }

  const enrichBatch = async (batch) => {
    await Promise.all(
      batch.map(async (entry) => {
        stats.enrichmentAttempted += 1;

        const geocoded = await geocodeAttraction({
          name: entry.name,
          contextCity: city,
        });

        if (
          geocoded &&
          Number.isFinite(geocoded.latitude) &&
          Number.isFinite(geocoded.longitude)
        ) {
          entry.latitude = geocoded.latitude;
          entry.longitude = geocoded.longitude;
          entry.address = geocoded.formatted || null;
          entry.city = geocoded.city || null;
          entry.state = geocoded.state || null;
          entry.country = geocoded.country || null;

          // Geographic validation: a wildly far coordinate is a bad
          // match, so drop it rather than pin the wrong place.
          if (
            reference &&
            haversineKm(
              { latitude: entry.latitude, longitude: entry.longitude },
              reference
            ) > MAX_CITY_DISTANCE_KM
          ) {
            entry.latitude = null;
            entry.longitude = null;
            entry.address = null;
            stats.coordinatesDropped += 1;
            return;
          }

          stats.enriched += 1;
        }
      })
    );
  };

  const enrichmentTargets = normalized.slice(0, MAX_GEOCODE_CANDIDATES);

  for (let index = 0; index < enrichmentTargets.length; index += GEOCODE_BATCH_SIZE) {
    await enrichBatch(enrichmentTargets.slice(index, index + GEOCODE_BATCH_SIZE));
  }

  /* 3. Distance annotations (real, computed from real coordinates) -- */

  if (reference) {
    for (const entry of normalized) {
      if (entry.latitude === null || entry.longitude === null) {
        continue;
      }

      const meters =
        haversineKm(
          { latitude: entry.latitude, longitude: entry.longitude },
          reference
        ) * 1000;

      entry.distanceMeters = Math.round(meters);
      entry.distanceText = formatDistanceText(meters);
    }
  }

  /* 4. Rank, dedupe, limit ------------------------------------------ */

  const ranked = normalized
    .slice()
    .sort(
      (first, second) =>
        rankPlace(second) - rankPlace(first) ||
        first.index - second.index
    );

  const deduplicated = deduplicate(ranked);
  stats.deduplicated = deduplicated.length;

  const places = deduplicated
    .slice(0, maxResults)
    .map((entry, index) => shapePlace(entry, index));

  stats.returned = places.length;

  console.log(
    `[CityDiscovery] enriched=${stats.enriched} deduplicated=${stats.deduplicated} returned=${places.length}`
  );

  return {
    query,
    places,
    stats,
  };
}

/**
 * Resolution for the referential point used to annotate discovered places
 * with real distances: caller-supplied coordinates win, otherwise the city
 * name is geocoded (best effort).
 */
async function resolveReferencePoint({ city, lat, lon }) {
  const latitude = Number(lat);
  const longitude = Number(lon);

  if (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180
  ) {
    return { latitude, longitude };
  }

  try {
    const matches = await geocodeSearch({ text: city, limit: 1 });

    if (matches[0]) {
      return { latitude: matches[0].latitude, longitude: matches[0].longitude };
    }
  } catch (error) {
    console.warn(
      `[CityDiscovery] geocode reference city "${city}" failed: ${error.message}`
    );
  }

  return null;
}

module.exports = {
  findCityPlaces,
  buildCitySearchQuery,
  pluralizeCustomCategory,
  sanitizeText,
  CATEGORY_QUERY_TERMS,
};