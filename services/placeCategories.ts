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