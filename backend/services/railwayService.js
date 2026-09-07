/**
 * Railway live-status service.
 *
 * Sits between the Express route and the low-level mNTES provider:
 *
 *   route -> railwayService -> ntesRailway provider
 *
 * Responsibilities:
 *   - validate / normalize inputs (trainNo, DD-MM-YYYY date)
 *   - call the provider (with limited retry/backoff)
 *   - parse the mNTES running-status HTML into a stable JSON shape
 *   - cache normalized results in memory (no Redis, no DB)
 *   - surface predictable error codes to the route layer
 *
 * Nothing NTES-specific leaks past this module.
 */

const {
  getRunningStatusHtml,
  NtesApiError,
} = require("../providers/ntesRailway");

/* --------------------------------------------------
   Configuration
-------------------------------------------------- */

const CACHE_TTL_MS = Number(
  process.env.NTES_CACHE_TTL_MS || 180000
);

const MAX_CACHE_ENTRIES = 50;

const MAX_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 400;

/* --------------------------------------------------
   Errors
-------------------------------------------------- */

class InvalidInputError extends Error {
  constructor(field, message) {
    super(message);
    this.name = "InvalidInputError";
    this.field = field;
    this.code =
      field === "date" ? "INVALID_DATE" : "INVALID_TRAIN_NO";
  }
}

class TrainNotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = "TrainNotFoundError";
    this.code = "TRAIN_NOT_FOUND";
  }
}

/* --------------------------------------------------
   Validation / normalization
-------------------------------------------------- */

const TRAIN_NO_PATTERN = /^\d{5}$/;

function normalizeTrainNo(raw) {
  const value = String(raw == null ? "" : raw).trim();

  if (!value) {
    throw new InvalidInputError(
      "trainNo",
      "trainNo is required"
    );
  }

  if (!TRAIN_NO_PATTERN.test(value)) {
    throw new InvalidInputError(
      "trainNo",
      "trainNo must be a 5-digit train number"
    );
  }

  return value;
}

const MONTHS = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
];

const DATE_PATTERN = /^(\d{2})-(\d{2})-(\d{4})$/;

function normalizeDate(raw) {
  const value = String(raw == null ? "" : raw).trim();

  if (!value) {
    throw new InvalidInputError("date", "date is required");
  }

  const match = value.match(DATE_PATTERN);

  if (!match) {
    throw new InvalidInputError(
      "date",
      'date must be in DD-MM-YYYY format, e.g. 08-09-2026'
    );
  }

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);

  if (month < 1 || month > 12) {
    throw new InvalidInputError("date", "Invalid date");
  }

  // Normalize round-trips through Date.UTC so 31-Feb, 32-Jan etc all reject.
  const parsed = new Date(Date.UTC(year, month - 1, day));

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new InvalidInputError("date", "Invalid date");
  }

  const paneId =
    `train${match[1]}-${MONTHS[month - 1]}-${match[3]}`;

  return {
    date: value,
    paneId,
  };
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

function parseTrainHeader(html) {
  const match = html.match(
    /<h3>\s*(\d{5})\s*([^<]+)<\/h3>/i
  );

  if (!match) {
    return { number: null, name: null };
  }

  return {
    number: match[1],
    name: cleanText(match[2]),
  };
}

/* --------------------------------------------------
   Pane selection
-------------------------------------------------- */

/*
 * The running-status page contains one tab-pane per train instance
 * (per journey date), each with id="trainDD-mmm-yyyy". Only the pane
 * matching the requested journey date is parsed.
 */
function extractPane(html, paneId) {
  const marker = `id="${paneId}"`;

  const markerIndex = html.indexOf(marker);

  if (markerIndex < 0) return null;

  const paneStart = html.lastIndexOf("<div", markerIndex);

  const nextPaneIndex = html.indexOf('id="train', markerIndex + 1);

  let paneEnd = html.length;

  if (nextPaneIndex > 0) {
    const nextPaneStart = html.lastIndexOf("<div", nextPaneIndex);

    if (nextPaneStart > paneStart) {
      paneEnd = nextPaneStart;
    }
  }

  return html.slice(paneStart, paneEnd);
}

function extractPaneStatus(pane) {
  const match = pane.match(
    /<h[56][^>]*>\s*<b>([^<]+)<\/b>\s*<\/h[56]>/i
  );

  return match ? cleanText(match[1]) : null;
}

/* --------------------------------------------------
   Row splitting
-------------------------------------------------- */

const ROW_PATTERN =
  /class="\s*w3-card-2(?:\s+w3-sand)?\s+(stopRow|nonStopRow)([^"]*)"/gi;

function splitRows(pane) {
  const matches = Array.from(pane.matchAll(ROW_PATTERN));

  const rows = [];

  for (let index = 0; index < matches.length; index += 1) {
    const start = matches[index].index + matches[index][0].length;
    const end =
      index + 1 < matches.length
        ? matches[index + 1].index
        : pane.length;

    rows.push({
      kind: matches[index][1],
      isCurrent: /currentStation/.test(matches[index][2]),
      html: pane.slice(start, end),
    });
  }

  return rows;
}

/* --------------------------------------------------
   Field decoders
-------------------------------------------------- */

function decodeBadge(text) {
  const value = cleanText(text);

  if (/^on\s*time$/i.test(value)) {
    return { onTime: true, delay: null };
  }

  const lateMatch = value.match(
    /late\s*(?:by)?\s*(\d+)/i
  ) || value.match(/delay(?:ed)?\s*[: ]\s*(\d+)/i);

  if (lateMatch) {
    return { onTime: false, delay: Number(lateMatch[1]) };
  }

  return { onTime: null, delay: null };
}

function decodeTimeBlock(block) {
  if (!block) {
    return {
      scheduled: null,
      actual: null,
      onTime: null,
      delay: null,
    };
  }

  const scheduledMatch = block.match(
    /<b><font size="1">([^<]+)<\/font><\/b>/
  );

  const actualMatch = block.match(
    /<font size="1"[^>]*>\s*<b>([^<]+)<\/b>\s*<br>\s*<span class="w3-round w3-(?:green|red|orange)"[^>]*>([^<]+)<\/span>/
  );

  const badge = actualMatch ? decodeBadge(actualMatch[2]) : null;

  return {
    scheduled: scheduledMatch
      ? cleanText(scheduledMatch[1])
      : null,
    actual: actualMatch
      ? cleanText(actualMatch[1])
      : null,
    onTime: badge ? badge.onTime : null,
    delay: badge ? badge.delay : null,
  };
}

function parsePlatform(text) {
  const value = cleanText(text);

  if (!value) return null;

  const digits = value.match(/\d+/);

  return digits ? digits[0] : value;
}

/* --------------------------------------------------
   Stop row parser
-------------------------------------------------- */

function parseStopRow(chunk) {
  const result = {
    station: null,
    stationCode: null,
    distanceKm: null,
    scheduledArrival: null,
    actualArrival: null,
    scheduledDeparture: null,
    actualDeparture: null,
    delay: null,
    platform: null,
    onTime: null,
  };

  const trackIndex = chunk.indexOf('<div class="w3-bar-block');

  const arrivalBlock = chunk.slice(
    0,
    trackIndex >= 0 ? trackIndex : chunk.length
  );

  const arrival = decodeTimeBlock(arrivalBlock);

  result.scheduledArrival = arrival.scheduled;
  result.actualArrival = arrival.actual;

  /* ---------- station block ---------- */

  const stationIndex = chunk.indexOf("<span><font size=\"1\"><b>");

  const departureIndex = chunk.indexOf(
    "float:right;text-align:right;width:100px"
  );

  let stationBlock = "";

  if (stationIndex >= 0) {
    stationBlock = chunk.slice(
      stationIndex,
      departureIndex >= 0 ? departureIndex : chunk.length
    );
  }

  if (stationBlock) {
    const nameMatch = stationBlock.match(
      /<b>([^<]+)<\/b>\s*<br>/
    );

    if (nameMatch) {
      result.station = cleanText(nameMatch[1]);
    }

    const codeMatch = stationBlock.match(
      /<b>([A-Z0-9]{1,5})\s*<span class="w3-round w3-orange"[^>]*>PF/
    );

    if (codeMatch) {
      result.stationCode = codeMatch[1];
    }

    const platformMatch = stationBlock.match(
      /P\s*F\s*([^<]+)<\/span>/
    );

    if (platformMatch) {
      result.platform = parsePlatform(platformMatch[1]);
    }

    const kmMatch = stationBlock.match(
      /<b>(\d+?)<\/b>\s*KMs?/i
    );

    if (kmMatch) {
      result.distanceKm = Number(kmMatch[1]);
    }
  }

  /* ---------- departure block ---------- */

  let departureBlock = "";

  if (departureIndex >= 0) {
    const modalIndex = chunk.indexOf("<!-- Modal -->");

    departureBlock = chunk.slice(
      departureIndex,
      modalIndex >= 0 && modalIndex > departureIndex
        ? modalIndex
        : chunk.length
    );
  }

  const departure = decodeTimeBlock(departureBlock);

  result.scheduledDeparture = departure.scheduled;
  result.actualDeparture = departure.actual;

  result.onTime = departure.onTime ?? arrival.onTime;
  result.delay = departure.delay ?? arrival.delay;

  return result;
}

/* --------------------------------------------------
   Current-station row parser
-------------------------------------------------- */

function parseCurrentRow(chunk) {
  const result = {
    station: null,
    stationCode: null,
    distanceKm: null,
    updatedOn: null,
    event: null,
    nextStation: null,
    nextStationCode: null,
  };

  const updated = chunk.match(
    /Updated on<\/span>\s*<br>\s*<span><b>([^<]+)<\/b><\/span>/i
  );

  if (updated) {
    result.updatedOn = cleanText(updated[1]);
  }

  const nameCode = chunk.match(
    /<b>\s*([^<]+?)\s*-\s*([A-Z0-9]{2,5})\s*<\/b>/is
  );

  if (nameCode) {
    result.station = cleanText(nameCode[1]);
    result.stationCode = nameCode[2];
  }

  const km = chunk.match(/<b>(\d+?)<\/b>\s*KMs?/i);

  if (km) {
    result.distanceKm = Number(km[1]);
  }

  const event = chunk.match(
    /green_dot_blink[^>]*>\s*<font size="1" color="GREEN"><b>([^<]+)<\/b><\/font>/i
  );

  if (event) {
    result.event = cleanText(event[1]);
  }

  const upcoming = chunk.match(
    /Upcoming Station<\/header>\s*<div class="w3-container">\s*<font size="1">\s*([^<]+)/is
  );

  if (upcoming) {
    const text = cleanText(upcoming[1]);
    const codeMatch = text.match(/\(([A-Z0-9]{2,5})\)/);

    result.nextStation =
      text.replace(/\(.*\)/, "").trim() || null;
    result.nextStationCode = codeMatch ? codeMatch[1] : null;
  }

  return result;
}

/* --------------------------------------------------
   Page parsing
-------------------------------------------------- */

function parseRunningPage(html, { paneId, journeyDate }) {
  const train = parseTrainHeader(html);

  const pane = extractPane(html, paneId);

  if (!pane) {
    throw new TrainNotFoundError(
      `No running instance found for ${journeyDate}`
    );
  }

  const status = extractPaneStatus(pane);

  const rows = splitRows(pane);

  const stations = [];
  let currentStation = null;

  for (const row of rows) {
    if (row.isCurrent) {
      const parsed = parseCurrentRow(row.html);

      if (parsed.station) {
        currentStation = parsed;
      }
    }

    if (row.kind === "stopRow") {
      stations.push(parseStopRow(row.html));
    }
  }

  return {
    train,
    status,
    currentStation,
    stations,
  };
}

/* --------------------------------------------------
   Cache
-------------------------------------------------- */

const cache = new Map(); // key -> { expiresAt, value }

function cacheKey(trainNo, date) {
  return `${trainNo}:${date}`;
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
    const expired = Array.from(cache.entries()).filter(
      ([, entry]) => entry.expiresAt <= Date.now()
    );

    for (const [expiredKey] of expired) {
      cache.delete(expiredKey);
    }

    if (cache.size >= MAX_CACHE_ENTRIES) {
      const oldestKey = cache.keys().next().value;

      if (oldestKey !== undefined) {
        cache.delete(oldestKey);
      }
    }
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
   Main lookup
-------------------------------------------------- */

/**
 * Fetch and normalize the live running status for a train.
 *
 * @param {object} args
 * @param {string} args.trainNo raw train number
 * @param {string} args.date    raw journey date (DD-MM-YYYY)
 * @returns {Promise<object>} normalized live-status payload
 */
async function getLiveStatus({ trainNo, date }) {
  const normalizedTrainNo = normalizeTrainNo(trainNo);

  const { date: normalizedDate, paneId } = normalizeDate(date);

  const key = cacheKey(normalizedTrainNo, normalizedDate);

  const cached = cacheGet(key);

  if (cached) {
    console.log(
      `[Railway] cache hit key=${key}`
    );
    return cached;
  }

  console.log(
    `[Railway] fetching trainNo=${normalizedTrainNo} date=${normalizedDate}`
  );

  let html = null;
  let lastError = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    try {
      html = await getRunningStatusHtml({
        trainNo: normalizedTrainNo,
        date: normalizedDate,
      });
      break;
    } catch (error) {
      lastError = error;

      const isRetryable =
        error instanceof NtesApiError &&
        error.code === "NTES_UNAVAILABLE";

      if (attempt + 1 < MAX_RETRIES && isRetryable) {
        const delay =
          RETRY_BASE_DELAY_MS * 2 ** attempt;

        console.log(
          `[Railway] attempt ${attempt + 1} failed, retrying in ${delay}ms: ${
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

  const parsed = parseRunningPage(html, {
    paneId,
    journeyDate: normalizedDate,
  });

  const payload = {
    success: true,
    source: "mNTES",
    train: {
      number: parsed.train.number
        ? String(parsed.train.number)
        : normalizedTrainNo,
      name: parsed.train.name,
    },
    journeyDate: normalizedDate,
    currentStation: parsed.currentStation
      ? {
          name: parsed.currentStation.station,
          code: parsed.currentStation.stationCode,
          distanceKm: parsed.currentStation.distanceKm,
          updatedOn: parsed.currentStation.updatedOn,
          event: parsed.currentStation.event,
          nextStation: parsed.currentStation.nextStation
            ? {
                name: parsed.currentStation.nextStation,
                code: parsed.currentStation.nextStationCode,
              }
            : null,
        }
      : null,
    status: parsed.status,
    stations: parsed.stations.map((station) => ({
      station: station.station,
      stationCode: station.stationCode,
      distanceKm: station.distanceKm,
      scheduledArrival: station.scheduledArrival,
      actualArrival: station.actualArrival,
      scheduledDeparture: station.scheduledDeparture,
      actualDeparture: station.actualDeparture,
      delay: station.delay,
      platform: station.platform,
      onTime: station.onTime,
    })),
    fetchedAt: new Date().toISOString(),
  };

  cacheSet(key, payload);

  return payload;
}

/* --------------------------------------------------
   Error → HTTP mapping helper for the route layer
-------------------------------------------------- */

function statusCodeForError(error) {
  if (error instanceof InvalidInputError) return 400;

  if (error instanceof TrainNotFoundError) return 404;

  return 502;
}

function errorPayload(error) {
  if (error instanceof InvalidInputError) {
    return {
      success: false,
      source: "mNTES",
      error: {
        code: error.code,
        message: error.message,
      },
    };
  }

  if (error instanceof TrainNotFoundError) {
    return {
      success: false,
      source: "mNTES",
      error: {
        code: error.code,
        message: error.message,
      },
    };
  }

  if (error instanceof NtesApiError) {
    return {
      success: false,
      source: "mNTES",
      error: {
        code:
          error.code === "NTES_UNAVAILABLE"
            ? "NTES_UNAVAILABLE"
            : "NTES_PARSE_ERROR",
        message:
          error.code === "NTES_UNAVAILABLE"
            ? "Live railway information is temporarily unavailable."
            : "Unexpected response from the railway enquiry system.",
      },
    };
  }

  return {
    success: false,
    source: "mNTES",
    error: {
      code: "NTES_UNAVAILABLE",
      message: "Live railway information is temporarily unavailable.",
    },
  };
}

module.exports = {
  getLiveStatus,
  InvalidInputError,
  TrainNotFoundError,
  NtesApiError,
  statusCodeForError,
  errorPayload,
};