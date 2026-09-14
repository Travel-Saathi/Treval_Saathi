import type { SupabaseClient } from "@supabase/supabase-js";

import { tripCitySequence } from "./liveTripsApi";
import type { LiveTrainStatusInfo } from "./liveTrainStatusApi";
import type { TripRow, TripStop, TripTransport } from "./tripsApi";
import {
  hasLiveStatusColumns,
  isMissingColumnError,
  markLiveStatusColumnsMissing,
} from "./tripsApi";

/**
 * Trip Progress data layer.
 *
 * A journey is split into ordered *segments* (consecutive city pairs of the
 * trip route). Each segment maps to one `trip_transport` row when a transport
 * was saved for that leg. Per-leg progress lives in the new live-status
 * columns of `trip_transport` (database/migrations/001_*):
 *
 *   UPCOMING -> BOARDING -> IN_PROGRESS -> ARRIVED -> COMPLETED
 *
 * The `segment_status` column is the persisted state machine; the live
 * running-status columns are the latest snapshot of the running train. Every
 * write is non-fatal and data-safe: null/undefined values are never written,
 * so a refresh can never wipe previously successful live values.
 */

/* --------------------------------------------------
   State machine
------------------------------------------------- */

export type SegmentStatus =
  | "UPCOMING"
  | "BOARDING"
  | "IN_PROGRESS"
  | "ARRIVED"
  | "COMPLETED";

export const SEGMENT_STATUS_ORDER: SegmentStatus[] = [
  "UPCOMING",
  "BOARDING",
  "IN_PROGRESS",
  "ARRIVED",
  "COMPLETED",
];

export function normalizeSegmentStatus(
  value: string | null | undefined
): SegmentStatus {
  const candidate = String(value ?? "").trim().toUpperCase();
  return SEGMENT_STATUS_ORDER.includes(candidate as SegmentStatus)
    ? (candidate as SegmentStatus)
    : "UPCOMING";
}

export const SEGMENT_STATUS_LABELS: Record<SegmentStatus, string> = {
  UPCOMING: "Upcoming",
  BOARDING: "Boarding",
  IN_PROGRESS: "In Progress",
  ARRIVED: "Arrived",
  COMPLETED: "Completed",
};

/** Emoji-driven journey-heading per transport mode (never hard-coded to TRAIN). */
export const MODE_JOURNEY_HEADERS: Record<string, string> = {
  train: "🚆 TRAIN JOURNEY",
  bus: "🚌 BUS JOURNEY",
  flight: "✈️ FLIGHT JOURNEY",
  cab: "🚕 CAB JOURNEY",
};

export function modeJourneyHeader(
  mode: string | null | undefined
): string {
  const key = String(mode ?? "").trim().toLowerCase();
  return MODE_JOURNEY_HEADERS[key] ?? "🚩 JOURNEY LEG";
}

export interface PlannedSegment {
  origin: string;
  destination: string;
  index: number;
  total: number;
  transport: TripTransport | null;
  /** Lowercase display mode ("train" | "bus" | ...) or null when unknown. */
  mode: string | null;
  status: SegmentStatus;
  isActive: boolean;
}

const normName = (value: string | null | undefined) =>
  String(value ?? "").trim().toLowerCase();

/* --------------------------------------------------
   Planning
------------------------------------------------- */

/**
 * Split a trip into planned segments and attach each leg's saved transport.
 *
 * A segment's status comes from its `trip_transport.segment_status` when one
 * exists (persisted by Live Journey), otherwise it defaults to UPCOMING.
 * Exactly one segment is flagged `isActive`: the first whose persisted status
 * is BOARDING/IN_PROGRESS, else the first UPCOMING. When every leg is
 * completed, no segment is active.
 */
export function buildPlannedSegments(
  trip: Pick<TripRow, "source_city" | "destination">,
  stops: TripStop[],
  transports: TripTransport[],
  overrideActiveIndex: number | null = null
): PlannedSegment[] {
  const cities = tripCitySequence(trip, stops);

  if (cities.length < 2) {
    return [];
  }

  const segments: PlannedSegment[] = [];

  for (let i = 0; i + 1 < cities.length; i += 1) {
    const from = cities[i];
    const to = cities[i + 1];

    const matched = transports.filter(
      (row) =>
        normName(row.departure_city) === normName(from) &&
        normName(row.arrival_city) === normName(to)
    );

    const transport = matched.length > 0 ? matched[matched.length - 1] : null;

    const fallback =
      !transport && transports.length === 1 && i === 0
        ? transports[0]
        : null;

    segments.push({
      origin: from,
      destination: to,
      index: i,
      total: cities.length - 1,
      transport: transport ?? fallback,
      mode: (transport ?? fallback)?.mode ?? null,
      status: normalizeSegmentStatus(
        (transport ?? fallback)?.segment_status
      ),
      isActive: false,
    });
  }

  let activeIndex = overrideActiveIndex ?? activeSegmentIndex(segments);
  if (overrideActiveIndex !== null && overrideActiveIndex >= 0) {
    activeIndex = Math.min(overrideActiveIndex, segments.length - 1);
  }

  if (activeIndex >= 0) {
    segments[activeIndex] = { ...segments[activeIndex], isActive: true };
  }

  return segments;
}

/**
 * Determine the active segment index: first boarded/in-progress leg wins,
 * otherwise the first upcoming leg. -1 when every leg is completed.
 */
export function activeSegmentIndex(segments: PlannedSegment[]): number {
  for (const segment of segments) {
    if (
      segment.status === "BOARDING" ||
      segment.status === "IN_PROGRESS"
    ) {
      return segment.index;
    }
  }

  for (const segment of segments) {
    if (segment.status === "UPCOMING") {
      return segment.index;
    }
  }

  return -1;
}

/* --------------------------------------------------
   Countdown helpers
------------------------------------------------- */

export interface ParsedClock {
  hours: number;
  minutes: number;
  raw: string;
  /** Null when the clock was already 24-hour ("19:10"). */
  period: "AM" | "PM" | null;
}

/**
 * Parse a departure clock into 24-hour hours/minutes. Accepts both the
 * saved 24-hour form ("19:10") and the display 12-hour form ("07:10 PM").
 * Returns null when the value is not a usable clock.
 */
export function parseClock(
  clock: string | null | undefined
): ParsedClock | null {
  const raw = String(clock ?? "").trim();

  if (!raw) {
    return null;
  }

  const ampm = raw.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);

  if (ampm) {
    let hours = Number(ampm[1]);
    const minutes = Number(ampm[2]);
    const period = ampm[3].toUpperCase() as "AM" | "PM";

    if (minutes > 59) {
      return null;
    }

    if (hours < 1 || hours > 12) {
      return null;
    }

    hours = period === "PM" && hours !== 12 ? hours + 12 : hours;
    hours = period === "AM" && hours === 12 ? 0 : hours;

    return { hours, minutes, raw, period };
  }

  const clock24 = raw.match(/^(\d{1,2}):(\d{2})$/);

  if (clock24) {
    const hours = Number(clock24[1]);
    const minutes = Number(clock24[2]);

    if (hours > 23 || minutes > 59) {
      return null;
    }

    return { hours, minutes, raw, period: null };
  }

  return null;
}

/**
 * Absolute departure instant for a transport leg, from its stored ISO
 * departure date + departure time. Returns null when either is missing or
 * unparseable (never guesses).
 */
export function dateTimeFromTransport(
  transport: Pick<
    TripTransport,
    "departure_date" | "departure_time"
  >
): Date | null {
  const dateParts = String(transport.departure_date ?? "")
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})$/);

  const clock = parseClock(transport.departure_time);

  if (!dateParts || !clock) {
    return null;
  }

  const year = Number(dateParts[1]);
  const month = Number(dateParts[2]);
  const day = Number(dateParts[3]);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return null;
  }

  const date = new Date(year, month - 1, day, clock.hours, clock.minutes, 0);

  return Number.isNaN(date.getTime()) ? null : date;
}

/** Milliseconds until the given departure instant (negative when past). */
export function msUntilDeparture(departure: Date | null): number | null {
  if (!departure) {
    return null;
  }

  return departure.getTime() - Date.now();
}

/** Human countdown label for "ms until departure". */
export function countdownLabel(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) {
    return "—";
  }

  if (ms < 0) {
    return "Departed";
  }

  const totalMinutes = Math.floor(ms / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  }

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  return `${minutes}m`;
}

/* --------------------------------------------------
   Persistence (data-safe, non-fatal)
------------------------------------------------- */

const liveColumnEntries = (
  info: LiveTrainStatusInfo
): [string, string | null][] => [
  ["current_station", info.currentStation],
  ["current_station_code", info.currentStationCode],
  ["next_station", info.nextStation],
  ["next_station_code", info.nextStationCode],
  ["expected_departure_time", info.expectedDepartureTime],
  ["expected_arrival_time", info.expectedArrivalTime],
  ["actual_departure_time", info.actualDepartureTime],
  ["actual_arrival_time", info.actualArrivalTime],
  ["delay", info.delay],
  ["status", info.statusLabel],
];

/**
 * Persist the latest live snapshot onto the leg's trip_transport row.
 *
 * Only columns with a non-null value are written (data safety) and failures
 * are logged, never thrown — a Supabase hiccup must not break the live UI.
 * Returns true when something was written.
 */
export async function persistTransportLiveUpdate(
  supabase: SupabaseClient,
  transportId: string,
  info: LiveTrainStatusInfo
): Promise<boolean> {
  const updates: Record<string, string | null> = {};

  for (const [column, value] of liveColumnEntries(info)) {
    if (value !== null && value !== undefined && String(value).trim() !== "") {
      updates[column] = String(value).trim();
    }
  }

  if (Object.keys(updates).length === 0) {
    return false;
  }

  updates.last_status_update = new Date().toISOString();

  /*
   * The live-status columns are missing on this database (probe learned it
   * earlier in the session), so the UPDATE can never succeed — skip it to
   * avoid a needless 400 in the network log.
   */
  if (hasLiveStatusColumns() === false) {
    return false;
  }

  const { error } = await supabase
    .from("trip_transport")
    .update(updates)
    .eq("id", transportId);

  if (error) {
    if (isMissingColumnError(error)) {
      markLiveStatusColumnsMissing();
    }
    console.error(
      `[TripProgress] Failed to persist live status: ${error.message}`
    );
    return false;
  }

  return true;
}

/**
 * Advance the persisted `segment_status` of one leg. This is the only place
 * the state machine is written; failures are logged and swallowed.
 */
export async function persistSegmentStatus(
  supabase: SupabaseClient,
  transportId: string,
  status: SegmentStatus
): Promise<boolean> {
  if (hasLiveStatusColumns() === false) {
    return false;
  }

  const { error } = await supabase
    .from("trip_transport")
    .update({
      segment_status: status,
      last_status_update: new Date().toISOString(),
    })
    .eq("id", transportId);

  if (error) {
    if (isMissingColumnError(error)) {
      markLiveStatusColumnsMissing();
    }
    console.error(
      `[TripProgress] Failed to persist segment status: ${error.message}`
    );
    return false;
  }

  return true;
}

/**
 * "START NEXT TRAVEL" transition: the current leg becomes COMPLETED and the
 * following leg becomes IN_PROGRESS (when it has a saved transport).
 * Callers then reload the transport rows so the new statuses take over.
 */
export async function advanceForNextTravel(
  supabase: SupabaseClient,
  segments: PlannedSegment[],
  activeIndex: number
): Promise<void> {
  const current = segments[activeIndex];
  const next = segments[activeIndex + 1] ?? null;

  const writes: Promise<boolean>[] = [];

  if (current?.transport) {
    writes.push(persistSegmentStatus(supabase, current.transport.id, "COMPLETED"));
  }

  if (next?.transport) {
    writes.push(persistSegmentStatus(supabase, next.transport.id, "IN_PROGRESS"));
  }

  await Promise.all(writes);
}