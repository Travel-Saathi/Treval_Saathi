import { API_BASE_URL } from "./locationApi";

/**
 * Client for the single place-details service (GET /api/place-details).
 *
 * The backend returns ONLY factual, publicly available information sourced
 * through the existing OpenSERP web search. Every field the source does not
 * provide is `null`; nothing is fabricated here.
 */
export interface PlaceDetails {
  name: string | null;
  description: string | null;
  website: string | null;
  type: string | null;
  rating: number | null;
  ratingCount: number | null;
}

export interface GetPlaceDetailsParams {
  name: string;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function toPlaceDetails(raw: unknown): PlaceDetails | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const record = raw as Record<string, unknown>;

  return {
    name: asString(record.name),
    description: asString(record.description),
    website: asString(record.website),
    type: asString(record.type),
    rating: asNumber(record.rating),
    ratingCount: asNumber(record.ratingCount),
  };
}

/**
 * Fetch factual details for one place. Returns `null` when the backend has
 * no usable result (HTTP 404) so callers can render a clean empty state.
 */
export async function getPlaceDetails({
  name,
  city,
  state,
  country,
  latitude,
  longitude,
}: GetPlaceDetailsParams): Promise<PlaceDetails | null> {
  const query = new URLSearchParams({ name });

  if (city && city.trim()) {
    query.set("city", city.trim());
  }

  if (state && state.trim()) {
    query.set("state", state.trim());
  }

  if (country && country.trim()) {
    query.set("country", country.trim());
  }

  if (typeof latitude === "number" && Number.isFinite(latitude)) {
    query.set("lat", String(latitude));
  }

  if (typeof longitude === "number" && Number.isFinite(longitude)) {
    query.set("lon", String(longitude));
  }

  let response: Response;

  try {
    response = await fetch(
      `${API_BASE_URL}/api/place-details?${query.toString()}`
    );
  } catch {
    throw new Error(
      "Could not reach the place details service. Is the backend running?"
    );
  }

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Place details request failed: ${response.status}`);
  }

  const data: unknown = await response.json();

  if (!data || typeof data !== "object" || !("place" in data)) {
    return null;
  }

  return toPlaceDetails((data as { place?: unknown }).place);
}
