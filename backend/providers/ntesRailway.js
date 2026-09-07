/**
 * Low-level mNTES (National Train Enquiry System / mobile web) provider.
 *
 * Talks directly to the official Indian Railways mobile enquiry flow:
 *
 *   1. GET  /mntes/                     -> bootstrap session, capture cookies
 *   2. GET  /mntes/GetCSRFToken?t=<ms>  -> return token name/value (dynamic)
 *   3. POST /mntes/tr ...               -> train running status HTML
 *
 * All three requests share the session cookies. The token field name is
 * never hard-coded — it is discovered from the token endpoint response.
 *
 * This module only deals with the wire protocol and returns the raw HTML.
 * Parsing/normalization lives in the railway service layer.
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

/* --------------------------------------------------
   Errors
-------------------------------------------------- */

class NtesApiError extends Error {
  constructor(code, message, cause) {
    super(message);
    this.name = "NtesApiError";
    this.code = code;
    if (cause) this.cause = cause;
  }
}

/* --------------------------------------------------
   Session cookie jar
-------------------------------------------------- */

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

    const name = firstPair.slice(0, separator).trim();
    const value = firstPair.slice(separator + 1).trim();

    jar.set(name, value);
  }
}

function cookieHeader(jar) {
  return Array.from(jar.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

/* --------------------------------------------------
   Request helper with timeout
-------------------------------------------------- */

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
      throw new NtesApiError(
        "NTES_UNAVAILABLE",
        `mNTES request timed out after ${REQUEST_TIMEOUT_MS}ms: ${url}`,
        error
      );
    }

    throw new NtesApiError(
      "NTES_UNAVAILABLE",
      `Failed to reach mNTES: ${error && error.message ? error.message : String(error)}`,
      error
    );
  } finally {
    clearTimeout(timer);
  }
}

/* --------------------------------------------------
   CSRF token discovery
-------------------------------------------------- */

/*
 * The token endpoint returns a hidden input, e.g.:
 *   <input type="hidden" name="-jccuhgohrgjl1788811394"
 *                          value="uYZiNweUFSd5sYqkP1iB5">
 * The field name is dynamic and must be extracted, never assumed.
 */
const CSRF_INPUT_PATTERN =
  /name\s*=\s*(['"])([^'"]+)\1\s+value\s*=\s*(['"])([^'"]+)\3/;

function extractCsrfToken(body) {
  const match = String(body).match(CSRF_INPUT_PATTERN);

  if (!match) {
    throw new NtesApiError(
      "NTES_UNEXPECTED_RESPONSE",
      "CSRF token not found in mNTES token response"
    );
  }

  return { name: match[2], value: match[4] };
}

/* --------------------------------------------------
   Public: fetch the train running status HTML
-------------------------------------------------- */

/**
 * Run the three-step mNTES flow and return the raw running-status HTML.
 *
 * @param {object} args
 * @param {string} args.trainNo 5-digit train number
 * @param {string} args.date    journey date in DD-MM-YYYY format
 * @returns {Promise<string>} raw HTML
 */
async function getRunningStatusHtml({ trainNo, date }) {
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
    throw new NtesApiError(
      "NTES_UNAVAILABLE",
      `mNTES bootstrap failed with HTTP ${bootstrap.response.status}`
    );
  }

  parseCookies(bootstrap.response.headers, jar);

  /* Step B — obtain the CSRF token */
  const tokenUrl =
    `${NTES_BASE_URL}/GetCSRFToken?t=${Date.now()}`;

  const token = await fetchWithTimeout(tokenUrl, {
    method: "GET",
    headers: {
      ...baseHeaders,
      "X-Requested-With": "XMLHttpRequest",
      Cookie: cookieHeader(jar),
    },
  });

  if (!token.response.ok) {
    throw new NtesApiError(
      "NTES_UNAVAILABLE",
      `mNTES CSRF request failed with HTTP ${token.response.status}`
    );
  }

  parseCookies(token.response.headers, jar);

  const csrf = extractCsrfToken(token.text);

  /* Step C — request the train running status */
  const params = new URLSearchParams({
    opt: "TrainRunning",
    subOpt: "FindRunningInstance",
    refDate: date,
  });

  const form = new URLSearchParams({
    lan: "en",
    jDate: date,
    trainNo,
    [csrf.name]: csrf.value,
  });

  const running = await fetchWithTimeout(
    `${NTES_BASE_URL}/tr?${params.toString()}`,
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
    throw new NtesApiError(
      "NTES_UNAVAILABLE",
      `mNTES running-status request failed with HTTP ${running.response.status}`
    );
  }

  if (!running.text || running.text.trim().length === 0) {
    throw new NtesApiError(
      "NTES_UNEXPECTED_RESPONSE",
      "mNTES returned an empty running-status response"
    );
  }

  return running.text;
}

module.exports = {
  getRunningStatusHtml,
  NtesApiError,
  NTES_BASE_URL,
};