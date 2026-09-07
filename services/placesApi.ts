import { API_BASE_URL } from "./locationApi";
import {
  toGeoapifyCategories,
  toOsmCategories,
} from "./placeCategories";
import {
  validateStopAgainstRoute,
  type RoutePoint,
} from "./routeApi";

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

/* --------------------------------------------------
   Recommended intermediate stops along a route
-------------------------------------------------- */

export interface RecommendedStop {
  id: string;
  name: string;
  formatted: string;
  latitude: number;
  longitude: number;
}

export interface RecommendedStopsOptions {
  /** Point sample radius around each route waypoint, in meters. */
  radius?: number;
  /** Settlements to gather during each sample query. */
  limit?: number;
  /** City names (case-insensitive) that must never be suggested. */
  excludes?: string[];
  /** Number of evenly spaced samples along the route. */
  maxResults?: number;
}

const SETTLEMENT_CATEGORIES = ["city", "town", "village"];

const DEFAULT_SAMPLE_RADIUS_M = 30000;
const DEFAULT_SAMPLE_LIMIT = 20;
const DEFAULT_MAX_RESULTS = 8;

/**
 * Sample fractions of the routed polyline (between source and destination),
 * so recommendations are spread along the whole journey rather than bunched
 * near one end.
 */
const SAMPLE_FRACTIONS = [0.12, 0.26, 0.4, 0.54, 0.68, 0.82];

/**
 * Interpolate a point along the routed polyline at the given arc-length
 * fraction (0 = start, 1 = end). Returns null when the geometry is unusable.
 */
function pointAlongRoute(
  coordinates: RoutePoint[],
  fraction: number
): RoutePoint | null {
  if (!Array.isArray(coordinates) || coordinates.length < 2) {
    return null;
  }

  const segmentLengths: number[] = [];
  let total = 0;

  for (let index = 0; index + 1 < coordinates.length; index += 1) {
    const lengthMeters = calculateDistanceMeters(
      coordinates[index].latitude,
      coordinates[index].longitude,
      coordinates[index + 1].latitude,
      coordinates[index + 1].longitude
    );

    segmentLengths.push(lengthMeters);
    total += lengthMeters;
  }

  if (total <= 0) {
    return null;
  }

  let target = Math.max(0, Math.min(1, fraction)) * total;

  for (let index = 0; index < segmentLengths.length; index += 1) {
    const segment = segmentLengths[index];

    if (target <= segment || index + 1 === segmentLengths.length) {
      const ratio = segment > 0 ? target / segment : 0;
      const start = coordinates[index];
      const end = coordinates[index + 1];

      return {
        latitude: start.latitude + ratio * (end.latitude - start.latitude),
        longitude:
          start.longitude + ratio * (end.longitude - start.longitude),
      };
    }

    target -= segment;
  }

  return null;
}

/** Rank a settlement so larger settlements ("cities") win over towns/villages. */
function settlementRank(categories: string[] | null): number {
  const list = categories ?? [];

  if (list.includes("settlement.city")) return 0;
  if (list.includes("settlement.town")) return 1;
  if (list.includes("settlement.village")) return 2;

  return 3;
}

function normalizeSuggestedName(place: NearbyPlace): string | null {
  const name = (place.city || place.name || place.formatted || "").trim();

  return name || null;
}

/**
 * Dynamically build intermediate-stop suggestions from the CURRENT route
 * geometry and the existing places service. Nothing here is hardcoded:
 *
 *   1. A few evenly spaced points are sampled along the routed polyline.
 *   2. The existing Geoapify places feed returns settlements near each
 *      sample (existing "settlement.*" categories + existing backend).
 *   3. Every candidate is checked against the existing route corridor
 *      (single ROUTE_STOP_TOLERANCE_KM via validateStopAgainstRoute).
 *   4. Candidates are ranked by settlement size, then by how close they
 *      are to the route, and de-duplicated by name.
 *
 * Returns an empty array on any failure — callers must not depend on it.
 */
export async function getRecommendedStopsAlongRoute(
  routeCoordinates: RoutePoint[],
  options: RecommendedStopsOptions = {}
): Promise<RecommendedStop[]> {
  if (!Array.isArray(routeCoordinates) || routeCoordinates.length < 2) {
    return [];
  }

  const radius = options.radius ?? DEFAULT_SAMPLE_RADIUS_M;
  const limit = options.limit ?? DEFAULT_SAMPLE_LIMIT;
  const maxResults = options.maxResults ?? DEFAULT_MAX_RESULTS;

  const excluded = new Set(
    (options.excludes ?? [])
      .map((name) => name.trim().toLowerCase())
      .filter(Boolean)
  );

  const samplePoints = SAMPLE_FRACTIONS
    .map((fraction) => pointAlongRoute(routeCoordinates, fraction))
    .filter((point): point is RoutePoint => point !== null);

  if (samplePoints.length === 0) {
    return [];
  }

  const candidates = new Map<string, RecommendedStop & { rank: number; distanceKm: number }>();

  const queryRuns = samplePoints.map(async (point) => {
    try {
      const places = await getNearbyPlaces({
        latitude: point.latitude,
        longitude: point.longitude,
        categories: SETTLEMENT_CATEGORIES,
        radius,
        limit,
      });

      for (const place of places) {
        if (
          typeof place.latitude !== "number" ||
          typeof place.longitude !== "number"
        ) {
          continue;
        }

        const name = normalizeSuggestedName(place);

        if (!name) continue;

        const key = name.toLowerCase();

        if (excluded.has(key)) continue;

        const validation = validateStopAgainstRoute(
          { latitude: place.latitude, longitude: place.longitude },
          routeCoordinates
        );

        if (!validation.valid) continue;

        const current = candidates.get(key);

        const distanceKm = validation.distanceKm ?? Infinity;
        const rank = settlementRank(place.categories);

        if (
          !current ||
          rank < current.rank ||
          (rank === current.rank && distanceKm < current.distanceKm)
        ) {
          candidates.set(key, {
            id: place.id ?? `route-stop-${key}`,
            name,
            formatted: place.formatted ?? name,
            latitude: place.latitude,
            longitude: place.longitude,
            rank,
            distanceKm,
          });
        }
      }
    } catch (error) {
      console.error(
        "RECOMMENDED STOP SAMPLE ERROR:",
        error instanceof Error ? error.message : error
      );
    }
  });

  await Promise.all(queryRuns);

  return Array.from(candidates.values())
    .sort(
      (first, second) =>
        first.rank - second.rank || first.distanceKm - second.distanceKm
    )
    .slice(0, maxResults)
    .map(({ id, name, formatted, latitude, longitude }) => ({
      id,
      name,
      formatted,
      latitude,
      longitude,
    }));
}