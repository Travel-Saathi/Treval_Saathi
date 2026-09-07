import { API_BASE_URL, searchLocation } from "./locationApi";

/**
 * Multi-stop route client.
 *
 * Reuses the existing backend route engine (OSRM):
 *   GET /api/routing/route?coords=lat,lon;lat,lon;...&geometry=true
 *
 * The backend is asked for GeoJSON geometry (format=geojson) so the
 * returned line can be drawn directly on the map as a Polyline.
 */

export interface RoutePoint {
  latitude: number;
  longitude: number;
}

export interface JourneyRoute {
  distanceMeters: number | null;
  distanceKilometers: number | null;
  durationSeconds: number | null;
  durationMinutes: number | null;
  waypoints: RoutePoint[];
  coordinates: RoutePoint[];
}

interface RawRoute {
  distance?: {
    meters?: number | null;
    kilometers?: number | null;
  } | null;
  duration?: {
    seconds?: number | null;
    minutes?: number | null;
  } | null;
  waypoints?: Array<{
    name?: string | null;
    location?: { longitude?: number | null; latitude?: number | null } | null;
  }> | null;
  geometry?: unknown;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isRoutePoint(value: unknown): value is RoutePoint {
  if (!value || typeof value !== "object") {
    return false;
  }

  const point = value as Record<string, unknown>;

  return (
    isFiniteNumber(point.latitude) && isFiniteNumber(point.longitude)
  );
}

/**
 * Decode an OSRM encoded polyline (precision 5) into coordinates.
 * Used as a fallback when the backend returns polyline geometry.
 */
function decodePolyline(encoded: string): RoutePoint[] {
  const points: RoutePoint[] = [];

  let index = 0;
  let latitude = 0;
  let longitude = 0;

  while (index < encoded.length) {
    let byte = 0;
    let shift = 0;
    let result = 0;

    do {
      byte = encoded.charCodeAt(index) - 63;
      index += 1;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    const deltaLatitude = result & 1 ? ~(result >> 1) : result >> 1;

    latitude += deltaLatitude;

    shift = 0;
    result = 0;

    do {
      byte = encoded.charCodeAt(index) - 63;
      index += 1;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    const deltaLongitude = result & 1 ? ~(result >> 1) : result >> 1;

    longitude += deltaLongitude;

    points.push({
      latitude: latitude / 1e5,
      longitude: longitude / 1e5,
    });
  }

  return points;
}

/**
 * Extract route coordinates from the raw `geometry` field.
 * Supports both GeoJSON LineStrings and encoded polylines.
 */
function extractCoordinates(geometry: unknown): RoutePoint[] {
  if (typeof geometry === "string") {
    return decodePolyline(geometry);
  }

  if (geometry && typeof geometry === "object") {
    const geo = geometry as Record<string, unknown>;

    if (geo.type === "LineString" && Array.isArray(geo.coordinates)) {
      const result: RoutePoint[] = [];

      for (const pair of geo.coordinates) {
        if (
          Array.isArray(pair) &&
          pair.length >= 2 &&
          isFiniteNumber(pair[0]) &&
          isFiniteNumber(pair[1])
        ) {
          // GeoJSON order is [longitude, latitude]
          result.push({
            longitude: pair[0],
            latitude: pair[1],
          });
        }
      }

      return result;
    }
  }

  return [];
}

/**
 * Compute a driving route across the given ordered waypoints.
 * Throws when the route engine fails or the route is unusable.
 */
export async function getJourneyRoute(
  coordinates: RoutePoint[],
  signal?: AbortSignal
): Promise<JourneyRoute> {
  if (!Array.isArray(coordinates) || coordinates.length < 2) {
    throw new Error("At least 2 waypoints are required to build a route");
  }

  for (const point of coordinates) {
    if (!isRoutePoint(point)) {
      throw new Error("Every waypoint needs valid latitude and longitude");
    }
  }

  const coordsParam = coordinates
    .map((point) => `${point.latitude},${point.longitude}`)
    .join(";");

  const query = new URLSearchParams({
    coords: coordsParam,
    geometry: "true",
    format: "geojson",
  });

  let response: Response;

  try {
    response = await fetch(
      `${API_BASE_URL}/api/routing/route?${query.toString()}`,
      { signal }
    );
  } catch (error) {
    throw new Error(
      "Could not reach the route service. Is the backend running?"
    );
  }

  if (!response.ok) {
    throw new Error(`Route request failed: ${response.status}`);
  }

  let data: unknown;

  try {
    data = await response.json();
  } catch {
    throw new Error("Route service returned an unexpected response");
  }

  if (!data || typeof data !== "object") {
    throw new Error("Route service returned an unexpected response");
  }

  const route = data as RawRoute;

  const meters = route.distance?.meters ?? null;
  const seconds = route.duration?.seconds ?? null;

  const waypoints = (route.waypoints ?? [])
    .map((waypoint) => waypoint?.location)
    .filter(isRoutePoint);

  return {
    distanceMeters: meters,
    distanceKilometers:
      isFiniteNumber(meters) ? meters / 1000 : null,
    durationSeconds: seconds,
    durationMinutes:
      isFiniteNumber(seconds) ? seconds / 60 : null,
    waypoints,
    coordinates: extractCoordinates(route.geometry),
  };
}

/* --------------------------------------------------
   City coordinate resolution
-------------------------------------------------- */

interface ResolvedPoint extends RoutePoint {
  label: string | null;
}

/**
 * In-memory cache so an identical city is only geocoded once per app
 * session. The DB stores city names only (no coordinates), so the exact
 * string acts as the cache key.
 */
const coordCache = new Map<string, ResolvedPoint>();

/**
 * Resolve a city/place name to coordinates using the existing
 * location search service (which wraps the backend Geoapify geocoder).
 * Throws when no usable coordinate can be found.
 */
export async function resolveCityCoordinates(
  name: string,
  signal?: AbortSignal
): Promise<ResolvedPoint> {
  const trimmed = name.trim();

  if (!trimmed) {
    throw new Error("A city name is required");
  }

  const cached = coordCache.get(trimmed.toLowerCase());

  if (cached) {
    return cached;
  }

  const results = await searchLocation(trimmed, signal);

  if (!Array.isArray(results) || results.length === 0) {
    throw new Error(`Could not find coordinates for "${trimmed}"`);
  }

  const lower = trimmed.toLowerCase();

  const preferred =
    results.find((item) => {
      const candidate = `${item.name ?? ""} ${item.city ?? ""}`.toLowerCase();

      return (
        candidate.includes(lower) &&
        Number.isFinite(item.latitude) &&
        Number.isFinite(item.longitude)
      );
    }) ??
    results.find(
      (item) => Number.isFinite(item.latitude) && Number.isFinite(item.longitude)
    );

  if (!preferred) {
    throw new Error(`Could not find coordinates for "${trimmed}"`);
  }

  const resolved: ResolvedPoint = {
    latitude: preferred.latitude,
    longitude: preferred.longitude,
    label: preferred.name ?? trimmed,
  };

  coordCache.set(trimmed.toLowerCase(), resolved);

  return resolved;
}

/* --------------------------------------------------
   Route-aware stop validation
-------------------------------------------------- */

const EARTH_RADIUS_KM = 6371;
const DEG_TO_RAD = Math.PI / 180;

/**
 * Corridor width around the existing route that counts as "on the route".
 * Tuned for MVP (Gwalior-scale detours should still be addable even though
 * the city sits a few km off the exact road line).
 */
export const ROUTE_STOP_TOLERANCE_KM = 35;

function haversineKm(a: RoutePoint, b: RoutePoint): number {
  const dLat = (b.latitude - a.latitude) * DEG_TO_RAD;
  const dLon = (b.longitude - a.longitude) * DEG_TO_RAD;

  const y =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.latitude * DEG_TO_RAD) *
      Math.cos(b.latitude * DEG_TO_RAD) *
      Math.sin(dLon / 2) ** 2;

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(y));
}

/**
 * Closest distance from `point` to the segment `[a, b]`.
 * Uses an equirectangular projection around the point so the nearest
 * projection is stable, then returns a true great-circle distance.
 */
function pointSegmentDistanceKm(
  point: RoutePoint,
  a: RoutePoint,
  b: RoutePoint
): { t: number; distanceKm: number } {
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

  return {
    t,
    distanceKm: haversineKm(point, {
      latitude: a.latitude + t * (b.latitude - a.latitude),
      longitude: a.longitude + t * (b.longitude - a.longitude),
    }),
  };
}

export type StopRouteValidationCode =
  | "ok"
  | "no-geometry"
  | "before-source"
  | "after-destination"
  | "too-far";

export interface StopRouteValidation {
  valid: boolean;
  code: StopRouteValidationCode;
  /** Distance from the candidate to the nearest route segment, in km. */
  distanceKm: number | null;
  /**
   * 0 = source, 1 = destination. Used to place the stop in the correct
   * position along the route (stop_order).
   */
  fraction: number | null;
}

const FRACTION_MARGIN = 0.001;

/**
 * Validate whether a geocoded candidate stop lies inside the existing
 * route corridor (nearest distance <= `toleranceKm`) AND between the
 * source and destination along the route progression.
 *
 * This is geometry-only: it never builds a new route. Callers reuse the
 * already-calculated route geometry, so validation is cheap and never
 * triggers an extra routing request per keystroke.
 */
export function validateStopAgainstRoute(
  point: RoutePoint,
  routeCoordinates: RoutePoint[],
  toleranceKm: number = ROUTE_STOP_TOLERANCE_KM
): StopRouteValidation {
  if (!Array.isArray(routeCoordinates) || routeCoordinates.length < 2) {
    return {
      valid: false,
      code: "no-geometry",
      distanceKm: null,
      fraction: null,
    };
  }

  const segmentKm: number[] = [];

  let totalKm = 0;

  for (let i = 0; i + 1 < routeCoordinates.length; i += 1) {
    const km = haversineKm(routeCoordinates[i], routeCoordinates[i + 1]);
    segmentKm.push(km);
    totalKm += km;
  }

  let best = { distanceKm: Infinity, t: 0, segmentIndex: 0, prefixKm: 0 };
  let prefixKm = 0;

  for (let i = 0; i < segmentKm.length; i += 1) {
    const { t, distanceKm } = pointSegmentDistanceKm(
      point,
      routeCoordinates[i],
      routeCoordinates[i + 1]
    );

    if (distanceKm < best.distanceKm) {
      best = { distanceKm, t, segmentIndex: i, prefixKm };
    }

    prefixKm += segmentKm[i];
  }

  const fraction =
    totalKm > 0
      ? (best.prefixKm + best.t * segmentKm[best.segmentIndex]) / totalKm
      : null;

  if (fraction === null || !Number.isFinite(fraction)) {
    return {
      valid: false,
      code: "no-geometry",
      distanceKm: best.distanceKm,
      fraction: null,
    };
  }

  if (fraction <= FRACTION_MARGIN) {
    return {
      valid: false,
      code: "before-source",
      distanceKm: best.distanceKm,
      fraction,
    };
  }

  if (fraction >= 1 - FRACTION_MARGIN) {
    return {
      valid: false,
      code: "after-destination",
      distanceKm: best.distanceKm,
      fraction,
    };
  }

  if (best.distanceKm > toleranceKm) {
    return {
      valid: false,
      code: "too-far",
      distanceKm: best.distanceKm,
      fraction,
    };
  }

  return {
    valid: true,
    code: "ok",
    distanceKm: best.distanceKm,
    fraction,
  };
}