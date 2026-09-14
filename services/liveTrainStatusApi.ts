import { API_BASE_URL } from "./locationApi";
import type { TripTransport } from "./tripsApi";

/**
 * LIVE RUNNING STATUS data layer (Train only).
 *
 * This module is the single source of truth for the "live" train running
 * status shown in the Trip Progress screen. Two producers feed the same
 * `LiveTrainStatusInfo` shape:
 *
 *  - `fetchLiveTrainStatus(...)`  real data from the backend
 *                                  (/api/railway/live, mNTES-backed).
 *  - `buildLiveTrainStatus(...)`  schedule-derived fallback used while a
 *                                  live fetch has not succeeded yet.
 *
 * Values that the live feed cannot provide are `null` — never invented.
 * Arrival at the segment destination is only reported when the railway
 * status actually indicates it (current station equals the destination),
 * not from the device clock.
 */

export type StationPointState =
  | "origin"
  | "intermediate"
  | "current"
  | "next"
  | "destination";

/** Which live/schedule value produced a displayed time. */
export type TimeKind = "actual" | "expected" | "scheduled" | "none";

export interface LiveTrainStationPoint {
  /** Station name (from mNTES) or null when unknown. */
  station: string | null;
  /** Station code (e.g. "STA") or null when unknown. */
  code: string | null;
  distanceKm: number | null;
  /** 12-hour display strings — "6:10 PM". */
  scheduledArrival: string | null;
  actualArrival: string | null;
  scheduledDeparture: string | null;
  actualDeparture: string | null;
  /** e.g. "5 min", null when on time / unknown. */
  delay: string | null;
  onTime: boolean | null;
  state: StationPointState;
  /** Row role label: "Origin" | "Stop" | "Current Station" | "Next Station" | "Destination". */
  role: string;
  /** Minutes since 00:00 of the journey day (midnight-safe), null when unknown. */
  scheduledArrivalMinutes: number | null;
  actualArrivalMinutes: number | null;
  scheduledDepartureMinutes: number | null;
  actualDepartureMinutes: number | null;
  /** Real API-derived expected times (scheduled + the API's delay), 12h text. */
  expectedArrival: string | null;
  expectedDeparture: string | null;
  /** Signed minutes late (+)/early (−); null when the API cannot tell. */
  delayMinutes: number | null;
  /** "On Time" | "41 min late" | "2 min early"; null when unknown. */
  delayText: string | null;
  /** "Departed" | "At Station" | "Arrived" | "Upcoming" | "Not Started". */
  stopStatus: string | null;
  /** Resolved time to display for this row + which value produced it. */
  arrivalTime: string | null;
  arrivalKind: TimeKind;
  departureTime: string | null;
  departureKind: TimeKind;
}

export interface LiveTrainStatusInfo {
  /** `"live"` = real mNTES data; `"schedule"` = derived from saved data. */
  source: "schedule" | "live";

  trainName: string | null;
  trainNumber: string | null;

  startingStation: string | null;
  startingTime: string | null;

  currentStation: string | null;
  currentStationCode: string | null;
  statusLabel: string | null;
  onTime: boolean | null;
  /** Readable clock of the last successful live fetch ("6:10 PM"). */
  lastUpdatedAt: string | null;

  nextStation: string | null;
  nextStationCode: string | null;
  nextStationExpectedTime: string | null;

  expectedArrivalStation: string | null;
  expectedArrivalTime: string | null;
  expectedDepartureTime: string | null;
  actualArrivalTime: string | null;
  actualDepartureTime: string | null;
  delay: string | null;

  /** True when the railway status says the train reached the destination. */
  arrived: boolean;
  /** True when the last live fetch failed and the fallback is shown. */
  liveUnavailable: boolean;

  /** ISO timestamp of the latest successful live fetch. */
  fetchedAt: string | null;

  stations: LiveTrainStationPoint[];
  routeText: string | null;
}

interface RawStation {
  station: string | null;
  stationCode: string | null;
  distanceKm: number | null;
  scheduledArrival: string | null;
  actualArrival: string | null;
  scheduledDeparture: string | null;
  actualDeparture: string | null;
  delay: number | null;
  onTime: boolean | null;
}

interface LiveRailwayPayload {
  success: boolean;
  source?: string;
  train?: { number?: string | number; name?: string | null } | null;
  journeyDate?: string;
  currentStation?: {
    name?: string | null;
    code?: string | null;
    distanceKm?: number | null;
    updatedOn?: string | null;
    event?: string | null;
    nextStation?: { name?: string | null; code?: string | null } | null;
  } | null;
  status?: string | null;
  stations?: RawStation[];
  fetchedAt?: string | null;
}

/* --------------------------------------------------
   Small helpers
------------------------------------------------- */

const trim = (value: string | null | undefined) =>
  String(value ?? "").trim();

const norm = (value: string | null | undefined) => trim(value).toLowerCase();

/** Compare two station descriptors by code or by name. */
export function sameStation(
  a: { name?: string | null; code?: string | null; station?: string | null; stationCode?: string | null },
  b: { name?: string | null; code?: string | null; station?: string | null; stationCode?: string | null }
): boolean {
  const aName = norm(a.name ?? a.station);
  const bName = norm(b.name ?? b.station);
  const aCode = norm(a.code ?? a.stationCode);
  const bCode = norm(b.code ?? b.stationCode);

  if (aCode && bCode && aCode === bCode) return true;
  if (aName && bName && aName === bName) return true;
  return false;
}

export function formatTime12h(value: string | null | undefined): string | null {
  const raw = trim(value);

  if (!raw) {
    return null;
  }

  const ampm = raw.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);

  if (ampm) {
    return `${ampm[1]}:${ampm[2]} ${ampm[3].toUpperCase()}`;
  }

  const clock = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);

  if (!clock) {
    return raw;
  }

  const hours = Number(clock[1]);

  if (hours > 23) {
    return raw;
  }

  const period = hours >= 12 ? "PM" : "AM";
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;

  return `${hour12}:${clock[2]} ${period}`;
}

/** "2026-09-14T18:30:00.000Z" -> "6:30 PM" (device local time). */
export function formatClock(
  iso: string | null | undefined
): string | null {
  if (!iso) {
    return null;
  }

  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const period = hours >= 12 ? "PM" : "AM";
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;

  return `${hour12}:${minutes} ${period}`;
}

/** Minutes -> readable delay; null when on time / unknown. */
export function formatDelay(
  minutes: number | null | undefined
): string | null {
  if (minutes == null || !Number.isFinite(minutes)) {
    return null;
  }

  if (minutes <= 0) {
    return null;
  }

  return `${minutes} min`;
}

const MONTH_INDEX: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

/** "HH:MM" clock minutes within a day, parsed from any mNTES cell text. */
export function clockMinutes(
  raw: string | null | undefined
): number | null {
  const match = trim(raw).match(/(\d{1,2}):(\d{2})/);

  if (!match) {
    return null;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (hours > 23 || minutes > 59) {
    return null;
  }

  return hours * 60 + minutes;
}

/**
 * Day-of-month carried by an mNTES label ("21-Sep", "15-Sep*") collapsed into
 * a month-aware serial day so 30-Aug → 01-Sep still compares correctly.
 */
function serialDay(raw: string | null | undefined): number | null {
  const match = trim(raw).match(/(\d{1,2})[- ]([A-Za-z]{3,4})/);

  if (!match) {
    return null;
  }

  const monthIndex = MONTH_INDEX[trim(match[2]).slice(0, 3).toLowerCase()];

  if (monthIndex == null) {
    return null;
  }

  const day = Number(match[1]);

  if (!Number.isInteger(day) || day < 1 || day > 31) {
    return null;
  }

  return monthIndex * 31 + day;
}

/**
 * Convert an mNTES time cell ("14:08 14-Sep", "00:33 15-Sep", "19:10") into
 * minutes measured from 00:00 of the journey day. The carried date shifts the
 * value across midnight, so a 23:55 → 00:10 comparison never yields −1425.
 */
export function clockToJourneyMinutes(
  raw: string | null | undefined,
  refDay: number | null | undefined
): number | null {
  const clock = clockMinutes(raw);

  if (clock == null) {
    return null;
  }

  const day = serialDay(raw);

  if (day != null && refDay != null) {
    return clock + (day - refDay) * 1440;
  }

  return clock;
}

/** Wrap a minute difference into the nearest plausible (±12 h) delay. */
export function wrapMinutesDiff(diff: number): number {
  if (diff > 720) {
    return diff - 1440;
  }

  if (diff < -720) {
    return diff + 1440;
  }

  return diff;
}

/** Signed delay → "On Time" | "6 min late" | "2 min early"; null when unknown. */
export function formatDelaySigned(
  minutes: number | null | undefined
): string | null {
  if (minutes == null || !Number.isFinite(minutes)) {
    return null;
  }

  const absolute = Math.abs(minutes);

  if (absolute <= 5) {
    return "On Time";
  }

  if (minutes > 0) {
    return `${minutes} min late`;
  }

  return `${absolute} min early`;
}

/** Journey minutes since the ref day → 12-hour clock text. */
export function minutesToClock12(
  minutes: number | null | undefined
): string | null {
  if (minutes == null || !Number.isFinite(minutes)) {
    return null;
  }

  const wrapped = ((Math.round(minutes) % 1440) + 1440) % 1440;
  const hours = Math.floor(wrapped / 60);
  const mins = wrapped % 60;

  return formatTime12h(
    `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`
  );
}

/**
 * mNTES sometimes returns no `currentStation` while the human status text
 * still carries it ("Departed from CHALISGAON JN(CSN) at …" / "Arrived at
 * SATNA(STA) at …"). Extract it so the timeline can highlight the stop —
 * still real backend data, never invented.
 */
function statusCurrentStation(
  status: string | null | undefined
): { name: string; code: string } | null {
  const match = trim(status).match(
    /(?:\bdeparted\s+from\b|\barrived\s+at\b)\s+([^(]+?)\s*\(([A-Za-z0-9]+)\)/i
  );

  if (!match) {
    return null;
  }

  const name = trim(match[1]);

  return name ? { name, code: match[2].toUpperCase() } : null;
}

/** "YYYY-MM-DD" -> "DD-MM-YYYY" (the format /api/railway/live expects). */
function isoDateToDmy(iso: string | null | undefined): string | null {
  const match = trim(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);

  if (!match) {
    return null;
  }

  return `${match[3]}-${match[2]}-${match[1]}`;
}

/* --------------------------------------------------
   Timeline building
------------------------------------------------- */

const ROLE_LABELS: Record<StationPointState, string> = {
  origin: "Origin",
  intermediate: "Stop",
  current: "Current Station",
  next: "Next Station",
  destination: "Destination",
};

const POINT_TEMPLATE: LiveTrainStationPoint = {
  station: null,
  code: null,
  distanceKm: null,
  scheduledArrival: null,
  actualArrival: null,
  scheduledDeparture: null,
  actualDeparture: null,
  delay: null,
  onTime: null,
  state: "intermediate",
  role: "Stop",
  scheduledArrivalMinutes: null,
  actualArrivalMinutes: null,
  scheduledDepartureMinutes: null,
  actualDepartureMinutes: null,
  expectedArrival: null,
  expectedDeparture: null,
  delayMinutes: null,
  delayText: null,
  stopStatus: null,
  arrivalTime: null,
  arrivalKind: "none",
  departureTime: null,
  departureKind: "none",
};

function toPoint(raw: RawStation, refDay: number | null): LiveTrainStationPoint {
  return {
    ...POINT_TEMPLATE,
    station: trim(raw.station) || null,
    code: trim(raw.stationCode) || null,
    distanceKm: raw.distanceKm ?? null,
    scheduledArrival: formatTime12h(raw.scheduledArrival),
    actualArrival: formatTime12h(raw.actualArrival),
    scheduledDeparture: formatTime12h(raw.scheduledDeparture),
    actualDeparture: formatTime12h(raw.actualDeparture),
    delay: formatDelay(raw.delay),
    delayMinutes: raw.delay ?? null,
    onTime: raw.onTime ?? null,
    scheduledArrivalMinutes: clockToJourneyMinutes(
      raw.scheduledArrival,
      refDay
    ),
    actualArrivalMinutes: clockToJourneyMinutes(raw.actualArrival, refDay),
    scheduledDepartureMinutes: clockToJourneyMinutes(
      raw.scheduledDeparture,
      refDay
    ),
    actualDepartureMinutes: clockToJourneyMinutes(
      raw.actualDeparture,
      refDay
    ),
  };
}

interface TimeCandidate {
  display: string | null;
  kind: TimeKind;
}

/** First usable value wins; everything missing keeps "none"/null (real data). */
function resolveTime(
  candidates: TimeCandidate[]
): { time: string | null; kind: TimeKind } {
  for (const candidate of candidates) {
    if (candidate.display) {
      return { time: candidate.display, kind: candidate.kind };
    }
  }

  return { time: null, kind: "none" };
}

interface EnrichmentTimeline {
  currentIndex: number;
  destinationIndex: number;
  arrived: boolean;
}

/**
 * Derive the display values (expected times, delay, per-station status, the
 * time to show and which kind produced it) for every timeline point.
 *
 * Display priority (real data only):
 *   past      arrival = actual → scheduled
 *   current   arrival = actual → expected → scheduled
 *   upcoming  arrival = expected → scheduled
 * same rules for departure. Delay = actual vs scheduled, else expected vs
 * scheduled, else the API badge — never the device clock.
 */
export function enrichPoints(
  points: LiveTrainStationPoint[],
  timeline: EnrichmentTimeline
): LiveTrainStationPoint[] {
  const { currentIndex, destinationIndex, arrived } = timeline;

  return points.map((point, index) => {
    const isOrigin = index === 0;
    const isDestination = index === destinationIndex;

    const position =
      arrived || (currentIndex >= 0 && index < currentIndex)
        ? "past"
        : index === currentIndex
          ? "current"
          : currentIndex < 0
            ? "not-started"
            : "upcoming";

    const scheduledArrivalMinutes = point.scheduledArrivalMinutes;
    const scheduledDepartureMinutes = point.scheduledDepartureMinutes;
    const actualArrivalMinutes = point.actualArrivalMinutes;
    const actualDepartureMinutes = point.actualDepartureMinutes;

    let delayMinutes = point.delayMinutes;

    if (delayMinutes == null) {
      if (
        actualArrivalMinutes != null &&
        scheduledArrivalMinutes != null
      ) {
        delayMinutes = wrapMinutesDiff(
          actualArrivalMinutes - scheduledArrivalMinutes
        );
      } else if (
        actualDepartureMinutes != null &&
        scheduledDepartureMinutes != null
      ) {
        delayMinutes = wrapMinutesDiff(
          actualDepartureMinutes - scheduledDepartureMinutes
        );
      }
    }

    // A 0/on-time "expected" is just the scheduled time restated — keep the
    // real scheduled text (with its date) instead of a bare clock.
    const hasRealDelay = delayMinutes != null && delayMinutes !== 0;

    const expectedArrival =
      scheduledArrivalMinutes != null &&
      hasRealDelay &&
      delayMinutes != null
        ? minutesToClock12(scheduledArrivalMinutes + delayMinutes)
        : null;

    const expectedDeparture =
      scheduledDepartureMinutes != null &&
      hasRealDelay &&
      delayMinutes != null
        ? minutesToClock12(scheduledDepartureMinutes + delayMinutes)
        : null;

    const expectedArrivalCandidate: TimeCandidate = {
      display: expectedArrival,
      kind: "expected",
    };

    const expectedDepartureCandidate: TimeCandidate = {
      display: expectedDeparture,
      kind: "expected",
    };

    const arrival =
      isOrigin
        ? { time: null, kind: "none" as TimeKind }
        : position === "past"
          ? resolveTime([
              { display: point.actualArrival, kind: "actual" },
              { display: point.scheduledArrival, kind: "scheduled" },
            ])
          : position === "current"
            ? resolveTime([
                { display: point.actualArrival, kind: "actual" },
                expectedArrivalCandidate,
                { display: point.scheduledArrival, kind: "scheduled" },
              ])
            : resolveTime([
                expectedArrivalCandidate,
                { display: point.scheduledArrival, kind: "scheduled" },
              ]);

    const departure =
      isDestination
        ? { time: null, kind: "none" as TimeKind }
        : position === "past" || position === "current"
          ? resolveTime([
              { display: point.actualDeparture, kind: "actual" },
              position === "current"
                ? expectedDepartureCandidate
                : { display: null, kind: "none" as TimeKind },
              { display: point.scheduledDeparture, kind: "scheduled" },
            ])
          : resolveTime([
              expectedDepartureCandidate,
              { display: point.scheduledDeparture, kind: "scheduled" },
            ]);

    let stopStatus: string | null;

    if (arrived && isDestination) {
      stopStatus = "Arrived";
    } else if (position === "past") {
      stopStatus = "Departed";
    } else if (position === "current") {
      stopStatus = "At Station";
    } else if (position === "not-started" && isOrigin) {
      stopStatus = "Not Started";
    } else {
      stopStatus = "Upcoming";
    }

    const delayText =
      formatDelaySigned(delayMinutes) ??
      (point.onTime === true ? "On Time" : null);

    return {
      ...point,
      role: ROLE_LABELS[point.state] ?? "Stop",
      expectedArrival,
      expectedDeparture,
      delayMinutes,
      delayText,
      stopStatus,
      arrivalTime: arrival.time,
      arrivalKind: arrival.kind,
      departureTime: departure.time,
      departureKind: departure.kind,
    };
  });
}

/** True when the railway data says the train has reached `destinationName`. */
function arrivalDetected(
  payload: LiveRailwayPayload,
  currentPoint: { name: string | null; code: string | null } | null,
  segmentDestination: string | null | undefined
): boolean {
  const cur = payload.currentStation;

  if (!cur) {
    return false;
  }

  const finale = payload.stations?.length
    ? payload.stations[payload.stations.length - 1]
    : null;

  if (
    finale &&
    sameStation(cur, {
      station: finale.station,
      code: finale.stationCode,
    })
  ) {
    return true;
  }

  if (segmentDestination && trim(segmentDestination)) {
    if (norm(cur.name) === norm(segmentDestination)) {
      return true;
    }
  }

  const statusText = norm(payload.status);
  return /arriv(?:ed|al)[\s\S]*destination|destination[\s\S]*arriv(?:ed|al)/.test(
    statusText
  );
}

interface Timeline {
  points: LiveTrainStationPoint[];
  currentIndex: number;
  nextIndex: number;
  destinationIndex: number;
  arrived: boolean;
}

function buildTimeline(
  payload: LiveRailwayPayload,
  segmentDestination: string | null | undefined
): Timeline {
  const rawStations = payload.stations ?? [];
  const cur = payload.currentStation;

  // Reference day-of-travel taken from the origin row, so overnight trains
  // keep monotonic time comparisons across midnight (23:55 → 00:10).
  let refDay: number | null = null;

  if (rawStations.length > 0) {
    const first = rawStations[0];
    refDay =
      serialDay(
        first.actualDeparture ??
          first.scheduledDeparture ??
          first.actualArrival ??
          first.scheduledArrival
      ) ?? null;
  }

  const points: LiveTrainStationPoint[] = rawStations.map((raw) =>
    toPoint(raw, refDay)
  );

  let currentIndex = -1;
  let arrived = false;

  if (!points.length) {
    if (cur) {
      points.push({
        ...POINT_TEMPLATE,
        station: trim(cur.name) || null,
        code: trim(cur.code) || null,
        distanceKm: cur.distanceKm ?? null,
      });
      currentIndex = 0;
    }
  } else if (cur) {
    const currentPoint = {
      name: trim(cur.name) || null,
      code: trim(cur.code) || null,
    };

    arrived = arrivalDetected(payload, currentPoint, segmentDestination);

    const found = points.findIndex((point) =>
      sameStation(currentPoint, point)
    );

    if (found >= 0) {
      currentIndex = found;
    } else {
      // Insert the live current station by distance ordering so the
      // timeline stays chronological without fabricating schedule fields.
      let insertAt = points.length;

      for (let i = 0; i < points.length; i += 1) {
        const pointDistance = points[i].distanceKm;
        const currentDistance = cur.distanceKm;

        if (
          pointDistance != null &&
          currentDistance != null &&
          pointDistance > currentDistance
        ) {
          insertAt = i;
          break;
        }
      }

      // Unknown current station (no distance): keep the real destination as
      // the last point instead of pasting the unknown stop over it.
      if (insertAt >= points.length && points.length > 1) {
        insertAt = points.length - 1;
      }

      points.splice(insertAt, 0, {
        ...POINT_TEMPLATE,
        station: currentPoint.name,
        code: currentPoint.code,
        distanceKm: cur.distanceKm ?? null,
      });
      currentIndex = insertAt;
    }
  }

  const destinationIndex = points.length - 1;

  if (points.length > 0) {
    points[0] = { ...points[0], state: "origin" };
  }

  if (destinationIndex > 0) {
    points[destinationIndex] = {
      ...points[destinationIndex],
      state: "destination",
    };
  }

  if (
    currentIndex >= 0 &&
    !arrived &&
    currentIndex !== 0 &&
    currentIndex !== destinationIndex
  ) {
    points[currentIndex] = { ...points[currentIndex], state: "current" };
  }

  // Next station: prefer the live "upcoming station", else the first stop
  // after the current one on the timeline.
  let nextIndex = -1;

  if (!arrived && cur?.nextStation) {
    const upcoming = cur.nextStation;
    const foundNext = points.findIndex(
      (point) =>
        sameStation(upcoming, point) &&
        point.state !== "current" &&
        point.state !== "origin"
    );

    if (foundNext >= 0) {
      nextIndex = foundNext;
    }
  }

  if (nextIndex < 0 && currentIndex >= 0 && !arrived) {
    for (let i = currentIndex + 1; i < points.length; i += 1) {
      nextIndex = i;
      break;
    }
  }

  if (nextIndex >= 0 && nextIndex !== 0) {
    const isDestination = nextIndex === destinationIndex;

    points[nextIndex] = {
      ...points[nextIndex],
      state: isDestination ? "destination" : "next",
    };
  }

  return {
    points: enrichPoints(points, {
      currentIndex,
      destinationIndex,
      arrived,
    }),
    currentIndex,
    nextIndex,
    destinationIndex,
    arrived,
  };
}

/* --------------------------------------------------
   Live fetch
------------------------------------------------- */

/**
 * Fetch the real train running status from /api/railway/live (mNTES-backed)
 * and normalize it into `LiveTrainStatusInfo`.
 *
 * Throws when the live feed is unreachable or does not contain usable data —
 * callers keep the last successful snapshot and show "Live update
 * unavailable" instead of fabricating values.
 */
export async function fetchLiveTrainStatus(
  transport: TripTransport,
  options: { signal?: AbortSignal } = {}
): Promise<LiveTrainStatusInfo> {
  const trainNumber = trim(transport.transport_number);
  const journeyDateDmy = isoDateToDmy(transport.departure_date);

  if (!/^\d{5}$/.test(trainNumber)) {
    throw new Error(
      "Live train status requires a 5-digit train number."
    );
  }

  if (!journeyDateDmy) {
    throw new Error("Live train status requires a departure date.");
  }

  const params = new URLSearchParams({
    trainNo: trainNumber,
    date: journeyDateDmy,
  });

  const response = await fetch(
    `${API_BASE_URL}/api/railway/live?${params.toString()}`,
    { signal: options.signal }
  );

  const errorBody = await response.json().catch(() => null);

  if (!response.ok) {
    const serverMessage =
      errorBody?.error && typeof errorBody.error.message === "string"
        ? errorBody.error.message
        : null;

    const error = new Error(
      serverMessage || `Live railway status request failed (${response.status}).`
    ) as Error & { code?: string };

    error.code =
      errorBody?.error && typeof errorBody.error.code === "string"
        ? errorBody.error.code
        : "LIVE_STATUS_ERROR";

    throw error;
  }

  const payload = errorBody as LiveRailwayPayload;

  if (!payload || payload.success === false) {
    throw new Error("Live railway status returned no usable data.");
  }

  const segmentDestination = trim(transport.arrival_city) || null;

  // Fall back to the station named inside the human status text when the
  // parsed live payload omits currentStation.
  const payloadWithCurrent =
    payload.currentStation || !payload.status
      ? payload
      : (() => {
          const parsed = statusCurrentStation(payload.status);

          return parsed
            ? {
                ...payload,
                currentStation: {
                  name: parsed.name,
                  code: parsed.code,
                  distanceKm: null,
                  updatedOn: null,
                  event: null,
                  nextStation: null,
                },
              }
            : payload;
        })();

  const { points, currentIndex, nextIndex, destinationIndex, arrived } =
    buildTimeline(payloadWithCurrent, segmentDestination);

  const currentPoint = currentIndex >= 0 ? points[currentIndex] : null;
  const nextPoint = nextIndex >= 0 ? points[nextIndex] : null;
  const destinationPoint =
    points[destinationIndex] ?? currentPoint ?? null;

  const statusText = trim(payload.status);

  let onTime: boolean | null = null;

  if (currentPoint && currentPoint.onTime !== null) {
    onTime = currentPoint.onTime;
  } else if (/late|delay/i.test(statusText)) {
    onTime = false;
  } else if (/on\s*time/i.test(statusText)) {
    onTime = true;
  }

  const delay =
    currentPoint?.delayText ??
    currentPoint?.delay ??
    (onTime === false && statusText ? "Late" : null);

  const statusLabel =
    arrived && !statusText ? "Arrived" : statusText || null;

  return {
    source: "live",
    trainName: trim(payload.train?.name) || null,
    trainNumber:
      String(payload.train?.number ?? "").trim() || trainNumber,
    startingStation:
      (points[0]?.station ?? null) || trim(transport.departure_city) || null,
    startingTime: points[0]?.scheduledDeparture ?? formatTime12h(transport.departure_time),
    currentStation: currentPoint?.station ?? null,
    currentStationCode: currentPoint?.code ?? null,
    statusLabel,
    onTime,
    lastUpdatedAt: formatClock(payload.fetchedAt),
    nextStation: nextPoint?.station ?? null,
    nextStationCode: nextPoint?.code ?? null,
    nextStationExpectedTime:
      nextPoint?.expectedArrival ??
      nextPoint?.scheduledArrival ??
      nextPoint?.actualArrival ??
      null,
    expectedArrivalStation:
      arrived && segmentDestination
        ? segmentDestination
        : (destinationPoint?.station ?? segmentDestination),
    expectedArrivalTime:
      destinationPoint?.expectedArrival ??
      destinationPoint?.scheduledArrival ??
      formatTime12h(transport.arrival_time),
    expectedDepartureTime:
      currentPoint?.expectedDeparture ??
      currentPoint?.scheduledDeparture ??
      formatTime12h(transport.departure_time),
    actualArrivalTime: arrived
      ? destinationPoint?.actualArrival ??
        destinationPoint?.scheduledArrival ??
        null
      : currentPoint?.actualArrival ?? null,
    actualDepartureTime: currentPoint?.actualDeparture ?? null,
    delay,
    arrived,
    liveUnavailable: false,
    fetchedAt: payload.fetchedAt ?? null,
    stations: points,
    routeText:
      [points[0]?.station, destinationPoint?.station]
        .filter(Boolean)
        .join(" → ") || null,
  };
}

/* --------------------------------------------------
   Schedule-derived fallback
------------------------------------------------- */

const matchName = (value: string | null | undefined) =>
  norm(value);

/**
 * Derive a running-status snapshot from the saved train row plus the trip's
 * route. `currentStation` comes from the caller's journey-progress logic;
 * everything a live feed would later provide is either schedule-inferred or
 * `null`. Used only as a visually quieter fallback before the first live
 * fetch succeeds.
 */
export function buildLiveTrainStatus(
  transport: TripTransport,
  options: {
    journeyCities?: string[];
    currentStation?: string | null;
  } = {}
): LiveTrainStatusInfo {
  const cities = options.journeyCities ?? [];

  const startingStation = trim(transport.departure_city) || null;
  const arrivalStation = trim(transport.arrival_city) || null;

  // Only a boarding/in-progress leg is treated as "at" the origin; an
  // upcoming leg keeps the quieter "Not Started" status until live data.
  const hasCurrentStop = Boolean(trim(options.currentStation));

  const currentStation =
    trim(options.currentStation) || startingStation;

  let nextStation: string | null = null;

  if (currentStation && arrivalStation) {
    const startIndex = cities.findIndex(
      (city) => matchName(city) === matchName(currentStation)
    );
    const endIndex = cities.findIndex(
      (city) => matchName(city) === matchName(arrivalStation)
    );

    if (startIndex >= 0 && endIndex > startIndex) {
      const between = cities.slice(startIndex + 1, endIndex);
      nextStation = between[0] ?? arrivalStation;
    }
  }

  if (!nextStation) {
    nextStation = arrivalStation;
  }

  const arrivalTime = formatTime12h(transport.arrival_time);
  const departureTime = formatTime12h(transport.departure_time);
  const nextStationExpectedTime =
    nextStation && arrivalStation && matchName(nextStation) === matchName(arrivalStation)
      ? arrivalTime
      : null;

  const fallbackArrival =
    arrivalStation ??
    (cities.length > 0 ? cities[cities.length - 1] : null);

  const points: LiveTrainStationPoint[] = [];

  if (startingStation) {
    points.push({
      ...POINT_TEMPLATE,
      station: startingStation,
      scheduledDeparture: departureTime,
      scheduledDepartureMinutes:
        departureTime == null ? null : clockToJourneyMinutes(departureTime, null),
      state: "origin",
    });
  }

  if (arrivalStation && matchName(arrivalStation) !== matchName(startingStation)) {
    points.push({
      ...POINT_TEMPLATE,
      station: arrivalStation,
      scheduledArrival: arrivalTime,
      scheduledArrivalMinutes:
        arrivalTime == null ? null : clockToJourneyMinutes(arrivalTime, null),
      state: "destination",
    });
  }

  const destinationIndex = points.length - 1;
  const currentIndex = hasCurrentStop ? 0 : -1;

  const enriched = enrichPoints(points, {
    currentIndex,
    destinationIndex,
    arrived: false,
  });

  const enrichedOrigin = enriched[0] ?? null;
  const enrichedDestination = enriched[destinationIndex] ?? null;

  return {
    source: "schedule",
    trainName: trim(transport.transport_name) || null,
    trainNumber: trim(transport.transport_number) || null,
    startingStation,
    startingTime: departureTime,
    currentStation,
    currentStationCode: null,
    statusLabel: "On Time",
    onTime: true,
    lastUpdatedAt: null,
    nextStation,
    nextStationCode: null,
    nextStationExpectedTime,
    expectedArrivalStation: fallbackArrival,
    expectedArrivalTime: arrivalTime,
    expectedDepartureTime: departureTime,
    actualArrivalTime: null,
    actualDepartureTime: null,
    delay: null,
    arrived: false,
    liveUnavailable: false,
    fetchedAt: null,
    stations: enrichedOrigin ? enriched : [],
    routeText:
      [enrichedOrigin?.station, enrichedDestination?.station]
        .filter(Boolean)
        .join(" → ") ||
      null,
  };
}