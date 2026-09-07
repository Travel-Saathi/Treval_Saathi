/**
 * Trains-Between-Stations provider backed by mNTES (National Train
 * Enquiry System / mobile web).
 *
 * Reuses the same official Indian Railways enquiry flow as the live-status
 * provider (ntesRailway.js) but targets the Between-Stations screen:
 *
 *   1. GET  /mntes/                                     -> bootstrap session
 *   2. GET  /mntes/GetCSRFToken?t=<ms>                 -> dynamic CSRF name/value
 *   3. POST /mntes/q?opt=TrainsBetweenStation&subOpt=tbs
 *                -> HTML of trains between two stations
 *
 * The journey date is intentionally NOT sent as a date filter: mNTES returns
 * the between-stations result for the running cycle rather than a strict date
 * filter, and it rejects the date+full-name combination its own UI sends only
 * when an explicit "NAME- CODE" value is used. Using station codes alone is
 * what the live site responds to reliably.
 *
 * Recorded on-disk HTML is parsed in the railway-search service layer.
 */

const NTES_BASE_URL =
  process.env.NTES_BASE_URL ||
  "https://enquiry.indianrail.gov.in/mntes";

const NTES_ORIGIN = "https://enquiry.indianrail.gov.in";

const REQUEST_TIMEOUT_MS = Number(
  process.env.NTES_REQUEST_TIMEOUT_MS || 15000
);

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/120.0.0.0 Safari/537.36";

const TRAIN_SEARCH_MSG =
  "Live train search is temporarily unavailable.";

class RailwaySearchApiError extends Error {
  constructor(code, message, cause) {
    super(message);
    this.name = "RailwaySearchApiError";
    this.code = code;
    if (cause) this.cause = cause;
  }
}

function parseCookies(headers, jar) {
  let rawList;

  if (headers.getSetCookie) {
    rawList = headers.getSetCookie();
  } else {
    const combined = headers.get("set-cookie");
    rawList = combined ? [combined] : [];
  }

  for (const raw of rawList) {
    const firstPair = String(raw).split(";")[0];

    if (!firstPair) continue;

    const separator = firstPair.indexOf("=");

    if (separator <= 0) continue;

    jar.set(firstPair.slice(0, separator).trim(), firstPair.slice(separator + 1).trim());
  }
}

function cookieHeader(jar) {
  return Array.from(jar.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

async function fetchWithTimeout(url, options) {
  const controller = new AbortController();

  const timer = setTimeout(
    () => controller.abort(),
    REQUEST_TIMEOUT_MS
  );

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });

    const text = await response.text();

    return { response, text };
  } catch (error) {
    if (error && error.name === "AbortError") {
      throw new RailwaySearchApiError(
        "RAILWAY_SEARCH_UNAVAILABLE",
        `mNTES request timed out after ${REQUEST_TIMEOUT_MS}ms: ${url}`,
        error
      );
    }

    throw new RailwaySearchApiError(
      "RAILWAY_SEARCH_UNAVAILABLE",
      `Failed to reach mNTES: ${error && error.message ? error.message : String(error)}`,
      error
    );
  } finally {
    clearTimeout(timer);
  }
}

const CSRF_INPUT_PATTERN =
  /name\s*=\s*(['"])([^'"]+)\1\s+value\s*=\s*(['"])([^'"]+)\3/;

function extractCsrfToken(body) {
  const match = String(body).match(CSRF_INPUT_PATTERN);

  if (!match) {
    throw new RailwaySearchApiError(
      "RAILWAY_SEARCH_UNEXPECTED_RESPONSE",
      "CSRF token not found in mNTES token response"
    );
  }

  return { name: match[2], value: match[4] };
}

/**
 * Fetch the raw "Trains Between Stations" HTML for two station codes.
 *
 * @param {object} args
 * @param {string} args.from code (e.g. "BPL")
 * @param {string} args.to   code (e.g. "NDLS")
 * @returns {Promise<string>} raw HTML
 */
async function getBetweenStationsHtml({ from, to }) {
  const jar = new Map();

  const baseHeaders = {
    "User-Agent": USER_AGENT,
    Accept: "text/html, application/xhtml+xml, */*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    Referer: `${NTES_BASE_URL}/`,
  };

  /* Step A — bootstrap the session */
  const bootstrap = await fetchWithTimeout(`${NTES_BASE_URL}/`, {
    method: "GET",
    headers: baseHeaders,
  });

  if (!bootstrap.response.ok) {
    throw new RailwaySearchApiError(
      "RAILWAY_SEARCH_UNAVAILABLE",
      `mNTES bootstrap failed with HTTP ${bootstrap.response.status}`
    );
  }

  parseCookies(bootstrap.response.headers, jar);

  /* Step B — obtain the CSRF token */
  const tokenUrl = `${NTES_BASE_URL}/GetCSRFToken?t=${Date.now()}`;

  const token = await fetchWithTimeout(tokenUrl, {
    method: "GET",
    headers: {
      ...baseHeaders,
      "X-Requested-With": "XMLHttpRequest",
      Cookie: cookieHeader(jar),
    },
  });

  if (!token.response.ok) {
    throw new RailwaySearchApiError(
      "RAILWAY_SEARCH_UNAVAILABLE",
      `mNTES CSRF request failed with HTTP ${token.response.status}`
    );
  }

  parseCookies(token.response.headers, jar);

  const csrf = extractCsrfToken(token.text);

  /* Step C — request the between-stations result */
  const form = new URLSearchParams({
    lan: "en",
    jFromStationInput: from,
    jToStationInput: to,
    [csrf.name]: csrf.value,
  });

  const running = await fetchWithTimeout(
    `${NTES_BASE_URL}/q?opt=TrainsBetweenStation&subOpt=tbs`,
    {
      method: "POST",
      headers: {
        ...baseHeaders,
        "Content-Type":
          "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest",
        Origin: NTES_ORIGIN,
        Cookie: cookieHeader(jar),
      },
      body: form.toString(),
    }
  );

  if (!running.response.ok) {
    throw new RailwaySearchApiError(
      "RAILWAY_SEARCH_UNAVAILABLE",
      `mNTES between-stations request failed with HTTP ${running.response.status}`
    );
  }

  if (!running.text || running.text.trim().length === 0) {
    throw new RailwaySearchApiError(
      "RAILWAY_SEARCH_UNEXPECTED_RESPONSE",
      "mNTES returned an empty between-stations response"
    );
  }

  return running.text;
}

/**
 * Fetch the raw mNTES station catalogue JavaScript. Defines
 * `var arrStationList = [ { "code": "...", "name": "..." }, ... ];`.
 *
 * @returns {Promise<string>} raw station_data.js body
 */
async function getStationListFile() {
  const stationUrl = `${NTES_BASE_URL}/javascripts/station_data.js`;

  const response = await fetchWithTimeout(stationUrl, {
    method: "GET",
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/javascript, */*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      Referer: `${NTES_BASE_URL}/`,
    },
  });

  if (!response.response.ok) {
    throw new RailwaySearchApiError(
      "RAILWAY_SEARCH_UNAVAILABLE",
      `mNTES station list request failed with HTTP ${response.response.status}`
    );
  }

  if (!response.text || response.text.trim().length === 0) {
    throw new RailwaySearchApiError(
      "RAILWAY_SEARCH_UNEXPECTED_RESPONSE",
      "mNTES returned an empty station list"
    );
  }

  return response.text;
}

module.exports = {
  getBetweenStationsHtml,
  getStationListFile,
  RailwaySearchApiError,
  TRAIN_SEARCH_MSG,
  NTES_BASE_URL,
};