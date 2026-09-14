/*
 * OpenRouter chat service.
 *
 * Single chat-completions call used by Saathi. The API key lives only in
 * backend/.env (never in the client bundle) and is never logged or returned
 * to the frontend. Falls back to the allowed free Gemma model when
 * OPENROUTER_MODEL is not configured.
 */
const OPENROUTER_URL =
  "https://openrouter.ai/api/v1/chat/completions";

const DEFAULT_OPENROUTER_MODEL = "google/gemma-4-31b-it:free";

/*
 * Gemma can take a while on the free tier: keep the upstream timeout loose
 * (default 60s) but never unbounded. Override with OPENROUTER_REQUEST_TIMEOUT_MS.
 */
const OPENROUTER_REQUEST_TIMEOUT_MS = clampTimeout(
  process.env.OPENROUTER_REQUEST_TIMEOUT_MS,
  60000
);

/*
 * Optional token cap so a single free-tier reply stays small and fast.
 * Override with OPENROUTER_MAX_TOKENS; disabled when unset.
 */
const OPENROUTER_MAX_TOKENS = clampMaxTokens(
  process.env.OPENROUTER_MAX_TOKENS
);

function clampTimeout(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);

  if (!Number.isFinite(parsed) || parsed < 1000) {
    return fallback;
  }

  return parsed;
}

function clampMaxTokens(value) {
  const parsed = Number.parseInt(String(value ?? ""), 10);

  if (!Number.isFinite(parsed) || parsed < 1) {
    return null;
  }

  return parsed;
}

async function sendChatMessages(messages, options = {}) {
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not configured");
  }

  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error("At least one message is required");
  }

  const model = process.env.OPENROUTER_MODEL || DEFAULT_OPENROUTER_MODEL;

  /*
   * The route always supplies the Saathi system prompt (kept in
   * utils/saathiPrompt.js) so request handling never embeds it.
   */
  const payloadMessages = [];

  if (options.systemPrompt) {
    payloadMessages.push({
      role: "system",
      content: String(options.systemPrompt),
    });
  }

  for (const message of messages) {
    if (!message || typeof message !== "object") {
      throw new Error("Each message must be an object");
    }

    const role =
      message.role === "assistant" || message.role === "system"
        ? message.role
        : "user";
    const content = String(message.content ?? "").trim();

    if (!content) {
      throw new Error("Messages must have non-empty content");
    }

    payloadMessages.push({ role, content });
  }

  const body = {
    model,
    messages: payloadMessages,
  };

  if (OPENROUTER_MAX_TOKENS) {
    body.max_tokens = OPENROUTER_MAX_TOKENS;
  }

  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    OPENROUTER_REQUEST_TIMEOUT_MS
  );

  try {
    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();

      const error = new Error(
        `OpenRouter API error ${response.status}: ${errorText}`
      );

      if (response.status === 429 || response.status === 503) {
        error.code = "rate-limited";
      }

      throw error;
    }

    const data = await response.json();

    const content = data?.choices?.[0]?.message?.content;

    if (typeof content !== "string" || !content.trim()) {
      throw new Error("OpenRouter returned no usable assistant response");
    }

    return content.trim();
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  sendChatMessages,
};