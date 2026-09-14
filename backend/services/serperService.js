const SERPER_API_URL = "https://google.serper.dev/search";

/*
 * Serper calls must never hang the backend: abort if the upstream does not
 * respond. Default is 8s; override with SERPER_REQUEST_TIMEOUT_MS.
 */
const SERPER_REQUEST_TIMEOUT_MS = clampTimeout(
  process.env.SERPER_REQUEST_TIMEOUT_MS,
  8000
);

function clampTimeout(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);

  if (!Number.isFinite(parsed) || parsed < 1000) {
    return fallback;
  }

  return parsed;
}

async function searchWithSerper(query, options = {}) {
  if (!process.env.SERPER_API_KEY) {
    throw new Error("SERPER_API_KEY is not configured");
  }

  if (!query || !String(query).trim()) {
    throw new Error("Search query is required");
  }

  const controller = new AbortController();

  const timer = setTimeout(
    () => controller.abort(),
    SERPER_REQUEST_TIMEOUT_MS
  );

  try {
    const response = await fetch(SERPER_API_URL, {
      method: "POST",
      headers: {
        "X-API-KEY": process.env.SERPER_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        q: String(query).trim(),
        gl: options.gl || "in",
        hl: options.hl || "en",
        num: options.num || 10,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();

      const error = new Error(
        `Serper API error ${response.status}: ${errorText}`
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

/**
 * General-purpose Serper web search.
 */
async function searchWeb(query, options = {}) {
  const data = await searchWithSerper(query, options);

  return {
    query,
    source: "serper",
    count: (data.organic || []).length,

    results: (data.organic || []).map((result) => ({
      title: result.title || null,
      link: result.link || null,
      snippet: result.snippet || null,
      date: result.date || null,
      source: "serper",
    })),
  };
}

/**
 * Existing bus search.
 * Kept for backward compatibility.
 */
async function searchBusRoutes(from, to) {
  if (!from || !to) {
    throw new Error("from and to are required");
  }

  const query = `"${String(from).trim()}" to "${String(to).trim()}" bus`;

  const search = await searchWeb(query);

  return search.results;
}

module.exports = {
  searchWithSerper,
  searchWeb,
  searchBusRoutes,
};