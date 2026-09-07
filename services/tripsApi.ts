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
  "id, trip_id, mode, transport_number, transport_name, departure_city, arrival_city, departure_date, departure_time, arrival_date, arrival_time, duration, price, deal_price, availability, route, created_at";

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
 * Load the trip's selected transport. If the trip already has multiple
 * rows (legacy duplicate rows), the first one is returned.
 */
export async function getTransport(
  supabase: SupabaseClient,
  tripId: string
): Promise<TripTransport | null> {
  const { data, error } = await supabase
    .from("trip_transport")
    .select(TRANSPORT_COLUMNS)
    .eq("trip_id", tripId)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(25);

  if (error) {
    throw error;
  }

  const rows = (data as TripTransport[]) ?? [];

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

  const payload = {
    trip_id: tripId,
    mode: input.mode,
    transport_number: input.transport_number ?? null,
    transport_name: input.transport_name ?? null,
    departure_city: input.departure_city ?? null,
    arrival_city: input.arrival_city ?? null,
    departure_date: input.departure_date ?? null,
    departure_time: input.departure_time ?? null,
    arrival_date: input.arrival_date ?? null,
    arrival_time: input.arrival_time ?? null,
    duration: input.duration ?? null,
    price: input.price ?? null,
    deal_price: input.deal_price ?? null,
    availability: input.availability ?? null,
    route: input.route ?? null,
  };

  const rows = (existingRows as { id: string }[] | null) ?? [];

  let savedId: string;

  if (rows.length === 0) {
    const { data, error } = await supabase
      .from("trip_transport")
      .insert(payload)
      .select(TRANSPORT_COLUMNS)
      .single();

    if (error) {
      throw error;
    }

    savedId = (data as TripTransport).id;
  } else {
    const { data, error } = await supabase
      .from("trip_transport")
      .update(payload)
      .eq("id", rows[0].id)
      .select(TRANSPORT_COLUMNS)
      .single();

    if (error) {
      throw error;
    }

    savedId = (data as TripTransport).id;

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

  const { data: saved, error: refetchError } = await supabase
    .from("trip_transport")
    .select(TRANSPORT_COLUMNS)
    .eq("id", savedId)
    .single();

  if (refetchError) {
    throw refetchError;
  }

  return saved as TripTransport;
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
  const { data, error } = await supabase
    .from("trip_transport")
    .select(TRANSPORT_COLUMNS)
    .eq("trip_id", tripId)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(50);

  if (error) {
    throw error;
  }

  return (data as TripTransport[]) ?? [];
}

function normalizedName(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function buildTransportPayload(input: SaveTransportInput, tripId: string) {
  return {
    trip_id: tripId,
    mode: input.mode,
    transport_number: input.transport_number ?? null,
    transport_name: input.transport_name ?? null,
    departure_city: input.departure_city ?? null,
    arrival_city: input.arrival_city ?? null,
    departure_date: input.departure_date ?? null,
    departure_time: input.departure_time ?? null,
    arrival_date: input.arrival_date ?? null,
    arrival_time: input.arrival_time ?? null,
    duration: input.duration ?? null,
    price: input.price ?? null,
    deal_price: input.deal_price ?? null,
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

  const { data: rows, error: loadError } = await supabase
    .from("trip_transport")
    .select(TRANSPORT_COLUMNS)
    .eq("trip_id", tripId)
    .limit(50);

  if (loadError) {
    throw loadError;
  }

  const legRows = ((rows as TripTransport[]) ?? []).filter(
    (row) =>
      normalizedName(row.departure_city) === from &&
      normalizedName(row.arrival_city) === to
  );

  const payload = buildTransportPayload(input, tripId);

  let savedId: string;

  if (legRows.length === 0) {
    const { data, error } = await supabase
      .from("trip_transport")
      .insert(payload)
      .select(TRANSPORT_COLUMNS)
      .single();

    if (error) {
      throw error;
    }

    savedId = (data as TripTransport).id;
  } else {
    const { data, error } = await supabase
      .from("trip_transport")
      .update(payload)
      .eq("id", legRows[0].id)
      .select(TRANSPORT_COLUMNS)
      .single();

    if (error) {
      throw error;
    }

    savedId = (data as TripTransport).id;

    const duplicates = legRows.slice(1);

    for (const duplicate of duplicates) {
      await supabase
        .from("trip_transport")
        .delete()
        .eq("id", duplicate.id);
    }
  }

  const { data: saved, error: refetchError } = await supabase
    .from("trip_transport")
    .select(TRANSPORT_COLUMNS)
    .eq("id", savedId)
    .single();

  if (refetchError) {
    throw refetchError;
  }

  return saved as TripTransport;
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