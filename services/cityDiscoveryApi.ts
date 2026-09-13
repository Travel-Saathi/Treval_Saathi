import { Ionicons } from "@expo/vector-icons";

import { API_BASE_URL } from "./locationApi";

/**
 * Treval Saathi "Explore City" discovery client.
 *
 * The Explore City block never talks to a search provider directly. It calls
 * the backend city-discovery service (GET /api/city/explore), which builds a
 * natural "<category> in <city>" query, runs it through the provider-agnostic
 * web search service (OpenSERP when configured as the default), then
 * normalizes, enriches, ranks and de-duplicates the results.
 *
 * The UI never learns which provider supplied a result.
 */

export type IoniconName = keyof typeof Ionicons.glyphMap;

/**
 * Central category configuration for the Explore City block.
 *
 * Adding a new preset category = one entry here. Every category still goes
 * through the same discovery backend, so no new API is ever needed.
 */
export const CITY_EXPLORE_CATEGORIES: readonly {
  id: string;
  label: string;
  icon: IoniconName;
}[] = [
  { id: "temple", label: "Temples", icon: "business-outline" },
  { id: "tourist-attraction", label: "Attractions", icon: "camera-outline" },
  { id: "restaurant", label: "Restaurants", icon: "restaurant-outline" },
  { id: "hotel", label: "Hotels", icon: "bed-outline" },
  { id: "cafe", label: "Cafes", icon: "cafe-outline" },
  { id: "gas-station", label: "Fuel", icon: "speedometer-outline" },
];

export function categoryConfig(id: string) {
  return CITY_EXPLORE_CATEGORIES.find((config) => config.id === id) ?? null;
}

/**
 * Built-in "custom" toggle for free-form categories. It is not a preset:
 * selecting it lets the user type any category (dhaba, mandir, bike rental,
 * EV charging, ...) and search is constructed as "<custom> in <city>".
 */
export const CUSTOM_SEARCH_CATEGORY_ID = "custom";

export const CUSTOM_SEARCH_PLACEHOLDER =
  "e.g. dhaba, mandir, street food";

export const CUSTOM_SEARCH_HINT =
  'Type a category like "dhaba", "mandir" or "street food" to explore it.';

/** A discovered place in the provider-neutral card model. */
export interface DiscoveredPlace {
  id: string;
  name: string | null;
  category: string | null;
  categoryLabel: string | null;
  description: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  /** May be null when the place could not be geocoded; never fabricated. */
  latitude: number | null;
  longitude: number | null;
  website: string | null;
  phone: string | null;
  imageUrl: string | null;
  sourceUrl: string | null;
  rating: number | null;
  ratingCount: number | null;
  distanceMeters: number | null;
  distanceText: string | null;
}

export interface GetCityPlacesOptions {
  city: string;
  categoryId?: string | null;
  customCategory?: string | null;
  limit?: number;
  /** Optional real reference point used to prioritise/annotate results. */
  coords?: { latitude: number; longitude: number } | null;
}

const CACHE_TTL_MS = 4 * 60 * 1000;

interface CacheEntry {
  expiresAt: number;
  places: DiscoveredPlace[];
}

const cache = new Map<string, CacheEntry>();

/**
 * Lightweight in-memory cache (mirrors the existing city-coordinate cache
 * pattern in services/routeApi.ts). Prevents repeated identical searches
 * while switching city/category chips back and forth.
 */
export function clearCityDiscoveryCache(): void {
  cache.clear();
}

function toNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : null;
}

function toNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function normalizePlace(raw: unknown): DiscoveredPlace | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const item = raw as Record<string, unknown>;

  if (typeof item.name !== "string" || !item.name.trim()) {
    return null;
  }

  return {
    id: typeof item.id === "string" ? item.id : "",
    name: item.name,
    category: toNullableString(item.category),
    categoryLabel: toNullableString(item.categoryLabel),
    description: toNullableString(item.description),
    address: toNullableString(item.address),
    city: toNullableString(item.city),
    state: toNullableString(item.state),
    country: toNullableString(item.country),
    latitude: toNullableNumber(item.latitude),
    longitude: toNullableNumber(item.longitude),
    website: toNullableString(item.website),
    phone: toNullableString(item.phone),
    imageUrl: toNullableString(item.imageUrl),
    sourceUrl: toNullableString(item.sourceUrl),
    rating: toNullableNumber(item.rating),
    ratingCount: toNullableNumber(item.ratingCount),
    distanceMeters: toNullableNumber(item.distanceMeters),
    distanceText: toNullableString(item.distanceText),
  };
}

/**
 * Search places of a category (preset or custom) inside a city.
 *
 * Returns an empty array when the search succeeds but nothing relevant was
 * found. Throws when the service is unavailable so the UI can show its
 * existing temporary-unavailable state.
 */
export async function getCityPlaces({
  city,
  categoryId,
  customCategory,
  limit = 12,
  coords,
}: GetCityPlacesOptions): Promise<DiscoveredPlace[]> {
  const trimmedCity = city.trim();
  const trimmedCustom = (customCategory ?? "").trim();

  if (!trimmedCity) {
    throw new Error("A city is required.");
  }

  if (!categoryId && !trimmedCustom) {
    throw new Error("A category is required.");
  }

  const cacheKey = [
    trimmedCity.toLowerCase(),
    (categoryId ?? "").toLowerCase(),
    trimmedCustom.toLowerCase(),
  ].join("|");

  const cached = cache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.places;
  }

  const params = new URLSearchParams({
    city: trimmedCity,
    limit: String(limit),
  });

  if (categoryId) {
    params.set("category", categoryId);
  }

  if (trimmedCustom) {
    params.set("custom", trimmedCustom);
  }

  if (
    coords &&
    Number.isFinite(coords.latitude) &&
    Number.isFinite(coords.longitude)
  ) {
    params.set("lat", String(coords.latitude));
    params.set("lon", String(coords.longitude));
  }

  let response: Response;

  try {
    response = await fetch(
      `${API_BASE_URL}/api/city/explore?${params.toString()}`
    );
  } catch {
    throw new Error(
      "Could not reach the city discovery service."
    );
  }

  if (!response.ok) {
    throw new Error("City places are temporarily unavailable.");
  }

  let data: unknown;

  try {
    data = await response.json();
  } catch {
    throw new Error("City discovery returned an unexpected response.");
  }

  if (
    !data ||
    typeof data !== "object" ||
    !("success" in data) ||
    !(data as { success?: unknown }).success
  ) {
    throw new Error("City discovery returned an unexpected response.");
  }

  const rawPlaces = (data as { places?: unknown }).places;

  if (!Array.isArray(rawPlaces)) {
    throw new Error("City discovery returned an unexpected response.");
  }

  const places = rawPlaces
    .map((raw, index) => normalizePlace(raw) ?? null)
    .filter((place): place is DiscoveredPlace => place !== null)
    .map((place, index) => ({
      ...place,
      id: place.id || `city-place-${index + 1}`,
    }));

  cache.set(cacheKey, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    places,
  });

  return places;
}