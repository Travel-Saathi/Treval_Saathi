import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase data layer for a journey.
 *
 * Table responsibilities (spec section 22):
 *  - trips          -> overall trip information
 *  - trip_stops     -> intermediate stops
 *  - trip_transport -> selected transportation
 *
 * `trip_id` links the two child tables back to `trips.id`.
 * Callers pass the authenticated Supabase client (`useSupabase()`);
 * no credentials are ever handled here.
 */

export interface TripRow {
  id: string;
  created_by: string | null;
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
}

/**
 * Normalize a date value into the ISO `YYYY-MM-DD` form PostgreSQL expects.
 *
 * Accepted inputs (all case-insensitive to whitespace):
 *  - `YYYY-MM-DD`                 (already canonical, preserved as-is)
 *  - `YYYY-MM-DD` with a time part (ISO datetime, kept as the date portion)
 *  - `DD-MM-YYYY`                 (e.g. `23-09-2026`)
 *  - `DD/MM/YYYY`                 (e.g. `23/09/2026`)
 *
 * Anything the app can't map safely maps to `null` (no `new Date(...)`
 * string parsing, which is not reliable across engines).
 */
export function normalizeISODate(
  value: string | null | undefined
): string | null {
  const raw = String(value ?? "").trim();

  if (!raw) {
    return null;
  }

  const isoTime = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ])/);
  const isoExact = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (isoTime) {
    const [, year, month, day] = isoTime;
    return isValidDateParts(year, month, day)
      ? `${year}-${month}-${day}`
      : null;
  }

  if (isoExact) {
    const [, year, month, day] = isoExact;
    return isValidDateParts(year, month, day)
      ? `${year}-${month}-${day}`
      : null;
  }

  const dmy = raw.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);

  if (dmy) {
    const [, day, month, year] = dmy;
    const pad = (part: string) => String(part).padStart(2, "0");
    return isValidDateParts(year, month, day)
      ? `${year}-${pad(month)}-${pad(day)}`
      : null;
  }

  return null;
}

function isValidDateParts(
  yearStr: string,
  monthStr: string,
  dayStr: string
): boolean {
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    return false;
  }

  if (year < 1900 || year > 2100) {
    return false;
  }

  if (month < 1 || month > 12) {
    return false;
  }

  const daysInMonth = new Date(year, month, 0).getDate();

  return day >= 1 && day <= daysInMonth;
}

export interface TripStop {
  id: string;
  trip_id: string;
  city: string;
  stop_order: number;
  arrival_date: string | null;
  departure_date: string | null;
  created_at: string | null;
}

export interface TripTransport {
  id: string;
  trip_id: string;
  mode: string | null;
  transport_number: string | null;
  transport_name: string | null;
  departure_city: string | null;
  arrival_city: string | null;
  departure_date: string | null;
  departure_time: string | null;
  arrival_date: string | null;
  arrival_time: string | null;
  duration: string | null;
  price: string | null;
  deal_price: string | null;
  availability: string | null;
  route: string | null;
  created_at: string | null;

  /* Live-status / per-leg progress fields (see database/migrations/001_*).
     NULL until a live refresh has been persisted for the row. */
  segment_status: string | null;
  current_station: string | null;
  current_station_code: string | null;
  next_station: string | null;
  next_station_code: string | null;
  actual_departure_time: string | null;
  actual_arrival_time: string | null;
  expected_departure_time: string | null;
  expected_arrival_time: string | null;
  delay: string | null;
  status: string | null;
  last_status_update: string | null;
}

export interface CreateTripInput {
  created_by: string;
  title?: string | null;
  source_city: string;
  destination: string;
  description?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  budget?: number | null;
  members?: number;
  status?: string;
}

export interface SaveTransportInput {
  mode: string;
  transport_number?: string | null;
  transport_name?: string | null;
  departure_city?: string | null;
  arrival_city?: string | null;
  departure_date?: string | null;
  departure_time?: string | null;
  arrival_date?: string | null;
  arrival_time?: string | null;
  duration?: string | null;
  price?: string | null;
  deal_price?: string | null;
  availability?: string | null;
  route?: string | null;
}

/**
 * Identifies a single train leg (e.g. "Bhopal → Indore") inside a
 * multi-stop journey. Legs are stored as separate trip_transport rows,
 * matched by their departure/arrival cities.
 */
export interface TransportLegKey {
  from: string;
  to: string;
}

const TRIP_COLUMNS =
  "id, created_by, title, source_city, destination, description, start_date, end_date, budget, members, status, created_at";

const STOP_COLUMNS =
  "id, trip_id, city, stop_order, arrival_date, departure_date, created_at";

const TRANSPORT_COLUMNS =
  "id, trip_id, mode, transport_number, transport_name, departure_city, arrival_city, departure_date, departure_time, arrival_date, arrival_time, duration, price, deal_price, availability, route, created_at, segment_status, current_station, current_station_code, next_station, next_station_code, actual_departure_time, actual_arrival_time, expected_departure_time, expected_arrival_time, delay, status, last_status_update";

/**
 * Column set that exists on the live database today. Used as a graceful
 * fallback when the live-status migration (database/migrations/001_*)
 * has not been applied yet, so trip loading never breaks on the pending
 * schema change.
 */
const TRANSPORT_BASE_COLUMNS =
  "id, trip_id, mode, transport_number, transport_name, departure_city, arrival_city, departure_date, departure_time, arrival_date, arrival_time, duration, price, deal_price, availability, route, created_at";

/**
 * Whether the live-status columns of `trip_transport` (segment_status,
 * current_station, ..., last_status_update) exist on the connected database.
 * `null` until the first transport query of this app session decides it;
 * once known, the decision is memoized so every later read of the session
 * uses the correct column set directly — the full-column SELECT is only ever
 * attempted once per session, not once per trip.
 */
let liveStatusProbe: boolean | null = null;

/**
 * Memoized probe result for the live-status columns: `null` (not probed
 * yet), `true` (columns exist), or `false` (migration not applied).
 */
export function hasLiveStatusColumns(): boolean | null {
  return liveStatusProbe;
}

/** Remember that the live-status columns do NOT exist (use base columns). */
export function markLiveStatusColumnsMissing(): void {
  liveStatusProbe = false;
}

/** Remember that the live-status columns exist (use the full column set). */
function markLiveStatusColumnsPresent(): void {
  liveStatusProbe = true;
}

/**
 * Column set to request first. Once the session has learned the live-status
 * columns are absent, reads go straight to the base set so the fallback 400
 * is not repeated for every subsequent trip.
 */
function preferredTransportColumns(): string {
  return liveStatusProbe === false
    ? TRANSPORT_BASE_COLUMNS
    : TRANSPORT_COLUMNS;
}

/* --------------------------------------------------
   trips
-------------------------------------------------- */

export async function createTrip(
  supabase: SupabaseClient,
  input: CreateTripInput
): Promise<TripRow> {
  const { data, error } = await supabase
    .from("trips")
    .insert({
      created_by: input.created_by,
      title: input.title ?? null,
      source_city: input.source_city,
      destination: input.destination,
      description: input.description ?? null,
      start_date: input.start_date ?? null,
      end_date: input.end_date ?? null,
      budget: input.budget ?? null,
      members: input.members ?? 1,
      status: input.status ?? "planned",
    })
    .select(TRIP_COLUMNS)
    .single();

  if (error) {
    throw error;
  }

  return data as TripRow;
}

export async function getTrip(
  supabase: SupabaseClient,
  tripId: string
): Promise<TripRow | null> {
  const { data, error } = await supabase
    .from("trips")
    .select(TRIP_COLUMNS)
    .eq("id", tripId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as TripRow | null) ?? null;
}

/* --------------------------------------------------
   trip_stops
-------------------------------------------------- */

export async function listStops(
  supabase: SupabaseClient,
  tripId: string
): Promise<TripStop[]> {
  const { data, error } = await supabase
    .from("trip_stops")
    .select(STOP_COLUMNS)
    .eq("trip_id", tripId)
    .order("stop_order", { ascending: true })
    .order("id", { ascending: true });

  if (error) {
    throw error;
  }

  return (data as TripStop[]) ?? [];
}

export async function addStop(
  supabase: SupabaseClient,
  tripId: string,
  city: string,
  arrivalDate: string | null,
  departureDate: string | null
): Promise<TripStop> {
  const existing = await listStops(supabase, tripId);

  const nextOrder =
    existing.length === 0
      ? 1
      : Math.max(...existing.map((stop) => stop.stop_order)) + 1;

  const { data, error } = await supabase
    .from("trip_stops")
    .insert({
      trip_id: tripId,
      city,
      stop_order: nextOrder,
      arrival_date: arrivalDate,
      departure_date: departureDate,
    })
    .select(STOP_COLUMNS)
    .single();

  if (error) {
    throw error;
  }

  return data as TripStop;
}

export async function removeStop(
  supabase: SupabaseClient,
  stopId: string
): Promise<void> {
  const { error } = await supabase
    .from("trip_stops")
    .delete()
    .eq("id", stopId);

  if (error) {
    throw error;
  }
}

/**
 * Persist the stop_order of every provided stop. The caller is
 * responsible for the new ordering; after this the DB order and the
 * UI order are identical (spec section 13).
 */
export async function saveStopOrder(
  supabase: SupabaseClient,
  stops: { id: string; stop_order: number }[]
): Promise<void> {
  for (const stop of stops) {
    const { error } = await supabase
      .from("trip_stops")
      .update({ stop_order: stop.stop_order })
      .eq("id", stop.id);

    if (error) {
      throw error;
    }
  }
}

/* --------------------------------------------------
   trip_transport
-------------------------------------------------- */

/**
 * Fetch a single trip_transport row by id, preferring the full column set
 * (which includes live-status fields). If the live-status migration has not
 * been applied yet the query falls back to the base column set instead of
 * failing.
 */
async function refetchTransport(
  supabase: SupabaseClient,
  id: string
): Promise<TripTransport | null> {
  for (const columns of [
    preferredTransportColumns(),
    TRANSPORT_BASE_COLUMNS,
  ]) {
    try {
      const { data, error } = await supabase
        .from("trip_transport")
        .select(columns)
        .eq("id", id)
        .single();

      if (error) {
        if (isMissingColumnError(error)) {
          markLiveStatusColumnsMissing();
          continue;
        }
        throw error;
      }

      if (columns === TRANSPORT_COLUMNS) {
        markLiveStatusColumnsPresent();
      }

      return data ? withDisplayMode(data as unknown as TripTransport) : null;
    } catch (error) {
      if (isMissingColumnError(error)) {
        markLiveStatusColumnsMissing();
        continue;
      }
      throw error;
    }
  }

  return null;
}

export function isMissingColumnError(error: unknown): boolean {
  const message = String(
    (error as { message?: string } | null)?.message ?? ""
  );
  return /column .* does not exist/i.test(message);
}

/**
 * Load the trip's selected transport. If the trip already has multiple
 * rows (legacy duplicate rows), the first one is returned.
 */
export async function getTransport(
  supabase: SupabaseClient,
  tripId: string
): Promise<TripTransport | null> {
  const rows = await listTransport(supabase, tripId);

  return rows.length > 0 ? rows[0] : null;
}

/**
 * Persist the selected transport for a trip.
 *
 * Guarantees a single record per trip (spec section 9): if the trip already
 * has a trip_transport row it is updated; any stray duplicate rows are
 * removed; otherwise a new row is inserted.
 */
export async function saveTransport(
  supabase: SupabaseClient,
  tripId: string,
  input: SaveTransportInput
): Promise<TripTransport> {
  const { data: existingRows, error: loadError } = await supabase
    .from("trip_transport")
    .select("id")
    .eq("trip_id", tripId);

  if (loadError) {
    throw loadError;
  }

  const payload = buildTransportPayload(input, tripId);

  if (!payload.departure_date) {
    throw new Error("A valid departure date is required to save transport.");
  }

  const rows = (existingRows as { id: string }[] | null) ?? [];

  let savedId: string;

  if (rows.length === 0) {
    const { data, error } = await supabase
      .from("trip_transport")
      .insert(payload)
      .select("id")
      .single();

    if (error) {
      throw error;
    }

    savedId = (data as { id: string }).id;
  } else {
    const { data, error } = await supabase
      .from("trip_transport")
      .update(payload)
      .eq("id", rows[0].id)
      .select("id")
      .single();

    if (error) {
      throw error;
    }

    savedId = (data as { id: string }).id;

    // Remove any stray duplicate rows so repeated selections never
    // accumulate duplicates.
    const duplicates = rows.slice(1);

    for (const duplicate of duplicates) {
      await supabase
        .from("trip_transport")
        .delete()
        .eq("id", duplicate.id);
    }
  }

  const saved = await refetchTransport(supabase, savedId);

  if (!saved) {
    throw new Error("Transport could not be reloaded.");
  }

  return saved;
}

export async function removeTransport(
  supabase: SupabaseClient,
  tripId: string
): Promise<void> {
  const { error } = await supabase
    .from("trip_transport")
    .delete()
    .eq("trip_id", tripId);

  if (error) {
    throw error;
  }
}

/* --------------------------------------------------
   Multi-leg transport (trip_transport, one row per leg)
-------------------------------------------------- */

/**
 * List every saved transport row for a trip in insertion order.
 * Journey legs each keep their own row so every leg stays identifiable.
 */
export async function listTransport(
  supabase: SupabaseClient,
  tripId: string
): Promise<TripTransport[]> {
  /* Preferred full column set; falls back to the base set when the
     live-status migration has not been applied yet. */
  for (const columns of [
    preferredTransportColumns(),
    TRANSPORT_BASE_COLUMNS,
  ]) {
    try {
      const { data, error } = await supabase
        .from("trip_transport")
        .select(columns)
        .eq("trip_id", tripId)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .limit(50);

      if (error) {
        if (isMissingColumnError(error)) {
          markLiveStatusColumnsMissing();
          continue;
        }
        throw error;
      }

      if (columns === TRANSPORT_COLUMNS) {
        markLiveStatusColumnsPresent();
      }

      return ((data as unknown as TripTransport[]) ?? []).map(withDisplayMode);
    } catch (error) {
      if (isMissingColumnError(error)) {
        continue;
      }
      throw error;
    }
  }

  return [];
}

function normalizedName(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

/**
 * Canonical storage form for `trip_transport.mode`. The Supabase
 * `trip_transport_mode_check` constraint only accepts TRAIN, BUS, FLIGHT,
 * CAB — the app works in lowercase, so the value is uppercased right before
 * insert. Unknown values pass through untouched.
 */
function normalizeTransportModeForSave(
  mode: string | null | undefined
): string | null {
  const value = String(mode ?? "").trim();

  if (!value) {
    return null;
  }

  switch (value.toUpperCase()) {
    case "TRAIN":
      return "TRAIN";
    case "BUS":
      return "BUS";
    case "FLIGHT":
      return "FLIGHT";
    case "CAB":
    case "TAXI":
      return "CAB";
    default:
      return value;
  }
}

/**
 * Canonical display form for `trip_transport.mode`. Database rows may hold
 * uppercase values (TRAIN/BUS/FLIGHT/CAB from the check constraint) or
 * legacy lowercase values; both are folded back to the lowercase keys the
 * UI's MODE_LABELS understands.
 */
function normalizeTransportModeForDisplay(
  mode: string | null | undefined
): string | null {
  const value = String(mode ?? "").trim();

  if (!value) {
    return null;
  }

  switch (value.toUpperCase()) {
    case "TRAIN":
      return "train";
    case "BUS":
      return "bus";
    case "FLIGHT":
      return "flight";
    case "CAB":
    case "TAXI":
      return "cab";
    default:
      return value;
  }
}

function withDisplayMode<T extends TripTransport>(row: T): T {
  return { ...row, mode: normalizeTransportModeForDisplay(row.mode) };
}

/**
 * Log the full Supabase error fields, then rethrow so the caller can
 * still show a user-facing message.
 */
function logAndThrowSupabaseError(error: unknown, context: string): never {
  const err = error as {
    code?: string;
    message?: string;
    details?: string;
    hint?: string;
    statusCode?: number;
  };

  console.error(
    `SUPABASE ERROR [${context}]:`,
    JSON.stringify(
      {
        code: err.code ?? null,
        message: err.message ?? null,
        details: err.details ?? null,
        hint: err.hint ?? null,
        statusCode: err.statusCode ?? null,
      },
      null,
      2
    )
  );

  throw error;
}

function parseNumericValue(value: unknown): number | null {
  if (value == null) {
    return null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  const cleaned = String(value).replace(/[^0-9.\-]/g, "");
  const parsed = Number(cleaned);

  return Number.isFinite(parsed) ? parsed : null;
}

function buildTransportPayload(input: SaveTransportInput, tripId: string) {
  return {
    trip_id: tripId,
    mode: normalizeTransportModeForSave(input.mode),
    transport_number: input.transport_number ?? null,
    transport_name: input.transport_name ?? null,
    departure_city: input.departure_city ?? null,
    arrival_city: input.arrival_city ?? null,
    departure_date: normalizeISODate(input.departure_date),
    departure_time: input.departure_time ?? null,
    arrival_date: normalizeISODate(input.arrival_date),
    arrival_time: input.arrival_time ?? null,
    duration: input.duration ?? null,
    price: parseNumericValue(input.price),
    deal_price: parseNumericValue(input.deal_price),
    availability: input.availability ?? null,
    route: input.route ?? null,
  };
}

/**
 * Upsert the transport row owned by ONE journey leg. Other legs' rows are
 * left untouched so a multi-leg trip can hold several transport selections.
 * The leg identity is the pair of departure/arrival cities.
 */
export async function saveLegTransport(
  supabase: SupabaseClient,
  tripId: string,
  input: SaveTransportInput,
  leg: TransportLegKey
): Promise<TripTransport> {
  const from = normalizedName(leg.from);
  const to = normalizedName(leg.to);

  let rows: TripTransport[] = [];

  for (const columns of [
    preferredTransportColumns(),
    TRANSPORT_BASE_COLUMNS,
  ]) {
    try {
      const { data, error } = await supabase
        .from("trip_transport")
        .select(columns)
        .eq("trip_id", tripId)
        .limit(50);

      if (error) {
        if (isMissingColumnError(error)) {
          markLiveStatusColumnsMissing();
          continue;
        }
        logAndThrowSupabaseError(error, "saveLegTransport.load");
      }

      if (columns === TRANSPORT_COLUMNS) {
        markLiveStatusColumnsPresent();
      }

      rows = (data as unknown as TripTransport[]) ?? [];
      break;
    } catch (error) {
      if (isMissingColumnError(error)) {
        continue;
      }
      throw error;
    }
  }

  const legRows = rows.filter(
    (row) =>
      normalizedName(row.departure_city) === from &&
      normalizedName(row.arrival_city) === to
  );

  const payload = buildTransportPayload(input, tripId);

  if (!payload.departure_date) {
    throw new Error("A valid departure date is required to save transport.");
  }

  let savedId: string;

  if (legRows.length === 0) {
    const { data, error } = await supabase
      .from("trip_transport")
      .insert(payload)
      .select("id")
      .single();

    if (error) {
      logAndThrowSupabaseError(error, "saveLegTransport.insert");
    }

    savedId = (data as { id: string }).id;
  } else {
    const { data, error } = await supabase
      .from("trip_transport")
      .update(payload)
      .eq("id", legRows[0].id)
      .select("id")
      .single();

    if (error) {
      logAndThrowSupabaseError(error, "saveLegTransport.update");
    }

    savedId = (data as { id: string }).id;

    const duplicates = legRows.slice(1);

    for (const duplicate of duplicates) {
      await supabase
        .from("trip_transport")
        .delete()
        .eq("id", duplicate.id);
    }
  }

  const saved = await refetchTransport(supabase, savedId);

  if (!saved) {
    throw new Error("Transport could not be reloaded.");
  }

  return saved;
}

/**
 * Remove the transport row owned by ONE journey leg, leaving remaining
 * legs' transports untouched.
 */
export async function removeTransportLeg(
  supabase: SupabaseClient,
  tripId: string,
  leg: TransportLegKey
): Promise<void> {
  const from = normalizedName(leg.from);
  const to = normalizedName(leg.to);

  const { data: rows, error: loadError } = await supabase
    .from("trip_transport")
    .select("id, departure_city, arrival_city")
    .eq("trip_id", tripId)
    .limit(50);

  if (loadError) {
    throw loadError;
  }

  const legRowIds = ((rows as TripTransport[]) ?? [])
    .filter(
      (row) =>
        normalizedName(row.departure_city) === from &&
        normalizedName(row.arrival_city) === to
    )
    .map((row) => row.id);

  if (legRowIds.length === 0) {
    return;
  }

  const { error } = await supabase
    .from("trip_transport")
    .delete()
    .in("id", legRowIds);

  if (error) {
    throw error;
  }
}