/**
 * Attractions-along-route service.
 *
 * Discovers REAL places of interest near an EXISTING route geometry (the
 * OSRM polyline built by the routing API). It never re-routes, never uses
 * Overpass, and never invents results:
 *
 *  1. Normalize the route geometry to {latitude, longitude} pairs.
 *  2. OpenSERP (through the provider-agnostic web-search service) is the
 *     primary discovery source: queries are built from the ordered journey
 *     cities and the adjacent pairs of the route (e.g. "tourist attractions
 *     on the way from Bhopal to Jaipur", "top tourist attractions in Agra").
 *  3. Every result is normalized. Named (non-list-page) results are then
 *     geocoded through the existing OpenStreetMap-based Geoapify geocoder
 *     for real coordinates — enrichment/validation only, never discovery.
 *     Additional real place names are extracted straight from list-page
 *     result descriptions and geocoded the same way (a name is only ever
 *     kept when the geocoder actually resolves it and it sits inside the
 *     corridor, so nothing is invented).
 *  4. Results WITH coordinates are kept only when their distance to the
 *     ACTUAL polyline is within the corridor radius. Results without
 *     coordinates stay as real list rows but never get a map marker, and
 *     coordinates are never fabricated.
 *  5. Rank by real signals only (description, website, rating, geographic
 *     anchoring), then de-duplicate by normalized name + proximity.
 *
 * Corridor width is a single configurable constant:
 * ROUTE_ATTRACTION_RADIUS_KM (env, default 50).
 */

const {
  searchWeb,
} = require("./webSearchService");

const {
  geocodeSearch,
  reverseGeocode,
} = require("./geocodeService");

const EARTH_RADIUS_KM = 6371;
const DEG_TO_RAD = Math.PI / 180;

const ROUTE_ATTRACTION_RADIUS_KM =
  Number(process.env.ROUTE_ATTRACTION_RADIUS_KM) > 0
    ? Number(process.env.ROUTE_ATTRACTION_RADIUS_KM)
    : 50;

const DEFAULT_MAX_RESULTS = 10;
const MAX_SEARCH_QUERIES = 6;
const PER_QUERY_RESULTS = 10;
const WEB_SEARCH_QUERY_TIMEOUT_MS =
  Number(process.env.WEB_SEARCH_QUERY_TIMEOUT_MS) > 0
    ? Number(process.env.WEB_SEARCH_QUERY_TIMEOUT_MS)
    : 45000;
const GEOCODE_PROXIMITY_MERGE_KM = 1.5;

const CATEGORY_KEYWORDS = {
  tourist_attractions: null,
  route_attractions: null,
  historic: "historical places",
  temples: "temples",
  parks: "parks and gardens",
  hotels: "hotels",
  restaurants: "restaurants",
  cafes: "cafes",
  hospitals: "hospitals",
  pharmacies: "pharmacies",
  fuel: "fuel stations",
  parking: "parking",
  railway_station: "railway stations",
  bus_station: "bus stops",
};

const LISTICLE_TITLE_PATTERN =
  /(^|\W)(top|best|\d+)\s+(places|things|attractions|spots|sights|monuments|destinations|activities|stops)\b/i;

const ROUTE_PHRASE_PATTERN =
  /(places|things|attractions)\b.*\b(in|to|on|near)\b|\btravel guide\b|\bthings to (do|see)\b|\bplaces to (visit|see)\b|\bmust (see|visit)\b|\b(city|travel) guide\b|\bguide to\b|\broad trip\b|\bplaces to see\b|\btourist places? [\w ]*in\b|\bin \d+ days?\b/i;

const NON_PLACE_PATTERN =
  /\b(distance (between|faq|from|to|by|calculator|duration)|road conditions|flight|airfare|bus (from|ticket|service)|train ticket|weather|how far|how long|how to reach|traffic|covid|faqs?|overview|timings|\bcabs?\b|booking|tourist (places?|spots?|destinations|attractions?)|places to visit|things to do|sightseeing|tour packages)\b/i;

const CITY_QUERY_LIMIT = 20;
const PER_RESULT_SNIPPET_CANDIDATES = 3;
const MAX_SNIPPET_CANDIDATES = 24;

/* --------------------------------------------------
   Geometry helpers
-------------------------------------------------- */

function haversineKm(a, b) {
  const dLat = (b.latitude - a.latitude) * DEG_TO_RAD;
  const dLon = (b.longitude - a.longitude) * DEG_TO_RAD;

  const y =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.latitude * DEG_TO_RAD) *
      Math.cos(b.latitude * DEG_TO_RAD) *
      Math.sin(dLon / 2) ** 2;

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(y));
}

function pointSegmentDistanceKm(point, a, b) {
  const cosFactor = Math.max(Math.cos(point.latitude * DEG_TO_RAD), 0.01);

  const ax = a.longitude * cosFactor;
  const ay = a.latitude;
  const bx = b.longitude * cosFactor;
  const by = b.latitude;
  const px = point.longitude * cosFactor;
  const py = point.latitude;

  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;

  let t = 0;

  if (lengthSquared > 0) {
    t = ((px - ax) * dx + (py - ay) * dy) / lengthSquared;
    t = Math.max(0, Math.min(1, t));
  }

  return haversineKm(point, {
    latitude: a.latitude + t * (b.latitude - a.latitude),
    longitude: a.longitude + t * (b.longitude - a.longitude),
  });
}

function distanceToRouteKm(point, coords) {
  let best = Infinity;

  for (let i = 0; i + 1 < coords.length; i += 1) {
    const distanceKm = pointSegmentDistanceKm(
      point,
      coords[i],
      coords[i + 1]
    );

    if (distanceKm < best) {
      best = distanceKm;
    }
  }

  return best;
}

function normalizeRouteCoordinates(routeCoordinates) {
  if (!Array.isArray(routeCoordinates)) {
    return [];
  }

  const result = [];

  for (const entry of routeCoordinates) {
    if (!entry || typeof entry !== "object") continue;

    const latitude =
      entry.latitude ?? entry.lat ?? null;
    const longitude =
      entry.longitude ?? entry.lon ?? entry.lng ?? null;

    if (
      typeof latitude !== "number" ||
      !Number.isFinite(latitude) ||
      Math.abs(latitude) > 90
    ) {
      continue;
    }

    if (
      typeof longitude !== "number" ||
      !Number.isFinite(longitude) ||
      Math.abs(longitude) > 180
    ) {
      continue;
    }

    result.push({ latitude, longitude });
  }

  return result;
}

function formatCorridorText(distanceKm) {
  if (distanceKm >= 1) {
    return `~${distanceKm.toFixed(1)} km from route`;
  }

  return `~${Math.round(distanceKm * 1000)} m from route`;
}

/* --------------------------------------------------
   Query building from journey cities + route
-------------------------------------------------- */

function routeKeywords(categories) {
  const selected = Array.isArray(categories)
    ? categories.map((item) => String(item).trim().toLowerCase())
    : [];

  for (const category of selected) {
    const keyword = CATEGORY_KEYWORDS[category];

    if (keyword) return keyword;
  }

  return null;
}

function adjacentPairs(cities) {
  const pairs = [];

  for (let index = 0; index + 1 < cities.length; index += 1) {
    pairs.push([cities[index], cities[index + 1]]);
  }

  return pairs;
}

function buildSearchQueries(cities, categories) {
  const phrase = routeKeywords(categories) || "tourist attractions";
  const queries = [];

  for (const [from, to] of adjacentPairs(cities)) {
    queries.push({
      text: `${phrase} on the way from ${from} to ${to}`,
      city: null,
    });
  }

  for (const city of cities.slice(0, CITY_QUERY_LIMIT)) {
    queries.push({
      text: `top ${phrase} in ${city}`,
      city,
    });
  }

  if (cities.length >= 2) {
    const start = cities[0];
    const end = cities[cities.length - 1];

    queries.push({
      text: `recommended stops and places to visit between ${start} and ${end}`,
      city: null,
    });
  }

  return queries.slice(0, MAX_SEARCH_QUERIES);
}

/* --------------------------------------------------
   Search result normalization
-------------------------------------------------- */

function stripTitleNoise(title) {
  let value = String(title || "")
    .trim()
    .replace(/\s*[-–—|•]\s*(Tripadvisor|Yatra|Holidify|MakeMyTrip|Thrillophilia|Cleartrip|booking\.com|wikipedia)$/i, "")
    .replace(/\s*[-–—|•].*$/, "")
    .replace(/\s*\(\d{4}\)\s*$/, "")
    .trim();

  return value || null;
}

function isListicleTitle(title) {
  const text = String(title || "");

  return (
    LISTICLE_TITLE_PATTERN.test(text) ||
    ROUTE_PHRASE_PATTERN.test(text)
  );
}

function isNonPlaceResult(title, description) {
  const text = `${title || ""} ${description || ""}`;

  return NON_PLACE_PATTERN.test(text);
}

function isUrlLike(title) {
  return /^(https?:\/\/)?([\w-]+\.)+[a-z]{2,}(\/\S*)?$/i.test(
    String(title || "").trim()
  );
}

function extractSnippetNames(description) {
  const candidates = [];
  const text = String(description || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;|&#\d+;|&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (text.length < 12) return candidates;

  const seen = new Set();

  const consider = (candidate) => {
    let value = String(candidate || "")
      .replace(/[^\x20-\x7E]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^[\s.·•\-|,;:"]+/, "")
      .replace(/[\s.·•\-|,;:"']+$/, "")
      .split(/\s+\d/)[0]
      .trim();

    if (value.length < 4 || value.length > 60) return;
    if (!/^[A-Za-z]/.test(value)) return;

    const words = value.split(/\s+/);

    if (
      words.length <= 4 &&
      /\b(tourism|tourist|places|things|top|best|visit|see|day|weekend|road trip|attractions)\b/i.test(
        value
      )
    ) {
      return;
    }

    if (/^\d+$/.test(value)) return;

    const key = value.toLowerCase();

    if (seen.has(key)) return;

    seen.add(key);
    candidates.push(value);
  };

  const numbered = text.match(
    /(?:^|\s)\d{1,2}[.)]\s+[A-Z][^|•·;]{2,55}(?=\s{1,3}\d{1,2}[.)]\s|$)/g
  );

  if (numbered) {
    for (const item of numbered.slice(0, PER_RESULT_SNIPPET_CANDIDATES)) {
      consider(item.replace(/^\s*\d{1,2}[.)]\s+/, "").split(/[,:—–-]/)[0]);
    }
  }

  const colonLed = text.match(
    /(?:^|\s)([A-Z][A-Za-z0-9&'. ]{3,50}):/g
  );

  if (numbered && colonLed) {
    for (const item of colonLed.slice(0, PER_RESULT_SNIPPET_CANDIDATES)) {
      consider(item.replace(/:\s*$/, "").trim().replace(/^\s+/, ""));
    }
  }

  if (candidates.length === 0) {
    const chunks = text
      .split(/\s*[|•·]\s*/)
      .slice(0, PER_RESULT_SNIPPET_CANDIDATES * 3);

    for (const chunk of chunks) {
      consider(chunk.split(/[,:—–-]/)[0]);
    }
  }

  return candidates;
}

async function geocodeAttraction({ name, contextCity }) {
  const attemptTexts = [];

  if (contextCity) {
    attemptTexts.push(`${name}, ${contextCity}`);
  }

  attemptTexts.push(name);

  for (const text of attemptTexts) {
    try {
      const matches = await geocodeSearch({ text, limit: 3 });

      for (const match of matches) {
        const matchedName = (match.name || "").trim().toLowerCase();
        const contextName = (contextCity || "").trim().toLowerCase();

        if (!matchedName) continue;

        if (contextName && matchedName === contextName) {
          continue;
        }

        return match;
      }
    } catch (error) {
      console.warn(
        `[RouteAttractions] geocode "${text}" failed: ${error.message}`
      );
    }
  }

  return null;
}

async function deriveJourneyCities(coords) {
  if (!Array.isArray(coords) || coords.length === 0) {
    return [];
  }

  const points =
    coords.length === 1
      ? [coords[0]]
      : [coords[0], coords[coords.length - 1]];

  const cities = [];

  for (const point of points) {
    try {
      const place = await reverseGeocode(point);

      const name = place && (place.city || place.name);

      if (name && !cities.includes(name)) {
        cities.push(name);
      }
    } catch (error) {
      console.warn(
        `[RouteAttractions] reverse geocode failed: ${error.message}`
      );
    }
  }

  return cities;
}

/* --------------------------------------------------
   Shaping / ranking / dedupe
-------------------------------------------------- */

function nearestCityOf(latitude, longitude, cityPoints) {
  let best = null;
  let bestDistance = Infinity;

  for (const cityPoint of cityPoints) {
    const distanceKm = haversineKm(
      { latitude, longitude },
      { latitude: cityPoint.latitude, longitude: cityPoint.longitude }
    );

    if (distanceKm < bestDistance) {
      bestDistance = distanceKm;
      best = cityPoint.name;
    }
  }

  return best;
}

function rankAttraction(attraction) {
  let score = 0;

  if (attraction.description) score += 2;
  if (attraction.website) score += 1;
  if (attraction.rating && Number(attraction.rating) > 0) score += 2;
  if (attraction.ratingCount && Number(attraction.ratingCount) > 0) score += 1;
  if (attraction.latitude !== null && attraction.longitude !== null) score += 3;
  if (!attraction.listicle) score += 2;

  return score;
}

function normalizeName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\w\s]/g, "")
    .trim();
}

function mergeAttractions(target, source) {
  target.name = target.name || source.name;
  target.description = target.description || source.description;
  target.website = target.website || source.website;

  if (target.latitude === null || target.longitude === null) {
    target.latitude = source.latitude;
    target.longitude = source.longitude;
    target.distanceKm = source.distanceKm;
    target.distanceText = source.distanceText;
    target.nearestCity = target.nearestCity || source.nearestCity;
  }

  target.rating = target.rating || source.rating;
  target.ratingCount = target.ratingCount || source.ratingCount;
  target.formatted = target.formatted || source.formatted;
}

function deduplicate(attractions) {
  const unique = [];
  const byName = new Map();

  for (const attraction of attractions) {
    const name = normalizeName(attraction.name);

    if (name && byName.has(name)) {
      mergeAttractions(byName.get(name), attraction);
      continue;
    }

    const existingNear = unique.find(
      (candidate) =>
        candidate.latitude !== null &&
        attraction.latitude !== null &&
        haversineKm(
          { latitude: candidate.latitude, longitude: candidate.longitude },
          { latitude: attraction.latitude, longitude: attraction.longitude }
        ) <= GEOCODE_PROXIMITY_MERGE_KM &&
        (name.includes(normalizeName(candidate.name)) ||
          normalizeName(candidate.name).includes(name))
    );

    if (existingNear) {
      mergeAttractions(existingNear, attraction);
      continue;
    }

    if (name) {
      byName.set(name, attraction);
    }

    unique.push(attraction);
  }

  return unique;
}

function shapeAttraction(entry, index) {
  return {
    id: `web-attraction-${index + 1}`,
    name: entry.name,
    category: "attraction",
    formatted: entry.formatted || null,
    description: entry.description || null,
    latitude: entry.latitude,
    longitude: entry.longitude,
    distanceKm: entry.distanceKm,
    distanceText: entry.distanceText,
    website: entry.website || null,
    imageUrl: null,
    nearestCity: entry.nearestCity || null,
    source: "web",
  };
}

/* --------------------------------------------------
   Main entry point
-------------------------------------------------- */

async function findAttractionsAlongRoute(routeCoordinates, options = {}) {
  const corridorKm =
    Number(options.corridorKm) > 0
      ? Number(options.corridorKm)
      : ROUTE_ATTRACTION_RADIUS_KM;

  const maxResults =
    Number(options.maxResults) > 0
      ? Number(options.maxResults)
      : DEFAULT_MAX_RESULTS;

  const cities = Array.isArray(options.cities)
    ? options.cities.map(String).filter(Boolean)
    : [];

  const categories = Array.isArray(options.categories)
    ? options.categories.map(String).filter(Boolean)
    : [];

  /* 1. Route geometry ---------------------------------- */

  const coords = normalizeRouteCoordinates(routeCoordinates);

  if (coords.length < 2) {
    console.log(
      `[RouteAttractions] no-geometry: ${coords.length} valid coordinates`
    );

    const error = new Error("Route geometry is missing or invalid.");
    error.code = "no-geometry";
    throw error;
  }

  console.log(`[RouteAttractions] route coordinates: ${coords.length}`);

  /* 2. Journey cities (OpenSERP bases discovery on real city names) */

  const journeyCities = cities.length > 0 ? cities : await deriveJourneyCities(coords);

  const stats = {
    coordinates: coords.length,
    corridorKm,
    queries: 0,
    rawResults: 0,
    normalized: 0,
    snippetCandidates: 0,
    snippetGeocoded: 0,
    enriched: 0,
    beforeFilter: 0,
    afterFilter: 0,
    deduplicated: 0,
    returned: 0,
  };

  if (journeyCities.length === 0) {
    console.log(
      `[RouteAttractions] no journey cities available; returning no attractions`
    );

    return {
      attractions: [],
      corridorKm,
      stats,
    };
  }

  console.log(
    `[RouteAttractions] corpus: cities=[${journeyCities.join(", ")}] categories=[${categories.join(",") || "attractions"}]`
  );

  /* 3. OpenSERP discovery ---------------------------------------- */

  const queries = buildSearchQueries(journeyCities, categories);
  stats.queries = queries.length;

  console.log(`[RouteAttractions] OpenSERP queries: ${queries.length}`);

  let queryFailures = 0;
  const webResults = [];

  /*
   * Queries run strictly sequentially. The shared web-search gateway already
   * serializes every provider call (concurrency 1) and paces them, so firing
   * all queries at once would only build burst pressure on OpenSERP.
   */
  for (const query of queries) {
    try {
      const timed = await Promise.race([
        searchWeb(query.text, { num: PER_QUERY_RESULTS }),
        new Promise((_, reject) =>
          setTimeout(
            () =>
              reject(new Error("web search timed out")),
            WEB_SEARCH_QUERY_TIMEOUT_MS
          )
        ),
      ]);

      const results = Array.isArray(timed.results) ? timed.results : [];

      console.log(
        `[RouteAttractions] query "${query.text}" -> ${results.length} results`
      );

      for (const result of results) {
        webResults.push({
          result,
          city: query.city,
        });
      }
    } catch (error) {
      queryFailures += 1;
      console.warn(
        `[RouteAttractions] query "${query.text}" failed: ${error.message}`
      );
    }
  }

  if (queryFailures === queries.length) {
    console.error(
      `[RouteAttractions] all ${queries.length} web searches failed; reporting search failure`
    );

    const error = new Error("Attraction search is unavailable.");
    error.code = "search-error";
    throw error;
  }

  stats.rawResults = webResults.length;

  console.log(`[RouteAttractions] raw web results: ${webResults.length}`);

  /* 4. Normalize + enrich with real coordinates ------------------ */

  const normalized = [];

  let snippetCandidates = 0;

  for (const { result, city } of webResults.slice(
    0,
    queries.length * PER_QUERY_RESULTS
  )) {
    const rawTitle = String(result.title || "").trim();

    for (const snippetName of extractSnippetNames(result.description || "")) {
      if (snippetCandidates >= MAX_SNIPPET_CANDIDATES) break;
      if (isNonPlaceResult(snippetName, "")) continue;

      snippetCandidates += 1;

      normalized.push({
        name: snippetName,
        listicle: false,
        fromSnippet: true,
        description: null,
        website: null,
        rating: null,
        ratingCount: null,
        latitude: null,
        longitude: null,
        distanceKm: null,
        distanceText: null,
        formatted: null,
        nearestCity: null,
        contextCity: city || null,
      });
    }

    if (!rawTitle) continue;
    if (isNonPlaceResult(rawTitle, result.description)) continue;
    if (isUrlLike(rawTitle)) continue;

    const name = stripTitleNoise(rawTitle);

    if (!name) continue;

    normalized.push({
      name,
      listicle: isListicleTitle(rawTitle),
      description: (result.description || "").slice(0, 400) || null,
      website: result.website || null,
      rating: result.rating || null,
      ratingCount: result.ratingCount || null,
      latitude: null,
      longitude: null,
      distanceKm: null,
      distanceText: null,
      formatted: null,
      nearestCity: null,
      contextCity: city || null,
    });
  }

  stats.snippetCandidates = snippetCandidates;

  stats.normalized = normalized.length;

  console.log(`[RouteAttractions] normalized results: ${normalized.length}`);

  const cityPoints = [];

  for (const city of journeyCities) {
    try {
      const matches = await geocodeSearch({ text: city, limit: 1 });

      if (matches[0]) {
        cityPoints.push({
          name: city,
          latitude: matches[0].latitude,
          longitude: matches[0].longitude,
        });
      }
    } catch (error) {
      console.warn(
        `[RouteAttractions] geocode city "${city}" failed: ${error.message}`
      );
    }
  }

  /* Listicle pages never pin a marker; named attractions get geocoded. */

  let enriched = 0;
  let snippetGeocoded = 0;

  const enrichBatch = async (batch) => {
    await Promise.all(
      batch.map(async (attraction) => {
        if (attraction.latitude !== null) return;

        if (attraction.listicle) return;

        const geocoded = await geocodeAttraction({
          name: attraction.name,
          contextCity: attraction.contextCity,
        });

        if (
          geocoded &&
          Number.isFinite(geocoded.latitude) &&
          Number.isFinite(geocoded.longitude)
        ) {
          const geocodedName = String(geocoded.name || "")
            .trim()
            .toLowerCase();

          const isJourneyCity =
            journeyCities.some(
              (city) => city.toLowerCase() === geocodedName
            );

          if (isJourneyCity) return;

          attraction.latitude = geocoded.latitude;
          attraction.longitude = geocoded.longitude;
          attraction.formatted = geocoded.formatted || null;
          enriched += 1;

          if (attraction.fromSnippet) {
            snippetGeocoded += 1;
          }
        }
      })
    );
  };

  for (let index = 0; index < normalized.length; index += 4) {
    await enrichBatch(normalized.slice(index, index + 4));
  }

  stats.enriched = enriched;
  stats.snippetGeocoded = snippetGeocoded;

  console.log(
    `[RouteAttractions] OSM-enriched with coordinates: ${enriched}`
  );

  const coordinateValid = normalized.filter(
    (attraction) =>
      attraction.latitude !== null && attraction.longitude !== null
  );

  console.log(
    `[RouteAttractions] coordinate-valid attractions: ${coordinateValid.length}`
  );

  /* 5. Corridor filter only applies to coordinate-valid results ---- */

  stats.beforeFilter = coordinateValid.length;

  const keptByGeometry = [];

  for (const attraction of normalized.slice()) {
    if (attraction.latitude === null || attraction.longitude === null) {
      attraction.nearestCity = attraction.contextCity || null;
      keptByGeometry.push(attraction);
      continue;
    }

    const distanceKm = distanceToRouteKm(
      { latitude: attraction.latitude, longitude: attraction.longitude },
      coords
    );

    if (distanceKm <= corridorKm) {
      attraction.distanceKm = Math.round(distanceKm * 10) / 10;
      attraction.distanceText = formatCorridorText(distanceKm);

      if (cityPoints.length > 0) {
        attraction.nearestCity = nearestCityOf(
          attraction.latitude,
          attraction.longitude,
          cityPoints
        );
      } else {
        attraction.nearestCity = attraction.contextCity || null;
      }

      keptByGeometry.push(attraction);
    }
  }

  stats.afterFilter = keptByGeometry.length;

  console.log(
    `[RouteAttractions] after corridor filter: ${keptByGeometry.length}`
  );

  /* 6. Rank + dedupe + limit -------------------------------------- */

  keptByGeometry.sort(
    (first, second) =>
      rankAttraction(second) - rankAttraction(first) ||
      (first.distanceKm ?? Infinity) - (second.distanceKm ?? Infinity)
  );

  const deduplicated = deduplicate(keptByGeometry);
  stats.deduplicated = deduplicated.length;

  console.log(`[RouteAttractions] deduplicated: ${deduplicated.length}`);

  const attractions = deduplicated
    .slice(0, maxResults)
    .map((entry, index) => shapeAttraction(entry, index));

  stats.returned = attractions.length;

  console.log(
    `[RouteAttractions] returning ${attractions.length} attractions`
  );

  return {
    attractions,
    corridorKm,
    stats,
  };
}

module.exports = {
  findAttractionsAlongRoute,
  ROUTE_ATTRACTION_RADIUS_KM,
  /*
   * Normalization helpers shared with other web-search pipelines
   * (e.g. the city-discovery service). Kept in one place so every
   * consumer applies the exact same cleaning rules.
   */
  stripTitleNoise,
  isListicleTitle,
  isNonPlaceResult,
  isUrlLike,
  extractSnippetNames,
  geocodeAttraction,
  normalizeName,
  haversineKm,
};