const {
  searchWeb: searchWithSerper,
} = require("./serperService");

const {
  searchWeb: searchWithOpenSerp,
} = require("./openserpService");

const SUPPORTED_PROVIDERS = ["openserp", "serper"];

/**
 * OpenSERP is the default provider because it is self-hosted and free.
 * Serper is used only when explicitly configured (WEB_SEARCH_PROVIDER)
 * or as the automatic fallback when the primary provider fails.
 */
const primaryProvider = (
  process.env.WEB_SEARCH_PROVIDER || "openserp"
).toLowerCase();

const configuredFallback = (
  process.env.WEB_SEARCH_FALLBACK_PROVIDER || ""
).toLowerCase();

const fallbackProvider = SUPPORTED_PROVIDERS.find(
  (name) => name !== primaryProvider && name !== configuredFallback
) || configuredFallback;

/*
 * Google-backed providers rate-limit bursts of concurrent requests, so web
 * searches are serialized through a shared concurrency gate. Every provider
 * call in the whole backend funnels through the same limiter: a trip screen
 * that fires several discovery/fact requests at once no longer produces a
 * burst of simultaneous upstream requests.
 */
const SEMAPHORE_CONCURRENCY = clampInt(
  process.env.WEB_SEARCH_CONCURRENCY,
  1,
  8,
  1
);

const REQUESTS_MIN_GAP_MS = clampInt(
  process.env.WEB_SEARCH_MIN_GAP_MS,
  1000,
  5000,
  1500
);

const CACHE_TTL_MS = clampInt(
  process.env.WEB_SEARCH_CACHE_TTL_MS,
  60 * 1000,
  24 * 60 * 60 * 1000,
  60 * 60 * 1000
);

const CACHE_MAX_ENTRIES = clampInt(
  process.env.WEB_SEARCH_CACHE_MAX_ENTRIES,
  10,
  5000,
  500
);

const RATE_LIMIT_COOLDOWN_MS = clampInt(
  process.env.WEB_SEARCH_RATE_LIMIT_COOLDOWN_MS,
  5000,
  10 * 60 * 1000,
  30 * 1000
);

/* --------------------------------------------------
   Simple semaphore (default concurrency 1)
-------------------------------------------------- */

class Semaphore {
  constructor(limit) {
    this.limit = limit;
    this.active = 0;
    this.waiters = [];
  }

  async acquire() {
    while (this.active >= this.limit) {
      await new Promise((resolve) => this.waiters.push(resolve));
    }

    this.active += 1;
  }

  release() {
    this.active -= 1;

    const next = this.waiters.shift();

    if (next) {
      next();
    }
  }
}

const semaphore = new Semaphore(SEMAPHORE_CONCURRENCY);

/* --------------------------------------------------
   Result cache (1h TTL; cached results never hit OpenSERP)
-------------------------------------------------- */

const cache = new Map();

function clampInt(value, min, max, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, parsed));
}

function normalizeCacheKey(query, options) {
  const engine = options.engine || "google";
  const num = Number.parseInt(String(options.num ?? 10), 10);
  const extract = Number.parseInt(String(options.extract ?? "0"), 10);

  const text = String(query || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

  return `${engine}/${Number.isFinite(num) ? num : 10}/${
    Number.isFinite(extract) ? extract : 0
  }/${text}`;
}

function getCached(key) {
  const entry = cache.get(key);

  if (!entry) {
    return null;
  }

  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }

  return entry.payload;
}

function setCached(key, payload) {
  while (cache.size >= CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next().value;

    if (oldest === undefined) break;
    cache.delete(oldest);
  }

  cache.set(key, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    payload,
  });
}

function clearWebSearchCache() {
  cache.clear();
}

function clonePayload(payload) {
  return {
    query: payload.query,
    count: payload.count,
    results: (payload.results || []).map((result) => ({
      ...result,
    })),
  };
}

/* --------------------------------------------------
   Pacing + rate-limit cooldown state
-------------------------------------------------- */

let lastProviderCallAt = 0;
const providerCooldowns = new Map();

async function enforceMinGap() {
  const elapsed = Date.now() - lastProviderCallAt;

  if (elapsed < REQUESTS_MIN_GAP_MS) {
    const waitMs = REQUESTS_MIN_GAP_MS - elapsed;

    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }

  lastProviderCallAt = Date.now();
}

function isCoolingDown(provider) {
  const until = providerCooldowns.get(provider);

  return typeof until === "number" && until > Date.now();
}

function markRateLimited(provider) {
  providerCooldowns.set(provider, Date.now() + RATE_LIMIT_COOLDOWN_MS);

  console.warn(
    `[WebSearch] provider "${provider}" rate limited; backing off for ${Math.round(
      RATE_LIMIT_COOLDOWN_MS / 1000
    )}s`
  );
}

/* --------------------------------------------------
   Search
-------------------------------------------------- */

/**
 * Provider-independent web search with automatic fallback.
 *
 * Supported providers:
 * - openserp (default)
 * - serper
 *
 * Calls are serialized behind a shared concurrency gate (default 1) with a
 * small pacing gap so Google-backed providers are never hit with a burst of
 * simultaneous requests. Successful results are cached (1h) and a cache hit
 * never reaches a provider (e.g. OpenSERP).
 *
 * A provider that returns HTTP 429/503 is put on a short cooldown and is
 * skipped by later calls; it is never retried aggressively. When every
 * provider fails the service throws a clean, provider-neutral error — HTTP
 * statuses and provider names are never surfaced to callers.
 */
async function searchWeb(query, options = {}) {
  const cacheKey = normalizeCacheKey(query, options);

  const cached = getCached(cacheKey);

  if (cached) {
    return clonePayload(cached);
  }

  await semaphore.acquire();

  try {
    const afterWait = getCached(cacheKey);

    if (afterWait) {
      return clonePayload(afterWait);
    }

    const errors = [];

    for (const provider of [primaryProvider, fallbackProvider]) {
      if (isCoolingDown(provider)) {
        errors.push(`${provider}: rate limited (cooling down)`);
        continue;
      }

      try {
        await enforceMinGap();

        const raw = await callProvider(provider, query, options);

        if (raw && Array.isArray(raw.results)) {
          const normalized = normalizeResults(raw);

          setCached(cacheKey, normalized);

          return normalized;
        }
      } catch (error) {
        const rateLimited =
          error &&
          (error.code === "rate-limited" ||
            /429|rate limit|too many requests/i.test(error.message || ""));

        if (rateLimited) {
          markRateLimited(provider);
        }

        errors.push(`${provider}: ${rateLimited ? "rate limited" : "unavailable"}`);

        console.warn(
          `[WebSearch] provider "${provider}" failed${rateLimited ? " (rate limited)" : ""}: ${
            error.message
          }`
        );
      }
    }

    /*
     * Provider-neutral failure. Upstream statuses, provider names and error
     * bodies never reach callers; per-provider detail stays in server logs.
     */
    const rateLimited = errors.some((message) =>
      message.includes("rate limited")
    );

    const failure = new Error(
      rateLimited
        ? "Web search is temporarily unavailable. Please try again shortly."
        : "Web search is unavailable."
    );

    if (rateLimited) {
      failure.code = "rate-limited";
    }

    throw failure;
  } finally {
    semaphore.release();
  }
}

async function callProvider(provider, query, options) {
  switch (provider) {
    case "serper":
      return searchWithSerper(query, options);

    case "openserp":
      return searchWithOpenSerp(query, options);

    default:
      throw new Error(
        `Unsupported web search provider: ${provider}`
      );
  }
}

/**
 * Normalize provider results into a provider-neutral shape. Provider
 * names, server URLs and implementation details never leave the
 * service layer.
 */
function normalizeResults(raw) {
  const results = (raw.results || []).map((result) => ({
    title: result.title || null,
    description: result.snippet || result.description || null,
    website: result.link || result.website || result.url || null,
    rating: result.rating || null,
    ratingCount: result.ratingCount || null,
    date: result.date || null,
    type: result.type || null,
    extracted: result.extracted || null,
  }));

  return {
    query: raw.query || null,
    count: results.length,
    results,
  };
}

module.exports = {
  searchWeb,
  primaryProvider,
  fallbackProvider,
  clearWebSearchCache,
};