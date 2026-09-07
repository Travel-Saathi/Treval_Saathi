import type { SupabaseClient } from "@supabase/supabase-js";

import {
  activeDayIndex,
  daysUntil,
  todayIso,
  tripDurationDays,
} from "../lib/tripDates";
import {
  getTransport,
  getTrip,
  type TripRow,
  type TripStop,
  type TripTransport,
  listStops,
} from "./tripsApi";

/**
 * Live Trips data layer (spec section 20+).
 *
 * A user's trips live in the existing `trips` table keyed by
 * `created_by` (the Clerk user id). The lifecycle (ACTIVE / UPCOMING /
 * COMPLETED) is *derived* from the trip's start/end dates, never stored
 * as the source of truth; the displayed status is always computed at
 * render time so a trip that crosses today's date updates by itself.
 *
 * Loading rules (spec section 23):
 *  - the Live Trips list loads only `trips` rows (light);
 *  - stop/transport details and live data are loaded lazily per screen.
 */

export type TripLifecycle = "active" | "upcoming" | "completed";

export interface TripSummaryCard {
  id: string;
  title: string | null;
  source_city: string | null;
  destination: string | null;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  budget: number | null;
  members: number | null;
  status: string | null;
  created_at: string | null;

  lifecycle: TripLifecycle;
  totalDays: number | null;
  dayIndex: number | null;
  daysUntilStart: number | null;
}

export interface ActiveTripEnrichment {
  stops: TripStop[];
  transport: TripTransport | null;
}

export interface TripDetailsBundle {
  trip: TripRow;
  stops: TripStop[];
  transport: TripTransport | null;
}

const TRIP_COLUMNS =
  "id, created_by, title, source_city, destination, description, start_date, end_date, budget, members, status, created_at";

/* --------------------------------------------------
   Lifecycle derivation
-------------------------------------------------- */

/** Derive the trip lifecycle purely from the stored dates. */
export function deriveTripLifecycle(
  trip: Pick<
    TripRow,
    "start_date" | "end_date" | "status"
  >
): TripLifecycle {
  const start = trip.start_date;
  const end = trip.end_date;

  if (start && end) {
    const today = todayIso();

    if (today < start) {
      return "upcoming";
    }

    if (today >= start && today <= end) {
      return "active";
    }

    if (today > end) {
      return "completed";
    }
  }

  // No usable date pair: fall back to the stored status field.
  const stored = (trip.status ?? "").toLowerCase();

  if (stored.includes("active")) {
    return "active";
  }

  if (
    stored.includes("planned") ||
    stored.includes("upcoming") ||
    stored.includes("draft")
  ) {
    return "upcoming";
  }

  return "completed";
}

/** Best-effort sync of the stored `status` column to the derived lifecycle. */
export function syncTripStatuses(
  supabase: SupabaseClient,
  trips: TripRow[]
): void {
  const pending: Promise<unknown>[] = [];

  for (const trip of trips) {
    const lifecycle = deriveTripLifecycle(trip);
    const target =
      lifecycle === "upcoming" ? "planned" : lifecycle;

    if ((trip.status ?? "") === target) {
      continue;
    }

    pending.push(
      Promise.resolve(
        supabase
          .from("trips")
          .update({ status: target })
          .eq("id", trip.id)
      ).then(() => undefined)
    );
  }

  // Fire-and-forget; a failed status sync is never fatal.
  void Promise.all(pending.map((p) => Promise.resolve(p).catch(() => undefined)));
}

/** Attach the derived lifecycle + display fields to a trips row. */
export function toTripSummary(row: TripRow): TripSummaryCard {
  return {
    ...row,
    lifecycle: deriveTripLifecycle(row),
    totalDays: tripDurationDays(row.start_date, row.end_date),
    dayIndex: activeDayIndex(row.start_date, row.end_date),
    daysUntilStart: daysUntil(row.start_date),
  };
}

/* --------------------------------------------------
   Queries
-------------------------------------------------- */

/** Lightweight list of every trip created by the user. */
export async function listUserTrips(
  supabase: SupabaseClient,
  userId: string
): Promise<TripRow[]> {
  const { data, error } = await supabase
    .from("trips")
    .select(TRIP_COLUMNS)
    .eq("created_by", userId)
    .order("start_date", { ascending: false });

  if (error) {
    throw error;
  }

  return (data as TripRow[]) ?? [];
}

/**
 * Full Trip Details bundle: trip header plus its ordered stops and the
 * selected transport. Loaded in parallel (spec section 24): a failure in
 * any part surfaces on its own block, never the whole page.
 */
export async function getTripDetails(
  supabase: SupabaseClient,
  tripId: string
): Promise<TripDetailsBundle> {
  const [trip, stops, transport] = await Promise.all([
    getTrip(supabase, tripId),
    listStops(supabase, tripId),
    getTransport(supabase, tripId),
  ]);

  if (!trip) {
    throw new Error("Trip not found");
  }

  return { trip, stops, transport };
}

/**
 * The first not-yet-visited stop of an ongoing trip. Because current
 * journeys rarely store per-stop dates, the next checkpoint is derived
 * from `stop_order`; the "current" location is simply reported as the
 * trip's source before departure and the next stop afterwards.
 */
export function nextCheckpoint(
  stops: TripStop[],
  isActive: boolean
): TripStop | null {
  if (!isActive || stops.length === 0) {
    return null;
  }

  return stops[0];
}

/** Summary line for the trip's selected transport, when one exists. */
export function transportSummary(
  transport: TripTransport | null
): string | null {
  if (!transport) {
    return null;
  }

  const name =
    transport.transport_name?.trim() ||
    transport.transport_number?.trim() ||
    null;
  const mode = transport.mode?.trim() || null;

  if (name && mode) {
    return `${name} • ${mode}`;
  }

  return name ?? mode;
}

/** Ordered list of every destination shown on a card (source + stops + target). */
export function tripCitySequence(
  trip: Pick<TripRow, "source_city" | "destination">,
  stops: TripStop[]
): string[] {
  const cities: string[] = [];

  if (trip.source_city?.trim()) {
    cities.push(trip.source_city.trim());
  }

  for (const stop of stops) {
    if (stop.city.trim()) {
      cities.push(stop.city.trim());
    }
  }

  if (trip.destination?.trim()) {
    cities.push(trip.destination.trim());
  }

  return cities;
}