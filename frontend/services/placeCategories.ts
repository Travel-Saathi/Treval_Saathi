/**
 * Centralized mapping between Travel Saathi app category IDs
 * and Geoapify Places API categories.
 *
 * Every mapping below was verified against the official Geoapify
 * Places API category list (apidocs.geoapify.com/docs/places/).
 * See `CATEGORIES_TO_VERIFY` for mappings that still need checking.
 */
export const GEOAPIFY_CATEGORY_MAP: Record<string, string> = {
  hotel: "accommodation.hotel",
  restaurant: "catering.restaurant",
  cafe: "catering.cafe",
  hospital: "healthcare.hospital",
  pharmacy: "healthcare.pharmacy",
  "tourist-attraction": "tourism",
  parking: "parking",
  atm: "service.financial.atm",
  "gas-station": "service.vehicle.fuel",
  "car-service": "service.vehicle.repair.car",
  grocery: "commercial.supermarket",
  /*
   * Settlement categories let the app discover cities/towns/villages near
   * a point (used to recommend intermediate stops along a driving route).
   * "settlement.*" is a documented Geoapify Places category family.
   */
  city: "settlement.city",
  town: "settlement.town",
  village: "settlement.village",
  /*
   * TODO VERIFY:
   * "rest-stop" has NO confirmed Geoapify category yet.
   * "highway.rest_area" was tested against the live API and
   * is NOT a valid Geoapify category. Do not map this silently;
   * resolve before relying on it. Until then, selecting only
   * "Rest Stops" will report an explicit error (not a wrong result).
   */
};

/**
 * App category IDs whose Geoapify mapping has not been confirmed
 * against official documentation yet.
 */
export const CATEGORIES_TO_VERIFY: string[] = ["rest-stop"];

/**
 * Maps app category IDs to the OSM /api/osm/places category keys
 * (the keys understood by the backend Overpass provider).
 *
 * Not every app category has a supported OSM query yet.
 */
export const OSM_CATEGORY_MAP: Record<string, string> = {
  hotel: "hotels",
  restaurant: "restaurants",
  cafe: "cafes",
  hospital: "hospitals",
  pharmacy: "pharmacies",
  "tourist-attraction": "tourist_attractions",
  temple: "temples",
  historic: "historic",
  "gas-station": "fuel",
  parking: "parking",
};

/**
 * App category IDs that do not map to a supported OSM/Overpass
 * query yet. They are deliberately never guessed silently.
 */
export const OSM_CATEGORIES_TO_VERIFY: string[] = [
  "rest-stop",
  "grocery",
  "atm",
  "car-service",
];

/**
 * Maps app category IDs to OSM categories.
 *
 * Unknown IDs are skipped and warned about (never guessed silently).
 */
export function toOsmCategories(placeTypeIds: string[]): string[] {
  const mapped: string[] = [];

  for (const id of placeTypeIds) {
    const category = OSM_CATEGORY_MAP[id];

    if (category) {
      mapped.push(category);
    } else {
      console.warn(`No OSM category for app category: "${id}"`);
    }
  }

  return mapped;
}

/* --------------------------------------------------
   Display helpers (raw category -> user-facing label)
-------------------------------------------------- */

/**
 * Raw category values that belong to each app category. The values cover
 * both the coarse `category` column of the Supabase places table AND the
 * raw keys `normalizeOsmPlace` produces, so Database and OSM places share
 * one category system: one chip row, one filter, one label.
 */
export const APP_CATEGORY_MATCH: Record<string, string[]> = {
  hotel: ["hotel", "hostel", "guest_house", "accommodation"],
  restaurant: ["restaurant", "food"],
  cafe: ["cafe", "food"],
  temple: [
    "place_of_worship",
    "temple",
    "religious",
    "religion",
    "worship",
  ],
  hospital: ["hospital", "healthcare"],
  pharmacy: ["pharmacy", "healthcare"],
  "gas-station": ["fuel", "transport"],
  parking: ["parking", "transport"],
  "tourist-attraction": [
    "tourism",
    "historic",
    "attraction",
    "museum",
    "gallery",
    "viewpoint",
    "artwork",
    "monument",
    "memorial",
    "castle",
    "ruins",
    "natural",
    "leisure",
    "water",
    "park",
    "garden",
    "zoo",
    "peak",
    "beach",
    "wood",
    "wetland",
    "recreation",
    "entertainment",
  ],
};

/** Singular user-facing labels for the app category IDs. */
export const CATEGORY_LABELS: Record<string, string> = {
  hotel: "Hotel",
  restaurant: "Restaurant",
  hospital: "Hospital",
  "rest-stop": "Rest Stop",
  "gas-station": "Gas Station",
  parking: "Parking",
  cafe: "Cafe",
  grocery: "Grocery Store",
  "tourist-attraction": "Tourist Attraction",
  temple: "Temple",
  atm: "ATM",
  pharmacy: "Pharmacy",
  "car-service": "Car Service",
};

/** Human-readable labels for raw OSM category keys. */
export const OSM_CATEGORY_LABELS: Record<string, string> = {
  tourism: "Tourist Attraction",
  attraction: "Tourist Attraction",
  museum: "Tourist Attraction",
  gallery: "Tourist Attraction",
  viewpoint: "Tourist Attraction",
  artwork: "Tourist Attraction",
  monument: "Monument",
  memorial: "Memorial",
  historic: "Historic Place",
  hotel: "Hotel",
  hostel: "Hotel",
  guest_house: "Hotel",
  restaurant: "Restaurant",
  cafe: "Cafe",
  hospital: "Hospital",
  pharmacy: "Pharmacy",
  fuel: "Gas Station",
  parking: "Parking",
  railway_station: "Railway Station",
  bus_station: "Bus Station",
  water: "Water Body",
  natural: "Natural",
  leisure: "Leisure",
  park: "Park",
  garden: "Garden",
  zoo: "Zoo",
  wetland: "Wetland",
  wood: "Forest",
  peak: "Peak",
  beach: "Beach",
  attraction_park: "Theme Park",
  shop: "Shop",
  office: "Office",
  building: "Building",
};

/** A place matches an app category when its raw category is one the app
 * category represents. Works identically for both providers. */
export function placeMatchesAppCategory(
  category: string | null,
  appCategoryId: string
): boolean {
  const accepted = APP_CATEGORY_MATCH[appCategoryId];

  if (!accepted) {
    return false;
  }

  return accepted.includes(String(category ?? "").toLowerCase());
}

/** Humanize a raw dotted/segmented category value. */
export function humanizeCategory(category: string | null): string {
  if (!category) {
    return "Place";
  }

  const segments = category.split(".");
  const primary = segments.length > 1 ? segments[1] : segments[0];

  const readable = primary
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

  return readable || "Place";
}

function worshipLabel(religion: string | null): string {
  if (religion === "hindu") {
    return "Temple";
  }

  if (religion === "muslim") {
    return "Mosque";
  }

  if (religion === "christian") {
    return "Church";
  }

  return "Place of Worship";
}

/** Human-readable label for a raw OSM category value. */
export function osmCategoryLabel(
  category: string | null,
  religion: string | null
): string {
  const key = String(category ?? "").toLowerCase();

  if (key === "place_of_worship") {
    return worshipLabel(religion);
  }

  return OSM_CATEGORY_LABELS[key] ?? humanizeCategory(category) ?? "Place";
}

/**
 * User-facing category label for a place. Uses the first selected app
 * category the place matches, falling back to its raw OSM label.
 */
export function displayCategory(
  category: string | null,
  religion: string | null,
  selectedCategories: string[]
): string {
  for (const appCategoryId of selectedCategories) {
    if (placeMatchesAppCategory(category, appCategoryId)) {
      return CATEGORY_LABELS[appCategoryId] ?? appCategoryId;
    }
  }

  return osmCategoryLabel(category, religion);
}

/**
 * Maps app category IDs to Geoapify categories.
 *
 * Unknown IDs are skipped and warned about (never guessed silently).
 */
export function toGeoapifyCategories(placeTypeIds: string[]): string[] {
  const mapped: string[] = [];

  for (const id of placeTypeIds) {
    const category = GEOAPIFY_CATEGORY_MAP[id];

    if (category) {
      mapped.push(category);
    } else {
      console.warn(`Unknown place category skipped: "${id}"`);
    }
  }

  return mapped;
}