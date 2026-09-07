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