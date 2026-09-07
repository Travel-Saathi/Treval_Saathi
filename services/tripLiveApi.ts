/**
 * Future-ready service boundary for LIVE TRIPS features whose data
 * providers are not implemented yet: per-trip live /activity updates,
 * booking references and travel advisories (spec section 26).
 *
 * Nothing here invents data. Every fetcher returns shaped-but-empty
 * results until a real provider (backend endpoint, IRCTC/IRIS feeds,
 * booking webhooks, alerts service) is wired in. UI blocks consume the
 * `LiveUpdatesInfo` / `TripActivitiesInfo` shapes below, so adding a
 * provider later requires no screen changes.
 */

export type LiveUpdateSeverity = "info" | "warning" | "alert";

export interface LiveUpdateItem {
  id: string;
  severity: LiveUpdateSeverity;
  title: string;
  message: string | null;
  at: string | null;
}

export interface LiveUpdatesInfo {
  updatedAt: string | null;
  items: LiveUpdateItem[];
}

export interface TripActivitiesInfo {
  /** Activities planned with dates, if your partner booking flow stores them. */
  planned: {
    id: string;
    title: string;
    city: string | null;
    date: string | null;
    time: string | null;
  }[];
  /** Machine-generated suggestions when an activities/recommendation API is available. */
  suggestions: {
    id: string;
    title: string;
    city: string | null;
    description: string | null;
  }[];
}

export interface TravelAdvisoriesInfo {
  advisories: {
    id: string;
    region: string;
    rule: string | null;
    link: string | null;
  }[];
}

/**
 * Live journey updates for a trip. Returns an empty envelope today;
 * replace the body with a call to your live-updates backend when ready.
 */
export async function getLiveTripUpdates(
  _tripId: string
): Promise<LiveUpdatesInfo> {
  return { updatedAt: null, items: [] };
}

/**
 * Activities for a trip. Returns an empty envelope today; replace the
 * body with the activities/recommendation provider when ready.
 */
export async function getTripActivities(
  _tripId: string
): Promise<TripActivitiesInfo> {
  return { planned: [], suggestions: [] };
}

/**
 * Travel advisories for the cities of a trip. Returns an empty envelope
 * today; wire this to an advisories/alerts source when ready.
 */
export async function getTravelAdvisories(
  _cities: string[]
): Promise<TravelAdvisoriesInfo> {
  return { advisories: [] };
}