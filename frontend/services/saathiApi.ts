import { API_BASE_URL } from "./locationApi";

/**
 * Saathi chat client (POST /api/saathi).
 *
 * The backend calls OpenRouter with Gemma and returns ONLY the assistant
 * reply. This client never sees the model id or any API key.
 */
export interface SaathiChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface SaathiReply {
  role: "assistant";
  content: string;
}

/**
 * Minimal, relevant context about the authenticated user and their current
 * trip. Built on the client from data already loaded by the app (Clerk +
 * Supabase); only fields that actually exist in the app are included, and
 * nothing sensitive (ids, tokens, emails) is ever sent.
 */
export interface SaathiContextUser {
  name?: string | null;
  homeCity?: string | null;
  bio?: string | null;
}

export interface SaathiContextTrip {
  sourceCity?: string | null;
  destination?: string | null;
  description?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  budget?: number | null;
  members?: number | null;
  stops?: string[] | null;
  transports?: {
    mode?: string | null;
    name?: string | null;
    number?: string | null;
    from?: string | null;
    to?: string | null;
    departureTime?: string | null;
    arrivalTime?: string | null;
    status?: string | null;
  }[] | null;
}

/**
 * Live train status fetched with the existing Railway service for the
 * trip's train (only when the current question is train/journey related).
 * The backend renders this as "real, current" data — never invented.
 */
export interface SaathiContextLiveTrain {
  trainNumber?: string | null;
  trainName?: string | null;
  statusLabel?: string | null;
  currentStation?: string | null;
  nextStation?: string | null;
  nextStationExpectedTime?: string | null;
  expectedArrivalTime?: string | null;
  expectedDepartureTime?: string | null;
  delay?: string | null;
  onTime?: boolean | null;
  arrived?: boolean | null;
  liveUnavailable?: boolean | null;
  lastUpdatedAt?: string | null;
}

export interface SaathiContext {
  user?: SaathiContextUser | null;
  trip?: SaathiContextTrip | null;
  liveTrain?: SaathiContextLiveTrain | null;
}

/**
 * Send the conversation (plus relevant authenticated context) to the backend
 * and return the assistant reply. Throws a friendly Error on
 * network/HTTP/invalid-response problems so the screen can surface its own
 * generic message.
 */
export async function sendSaathiMessage(
  messages: SaathiChatMessage[],
  context?: SaathiContext | null
): Promise<SaathiReply> {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error("At least one message is required.");
  }

  const clean = messages.map((message) => ({
    role: message.role === "assistant" ? "assistant" : "user",
    content: typeof message.content === "string" ? message.content.trim() : "",
  }));

  if (clean.some((message) => !message.content)) {
    throw new Error("Empty messages are not allowed.");
  }

  const body: Record<string, unknown> = { messages: clean };

  if (context && (context.user || context.trip || context.liveTrain)) {
    body.context = context;
  }

  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}/api/saathi`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("Could not reach Saathi. Is the backend running?");
  }

  if (!response.ok) {
    throw new Error(`Saathi request failed: ${response.status}`);
  }

  const data: unknown = await response.json();

  if (!data || typeof data !== "object" || !("message" in data)) {
    throw new Error("Saathi returned an invalid response.");
  }

  const message = (data as { message?: unknown }).message;

  if (!message || typeof message !== "object") {
    throw new Error("Saathi returned an invalid response.");
  }

  const record = message as Record<string, unknown>;
  const content =
    typeof record.content === "string" && record.content.trim()
      ? record.content.trim()
      : null;

  if (!content) {
    throw new Error("Saathi returned an empty response.");
  }

  return { role: "assistant", content };
}