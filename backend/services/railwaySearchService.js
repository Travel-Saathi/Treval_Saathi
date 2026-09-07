/**
 * Trains-Between-Stations service.
 *
 * Sits between the Express route and the low-level provider:
 *
 *   route -> railwaySearchService -> railwaySearch provider
 *
 * Responsibilities:
 *   - validate / normalize station codes and journey date
 *   - call the provider (with limited retry/backoff)
 *   - parse the mNTES between-stations HTML into a stable JSON shape
 *   - cache normalized results in memory
 *   - surface predictable error codes to the route layer
 *
 * Nothing mNTES-specific leaks past this module. The provider returns raw
 * HTML; this module owns parsing/normalization.
 */

const {
  getBetweenStationsHtml,
  getStationListFile,
  RailwaySearchApiError,
} = require("../providers/railwaySearch");

/* --------------------------------------------------
   Configuration
-------------------------------------------------- */

const CACHE_TTL_MS = Number(
  process.env.RAILWAY_SEARCH_CACHE_TTL_MS || 180000
);

const MAX_CACHE_ENTRIES = 100;

const MAX_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 400;

const STATION_LIST_TTL_MS = Number(
  process.env.RAILWAY_STATION_LIST_TTL_MS || 86400000
);

/* --------------------------------------------------
   Errors
-------------------------------------------------- */

class InvalidSearchError extends Error {
  constructor(field, message) {
    super(message);
    this.name = "InvalidSearchError";
    this.field = field;
    this.code =
      field === "from" || field === "to"
        ? "INVALID_STATION"
        : "INVALID_DATE";
  }
}

class StationNotFoundError extends Error {
  constructor(field, raw) {
    super(
      `Could not map "${raw}" to an Indian Railways station`
    );
    this.name = "StationNotFoundError";
    this.field = field;
    this.raw = raw;
    this.code = "STATION_NOT_FOUND";
  }
}

/* --------------------------------------------------
   Validation / normalization
-------------------------------------------------- */

const STATION_PATTERN = /^[A-Z]{2,5}$/;

function normalizeStationCode(raw, field) {
  const value = String(raw == null ? "" : raw).trim().toUpperCase();

  if (!value) {
    throw new InvalidSearchError(field, `${field} is required`);
  }

  if (!STATION_PATTERN.test(value)) {
    throw new InvalidSearchError(
      field,
      `${field} must be a 2-5 letter station code (e.g. BPL)`
    );
  }

  return value;
}

const DATE_PATTERN = /^(\d{2})-(\d{2})-(\d{4})$/;
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function isValidCalendarDate(year, month, day) {
  const parsed = new Date(Date.UTC(year, month - 1, day));

  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

/**
 * Accept DD-MM-YYYY or YYYY-MM-DD, always return DD-MM-YYYY
 * (the canonical form expected by mNTES).
 */
function normalizeDate(raw) {
  const value = String(raw == null ? "" : raw).trim();

  if (!value) {
    throw new InvalidSearchError("date", "date is required");
  }

  const dmy = value.match(DATE_PATTERN);
  const iso = value.match(ISO_DATE_PATTERN);

  if (!dmy && !iso) {
    throw new InvalidSearchError(
      "date",
      "date must be in DD-MM-YYYY or YYYY-MM-DD format"
    );
  }

  const day = dmy ? Number(dmy[1]) : Number(iso[3]);
  const month = Number((dmy || iso)[2]);
  const year = dmy ? Number(dmy[3]) : Number(iso[1]);

  if (month < 1 || month > 12) {
    throw new InvalidSearchError("date", "Invalid date");
  }

  if (!isValidCalendarDate(year, month, day)) {
    throw new InvalidSearchError("date", "Invalid date");
  }

  return `${String(day).padStart(2, "0")}-${String(month).padStart(2, "0")}-${year}`;
}

/* --------------------------------------------------
   Station catalogue (name -> code resolution)
-------------------------------------------------- */

const stationListCache = {
  entries: null,
  expiresAt: 0,
};

function parseStationListFile(body) {
  const start = body.indexOf("[");
  const end = body.lastIndexOf("]");

  if (start < 0 || end <= start) {
    throw new RailwaySearchApiError(
      "RAILWAY_SEARCH_UNEXPECTED_RESPONSE",
      "Station list response did not contain an array"
    );
  }

  const parsed = JSON.parse(body.slice(start, end + 1));

  if (!Array.isArray(parsed)) {
    throw new RailwaySearchApiError(
      "RAILWAY_SEARCH_UNEXPECTED_RESPONSE",
      "Station list response was not a JSON array"
    );
  }

  return parsed
    .filter(
      (entry) =>
        entry &&
        typeof entry.code === "string" &&
        entry.code &&
        typeof entry.name === "string" &&
        entry.name
    )
    .map((entry) => ({
      code: entry.code.toUpperCase(),
      name: entry.name.toUpperCase(),
    }));
}

async function loadStationList() {
  if (
    stationListCache.entries &&
    stationListCache.expiresAt > Date.now()
  ) {
    return stationListCache.entries;
  }

  const file = await getStationListFile();

  const entries = parseStationListFile(file);

  stationListCache.entries = entries;
  stationListCache.expiresAt = Date.now() + STATION_LIST_TTL_MS;

  console.log(
    `[RailwaySearch] loaded ${entries.length} stations from mNTES catalogue`
  );

  return entries;
}

/**
 * Resolve user input to a station. Accepts a station code (BPL),
 * an exact station name (BHOPAL JN), a partial name (Bhopal), or a
 * name substring (jabal -> Jabalpur). Throws StationNotFoundError
 * when nothing matches. Returns { code, name }.
 *
 * Prefix matches are ranked so that "BHOPAL" prefers the main
 * "BHOPAL JN" over minor stations like "BHOPALKA".
 */
function resolveStation(entries, raw, field) {
  const trimmed = String(raw == null ? "" : raw).trim();

  if (!trimmed) {
    throw new InvalidSearchError(field, `${field} is required`);
  }

  const key = trimmed.toUpperCase();
  const isCodeLike = STATION_PATTERN.test(key);

  if (isCodeLike) {
    const byCode = entries.find((entry) => entry.code === key);

    if (byCode) return byCode;
  }

  const exactName = entries.find((entry) => entry.name === key);
  if (exactName) return exactName;

  const prefixMatches = entries.filter((entry) =>
    entry.name.startsWith(key)
  );

  if (prefixMatches.length) {
    const ranked = prefixMatches.slice().sort((first, second) => {
      const rank = (entry) => {
        if (entry.name.startsWith(`${key} `)) return 0;
        return 1;
      };
      return rank(first) - rank(second);
    });

    return ranked[0];
  }

  const token = key.replace(/\s+/g, "");
  const tokenMatch = entries.find((entry) =>
    entry.name.replace(/\s+/g, "").startsWith(token)
  );
  if (tokenMatch) return tokenMatch;

  const contains = entries.find((entry) => entry.name.includes(key));
  if (contains) return contains;

  throw new StationNotFoundError(field, trimmed);
}

/* --------------------------------------------------
   HTML parsing
-------------------------------------------------- */

function cleanText(value) {
  return String(value == null ? "" : value)
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x[0-9A-Fa-f]{2,6};/g, " ")
    .replace(/&#\d+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const ROW_PATTERN = /<tr class=" w3-round ">/gi;

const ROW_START_BORDER =
  'border-left:5px solid #eee;border-right:5px solid #eee;">';

function splitRows(html) {
  const matches = Array.from(html.matchAll(ROW_PATTERN));

  const rows = [];

  for (let index = 0; index < matches.length; index += 1) {
    const start = matches[index].index + matches[index][0].length;
    const end =
      index + 1 < matches.length
        ? matches[index + 1].index
        : html.length;

    rows.push(html.slice(start, end));
  }

  return rows;
}

/**
 * Parse header like: "63 Trains found from BPL- BHOPAL JN to NDLS"
 */
function parseResultHeader(html) {
  const match = html.match(/(\d+)\s*Trains? found from ([^<]+?) to ([^<]+)/i);

  if (!match) {
    return null;
  }

  return {
    count: Number(match[1]),
    fromRaw: cleanText(match[2]),
    toRaw: cleanText(match[3]),
  };
}

const RUNNING_DAYS = [
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
  "Sun",
];

function decodeRunningDays(raw) {
  const value = cleanText(raw);

  return RUNNING_DAYS.filter((day) =>
    new RegExp(`\\b${day}\\b`, "i").test(value)
  );
}

/**
 * Split "Thu,Sat | Superfast" style running/type lines.
 */

/**
 * Parse the "Thu,Sat | Superfast" running/type line.
 */
function parseRunLine(raw) {
  const value = cleanText(raw);

  const [runPart, type] = value
    .split("|")
    .map((part) => cleanText(part));

  if (!runPart || /^Daily$/i.test(runPart)) {
    return {
      runningDays: RUNNING_DAYS,
      isDaily: true,
      type: type || null,
    };
  }

  return {
    runningDays: decodeRunningDays(runPart),
    isDaily: false,
    type: type || null,
  };
}

/**
 * Parse the bottom "display:flex" segment: departure, duration, arrival.
 */
function parseTrainLeg(chunk) {
  const depTime = chunk.match(
    /text-align:\s*left;\s*width: 25%;"><b>([^<]*)<\/b><br>([^<]*)<br>([A-Z0-9]{2,5})/i
  );

  const durationMatch =
    chunk.match(/--(\d{1,2}):([0-5]\d)\s*Hrs?\.?--/i) ||
    chunk.match(/--(\d{1,2})\s*Hrs?\.?--/i);

  const arrTime = chunk.match(
    /text-align:\s*right;\s*width: 25%;"><b>([^<]*)<\/b><br>([^<]*)<br><b>([A-Z0-9]{2,5})<\/b>/i
  );

  let duration = null;

  if (durationMatch) {
    duration = durationMatch[2]
      ? `${durationMatch[1]}:${durationMatch[2]}`
      : `${durationMatch[1]}h 0m`;
  }

  return {
    departureTime: depTime ? cleanText(depTime[1]) : null,
    departureStation: depTime ? cleanText(depTime[2]) : null,
    departureCode: depTime ? depTime[3].toUpperCase() : null,
    duration,
    arrivalTime: arrTime ? cleanText(arrTime[1]) : null,
    arrivalStation: arrTime ? cleanText(arrTime[2]) : null,
    arrivalCode: arrTime ? arrTime[3].toUpperCase() : null,
  };
}

/**
 * Parse a single train row.
 */
function parseTrainRow(chunk) {
  const headMatch = chunk.match(
    /<span><b>(\d{5})<\/b>\s*&nbsp;&nbsp;([^<]+)<\/span><br>\s*<span>([^<]+)<\/span>/i
  );

  const leg = parseTrainLeg(chunk);

  if (!headMatch) {
    return null;
  }

  const run = parseRunLine(headMatch[3]);

  return {
    number: headMatch[1],
    name: cleanText(headMatch[2]),
    runningDays: run.runningDays,
    isDaily: run.isDaily,
    type: run.type,
    departure: leg.departureTime,
    departureStation: leg.departureStation,
    departureCode: leg.departureCode,
    arrival: leg.arrivalTime,
    arrivalStation: leg.arrivalStation,
    arrivalCode: leg.arrivalCode,
    duration: leg.duration,
  };
}

function parseBetweenStationsPage(html) {
  const header = parseResultHeader(html);

  const rows = splitRows(html)
    .map(parseTrainRow)
    .filter(Boolean);

  return { header, rows };
}

/* --------------------------------------------------
   Cache
-------------------------------------------------- */

const cache = new Map(); // key -> { expiresAt, value }

function cacheKey(fromCode, toCode) {
  return `${fromCode}:${toCode}`;
}

function cacheGet(key) {
  const entry = cache.get(key);

  if (!entry) return null;

  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }

  return entry.value;
}

function cacheSet(key, value) {
  if (cache.size >= MAX_CACHE_ENTRIES) {
    cache.clear();
  }

  cache.set(key, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    value,
  });
}

/* --------------------------------------------------
   Retry helper
-------------------------------------------------- */

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/* --------------------------------------------------
   Public helpers for the route layer
-------------------------------------------------- */

/**
 * Detect the "service currently unavailable" HTML sent by the mNTES
 * wrapper page (an HTTP 200 that carries an error box instead of a
 * result table). Missing result rows are not necessarily an error:
 * some valid pairs legitimately have no through trains.
 */
function isUnavailablePage(html) {
  return /un-available at the moment/i.test(html);
}

/* --------------------------------------------------
   Main lookup
-------------------------------------------------- */

/**
 * Fetch and normalize the trains between two stations.
 *
 * @param {object} args
 * @param {string} args.from station code or name (e.g. "BPL", "Bhopal")
 * @param {string} args.to   station code or name (e.g. "NDLS", "New Delhi")
 * @param {string} args.date journey date (DD-MM-YYYY or YYYY-MM-DD)
 * @returns {Promise<object>} normalized between-stations payload
 */
async function searchBetweenStations({ from, to, date }) {
  const normalizedDate = normalizeDate(date);

  let stations = null;

  try {
    stations = await loadStationList();
  } catch (error) {
    console.log(
      `[RailwaySearch] station list unavailable (${error.message}); falling back to code-only resolution`
    );
  }

  let fromLabel;
  let toLabel;

  if (stations) {
    fromLabel = resolveStation(stations, from, "from");
    toLabel = resolveStation(stations, to, "to");
  } else {
    fromLabel = {
      code: normalizeStationCode(from, "from"),
      name: normalizeStationCode(from, "from"),
    };
    toLabel = {
      code: normalizeStationCode(to, "to"),
      name: normalizeStationCode(to, "to"),
    };
  }

  if (fromLabel.code === toLabel.code) {
    throw new InvalidSearchError(
      "stations",
      "From and To stations cannot be the same"
    );
  }

  const key = cacheKey(fromLabel.code, toLabel.code);

  const cached = cacheGet(key);

  if (cached) {
    console.log(`[RailwaySearch] cache hit key=${key}`);
    return cached;
  }

  console.log(
    `[RailwaySearch] fetching from=${fromLabel.code} to=${toLabel.code} date=${normalizedDate}`
  );

  let html = null;
  let lastError = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    try {
      html = await getBetweenStationsHtml({
        from: fromLabel.code,
        to: toLabel.code,
      });
      break;
    } catch (error) {
      lastError = error;

      const isRetryable =
        error instanceof RailwaySearchApiError &&
        error.code === "RAILWAY_SEARCH_UNAVAILABLE";

      if (attempt + 1 < MAX_RETRIES && isRetryable) {
        const delay = RETRY_BASE_DELAY_MS * 2 ** attempt;

        console.log(
          `[RailwaySearch] attempt ${attempt + 1} failed, retrying in ${delay}ms: ${
            error.message
          }`
        );

        await sleep(delay);
      }
    }
  }

  if (!html) {
    throw lastError;
  }

  if (isUnavailablePage(html)) {
    throw new RailwaySearchApiError(
      "RAILWAY_SEARCH_UNAVAILABLE",
      "mNTES between-stations service is temporarily unavailable"
    );
  }

  const { header, rows } = parseBetweenStationsPage(html);

  const responseFrom = {
    code: fromLabel.code,
    name: fromLabel.name,
  };
  const responseTo = {
    code: toLabel.code,
    name: toLabel.name,
  };

  const payload = {
    success: true,
    source: "mNTES",
    from: responseFrom,
    to: responseTo,
    date: normalizedDate,
    count: rows.length,
    trains: rows.map((train) => ({
      number: train.number,
      name: train.name,
      from: {
        code: train.departureCode || fromLabel.code,
        name: train.departureStation || fromLabel.name,
      },
      to: {
        code: train.arrivalCode || toLabel.code,
        name: train.arrivalStation || toLabel.name,
      },
      departure: train.departure,
      arrival: train.arrival,
      duration: train.duration,
      runningDays: train.runningDays,
      isDaily: train.isDaily,
    })),
    fetchedAt: new Date().toISOString(),
  };

  cacheSet(key, payload);

  return payload;
}

/* --------------------------------------------------
   Error → HTTP mapping helpers
-------------------------------------------------- */

function statusCodeForError(error) {
  if (
    error instanceof InvalidSearchError ||
    error instanceof StationNotFoundError
  ) {
    return 400;
  }

  return 502;
}

function errorPayload(error) {
  if (error instanceof InvalidSearchError) {
    return {
      success: false,
      source: "mNTES",
      error: {
        code: error.code,
        message: error.message,
      },
    };
  }

  if (error instanceof StationNotFoundError) {
    return {
      success: false,
      source: "mNTES",
      error: {
        code: error.code,
        message: error.message,
      },
    };
  }

  if (error instanceof RailwaySearchApiError) {
    return {
      success: false,
      source: "mNTES",
      error: {
        code: "RAILWAY_SEARCH_UNAVAILABLE",
        message:
          error.code === "RAILWAY_SEARCH_UNEXPECTED_RESPONSE"
            ? "Unexpected response from the railway enquiry system."
            : "Live train search is temporarily unavailable.",
      },
    };
  }

  return {
    success: false,
    source: "mNTES",
    error: {
      code: "RAILWAY_SEARCH_UNAVAILABLE",
      message: "Live train search is temporarily unavailable.",
    },
  };
}

module.exports = {
  searchBetweenStations,
  InvalidSearchError,
  StationNotFoundError,
  RailwaySearchApiError,
  statusCodeForError,
  errorPayload,
};