import { API_BASE_URL } from "./locationApi";

/**
 * Treval Saathi travel-information client.
 *
 * The backend returns normalized travel data only. The UI never learns
 * which search provider supplied a piece of information.
 */

export interface CityFact {
  text: string;
  title: string | null;
  link: string | null;
}

interface CityFactResponse {
  success: boolean;
  city: string;
  fact: CityFact | null;
}

export interface TravelInfoItem {
  title: string | null;
  description: string | null;
  website: string | null;
  date: string | null;
}

interface TravelInfoResponse {
  success: boolean;
  query: string | null;
  count: number;
  results: TravelInfoItem[];
}

/**
 * Fetch a "did you know" fact for a city. Returns null when nothing is
 * available so callers can hide the block gracefully.
 */
export async function getCityFunFact(
  city: string,
  signal?: AbortSignal
): Promise<CityFact | null> {
  const trimmed = city.trim();

  if (!trimmed) {
    return null;
  }

  try {
    const response = await fetch(
      `${API_BASE_URL}/api/city/fact?city=${encodeURIComponent(trimmed)}`,
      { signal }
    );

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as CityFactResponse;

    if (!data.success || !data.fact || !data.fact.text) {
      return null;
    }

    return data.fact;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw error;
    }

    console.error("CITY FACT ERROR:", error);

    return null;
  }
}

/**
 * General travel-information search (tips, descriptions, guides).
 * Returns an empty array on failure so callers degrade gracefully.
 */
export async function searchTravelInfo(
  query: string,
  signal?: AbortSignal
): Promise<TravelInfoItem[]> {
  const trimmed = query.trim();

  if (!trimmed) {
    return [];
  }

  try {
    const response = await fetch(
      `${API_BASE_URL}/api/web-search?q=${encodeURIComponent(trimmed)}`,
      { signal }
    );

    if (!response.ok) {
      return [];
    }

    const data = (await response.json()) as TravelInfoResponse;

    if (!data.success || !Array.isArray(data.results)) {
      return [];
    }

    return data.results;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw error;
    }

    console.error("TRAVEL INFO SEARCH ERROR:", error);

    return [];
  }
}