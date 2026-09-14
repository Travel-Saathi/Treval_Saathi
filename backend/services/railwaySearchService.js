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
 * Parse the departure and arrival blocks of a train row.
 *
 * mNTES renders these in "display:flex" spans. It is enough to parse
 * the first LEFT (departure) block and the first RIGHT (arrival) block
 * of the row, e.g.:
 *
 *   <span style="text-align: left;width: 25%;">
 *     <b>23:00</b><br>Bhopal Jn<br><b>BPL</b>
 *   </span>
 *
 * mNTES writes the station code with or without an inner <b> tag
 * (e.g. "<br><b>BPL</b>" vs "<br>BPL</b>"), depending on the row, so
 * both forms must be accepted. A leg whose station/time block is
 * missing or unreadable is reported as null fields - never guessed.
 */
const STATION_TIME_BLOCK_PATTERN =
  /<span style="text-align:\s*(left|right);\s*width:\s*25%;"><b>([^<]*)<\/b><br>([^<]*)<br>\s*(?:<b>)?([A-Z0-9]{2,5})<\/b?>\s*<\/span>/gi;

/**
 * Parse the bottom "display:flex" segment: departure, duration, arrival.
 */
function parseTrainLeg(chunk) {
  let departure = null;
  let arrival = null;

  for (const match of chunk.matchAll(STATION_TIME_BLOCK_PATTERN)) {
    const side = match[1].toLowerCase();
    const block = {
      time: cleanText(match[2]),
      station: cleanText(match[3]),
      code: match[4].toUpperCase(),
    };

    if (side === "left" && !departure) {
      departure = block;
    } else if (side === "right" && !arrival) {
      arrival = block;
    }
  }

  const durationMatch =
    chunk.match(/--(\d{1,2}):([0-5]\d)\s*Hrs?\.?--/i) ||
    chunk.match(/--(\d{1,2})\s*Hrs?\.?--/i);

  let duration = null;

  if (durationMatch) {
    duration = durationMatch[2]
      ? `${durationMatch[1]}:${durationMatch[2]}`
      : `${durationMatch[1]}h 0m`;
  }

  return {
    departureTime: departure ? departure.time : null,
    departureStation: departure ? departure.station : null,
    departureCode: departure ? departure.code : null,
    duration,
    arrivalTime: arrival ? arrival.time : null,
    arrivalStation: arrival ? arrival.station : null,
    arrivalCode: arrival ? arrival.code : null,
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
   Journey fit (date validity + route check)
-------------------------------------------------- */

/* INDEX_OF_WEEKDAY follows Date.prototype.getDay(): Sunday=0 .. Saturday=6 */
const INDEX_OF_WEEKDAY = [
  "Sun",
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
];

/**
 * Derive the weekday abbreviation (e.g. "Mon") for a DD-MM-YYYY date.
 * Returns null when the date cannot be interpreted.
 */
function weekdayForDate(dmy) {
  const [day, month, year] = String(dmy).split("-").map(Number);

  if (!day || !month || !year) {
    return null;
  }

  const date = new Date(Date.UTC(year, month - 1, day));

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return INDEX_OF_WEEKDAY[date.getUTCDay()];
}

/**
 * Render DD-MM-YYYY as YYYY-MM-DD (used in log lines).
 */
function toIsoDate(dmy) {
  const [day, month, year] = String(dmy).split("-");

  return `${year}-${month}-${day}`;
}

/**
 * Readable running-days label for logs ("Daily" for daily trains).
 */
function runningDaysToText(train) {
  if (train.isDaily === true) {
    return "Daily";
  }

  if (Array.isArray(train.runningDays) && train.runningDays.length > 0) {
    return train.runningDays.join(", ");
  }

  return "unavailable";
}

/**
 * Decide whether a train operates on the given weekday abbreviation.
 *
 * - Daily trains always operate.
 * - Otherwise the weekday must literally appear in runningDays.
 * - Missing or unparseable runningDays never implies the train runs.
 */
function trainOperatesOnDate(train, weekday) {
  if (train.isDaily === true) {
    return true;
  }

  const runningDays = Array.isArray(train.runningDays)
    ? train.runningDays
    : [];

  if (runningDays.length === 0) {
    return false;
  }

  return runningDays.includes(weekday);
}

/**
 * Convert a date to its full weekday name (e.g. "Monday").
 */
function weekdayFullName(dmy) {
  const weekday = weekdayForDate(dmy);

  if (!weekday) {
    return null;
  }

  const fullNames = {
    Sun: "Sunday",
    Mon: "Monday",
    Tue: "Tuesday",
    Wed: "Wednesday",
    Thu: "Thursday",
    Fri: "Friday",
    Sat: "Saturday",
  };

  return fullNames[weekday];
}

/**
 * Reason a train should be dropped because its direct/origin-destination
 * halts don't match the requested journey endpoints. The between-stations
 * response only carries the source-side and destination-side halts mNTES
 * renders for each train, so a train can only be validated when those halts
 * equal the requested endpoints exactly.
 *
 * Returns null (keep) or a human-readable reason (drop).
 */
function routeBlockReason(train, { fromCode, toCode, weekday }) {
  const from = String(fromCode || "").toUpperCase();
  const to = String(toCode || "").toUpperCase();
  const trainDep = String(train.departureCode || "").toUpperCase();
  const trainArr = String(train.arrivalCode || "").toUpperCase();

  if (!trainDep) {
    return "no departure halt";
  }

  if (!trainArr) {
    return "no arrival halt";
  }

  if (trainDep === from && trainArr === to) {
    return null;
  }

  if (train.runningDays && !trainOperatesOnDate(train, weekday)) {
    return `runs ${runningDaysToText(train)}`;
  }

  if (train.departureStation && train.arrivalStation) {
    return `route ${train.departureStation} -> ${train.arrivalStation} (not ${from} -> ${to})`;
  }

  return `route ${trainDep} -> ${trainArr} (not ${from} -> ${to})`;
}

/**
 * Filter parsed rows down to only trains that (a) serve the requested
 * journey endpoint pair exactly and (b) operate on the requested date.
 *
 * Trains whose departure/arrival halts deviate from the requested endpoints
 * are considered not validated for the leg and are dropped.
 * Date check: the selected date's weekday must appear in the runningDays
 * the parser actually extracted; daily trains always pass; missing or
 * uninterpretable runningDays never implies the train runs.
 *
 * Blocked trains are filtered out before the response payload is built, so
 * they are never returned or exposed.
 */
function filterTrainsForJourney(rows, { date, fromCode, toCode }) {
  const dateIso = toIsoDate(date);
  const weekday = weekdayForDate(date);
  const weekdayFull = weekdayFullName(date);

  console.log(`[RailwaySearch] Requested route: ${fromCode} -> ${toCode}`);
  console.log(`[RailwaySearch] Requested date: ${dateIso}`);
  console.log(`[RailwaySearch] Requested weekday: ${weekdayFull}`);

  const validRows = rows.filter((train) => {
    const reason = routeBlockReason(train, { fromCode, toCode, weekday });

    const routeOk = !reason;
    const dateOk = trainOperatesOnDate(train, weekday);

    console.log(
      `[RailwaySearch] Train ${train.number}${train.name ? ` ${train.name}` : ""}`.trim()
    );
    console.log(
      `[RailwaySearch]   Route match: ${routeOk ? "PASS" : "FAIL"} (${
        reason || `route ${fromCode} -> ${toCode}`
      })`
    );
    console.log(
      `[RailwaySearch]   Date match: ${dateOk ? "PASS" : "FAIL"} (runs ${runningDaysToText(train)})`
    );
    console.log(
      `[RailwaySearch]   Final: ${routeOk && dateOk ? "ALLOWED" : "BLOCKED"}`
    );

    return routeOk && dateOk;
  });

  console.log(
    `[RailwaySearch] ${fromCode} -> ${toCode} on ${dateIso}: ${rows.length} returned, ${validRows.length} valid`
  );

  return validRows;
}

/* --------------------------------------------------
   Cache
-------------------------------------------------- */

const cache = new Map(); // key -> { expiresAt, value }

function cacheKey(fromCode, toCode, date) {
  return `${fromCode}:${toCode}:${date}`;
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

  const key = cacheKey(fromLabel.code, toLabel.code, normalizedDate);

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

  /*
   * Only trains that genuinely serve the requested route on the
   * requested date may be returned. Route validity is exact
   * origin/destination equality (see routeBlockReason) and mNTES does not
   * apply a strict date filter - it reports the running cycle - so the
   * selected journey date is validated here using the running-day
   * information the parser actually extracted. A train whose halt pair or
   * operating days are not confirmed is discarded - never assumed valid.
   */
  const validTrains = filterTrainsForJourney(rows, {
    date: normalizedDate,
    fromCode: fromLabel.code,
    toCode: toLabel.code,
  });

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
    count: validTrains.length,
    trains: validTrains.map((train) => ({
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