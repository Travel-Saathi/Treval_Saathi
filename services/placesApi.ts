import { API_BASE_URL } from "./locationApi";
import {
  toGeoapifyCategories,
  toOsmCategories,
} from "./placeCategories";
import {
  validateStopAgainstRoute,
  type RoutePoint,
} from "./routeApi";

/** Max route points sent to the attractions API (corridor math tolerates this). */
const MAX_ROUTE_SENT_COORDINATES = 200;

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

  source: "database" | "osm" | "geoapify" | "foursquare" | "merged";

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

/** The Overpass endpoint accepts at most three categories per request. */
const OSM_CATEGORIES_PER_QUERY = 3;

/**
 * Fetch OSM places for any number of app categories.
 *
 * The existing Overpass endpoint caps a query at three categories, so a
 * larger selection is split into batches and the results are merged
 * (de-duplicated, nearest first). This is a thin caller of the single
 * existing `getOsmPlaces` implementation — there is no second OSM code
 * path. Batches that fail are tolerated as long as at least one succeeds.
 */
export async function getOsmPlacesForCategories(
  params: GetOsmPlacesParams
): Promise<TravelPlace[]> {
  if (params.categories.length <= OSM_CATEGORIES_PER_QUERY) {
    return getOsmPlaces(params);
  }

  const batches: string[][] = [];

  for (
    let index = 0;
    index < params.categories.length;
    index += OSM_CATEGORIES_PER_QUERY
  ) {
    batches.push(
      params.categories.slice(index, index + OSM_CATEGORIES_PER_QUERY)
    );
  }

  const settled = await Promise.allSettled(
    batches.map((batch) => getOsmPlaces({ ...params, categories: batch }))
  );

  const fulfilled = settled.filter(
    (result): result is PromiseFulfilledResult<TravelPlace[]> =>
      result.status === "fulfilled"
  );

  if (fulfilled.length === 0) {
    const firstError = settled.find(
      (result): result is PromiseRejectedResult =>
        result.status === "rejected"
    );

    throw firstError ? firstError.reason : new Error("OSM places request failed");
  }

  const byKey = new Map<string, TravelPlace>();

  for (const result of fulfilled) {
    for (const place of result.value) {
      const key =
        place.id ||
        `${place.name ?? ""}-${place.latitude}-${place.longitude}`;

      if (!byKey.has(key)) {
        byKey.set(key, place);
      }
    }
  }

  return Array.from(byKey.values()).sort(
    (first, second) =>
      (first.distanceMeters ?? Infinity) - (second.distanceMeters ?? Infinity)
  );
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

/* --------------------------------------------------
   Attractions along a route
-------------------------------------------------- */

export interface RouteAttraction {
  id: string;
  name: string | null;
  category: string;
  formatted: string | null;
  description: string | null;
  /** May be null when the attraction could not be geocoded to coordinates. */
  latitude: number | null;
  longitude: number | null;
  /** Shortest distance from the attraction to the route corridor, in km. */
  distanceKm: number | null;
  /** Human-readable corridor distance, e.g. "~1.4 km from route". */
  distanceText: string | null;
  website: string | null;
  imageUrl: string | null;
  /**
   * Nearest journey city (computed server-side). Used to route UI taps
   * to the existing city detail screen.
   */
  nearestCity: string | null;
  /** Provider-neutral origin of the attraction (e.g. "web"). */
  source?: string;
}

export type RouteAttractionsStatus = "ok" | "no-geometry" | "osm-error";

export interface RouteAttractionsResult {
  status: RouteAttractionsStatus;
  attractions: RouteAttraction[];
}

export interface GetAttractionsAlongRouteOptions {
  /** App category IDs to look up (defaults to the backend route bundle). */
  categories?: string[];
  /** Maximum number of attractions to return. */
  maxResults?: number;
  /** Corridor width in km (defaults to the backend ROUTE_ATTRACTION_RADIUS_KM). */
  corridorKm?: number;
  /** Ordered journey city names. Used for nearest-city + web fallback. */
  cities?: string[];
}

/**
 * Evenly sample a dense route polyline down to at most
 * MAX_ROUTE_SENT_COORDINATES points, always keeping both ends. The
 * corridor distance calculation tolerates this: a few km between samples
 * is negligible against a 25 km corridor.
 */
function decimateCoordinates(points: RoutePoint[]): RoutePoint[] {
  if (points.length <= MAX_ROUTE_SENT_COORDINATES) {
    return points;
  }

  const sampled: RoutePoint[] = [];
  const step = (points.length - 1) / (MAX_ROUTE_SENT_COORDINATES - 1);

  for (let index = 0; index < MAX_ROUTE_SENT_COORDINATES; index += 1) {
    sampled.push(points[Math.round(index * step)]);
  }

  return sampled;
}

function isNullableFinite(value: unknown): value is number | null {
  return (
    value === null ||
    (typeof value === "number" && Number.isFinite(value))
  );
}

function normalizeRouteAttraction(raw: unknown): RouteAttraction | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const item = raw as Record<string, unknown>;

  const id = typeof item.id === "string" ? item.id : "";
  const latitude = isNullableFinite(item.latitude) ? item.latitude : null;
  const longitude = isNullableFinite(item.longitude) ? item.longitude : null;
  const distanceKm = isNullableFinite(item.distanceKm) ? item.distanceKm : null;

  return {
    id,
    name: typeof item.name === "string" ? item.name : null,
    category:
      typeof item.category === "string" && item.category
        ? item.category
        : "attraction",
    formatted: typeof item.formatted === "string" ? item.formatted : null,
    description:
      typeof item.description === "string" ? item.description : null,
    latitude,
    longitude,
    distanceKm,
    distanceText:
      typeof item.distanceText === "string" && item.distanceText
        ? item.distanceText
        : null,
    website: typeof item.website === "string" ? item.website : null,
    imageUrl: typeof item.imageUrl === "string" ? item.imageUrl : null,
    nearestCity:
      typeof item.nearestCity === "string" ? item.nearestCity : null,
    source: typeof item.source === "string" ? item.source : undefined,
  };
}

/**
 * Discover real places of interest close to an existing route geometry.
 *
 * Delegates to GET /api/route/attractions, which runs the discovery
 * server-side: it builds OpenSERP search queries from the ordered journey
 * cities and route segments, geocodes the real results to coordinates with
 * an OpenStreetMap-based geocoder, keeps only results within `corridorKm`
 * of the ACTUAL OSRM route polyline, ranks by real signals and de-duplicates
 * by name. Attractions that cannot be geocoded remain list rows without a
 * map marker; coordinates are never fabricated.
 *
 * The client never fabricates results and only renders them when the
 * backend returns `status: "ok"`.
 */
export async function getAttractionsAlongRoute(
  routeCoordinates: RoutePoint[],
  options: GetAttractionsAlongRouteOptions = {}
): Promise<RouteAttractionsResult> {
  if (!Array.isArray(routeCoordinates) || routeCoordinates.length < 2) {
    return { status: "no-geometry", attractions: [] };
  }

  const coordinates = routeCoordinates.filter(
    (point) =>
      point != null &&
      Number.isFinite(point.latitude) &&
      Number.isFinite(point.longitude)
  );

  if (coordinates.length < 2) {
    return { status: "no-geometry", attractions: [] };
  }

  const sentCoordinates = decimateCoordinates(coordinates);

  const query = new URLSearchParams({
    coords: sentCoordinates
      .map((point) => `${point.latitude},${point.longitude}`)
      .join(";"),
  });

  if (options.categories && options.categories.length > 0) {
    const osmCategories = toOsmCategories(options.categories);

    if (osmCategories.length > 0) {
      query.set("categories", osmCategories.join(";"));
    }
  }

  if (options.maxResults) {
    query.set("max", String(options.maxResults));
  }

  if (options.corridorKm) {
    query.set("corridorKm", String(options.corridorKm));
  }

  if (options.cities && options.cities.length > 0) {
    query.set("cities", options.cities.join(";"));
  }

  let response: Response;

  try {
    response = await fetch(
      `${API_BASE_URL}/api/route/attractions?${query.toString()}`
    );
  } catch {
    return { status: "osm-error", attractions: [] };
  }

  let data: unknown;

  try {
    data = await response.json();
  } catch {
    return { status: "osm-error", attractions: [] };
  }

  if (!response.ok || !data || typeof data !== "object") {
    const reason: RouteAttractionsStatus =
      data &&
      typeof data === "object" &&
      "reason" in data &&
      data.reason === "no-geometry"
        ? "no-geometry"
        : "osm-error";

    return { status: reason, attractions: [] };
  }

  const rawAttractions = (data as { attractions?: unknown }).attractions;

  const attractions = Array.isArray(rawAttractions)
    ? rawAttractions
        .map(normalizeRouteAttraction)
        .filter((item): item is RouteAttraction => item !== null)
    : [];

  return { status: "ok", attractions };
}