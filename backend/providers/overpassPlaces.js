/**
 * Lightweight OSM/Overpass nearby-POI provider.
 *
 * Optimized for MVP performance:
 *  - node-only queries for point-based categories
 *  - `nwr` kept only where ways/relations are genuinely needed
 *  - one query per category, run in parallel (max 3 categories)
 *  - explicit timeouts so a request never hangs
 *  - `out center tags;` returns only the fields normalizeOsmPlace()
 *    needs (tags + coordinates), never full geometry
 */

const OVERPASS_URL =
  "https://overpass.kumi.systems/api/interpreter";

const OVERPASS_SERVER_TIMEOUT_MS = 10000;
const OVERPASS_QUERY_TIMEOUT = 10;

/*
 * Canonical category keys understood by this provider.
 *
 * Point-based categories (hospitals, pharmacies, fuel, cafes,
 * restaurants, parking, bus/railway stations) use lightweight
 * `node[...]` queries. `nwr[...]` is preserved only for categories
 * where ways/relations genuinely matter (hotels as buildings,
 * tourism/historic objects, places of worship).
 */
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

/*
 * Accept both the canonical plural keys ("hospitals") and the
 * singular names the frontend category labels use ("hospital").
 * Unknown values normalize to null and are dropped.
 */
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
  "tourist_attraction": "tourist_attractions",
  "tourist-attraction": "tourist_attractions",
  temple: "temples",
  place_of_worship: "temples",
  historic: "historic",
};

/**
 * Map a single raw category value to its canonical key, or null
 * when it is not a supported category.
 */
function normalizeCategory(raw) {
  const value = String(raw || "")
    .trim()
    .toLowerCase();

  if (CANONICAL_CATEGORIES.has(value)) {
    return value;
  }

  return CATEGORY_ALIASES[value] || null;
}

/**
 * Normalize a list of raw category values into valid canonical
 * categories. Unknown values are dropped; duplicates removed;
 * input order preserved.
 */
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

/**
 * Execute one Overpass GET request with a hard server-side timeout.
 */
async function runOverpassQuery(query) {
  const controller = new AbortController();

  const timer = setTimeout(
    () => controller.abort(),
    OVERPASS_SERVER_TIMEOUT_MS
  );

  try {
    const response = await fetch(
      `${OVERPASS_URL}?data=${encodeURIComponent(query)}`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          "User-Agent": "TrevalSaathi/1.0",
        },
        signal: controller.signal,
      }
    );

    const responseText = await response.text();

    if (!response.ok) {
      console.error(
        "Overpass HTTP status:",
        response.status
      );

      console.error(
        "Overpass response:",
        responseText
      );

      throw new Error(
        `Overpass request failed: ${response.status} ${responseText}`
      );
    }

    let data;

    try {
      data = JSON.parse(responseText);
    } catch {
      throw new Error(
        `Overpass returned invalid JSON: ${responseText}`
      );
    }

    return data;
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      error.name === "AbortError"
    ) {
      throw new Error(
        `Overpass request timed out after ${OVERPASS_SERVER_TIMEOUT_MS}ms`
      );
    }

    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Search Overpass for nearby places across the given categories.
 *
 * Runs one lightweight query per category in parallel (maximum 3)
 * and merges the elements, deduping by OSM object.
 *
 * Returns `{ elements }` so callers keep their existing envelope.
 */
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

  try {
    const responses = await Promise.all(
      selectedCategories.map((category) =>
        runOverpassQuery(
          buildQuery({
            category,
            latitude,
            longitude,
            radius,
          })
        )
      )
    );

    const seen = new Set();
    const elements = [];

    for (const response of responses) {
      for (const element of response.elements || []) {
        const key = `${element.type}-${element.id}`;

        if (
          element.type &&
          element.id &&
          seen.has(key)
        ) {
          continue;
        }

        if (element.type && element.id) {
          seen.add(key);
        }

        elements.push(element);
      }
    }

    console.log(
      `[Overpass] completed in ${Date.now() - startedAt}ms`
    );

    console.log(
      `[Overpass] results=${elements.length}`
    );

    return { elements };
  } catch (error) {
    console.error(
      `[Overpass] failed in ${Date.now() - startedAt}ms ` +
        `categories=${selectedCategories.join(",")}`
    );

    throw error;
  }
}

module.exports = {
  searchOverpassPlaces,
  normalizeOsmCategories,
};