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
 * Send the conversation to the backend and return the assistant reply.
 * Throws a friendly Error on network/HTTP/invalid-response problems so the
 * screen can surface its own generic message.
 */
export async function sendSaathiMessage(
  messages: SaathiChatMessage[]
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

  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}/api/saathi`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ messages: clean }),
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