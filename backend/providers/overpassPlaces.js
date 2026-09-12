/**
 * Lightweight OSM/Overpass nearby-POI provider.
 *
 * Optimized for MVP performance:
 *  - node-only queries for point-based categories
 *  - `nwr` kept only where ways/relations are genuinely needed
 *  - one query per category, run in parallel (max 3 categories)
 *  - sequential endpoint fallback (kumi → overpass-api.de → private.coffee)
 *  - fast failure per endpoint (12s) so overloaded servers don't block
 *  - post-fetch distance sorting + per-category result cap
 *  - `out center tags;` returns only the fields normalizeOsmPlace()
 *    needs (tags + coordinates), never full geometry
 */

/* --------------------------------------------------
   Overpass endpoints — tried sequentially per category
-------------------------------------------------- */

const OVERPASS_ENDPOINTS = [
  {
    name: "kumi.systems",
    url: "https://overpass.kumi.systems/api/interpreter",
  },
  {
    name: "overpass-api.de",
    url: "https://overpass-api.de/api/interpreter",
  },
  {
    name: "private.coffee",
    url: "https://overpass.private.coffee/api/interpreter",
  },
];

const PER_ENDPOINT_TIMEOUT_MS = 12000;
const OVERPASS_QUERY_TIMEOUT = 10;
const MAX_RESULTS_PER_CATEGORY = 25;
const MAX_TOTAL_RESULTS = 50;

/* --------------------------------------------------
   Category definitions
-------------------------------------------------- */

const CATEGORY_QUERIES = {
  tourist_attractions: `
    nwr["tourism"~"attraction|museum|gallery|viewpoint|artwork"]
  `,

  historic: `
    nwr["historic"]
  `,

  temples: `
    nwr["amenity"="place_of_worship"]["religion"="hindu"]
  `,

  hotels: `
    nwr["tourism"~"hotel|hostel|guest_house"]
  `,

  restaurants: `
    node["amenity"="restaurant"]
  `,

  cafes: `
    node["amenity"="cafe"]
  `,

  hospitals: `
    node["amenity"="hospital"]
  `,

  pharmacies: `
    node["amenity"="pharmacy"]
  `,

  fuel: `
    node["amenity"="fuel"]
  `,

  parking: `
    node["amenity"="parking"]
  `,

  railway_station: `
    node["railway"="station"]
  `,

  bus_station: `
    node["amenity"="bus_station"]
  `,
};

const CANONICAL_CATEGORIES = new Set(
  Object.keys(CATEGORY_QUERIES)
);

const CATEGORY_ALIASES = {
  hospital: "hospitals",
  pharmacy: "pharmacies",
  cafe: "cafes",
  restaurant: "restaurants",
  fuel: "fuel",
  gas_station: "fuel",
  parking: "parking",
  bus_station: "bus_station",
  busstation: "bus_station",
  railway_station: "railway_station",
  railway: "railway_station",
  train_station: "railway_station",
  hotel: "hotels",
  tourist_attraction: "tourist_attractions",
  "tourist-attraction": "tourist_attractions",
  temple: "temples",
  place_of_worship: "temples",
  historic: "historic",
};

/* --------------------------------------------------
   Category normalization
-------------------------------------------------- */

function normalizeCategory(raw) {
  const value = String(raw || "")
    .trim()
    .toLowerCase();

  if (CANONICAL_CATEGORIES.has(value)) {
    return value;
  }

  return CATEGORY_ALIASES[value] || null;
}

function normalizeOsmCategories(input) {
  const result = [];

  for (const raw of input) {
    const canonical = normalizeCategory(raw);

    if (canonical && !result.includes(canonical)) {
      result.push(canonical);
    }
  }

  return result;
}

/* --------------------------------------------------
   Haversine distance (meters)
-------------------------------------------------- */

function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/* --------------------------------------------------
   Build one Overpass QL query string
-------------------------------------------------- */

function buildQuery({
  category,
  latitude,
  longitude,
  radius,
}) {
  return `
[out:json][timeout:${OVERPASS_QUERY_TIMEOUT}];

${CATEGORY_QUERIES[category]}
(around:${radius},${latitude},${longitude});

out center tags;
`;
}

/* --------------------------------------------------
   Fetch one endpoint with AbortController timeout.
-------------------------------------------------- */

async function fetchEndpoint(endpoint, query, timeoutMs = PER_ENDPOINT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(
      `${endpoint.url}?data=${encodeURIComponent(query)}`,
      {
        headers: {
          Accept: "application/json",
          "User-Agent": "TravelSaathi/1.0",
        },
        signal: controller.signal,
      }
    );

    const text = await response.text();

    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status}: ${text.slice(0, 200)}`
      );
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error("Invalid JSON from Overpass");
    }

    return data;
  } finally {
    clearTimeout(timer);
  }
}

/* --------------------------------------------------
   Query one category across endpoints sequentially
-------------------------------------------------- */

async function queryCategoryWithFallback({
  category,
  latitude,
  longitude,
  radius,
  startTime,
}) {
  const query = buildQuery({
    category,
    latitude,
    longitude,
    radius,
  });

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const data = await fetchEndpoint(endpoint, query);

      const elapsed = Date.now() - startTime;

      console.log(
        `[Overpass] category=${category} radius=${radius} endpoint=${endpoint.name} elapsed=${elapsed}ms results=${(data.elements || []).length}`
      );

      return data;
    } catch (error) {
      const elapsed = Date.now() - startTime;
      const isAbort =
        error?.name === "AbortError";

      console.error(
        `[Overpass] category=${category} endpoint=${endpoint.name} failed elapsed=${elapsed}ms ${isAbort ? "(timeout)" : ""} ${error?.message || error}`
      );

      console.log(
        `[Overpass] category=${category} trying next endpoint...`
      );
    }
  }

  console.error(
    `[Overpass] category=${category} ALL endpoints failed`
  );

  return { elements: [] };
}

/* --------------------------------------------------
   Main search: parallel categories, sequential fallback
-------------------------------------------------- */

async function searchOverpassPlaces({
  latitude,
  longitude,
  radius = 4000,
  categories = ["tourist_attractions"],
}) {
  const selectedCategories = normalizeOsmCategories(
    categories
  ).slice(0, 3);

  if (selectedCategories.length === 0) {
    throw new Error("No valid categories selected");
  }

  const startedAt = Date.now();

  console.log(
    `[Overpass] categories=${selectedCategories.join(",")} radius=${radius}`
  );

  /* Each category independently uses fallback endpoints.
     Categories run in parallel via Promise.all. */
  const responses = await Promise.all(
    selectedCategories.map((category) =>
      queryCategoryWithFallback({
        category,
        latitude,
        longitude,
        radius,
        startTime: startedAt,
      })
    )
  );

  /* --------------------------------------------------
     Merge, dedupe, compute distance, sort, limit
  -------------------------------------------------- */

  const seen = new Set();
  const allElements = [];

  for (const response of responses) {
    for (const element of response.elements || []) {
      const key = `${element.type}-${element.id}`;

      if (seen.has(key)) continue;
      seen.add(key);

      const elLat = element.lat ?? element.center?.lat;
      const elLon = element.lon ?? element.center?.lon;

      if (typeof elLat === "number" && typeof elLon === "number") {
        element._distance = haversineDistance(
          latitude,
          longitude,
          elLat,
          elLon
        );
      } else {
        element._distance = Infinity;
      }

      allElements.push(element);
    }
  }

  allElements.sort((a, b) => a._distance - b._distance);

  const elements = allElements
    .slice(0, MAX_TOTAL_RESULTS)
    .map(({ _distance, ...rest }) => rest);

  const elapsed = Date.now() - startedAt;

  console.log(
    `[Overpass] completed in ${elapsed}ms total=${elements.length}`
  );

  return { elements };
}

module.exports = {
  searchOverpassPlaces,
  normalizeOsmCategories,
};
