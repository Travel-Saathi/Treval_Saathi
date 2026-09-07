import { API_BASE_URL } from "./locationApi";

/**
 * Transport search abstraction for Journey Setup.
 *
 * `searchTransportOptions` returns live train results from the backend
 * (`/api/railway/search`, backed by mNTES). Bus/flight/cab have no provider
 * yet and report `available: false` with a truthful "coming soon" message.
 * Every provider response is mapped through `normalizeTransportOption` into
 * the shared TransportOption shape below.
 */

export type TransportMode =
  | "train"
  | "bus"
  | "flight"
  | "cab"
  | "multi-modal";

export interface TransportModeMeta {
  id: TransportMode;
  label: string;
  icon: keyof typeof import("@expo/vector-icons").Ionicons.glyphMap;
}

export const TRANSPORT_MODES: TransportModeMeta[] = [
  { id: "train", label: "Train", icon: "train-outline" },
  { id: "bus", label: "Bus", icon: "bus-outline" },
  { id: "flight", label: "Flight", icon: "airplane-outline" },
  { id: "cab", label: "Cab", icon: "car-outline" },
  {
    id: "multi-modal",
    label: "Multi-Modal",
    icon: "git-merge-outline",
  },
];

/**
 * Common frontend structure for transport results (section 24 of the spec).
 * Every provider (train/bus/flight) is normalized into this shape.
 * Fields a provider does not supply are left `null`.
 */
export interface TransportOption {
  mode: TransportMode | "unknown";
  transport_number: string | null;
  transport_name: string | null;
  operating_company: string | null;
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
  status: string | null;
  extra: Record<string, unknown>;
}

export interface TransportAvailability {
  mode: TransportMode;
  available: boolean;
  message: string | null;
  results: TransportOption[];
}

export interface TransportSearchInput {
  source: string;
  destination: string;
  date: string | null;
}

const COMING_SOON_MESSAGES: Record<TransportMode, string> = {
  train: "Train information coming soon.",
  bus: "Bus information coming soon.",
  flight: "Flight information coming soon.",
  cab: "Cab information coming soon.",
  "multi-modal": "Multi-modal trip planning coming soon.",
};

const MODE_LABELS: Record<TransportMode, string> = {
  train: "Train",
  bus: "Bus",
  flight: "Flight",
  cab: "Cab",
  "multi-modal": "Multi-Modal",
};

/**
 * Best-effort heuristic that guesses the transport mode from a user-supplied
 * transport number/id. This is NOT a system of record: when the guess is
 * unreliable the user can still pick the mode manually.
 *
 * - ICAO/IATA style airline codes (+ number) -> flight
 *   e.g. "AI102", "6E234", "SG-8151"
 * - Indian/state vehicle registration plates -> bus
 *   e.g. "MP 04 AB 1234", "KA-01-MN-2055"
 * - 4/5 digit train-like numbers (e.g. "12002", "12909") -> train
 */
export function identifyTransportMode(input: string): {
  mode: TransportMode | "unknown";
  confidence: "high" | "medium" | "low" | "none";
} {
  const normalized = input.trim().toUpperCase();

  if (!normalized) {
    return { mode: "unknown", confidence: "none" };
  }

  // Look for a state-code + plate prefix before trying flight patterns,
  // because registrations are the most unambiguous cue.
  const platePattern =
    /^[A-Z]{2}[\s-]?\d{1,2}[\s-][A-Z]{1,2}[\s-]\d{1,4}$/;
  const loosePlatePattern =
    /(^|[\s-])([A-Z]{2}[\s-]?\d{1,2}[\s-][A-Z]{1,2}[\s-]\d{1,4})($|[\s,])/;

  if (platePattern.test(normalized) || loosePlatePattern.test(normalized)) {
    return { mode: "bus", confidence: "high" };
  }

  // Flight: 2-letter airline code (optionally 3 with pattern below) followed
  // by 2-4 digits. Common carriers: AI, 6E, UK, SG, I5, IX, QP, 9W, G8...
  const flightPattern = /^(?=.)[A-Z0-9]{2,3}[\s-]?\d{2,4}$/;

  if (flightPattern.test(normalized)) {
    const prefix = normalized.replace(/[\s-]?\d+$/, "");

    // A purely numeric token (e.g. "1234") is train-like, not a flight.
    if (/^\d+$/.test(prefix)) {
      return /^\d{4}$/.test(normalized)
        ? { mode: "train", confidence: "medium" }
        : { mode: "unknown", confidence: "low" };
    }

    return { mode: "flight", confidence: "high" };
  }

  // Train numbers are typically 4 digits (1xxxx-2xxxx in India). Some shuttle
  // lines also use 5 digits. Match when there is no obvious airline prefix.
  if (/^\d{4,5}$/.test(normalized)) {
    return { mode: "train", confidence: "high" };
  }

  if (/\b(EXPRESS|SUPERFAST|SHATABDI|VANDE|MEMU|PASSENGER)\b/.test(normalized)) {
    return { mode: "train", confidence: "medium" };
  }

  if (/\b(VOLVO|LUXURY|SEATER|SLEEPER|AC BUS|DELUXE)\b/.test(normalized)) {
    return { mode: "bus", confidence: "medium" };
  }

  return { mode: "unknown", confidence: "low" };
}

/**
 * Map a future provider response into the shared TransportOption shape.
 * Every field the raw payload does not provide becomes `null` — never
 * a made-up value.
 */
export function normalizeTransportOption(
  mode: TransportMode | "unknown",
  raw: Record<string, unknown>
): TransportOption {
  const stringOrNull = (key: string): string | null =>
    typeof raw[key] === "string" && String(raw[key]).trim()
      ? String(raw[key]).trim()
      : null;

  return {
    mode,
    transport_number: stringOrNull("transport_number"),
    transport_name: stringOrNull("transport_name"),
    operating_company: stringOrNull("operating_company"),
    departure_city: stringOrNull("departure_city"),
    arrival_city: stringOrNull("arrival_city"),
    departure_date: stringOrNull("departure_date"),
    departure_time: stringOrNull("departure_time"),
    arrival_date: stringOrNull("arrival_date"),
    arrival_time: stringOrNull("arrival_time"),
    duration: stringOrNull("duration"),
    price: stringOrNull("price"),
    deal_price: stringOrNull("deal_price"),
    availability: stringOrNull("availability"),
    route: stringOrNull("route"),
    status: stringOrNull("status"),
    extra: raw,
  };
}

function titleCaseStationName(name: string): string {
  return name
    .toLowerCase()
    .split(/\s+/)
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join(" ");
}

interface TrainSearchResult {
  success: boolean;
  source: string;
  from: { code: string; name: string };
  to: { code: string; name: string };
  date: string;
  count: number;
  trains: Array<{
    number: string;
    name: string;
    from: { code: string; name: string };
    to: { code: string; name: string };
    departure: string;
    arrival: string;
    duration: string;
    runningDays: string[];
    isDaily: boolean;
  }>;
}

/**
 * Search for transport options for the given mode.
 *
 * Train mode queries the backend's between-stations search (mNTES-backed).
 * Other modes have no live provider and return a truthful "coming soon"
 * result. The signature is stable so more providers can be added later.
 */
export async function searchTransportOptions(
  mode: TransportMode,
  input: TransportSearchInput,
  signal?: AbortSignal
): Promise<TransportAvailability> {
  if (mode !== "train") {
    return {
      mode,
      available: false,
      message: COMING_SOON_MESSAGES[mode],
      results: [],
    };
  }

  const params = new URLSearchParams({
    from: input.source,
    to: input.destination,
  });

  if (input.date) {
    params.set("date", input.date);
  }

  try {
    const response = await fetch(
      `${API_BASE_URL}/api/railway/search?${params.toString()}`,
      { signal }
    );

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      const serverMessage =
        body && body.error && typeof body.error.message === "string"
          ? body.error.message
          : null;

      return {
        mode,
        available: false,
        message: serverMessage || "Train search could not be completed.",
        results: [],
      };
    }

    const data = (await response.json()) as TrainSearchResult;

    if (!data || data.count < 1) {
      return {
        mode,
        available: false,
        message: "No trains found on this route.",
        results: [],
      };
    }

    const results: TransportOption[] = data.trains.map((train) => {
      const rawExtra: Record<string, unknown> = { ...train };

      delete rawExtra.duration;

      return normalizeTransportOption("train", {
        ...rawExtra,
        transport_number: train.number,
        transport_name: train.name,
        departure_city: titleCaseStationName(
          train.from?.name || data.from?.name || ""
        ),
        arrival_city: titleCaseStationName(
          train.to?.name || data.to?.name || ""
        ),
        departure_date: data.date,
        departure_time: train.departure,
        arrival_time: train.arrival,
        duration: train.duration,
        availability: train.isDaily
          ? "Daily"
          : train.runningDays?.join(", "),
        route: `${data.from?.name} - ${data.to?.name}`,
      });
    });

    return {
      mode,
      available: true,
      message: null,
      results,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw error;
    }

    return {
      mode,
      available: false,
      message: "Unable to reach train search right now.",
      results: [],
    };
  }
}

export { MODE_LABELS };