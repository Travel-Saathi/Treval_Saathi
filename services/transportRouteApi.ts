import { searchLocation } from "./locationApi";
import {
  getJourneyRoute,
  resolveCityCoordinates,
  type RoutePoint,
} from "./routeApi";
import {
  fetchLiveTrainStatus,
  type LiveTrainStationPoint,
} from "./liveTrainStatusApi";
import type { TripTransport } from "./tripsApi";

export type TransportLegMode = "train" | "bus" | "car" | "flight";

export type RouteSegmentKind = "transfer" | "ride";

export interface RouteSegment {
  id: string;
  kind: RouteSegmentKind;
  mode: "transfer" | TransportLegMode;
  coordinates: RoutePoint[];
  color: string;
  label: string;
  distanceKilometers: number | null;
  durationMinutes: number | null;
}

export interface JourneyMarker {
  key: string;
  name: string;
  latitude: number;
  longitude: number;
  kind: "source" | "stop" | "destination" | "current" | "next";
}

export interface RouteStats {
  distanceKilometers: number | null;
  durationMinutes: number | null;
}

export interface RouteRegion {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

export interface TransportRouteData {
  mode: TransportLegMode;
  segments: RouteSegment[];
  markers: JourneyMarker[];
  stats: RouteStats | null;
  region: RouteRegion;
  warnings: string[];
  label: string;
}

export interface TransportRouteInputs {
  transport: TripTransport;
  originCity: string;
  destinationCity: string;
  currentLocation?: RoutePoint | null;
  signal?: AbortSignal;
}

export const ROUTE_SEGMENT_COLORS = {
  transfer: "#00BC26",
  train: "#1287F5",
  car: "#1287F5",
  bus: "#E11D48",
  flight: "#8B5CF6",
} as const;

type GeoPoint = RoutePoint;

interface StationPoint {
  point: LiveTrainStationPoint;
  resolved: GeoPoint;
}

const stationCache = new Map<string, GeoPoint & { name: string }>();

function trim(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function norm(value: string | null | undefined): string {
  return trim(value).toLowerCase();
}

function strOf(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function isFinitePoint(point: GeoPoint | null | undefined): point is GeoPoint {
  return Boolean(
    point &&
      Number.isFinite(point.latitude) &&
      Number.isFinite(point.longitude)
  );
}

function samePoint(a: GeoPoint, b: GeoPoint): boolean {
  return (
    Math.abs(a.latitude - b.latitude) < 1e-7 &&
    Math.abs(a.longitude - b.longitude) < 1e-7
  );
}

function computeRegion(markers: JourneyMarker[]): RouteRegion {
  const valid = markers.filter(
    (marker) =>
      Number.isFinite(marker.latitude) && Number.isFinite(marker.longitude)
  );

  if (valid.length === 0) {
    return {
      latitude: 23,
      longitude: 79,
      latitudeDelta: 12,
      longitudeDelta: 12,
    };
  }

  const latitudes = valid.map((marker) => marker.latitude);
  const longitudes = valid.map((marker) => marker.longitude);
  const minLat = Math.min(...latitudes);
  const maxLat = Math.max(...latitudes);
  const minLon = Math.min(...longitudes);
  const maxLon = Math.max(...longitudes);

  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLon + maxLon) / 2,
    latitudeDelta: Math.max(maxLat - minLat, 0.05) * 1.5,
    longitudeDelta: Math.max(maxLon - minLon, 0.05) * 1.5,
  };
}

const MARKER_RANK: Record<JourneyMarker["kind"], number> = {
  stop: 0,
  source: 1,
  next: 2,
  destination: 3,
  current: 4,
};

function addMarker(
  markers: JourneyMarker[],
  key: string,
  name: string,
  point: GeoPoint | null | undefined,
  kind: JourneyMarker["kind"]
): void {
  if (!isFinitePoint(point)) return;

  const existing = markers.find((marker) =>
    samePoint(marker, point as GeoPoint)
  );

  if (existing) {
    if (MARKER_RANK[kind] > MARKER_RANK[existing.kind]) {
      existing.kind = kind;
    }
    return;
  }

  markers.push({
    key,
    name: name || "Stop",
    latitude: point.latitude,
    longitude: point.longitude,
    kind,
  });
}

function buildSegment(input: {
  id: string;
  kind: RouteSegmentKind;
  mode: "transfer" | TransportLegMode;
  coordinates: GeoPoint[];
  color: string;
  label: string;
  distanceKilometers: number | null;
  durationMinutes: number | null;
}): RouteSegment | null {
  const coordinates: GeoPoint[] = [];

  for (const point of input.coordinates) {
    if (!isFinitePoint(point)) continue;

    const last = coordinates[coordinates.length - 1];

    if (last && samePoint(last, point)) continue;

    coordinates.push(point);
  }

  if (coordinates.length < 2) return null;

  return { ...input, coordinates };
}

async function transferBetween(
  a: GeoPoint | null | undefined,
  b: GeoPoint | null | undefined,
  id: string,
  label: string,
  signal?: AbortSignal
): Promise<RouteSegment | null> {
  if (!isFinitePoint(a) || !isFinitePoint(b) || samePoint(a, b)) {
    return null;
  }

  try {
    const route = await getJourneyRoute([a, b], signal);

    return (
      buildSegment({
        id,
        kind: "transfer",
        mode: "transfer",
        coordinates: route.coordinates,
        color: ROUTE_SEGMENT_COLORS.transfer,
        label,
        distanceKilometers: route.distanceKilometers,
        durationMinutes: route.durationMinutes,
      }) ??
      buildSegment({
        id,
        kind: "transfer",
        mode: "transfer",
        coordinates: [a, b],
        color: ROUTE_SEGMENT_COLORS.transfer,
        label,
        distanceKilometers: null,
        durationMinutes: null,
      })
    );
  } catch {
    return buildSegment({
      id,
      kind: "transfer",
      mode: "transfer",
      coordinates: [a, b],
      color: ROUTE_SEGMENT_COLORS.transfer,
      label,
      distanceKilometers: null,
      durationMinutes: null,
    });
  }
}

async function resolvePoint(
  name: string,
  signal?: AbortSignal
): Promise<GeoPoint | null> {
  try {
    const point = await resolveCityCoordinates(name, signal);

    return { latitude: point.latitude, longitude: point.longitude };
  } catch {
    return null;
  }
}

function normalizeMode(
  mode: string | null | undefined
): TransportLegMode | null {
  const value = norm(mode);

  if (value === "train") return "train";
  if (value === "bus") return "bus";
  if (value === "flight") return "flight";
  if (value === "cab" || value === "car") return "car";

  return null;
}

function isFiniteLatLon(
  item: Record<string, unknown>
): item is Record<string, unknown> & { latitude: number; longitude: number } {
  return (
    Number.isFinite(item.latitude) && Number.isFinite(item.longitude)
  );
}

function stationish(haystack: string): boolean {
  return /railway|junction|junc|station|terminal|\bjn\b/.test(haystack);
}

function pickStationResult(
  results: Record<string, unknown>[],
  name: string,
  code: string | null
): Record<string, unknown> | null {
  const lowerName = norm(name);
  const tokens = norm(name).split(/[^a-z0-9]+/).filter(Boolean);
  const codeToken = code ? norm(code) : null;

  if (codeToken) {
    const byCode = results.find(
      (item) =>
        isFiniteLatLon(item) &&
        `${norm(strOf(item.name))} ${norm(strOf(item.formatted))}`
          .split(/[^a-z0-9]+/)
          .includes(codeToken)
    );

    if (byCode) return byCode;
  }

  const byNameAndStation = results.find(
    (item) =>
      isFiniteLatLon(item) &&
      stationish(`${norm(strOf(item.name))} ${norm(strOf(item.formatted))}`) &&
      (norm(strOf(item.name)).includes(lowerName) ||
        lowerName.includes(norm(strOf(item.name))) ||
        tokens.every((token) => norm(strOf(item.name)).includes(token)))
  );

  if (byNameAndStation) return byNameAndStation;

  const byStation = results.find((item) => {
    const haystack = `${norm(strOf(item.name))} ${norm(strOf(item.formatted))}`;
    return isFiniteLatLon(item) && stationish(haystack);
  });

  if (byStation) return byStation;

  const byName = results.find(
    (item) =>
      isFiniteLatLon(item) &&
      (norm(strOf(item.name)).includes(lowerName) ||
        lowerName.includes(norm(strOf(item.name))) ||
        tokens.every((token) => norm(strOf(item.name)).includes(token)))
  );

  if (byName) return byName;

  return results.find((item) => isFiniteLatLon(item)) ?? null;
}

async function resolveStationCoordinates(
  station: string | null,
  code: string | null,
  signal?: AbortSignal
): Promise<GeoPoint | null> {
  const name = trim(station);

  if (!name) return null;

  const key = `${norm(name)}#${norm(code)}`;
  const cached = stationCache.get(key);

  if (cached) {
    return { latitude: cached.latitude, longitude: cached.longitude };
  }

  const query = [name, code, "railway station"].filter(Boolean).join(" ");

  let results: Record<string, unknown>[] = [];

  try {
    const data = await searchLocation(query, signal);

    if (Array.isArray(data)) {
      results = data as Record<string, unknown>[];
    }
  } catch {
    return null;
  }

  const picked = pickStationResult(results, name, code);

  if (!picked || !isFiniteLatLon(picked)) return null;

  const resolved = {
    latitude: picked.latitude,
    longitude: picked.longitude,
    name: typeof picked.name === "string" ? picked.name : name,
  };

  stationCache.set(key, resolved);

  return { latitude: resolved.latitude, longitude: resolved.longitude };
}

function stationMatches(
  station: string | null | undefined,
  city: string | null | undefined
): boolean {
  const stationTokens = norm(station).split(/[^a-z0-9]+/).filter(Boolean);
  const cityTokens = norm(city).split(/[^a-z0-9]+/).filter(Boolean);

  if (!cityTokens.length || !stationTokens.length) return false;

  const joined = norm(station);

  return cityTokens.every((token) => joined.includes(token));
}

async function buildCarRoute(
  input: TransportRouteInputs
): Promise<TransportRouteData> {
  const { originCity, destinationCity, currentLocation, signal } = input;
  const warnings: string[] = [];

  const origin = isFinitePoint(currentLocation)
    ? currentLocation
    : await resolvePoint(originCity, signal);
  const destination = await resolvePoint(destinationCity, signal);

  if (!isFinitePoint(origin) || !isFinitePoint(destination)) {
    throw new Error("Could not resolve the route endpoints.");
  }

  let segment: RouteSegment | null = null;

  try {
    const route = await getJourneyRoute([origin, destination], signal);

    segment = buildSegment({
      id: "car",
      kind: "ride",
      mode: "car",
      coordinates:
        route.coordinates.length > 0 ? route.coordinates : [origin, destination],
      color: ROUTE_SEGMENT_COLORS.car,
      label: "Drive",
      distanceKilometers: route.distanceKilometers,
      durationMinutes: route.durationMinutes,
    });
  } catch {
    warnings.push("Could not compute the road route. Showing a direct connection.");
    segment = buildSegment({
      id: "car",
      kind: "ride",
      mode: "car",
      coordinates: [origin, destination],
      color: ROUTE_SEGMENT_COLORS.car,
      label: "Drive",
      distanceKilometers: null,
      durationMinutes: null,
    });
  }

  const segments: RouteSegment[] = segment ? [segment] : [];
  const markers: JourneyMarker[] = [];

  addMarker(markers, "source", originCity, origin, "source");
  addMarker(markers, "destination", destinationCity, destination, "destination");

  return {
    mode: "car",
    segments,
    markers,
    stats: {
      distanceKilometers: segment?.distanceKilometers ?? null,
      durationMinutes: segment?.durationMinutes ?? null,
    },
    region: computeRegion(markers),
    warnings,
    label: `Drive • ${trim(originCity) || "Start"} → ${trim(destinationCity) || "End"}`,
  };
}

async function buildBusRoute(
  input: TransportRouteInputs
): Promise<TransportRouteData> {
  const { originCity, destinationCity, currentLocation, signal } = input;
  const warnings: string[] = [];

  const pickup = await resolvePoint(originCity, signal);
  const drop = await resolvePoint(destinationCity, signal);

  if (!isFinitePoint(pickup) || !isFinitePoint(drop)) {
    throw new Error("Could not resolve the bus stops.");
  }

  const origin = isFinitePoint(currentLocation)
    ? currentLocation
    : pickup;

  const ride = buildSegment({
    id: "bus",
    kind: "ride",
    mode: "bus",
    coordinates: [pickup, drop],
    color: ROUTE_SEGMENT_COLORS.bus,
    label: "Bus",
    distanceKilometers: null,
    durationMinutes: null,
  });

  const segments: RouteSegment[] = [];

  const toPickup = await transferBetween(
    origin,
    pickup,
    "bus-transfer-in",
    "To the pickup",
    signal
  );

  if (toPickup) segments.push(toPickup);
  if (ride) segments.push(ride);

  const markers: JourneyMarker[] = [];

  addMarker(markers, "source", originCity, origin, "source");
  addMarker(markers, "pickup", `${originCity} pickup`, pickup, "stop");
  addMarker(markers, "drop", `${destinationCity} drop`, drop, "stop");
  addMarker(markers, "destination", destinationCity, drop, "destination");

  return {
    mode: "bus",
    segments,
    markers,
    stats: {
      distanceKilometers: null,
      durationMinutes: null,
    },
    region: computeRegion(markers),
    warnings,
    label: `Bus • ${trim(originCity) || "Pickup"} → ${trim(destinationCity) || "Drop"}`,
  };
}

async function buildTrainRoute(
  input: TransportRouteInputs
): Promise<TransportRouteData> {
  const { transport, originCity, destinationCity, currentLocation, signal } =
    input;
  const warnings: string[] = [];

  const trainNumber = trim(transport.transport_number);
  const departureDate = trim(transport.departure_date);

  let stations: LiveTrainStationPoint[] = [];

  if (/^\d{5}$/.test(trainNumber) && departureDate) {
    try {
      const info = await fetchLiveTrainStatus(transport, { signal });
      stations = info.stations ?? [];
    } catch {
      stations = [];
    }
  }

  const origin = isFinitePoint(currentLocation)
    ? currentLocation
    : await resolvePoint(originCity, signal);
  const destination = await resolvePoint(destinationCity, signal);

  if (!isFinitePoint(origin) || !isFinitePoint(destination)) {
    throw new Error("Could not resolve the train route endpoints.");
  }

  const segments: RouteSegment[] = [];
  const markers: JourneyMarker[] = [];

  addMarker(markers, "source", originCity, origin, "source");
  addMarker(markers, "destination", destinationCity, destination, "destination");

  let stats: RouteStats | null = null;

  if (stations.length >= 2) {
    const fromCity = transport.departure_city || originCity;
    const toCity = transport.arrival_city || destinationCity;
    const fromName = norm(fromCity);
    const toName = norm(toCity);

    let fromIdx = fromName
      ? stations.findIndex((point) => stationMatches(point.station, fromName))
      : -1;

    if (fromIdx < 0) fromIdx = 0;

    let toIdx = -1;

    if (toName) {
      for (let i = stations.length - 1; i >= fromIdx; i -= 1) {
        if (stationMatches(stations[i].station, toName)) {
          toIdx = i;
          break;
        }
      }
    }

    if (toIdx < fromIdx) toIdx = stations.length - 1;

    const slice = stations.slice(fromIdx, toIdx + 1);

    const geocoded: StationPoint[] = [];

    for (const point of slice) {
      const resolved = await resolveStationCoordinates(
        point.station,
        point.code,
        signal
      );

      if (resolved) {
        geocoded.push({ point, resolved });
      }
    }

    if (geocoded.length >= 2) {
      const ride = buildSegment({
        id: "train",
        kind: "ride",
        mode: "train",
        coordinates: geocoded.map((entry) => entry.resolved),
        color: ROUTE_SEGMENT_COLORS.train,
        label: trainNumber ? `Train ${trainNumber}` : "Train",
        distanceKilometers: null,
        durationMinutes: null,
      });

      if (ride) segments.push(ride);

      const pickup = geocoded[0].resolved;
      const drop = geocoded[geocoded.length - 1].resolved;

      for (let i = 0; i < geocoded.length; i += 1) {
        const entry = geocoded[i];

        const kind: JourneyMarker["kind"] =
          entry.point.state === "current"
            ? "current"
            : entry.point.state === "next"
              ? "next"
              : i === 0
                ? "stop"
                : i === geocoded.length - 1
                  ? "stop"
                  : "stop";

        addMarker(
          markers,
          `train-stop-${i}`,
          entry.point.station ?? `Station ${i + 1}`,
          entry.resolved,
          kind
        );
      }

      const firstKm = geocoded[0].point.distanceKm;
      const lastKm = geocoded[geocoded.length - 1].point.distanceKm;

      if (
        Number.isFinite(firstKm) &&
        Number.isFinite(lastKm) &&
        lastKm != null &&
        firstKm != null
      ) {
        const distanceKilometers = Math.max(0, lastKm - firstKm);

        if (ride) {
          ride.distanceKilometers = distanceKilometers;
        }

        stats = { distanceKilometers, durationMinutes: null };
      }

      const toStation = await transferBetween(
        origin,
        pickup,
        "train-transfer-in",
        "To the station",
        signal
      );

      if (toStation) segments.unshift(toStation);

      const fromStation = await transferBetween(
        drop,
        destination,
        "train-transfer-out",
        "From the station",
        signal
      );

      if (fromStation) segments.push(fromStation);
    } else {
      warnings.push("Live train status unavailable. Showing scheduled route.");

      const ride = buildSegment({
        id: "train",
        kind: "ride",
        mode: "train",
        coordinates: [origin, destination],
        color: ROUTE_SEGMENT_COLORS.train,
        label: trainNumber ? `Train ${trainNumber}` : "Train",
        distanceKilometers: null,
        durationMinutes: null,
      });

      if (ride) {
        segments.push(ride);
        addMarker(markers, "boarding", `${originCity} pickup`, origin, "stop");
        addMarker(markers, "alight", `${destinationCity} drop`, destination, "stop");
      }
    }
  } else {
    warnings.push("Live train status unavailable. Showing scheduled route.");

    const ride = buildSegment({
      id: "train",
      kind: "ride",
      mode: "train",
      coordinates: [origin, destination],
      color: ROUTE_SEGMENT_COLORS.train,
      label: trainNumber ? `Train ${trainNumber}` : "Train",
      distanceKilometers: null,
      durationMinutes: null,
    });

    if (ride) {
      segments.push(ride);
      addMarker(markers, "boarding", `${originCity} pickup`, origin, "stop");
      addMarker(markers, "alight", `${destinationCity} drop`, destination, "stop");
    }
  }

  return {
    mode: "train",
    segments,
    markers,
    stats,
    region: computeRegion(markers),
    warnings,
    label: `${trainNumber ? `Train ${trainNumber}` : "Train"} • ${trim(originCity) || "Start"} → ${trim(destinationCity) || "End"}`,
  };
}

async function buildFlightRoute(
  input: TransportRouteInputs
): Promise<TransportRouteData> {
  const { originCity, destinationCity, signal } = input;
  const warnings = [
    "Flight route is a preview using a direct city-to-city line.",
  ];

  const origin = await resolvePoint(originCity, signal);
  const destination = await resolvePoint(destinationCity, signal);

  if (!isFinitePoint(origin) || !isFinitePoint(destination)) {
    throw new Error("Could not resolve the flight route endpoints.");
  }

  const ride = buildSegment({
    id: "flight",
    kind: "ride",
    mode: "flight",
    coordinates: [origin, destination],
    color: ROUTE_SEGMENT_COLORS.flight,
    label: "Flight",
    distanceKilometers: null,
    durationMinutes: null,
  });

  const segments: RouteSegment[] = ride ? [ride] : [];
  const markers: JourneyMarker[] = [];

  addMarker(markers, "source", originCity, origin, "source");
  addMarker(markers, "destination", destinationCity, destination, "destination");

  return {
    mode: "flight",
    segments,
    markers,
    stats: null,
    region: computeRegion(markers),
    warnings,
    label: `Flight • ${trim(originCity) || "Start"} → ${trim(destinationCity) || "End"}`,
  };
}

export async function buildTransportRoute(
  input: TransportRouteInputs
): Promise<TransportRouteData> {
  const mode = normalizeMode(input.transport.mode);

  if (mode === null) {
    throw new Error("This transport cannot be drawn as a route.");
  }

  switch (mode) {
    case "train":
      return buildTrainRoute(input);
    case "bus":
      return buildBusRoute(input);
    case "car":
      return buildCarRoute(input);
    default:
      return buildFlightRoute(input);
  }
}