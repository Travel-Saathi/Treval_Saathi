import type { SupabaseClient } from "@supabase/supabase-js";

import {
  calculateDistanceMeters,
  formatDistanceText,
  type TravelPlace,
} from "./placesApi";

/**
 * Data layer for the Travel Saathi `places` table (existing dataset,
 * populated by the Wikidata/Overture pipeline).
 *
 * This module ONLY reads the existing table. It never writes, migrates,
 * or restructures anything: the schema, the data and the indexing are left
 * exactly as they are.
 *
 * Performance: a bounded bounding box around the destination is used for
 * the SQL filters and a hard `limit` caps the rows, so the client never
 * receives all 104K+ places. Great-circle distance is computed afterwards
 * on the small candidate set only.
 */

/** The `places` table columns the UI renders. */
const DB_PLACE_COLUMNS =
  "id, wikidata_id, name, category, subcategory, latitude, longitude, image_url, website, source";

/**
 * Categories that already exist in the `places` table (`category` column).
 *
 * The values match the database exactly and ARE NOT invented here; they
 * come from scanning the existing table. "All" is a UI-only option.
 */
export const DB_PLACE_CATEGORIES = [
  "finance",
  "accommodation",
  "healthcare",
  "transport",
  "education",
  "religious",
  "postal",
  "natural",
  "historic",
  "recreation",
  "shopping",
  "emergency",
  "food",
  "entertainment",
  "attraction",
  "infrastructure",
  "government",
] as const;

export type DbPlaceCategory = (typeof DB_PLACE_CATEGORIES)[number];

/**
 * Maps the app-wide category ids (the same ones the OSM provider uses) onto
 * the coarse `category` column values that already exist in the `places`
 * table. Multiple ids may share one stored value (e.g. "hospital" and
 * "pharmacy" are both "healthcare"), and one id may span several stored
 * values (visitor attractions live under several buckets). This is what
 * lets Database and OSM places share a single category system.
 */
export const DB_CATEGORY_MATCH: Record<string, string[]> = {
  hotel: ["accommodation"],
  restaurant: ["food"],
  cafe: ["food"],
  temple: ["religious"],
  "gas-station": ["transport"],
  parking: ["transport"],
  hospital: ["healthcare"],
  pharmacy: ["healthcare"],
  "tourist-attraction": [
    "attraction",
    "historic",
    "natural",
    "recreation",
    "entertainment",
  ],
  grocery: ["shopping"],
  atm: ["finance"],
  "rest-stop": [],
  "car-service": ["transport"],
};

/** Stored `category` values that satisfy the given app category ids. */
export function dbCategoriesForAppIds(
  categories: string[] | undefined
): string[] {
  const stored: string[] = [];

  for (const id of categories ?? []) {
    const match = DB_CATEGORY_MATCH[id];

    if (!match || match.length === 0) continue;

    for (const value of match) {
      if (!stored.includes(value)) {
        stored.push(value);
      }
    }
  }

  return stored;
}

/** Human-readable labels for the DB categories (used by the chips and cards). */
export const DB_CATEGORY_LABELS: Record<string, string> = {
  finance: "Finance",
  accommodation: "Accommodation",
  healthcare: "Healthcare",
  transport: "Transport",
  education: "Education",
  religious: "Religious",
  postal: "Postal",
  natural: "Natural",
  historic: "Historic",
  recreation: "Recreation",
  shopping: "Shopping",
  emergency: "Emergency",
  food: "Food",
  entertainment: "Entertainment",
  attraction: "Attraction",
  infrastructure: "Infrastructure",
  government: "Government",
};

/** Label for a raw DB `category` value, falling back to the raw value. */
export function dbCategoryLabel(category: string | null | undefined): string {
  if (!category) {
    return "Place";
  }

  const label = DB_CATEGORY_LABELS[category.toLowerCase()];

  if (label) {
    return label;
  }

  const readable = category
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());

  return readable || "Place";
}

/** One row of the existing `places` table (mirrors the stored columns). */
export interface DbPlace {
  id: string | number;
  wikidata_id: string | null;
  name: string | null;
  category: string | null;
  subcategory: string | null;
  latitude: number | null;
  longitude: number | null;
  image_url: string | null;
  website: string | null;
  source: string | null;
}

export interface GetNearbyDbPlacesParams {
  latitude: number;
  longitude: number;
  /**
   * App category ids (e.g. "hotel", "restaurant") — the shared category
   * system. Each id is expanded to the stored `category` values via
   * `DB_CATEGORY_MATCH`. Omitted/empty returns places from every category.
   */
  categories?: string[];
  /** Hard cap in meters; every candidate beyond it is dropped. */
  radiusMeters?: number;
  /** Maximum rows fetched from the database. */
  limit?: number;
}

export interface NearbyDbPlace extends DbPlace {
  distanceMeters: number;
  distanceText: string;
}

/**
 * Staged bounding boxes, in half-degrees of latitude, used to find the
 * nearest places. The search starts tight (so the nearest rows come back
 * in a small box around the destination) and only widens when a category
 * is sparse, up to ~50 km. Longitude is widened by `1 / cos(latitude)`
 * so each box is roughly square in real distance.
 */
const BOX_HALF_LAT_STAGES = [0.12, 0.24, 0.45];
const DEFAULT_RESULT_LIMIT = 150;

/** Rows fetched per box stage (limits the transfer, never the whole table). */
const PER_STAGE_FETCH_LIMIT = 300;

/**
 * Fetch the places nearest to a destination from the existing `places`
 * table.
 *
 *  - Filters server-side on the stored `category` column.
 *  - Bounds the search to small boxes around the destination so only
 *    nearby rows are transferred. The tight box normally satisfies the
 *    result cap; wider boxes are only used for sparse categories.
 *  - Computes the exact great-circle distance and sorts ascending, so the
 *    nearest place is always first.
 *
 * Callers pass the authenticated Supabase client (`useSupabase()`); no
 * credentials are handled here.
 */
export async function getNearbyDbPlaces(
  supabase: SupabaseClient,
  {
    latitude,
    longitude,
    categories,
    radiusMeters,
    limit = DEFAULT_RESULT_LIMIT,
  }: GetNearbyDbPlacesParams
): Promise<NearbyDbPlace[]> {
  const storedCategories = dbCategoriesForAppIds(categories);
  const hasCategoryConstraint = Array.isArray(categories);

  // The caller asked for specific categories but none of them map to a
  // stored `category` value (e.g. "rest-stop"). Without this early return
  // the empty `.in()` list would be skipped and EVERY category returned.
  if (hasCategoryConstraint && storedCategories.length === 0) {
    return [];
  }

  const lonFactor = Math.max(
    0.35,
    Math.min(1.5, 1 / Math.cos((latitude * Math.PI) / 180))
  );

  const byId = new Map<string, DbPlace>();
  const fetchLimit = Math.max(limit, PER_STAGE_FETCH_LIMIT);

  for (const halfLatDeg of BOX_HALF_LAT_STAGES) {
    if (byId.size >= limit) {
      break;
    }

    const halfLonDeg = halfLatDeg * lonFactor;

    const results = await fetchBox({
      supabase,
      latitude,
      longitude,
      halfLatDeg,
      halfLonDeg,
      categories: storedCategories,
      fetchLimit,
    });

    for (const row of results) {
      byId.set(String(row.id), row);
    }
  }

  const candidates: NearbyDbPlace[] = [];

  for (const row of byId.values()) {
    if (
      typeof row.latitude !== "number" ||
      !Number.isFinite(row.latitude) ||
      typeof row.longitude !== "number" ||
      !Number.isFinite(row.longitude)
    ) {
      continue;
    }

    const distanceMeters = calculateDistanceMeters(
      latitude,
      longitude,
      row.latitude,
      row.longitude
    );

    if (radiusMeters && distanceMeters > radiusMeters) {
      continue;
    }

    candidates.push({
      ...row,
      distanceMeters: Math.round(distanceMeters),
      distanceText: formatDistanceText(distanceMeters),
    });
  }

  return candidates
    .sort((first, second) => first.distanceMeters - second.distanceMeters)
    .slice(0, limit);
}

interface FetchBoxParams {
  supabase: SupabaseClient;
  latitude: number;
  longitude: number;
  halfLatDeg: number;
  halfLonDeg: number;
  categories: string[];
  fetchLimit: number;
}

/** One bounded SQL query against the existing `places` table. */
async function fetchBox({
  supabase,
  latitude,
  longitude,
  halfLatDeg,
  halfLonDeg,
  categories,
  fetchLimit,
}: FetchBoxParams): Promise<DbPlace[]> {
  const minLat = latitude - halfLatDeg;
  const maxLat = latitude + halfLatDeg;
  const minLon = longitude - halfLonDeg;
  const maxLon = longitude + halfLonDeg;

  let query = supabase
    .from("places")
    .select(DB_PLACE_COLUMNS)
    .gte("latitude", minLat)
    .lte("latitude", maxLat)
    .gte("longitude", minLon)
    .lte("longitude", maxLon)
    .limit(fetchLimit);

  if (categories.length > 0) {
    query = query.in("category", categories);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return (data ?? []) as DbPlace[];
}

/**
 * Adapt a `places` row into the app-wide `TravelPlace` model so the
 * existing map markers and place cards can render it unchanged.
 */
export function nearbyDbPlaceToTravelPlace(
  place: NearbyDbPlace
): TravelPlace {
  return {
    id: String(place.id ?? ""),
    name: place.name,
    category: place.category || "other",
    formatted: null,
    latitude: place.latitude!,
    longitude: place.longitude!,
    city: null,
    state: null,
    country: null,
    postcode: null,
    website: place.website,
    phone: null,
    opening_hours: null,
    wheelchair: null,
    religion: null,
    distanceMeters: place.distanceMeters,
    distanceText: place.distanceText,
    travelTimeMinutes: null,
    travelTimeText: null,
    rating: null,
    reviewCount: null,
    imageUrl: place.image_url,
    priceLevel: null,
    isOpen: null,
    source: "database",
  };
}