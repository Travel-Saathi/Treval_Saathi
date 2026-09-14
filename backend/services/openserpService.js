const DEFAULT_OPEN_SERP_BASE_URL = "http://127.0.0.1:7000";

/*
 * OpenSERP performs its own upstream retries (browser rendering etc.), so a
 * wedged instance can otherwise hold a request open for a long time. Cap it so
 * a single failed call aborts promptly and the request fails cleanly instead
 * of hanging. Default is short (8s) so failure-mode tests never block;
 * override with OPEN_SERP_REQUEST_TIMEOUT_MS when a longer window is needed.
 */
const OPEN_SERP_REQUEST_TIMEOUT_MS = clampTimeout(
  process.env.OPEN_SERP_REQUEST_TIMEOUT_MS,
  8000
);

function clampTimeout(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);

  if (!Number.isFinite(parsed) || parsed < 1000) {
    return fallback;
  }

  return parsed;
}

async function searchWithOpenSerp(query, options = {}) {
  if (!query || !String(query).trim()) {
    throw new Error("Search query is required");
  }

  const baseUrl = (
    process.env.OPEN_SERP_BASE_URL ||
    DEFAULT_OPEN_SERP_BASE_URL
  ).replace(/\/+$/, "");

  const engine = options.engine || "google";
  const limit = options.num || 10;

  const params = new URLSearchParams({
    text: String(query).trim(),
    limit: String(limit),
  });

  if (options.region) {
    params.set("region", String(options.region));
  }

  if (options.lang) {
    params.set("lang", String(options.lang));
  }

  if (options.extract) {
    params.set("extract", String(options.extract));
  }

  const url = `${baseUrl}/${engine}/search?${params.toString()}`;

  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    OPEN_SERP_REQUEST_TIMEOUT_MS
  );

  try {
    const response = await fetch(url, {
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();

      const error = new Error(
        `OpenSERP API error ${response.status}: ${errorText}`
      );

      if (response.status === 429 || response.status === 503) {
        error.code = "rate-limited";
      }

      throw error;
    }

    return response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function searchWeb(query, options = {}) {
  const data = await searchWithOpenSerp(query, options);

  const results = data.results || [];

  return {
    query,
    source: "openserp",
    count: results.length,

    results: results.map((result) => ({
      title: result.title || null,
      link: result.url || null,
      snippet: result.snippet || null,
      date: result.date || null,
      type: result.type || null,
      source: "openserp",
      extracted:
        result.extracted &&
        typeof result.extracted.content === "string"
          ? result.extracted.content.slice(0, 12000)
          : null,
    })),
  };
}

module.exports = {
  searchWithOpenSerp,
  searchWeb,
};