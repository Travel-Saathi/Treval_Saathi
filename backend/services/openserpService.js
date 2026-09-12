const DEFAULT_OPEN_SERP_BASE_URL = "http://127.0.0.1:7000";

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

  const url = `${baseUrl}/${engine}/search?${params.toString()}`;

  const response = await fetch(url);

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
}

/**
 * General-purpose OpenSERP web search.
 *
 * Converts OpenSERP's results into the same format
 * currently returned by Serper.
 */
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
      source: "openserp",
    })),
  };
}

module.exports = {
  searchWithOpenSerp,
  searchWeb,
};