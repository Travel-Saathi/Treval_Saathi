import { API_BASE_URL } from "./locationApi";
import {
  toGeoapifyCategories,
  toOsmCategories,
} from "./placeCategories";

export interface GetNearbyPlacesParams {
  latitude: number;
  longitude: number;
  categories: string[];
  radius?: number;
  limit?: number;
}

export interface GetOsmPlacesParams {
  latitude: number;
  longitude: number;
  categories: string[];
  radius?: number;
}

/**
 * Provider-independent Travel Saathi Place model.
 *
 * The UI renders this shape regardless of whether the place came
 * from OSM, Geoapify, Foursquare, or a merged result. Fields that a
 * provider does not supply are left `null` and populated later by
 * other services (Geoapify, Foursquare, routing API, ...).
 */
export interface TravelPlace {
  id: string;

  name: string | null;
  category: string;

  formatted: string | null;

  latitude: number;
  longitude: number;

  city: string | null;
  state: string | null;
  country: string | null;
  postcode: string | null;

  website: string | null;
  phone: string | null;

  opening_hours: string | null;
  wheelchair: string | null;
  religion: string | null;

  // Travel Saathi enrichment fields.
  // These may initially be null because OSM does not provide them.
  distanceMeters: number | null;
  distanceText: string | null;

  travelTimeMinutes: number | null;
  travelTimeText: string | null;

  rating: number | null;
  reviewCount: number | null;

  imageUrl: string | null;

  priceLevel: string | null;

  isOpen: boolean | null;

  source: "osm" | "geoapify" | "foursquare" | "merged";

  osmType?: string;
  osmId?: number | string;

  tags?: Record<string, unknown>;
}

/**
 * Great-circle distance between two coordinates in meters
 * (Haversine formula).
 */
export function calculateDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000;

  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Format a distance in meters as a human-readable "away" string.
 *
 * < 1000 m  -> "450 m away"
 * >= 1000 m -> "1.8 km away"
 */
export function formatDistanceText(distanceMeters: number): string {
  if (distanceMeters < 1000) {
    return `${Math.round(distanceMeters)} m away`;
  }

  return `${(distanceMeters / 1000).toFixed(1)} km away`;
}

export interface NearbyPlace {
  id: string | null;
  name: string | null;
  category: string | null;
  formatted: string | null;
  latitude: number | null;
  longitude: number | null;
  city: string | null;
  state: string | null;
  country: string | null;
  postcode: string | null;
  distance: number | null;
  categories: string[] | null;
  opening_hours: unknown;
  website: string | null;
  phone: string | null;
}

/**
 * Fetch nearby places for the given destination and app category IDs.
 *
 * App category IDs are converted to Geoapify categories on the
 * frontend; the backend only ever talks to Geoapify.
 */
export async function getNearbyPlaces({
  latitude,
  longitude,
  categories,
  radius = 5000,
  limit = 100,
}: GetNearbyPlacesParams): Promise<NearbyPlace[]> {
  if (categories.length === 0) {
    throw new Error("At least one place category is required");
  }

  const geoapifyCategories = toGeoapifyCategories(categories);

  if (geoapifyCategories.length === 0) {
    throw new Error(
      "None of the selected place categories map to a valid Geoapify category"
    );
  }

  const query = new URLSearchParams({
    lat: String(latitude),
    lon: String(longitude),
    category: geoapifyCategories.join(","),
    radius: String(radius),
    limit: String(limit),
  });

  let response: Response;

  try {
    response = await fetch(
      `${API_BASE_URL}/api/places/nearby?${query.toString()}`
    );
  } catch (error) {
    throw new Error(
      "Could not reach the places service. Is the backend running?"
    );
  }

  if (!response.ok) {
    throw new Error(
      `Places request failed: ${response.status}`
    );
  }

  const data: unknown = await response.json();

  if (!Array.isArray(data)) {
    throw new Error("Places service returned an unexpected response");
  }

  return data as NearbyPlace[];
}

/**
 * Normalize one raw OSM place (from /api/osm/places) into a
 * future-proof TravelPlace. Distance is derived on the client from
 * the selected destination coordinates via the Haversine formula.
 *
 * Never invents values: any enrichment the OSM response does not
 * provide is left `null`.
 */
function normalizeOsmToTravelPlace(
  raw: unknown,
  destinationLatitude: number,
  destinationLongitude: number
): TravelPlace | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const place = raw as Record<string, unknown>;

  const latitude =
    typeof place.latitude === "number" ? place.latitude : null;
  const longitude =
    typeof place.longitude === "number" ? place.longitude : null;

  if (latitude === null || longitude === null) {
    return null;
  }

  let distanceMeters: number | null = null;
  let distanceText: string | null = null;

  if (
    Number.isFinite(destinationLatitude) &&
    Number.isFinite(destinationLongitude)
  ) {
    const meters = calculateDistanceMeters(
      destinationLatitude,
      destinationLongitude,
      latitude,
      longitude
    );

    distanceMeters = Math.round(meters);
    distanceText = formatDistanceText(meters);
  }

  const openingHours =
    typeof place.opening_hours === "string" &&
    place.opening_hours.trim()
      ? place.opening_hours.trim()
      : null;

  const osmId =
    typeof place.osmId === "number" || typeof place.osmId === "string"
      ? place.osmId
      : undefined;

  return {
    id: typeof place.id === "string" ? place.id : "",
    name: typeof place.name === "string" ? place.name : null,
    category:
      typeof place.category === "string" && place.category
        ? place.category
        : "other",
    formatted: typeof place.formatted === "string" ? place.formatted : null,
    latitude,
    longitude,
    city: typeof place.city === "string" ? place.city : null,
    state: typeof place.state === "string" ? place.state : null,
    country: typeof place.country === "string" ? place.country : null,
    postcode: typeof place.postcode === "string" ? place.postcode : null,
    website: typeof place.website === "string" ? place.website : null,
    phone: typeof place.phone === "string" ? place.phone : null,
    opening_hours: openingHours,
    wheelchair: typeof place.wheelchair === "string" ? place.wheelchair : null,
    religion: typeof place.religion === "string" ? place.religion : null,
    distanceMeters,
    distanceText,
    travelTimeMinutes: null,
    travelTimeText: null,
    rating: null,
    reviewCount: null,
    imageUrl: null,
    priceLevel: null,
    isOpen: null,
    source: "osm",
    osmType: typeof place.osmType === "string" ? place.osmType : undefined,
    osmId,
    tags:
      place.tags && typeof place.tags === "object"
        ? (place.tags as Record<string, unknown>)
        : undefined,
  };
}

/**
 * Fetch normalized OSM places for the given destination and app
 * category IDs from GET /api/osm/places.
 *
 * Extracts only `response.places` and normalizes every entry into a
 * provider-independent TravelPlace. It never renders or returns the
 * whole response envelope.
 */
export async function getOsmPlaces({
  latitude,
  longitude,
  categories,
  radius = 4000,
}: GetOsmPlacesParams): Promise<TravelPlace[]> {
  if (categories.length === 0) {
    throw new Error("At least one place category is required");
  }

  const osmCategories = toOsmCategories(categories);

  if (osmCategories.length === 0) {
    throw new Error(
      "None of the selected place categories map to a supported OSM category"
    );
  }

  const query = new URLSearchParams({
    lat: String(latitude),
    lon: String(longitude),
    radius: String(radius),
    categories: osmCategories.join(","),
  });

  let response: Response;

  try {
    response = await fetch(
      `${API_BASE_URL}/api/osm/places?${query.toString()}`
    );
  } catch (error) {
    throw new Error(
      "Could not reach the places service. Is the backend running?"
    );
  }

  if (!response.ok) {
    throw new Error(
      `Places request failed: ${response.status}`
    );
  }

  const data: unknown = await response.json();

  if (!data || typeof data !== "object" || !("places" in data)) {
    throw new Error("Places service returned an unexpected response");
  }

  const places = (data as { places?: unknown }).places;

  if (!Array.isArray(places)) {
    throw new Error("Places service returned an unexpected response");
  }

  return places
    .map((raw) =>
      normalizeOsmToTravelPlace(raw, latitude, longitude)
    )
    .filter((place): place is TravelPlace => place !== null);
}