/**
 * Bus search service.
 *
 * Sits behind the provider abstraction (webSearchService) so the route layer
 * never knows whether results came from OpenSERP or Serper. OpenSERP is a
 * search/discovery layer, NOT a bus booking API, so raw search results are
 * never surfaced as buses:
 *
 *   1. validate the route
 *   2. build route-specific queries ("Bhopal to Jaipur bus", ...)
 *   3. call the existing provider-independent searchWeb()
 *   4. combine + deduplicate raw results across queries
 *   5. filter out non-bus content (ads, hotels, flights, trains, guides...)
 *   6. extract bus fields from snippets AND from OpenSERP `extract`ed page
 *      content when available
 *   7. normalize into the frontend bus shape
 *   8. deduplicate identical buses
 *
 * Nothing is invented: fields that cannot be reliably extracted stay `null`.
 * Source URLs are preserved so information can be traced back.
 */

const {
  searchWeb,
} = require("./webSearchService");

/* --------------------------------------------------
   Tunables (all optional via environment)
-------------------------------------------------- */

const BUS_SEARCH_ENGINE = (
  process.env.OPEN_SERP_ENGINE || "bing"
).toLowerCase();

const SERP_REGION = process.env.BUS_SEARCH_REGION || "IN";
const SERP_LANG = process.env.BUS_SEARCH_LANG || "EN";

/*
 * OpenSERP can embed fetched page content in the search response
 * (extract=N fetches the top N results). Extracting page content yields
 * real schedules/fares; without it we rely on snippet text only.
 */
const BUS_SEARCH_EXTRACT = clampInt(
  process.env.BUS_SEARCH_EXTRACT,
  0,
  3,
  2
);

const DEFAULT_NUM = clampInt(
  process.env.BUS_SEARCH_NUM,
  3,
  20,
  8
);

const MAX_BUSES = clampInt(
  process.env.BUS_SEARCH_MAX_RESULTS,
  1,
  20,
  8
);

function clampInt(value, min, max, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, parsed));
}

/* --------------------------------------------------
   Domain hints & keyword heuristics
-------------------------------------------------- */

const BUS_DOMAIN_HINTS = [
  "redbus",
  "abhibus",
  "makemytrip",
  "goibibo",
  "yatra.com",
  "ixigo",
  "railyatri",
  "easemytrip",
  "paytm",
  "intrcity",
  "zingbus",
  "ticketroutes",
  "busindia",
  "travels",
];

const BUS_RE =
  /\b(bus|buses|travels?|sleeper|seater|volvo|scania|mercedes|benz|deluxe|luxury|semi[- ]?sleeper|boarding|dropping|depot)\b/i;

const STRUCTURED_INFO_RE =
  /\b(?:₹|rs\.?|fare|price|timings?|schedule|departs?|arrives?|boarding|dropping|duration|seats?|operators?|distance)\b/i;

const REJECT_RE =
  /\b(hotel|hotels|flight|flights|airline|airlines|indigo|vistara|spicejet|air india|train|trains|railway|rails?|restaurant|restaurants|cafe|cafes|temple|temples|mandir|fort|palace|palaces|tourist|itinerary|itineraries|attraction|attractions|resort|resorts|museum|garden|gardens|weather|hiking|trek|accident|crash|killed|overturn|flex|injunction)\b/i;

const REDIRECT_URL_RE =
  /(bing\.com\/aclk|duckduckgo\.com\/y\.js|google\.(?:com|co\.in)\/url|ecosia\.org\/redirect|yandex\.com\/clck|googleadservices)/i;

/* Common city aliases so "New Delhi" matches "Delhi" in snippets. */
const CITY_ALIASES = {
  "new delhi": ["delhi"],
  delhi: ["new delhi"],
  bengaluru: ["bangalore"],
  bangalore: ["bengaluru"],
  mumbai: ["bombay"],
  bombay: ["mumbai"],
  "nagpur": ["nagpur"],
};

/* --------------------------------------------------
   Search-query construction
-------------------------------------------------- */

function buildQueries(from, to) {
  return [
    { text: `${from} to ${to} bus` },
    {
      text: `${from} ${to} bus timings fare`,
      extract: BUS_SEARCH_EXTRACT,
    },
    { text: `${from} to ${to} bus booking` },
  ];
}

/* --------------------------------------------------
   Relevance / bus-only filtering
-------------------------------------------------- */

function cityForms(name) {
  const lower = String(name || "").trim().toLowerCase();

  return [lower, ...(CITY_ALIASES[lower] || [])].filter(Boolean);
}

function matchesRoute(text, from, to) {
  const lower = String(text || "").toLowerCase();
  const fromForms = cityForms(from);
  const toForms = cityForms(to);

  const fromHit = fromForms.some((form) => lower.includes(form));
  const toHit = toForms.some((form) => lower.includes(form));

  return fromHit && toHit;
}

function assessRelevance(result, from, to) {
  const title = String(result.title || "");
  const description = String(result.description || "");
  const website = String(result.website || "").toLowerCase();
  const text = `${title} ${description}`;

  if (result.type === "ad" || REDIRECT_URL_RE.test(website)) {
    return { ok: false, score: 0 };
  }

  if (REJECT_RE.test(text)) {
    return { ok: false, score: 0 };
  }

  const busWord = BUS_RE.test(text);
  const domainHint = BUS_DOMAIN_HINTS.some((hint) =>
    website.includes(hint)
  );
  const infoHint = STRUCTURED_INFO_RE.test(text);
  const routeTitle = matchesRoute(title, from, to);
  const routeText = matchesRoute(text, from, to);

  let score = 0;

  if (domainHint) score += 4;
  if (busWord) score += 2;
  if (infoHint) score += 1;
  if (routeTitle) score += 2;
  else if (routeText) score += 1;

  if (!busWord && !domainHint) {
    return { ok: false, score: 0 };
  }

  if (!routeTitle && !routeText) {
    return { ok: false, score: 0 };
  }

  if (score < 3) {
    return { ok: false, score };
  }

  return { ok: true, score };
}

/* --------------------------------------------------
   Field extraction helpers
-------------------------------------------------- */

/*
 * Fare extraction is deliberately conservative: a number is reported only when
 * it is clearly labeled as a ticket price/fare (e.g. "starting from ₹756",
 * "Fare: ₹849", "₹849 onwards"). A bare amount inside a snippet/page body —
 * often a voucher, cashback or "Off" offer — is never presented as a fare.
 */
function parseFare(text) {
  const safe = String(text || "");
  const currency = "(?:\u20B9|Rs\\.?|INR)";
  const number = "(\\d[\\d,]*(?:\\.\\d{1,2})?)";

  const rules = [
    new RegExp(
      `\\b(?:fare|ticket\\s+price|min(?:imum)?\\s+fare|bus\\s+fare)\\s*[:=]?\\s*${currency}\\s*${number}`,
      "i"
    ),
    new RegExp(
      `\\b(?:starting|starts?)\\s+(?:at|from)\\s+${currency}\\s*${number}`,
      "i"
    ),
    new RegExp(`\\btickets?\\s+(?:from|starting\\s+at)\\s+${currency}\\s*${number}`, "i"),
    new RegExp(`\\b(?:from|just|only)\\s+${currency}\\s*${number}`, "i"),
    new RegExp(`\\b${currency}\\s*${number}\\s+(?:onwards|only)(?!\\s*off)`, "i"),
    new RegExp(`\\b${currency}\\s*${number}\\s+to\\s+${currency}\\s*\\d[\\d,]*`, "i"),
    new RegExp(`\\b${number}(?:\\.\\d{1,2})?\\s*(?:INR|Rs\\.?)\\s+(?:onwards|to|for)`, "i"),
  ];

  for (const rule of rules) {
    const match = safe.match(rule);

    if (match) {
      return `₹${match[1].replace(/\.0+$/, "")}`;
    }
  }

  return null;
}

function normalizeTime(value) {
  const cleaned = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s*(HRS|HOURS?)\s*$/i, "");

  return cleaned || null;
}

/*
 * Extract a departure/arrival pair. `strict` is used for page-extracted text
 * where several operators may be listed: only anchored or explicit pair
 * patterns are trusted there, and the two times must sit close together so we
 * never pair one bus's departure with another bus's arrival.
 */
function parseTimes(text, strict = false) {
  const upper = String(text || "").toUpperCase();

  const depRe =
    /\b(?:DEPART(?:URE|S)?|BOARDING|STARTS?(?:\s+AT)?|PICKUP(?:\s+POINT)?|LEAVES?)\s*[:\-–—]?\s*(?:AT\s+)?((?:[01]?\d|2[0-3]):[0-5]\d|\d{1,2}\s*(?:AM|PM))\b/i;

  const arrRe =
    /\b(?:ARRIV(?:E|AL)?|DROPPING|DROPS?|REACH(?:ES)?)\s*[:\-–—]?\s*(?:AT\s+)?((?:[01]?\d|2[0-3]):[0-5]\d|\d{1,2}\s*(?:AM|PM))\b/i;

  const dep = upper.match(depRe);
  const arr = upper.match(arrRe);

  const ANCHOR_WINDOW = 320;

  if (dep && arr) {
    if (arr.index - dep.index <= ANCHOR_WINDOW) {
      return {
        departure: normalizeTime(dep[1]),
        arrival: normalizeTime(arr[1]),
      };
    }
  } else if (dep || arr) {
    return {
      departure: dep ? normalizeTime(dep[1]) : null,
      arrival: arr ? normalizeTime(arr[1]) : null,
    };
  }

  const pairRe =
    /((?:[01]?\d|2[0-3]):[0-5]\d|\d{1,2}\s*(?:AM|PM))\s*(?:[→–—-]|->|\bTO\b)\s*((?:[01]?\d|2[0-3]):[0-5]\d|\d{1,2}\s*(?:AM|PM))/i;

  const pair = upper.match(pairRe);

  if (pair) {
    return {
      departure: normalizeTime(pair[1]),
      arrival: normalizeTime(pair[2]),
    };
  }

  /* Loose fallbacks are fine for a curated snippet, not for page body. */
  if (strict) {
    return { departure: null, arrival: null };
  }

  const tokenRe =
    /\b((?:[01]?\d|2[0-3]):[0-5]\d(?:\s*(?:AM|PM))?|\d{1,2}\s*(?:AM|PM))\b/g;

  const times = [];
  let match;

  while ((match = tokenRe.exec(upper)) !== null) {
    times.push({ value: match[1], index: match.index });

    if (
      times.length >= 2 &&
      times[1].index - times[0].index <= 300
    ) {
      break;
    }
  }

  if (times.length >= 2 && times[1].index - times[0].index <= 300) {
    return {
      departure: normalizeTime(times[0].value),
      arrival: normalizeTime(times[1].value),
    };
  }

  if (times.length >= 1) {
    return { departure: normalizeTime(times[0].value), arrival: null };
  }

  return { departure: null, arrival: null };
}

const DURATION_LABEL =
  "(?:duration|travel\\s+time|journey\\s+(?:duration|time|is|of|takes?)|approx(?:imately)?|around|about|takes?\\s+around)\\s*[:\\-–—]?\\s*(?:about\\s+)?";

function buildDurationValue(hoursText, minutesText) {
  const hours = Number.parseInt(hoursText || "0", 10);
  const minutes = minutesText
    ? Number.parseInt(minutesText, 10)
    : 0;

  /*
   * Intercity buses are longer than an hour; anything above 48h is a
   * misparse of another number on the page. Never report those.
   */
  if (hours < 1 || hours > 48) {
    return null;
  }

  if (minutes > 0) {
    return `${hours}h ${minutes}m`;
  }

  return `${hours}h`;
}

function parseDuration(text, strict = false) {
  const safe = String(text || "");

  const labeledRe = new RegExp(
    `\\b${DURATION_LABEL}(\\d{1,2})\\s*(?:hrs?|hours?|h)\\b(?:(?:\\s*(?:and|,)?\\s*)(\\d{1,2})\\s*(?:mins?|minutes?|m)\\b)?`,
    "i"
  );

  const labeled = safe.match(labeledRe);

  if (labeled) {
    return buildDurationValue(labeled[1], labeled[2]);
  }

  /*
   * In page-extracted body text a bare "X hours" is unreliable, so only labeled
   * durations are trusted there. Curated snippets may still use the plain form
   * (never "… hours ago", which is a search-engine timestamp).
   */
  if (!strict) {
    const plainRe =
      /\b(\d{1,2})\s*(?:hrs?|hours?|h)\b(?:(?:\s*(?:and|,)?\s*)(\d{1,2})\s*(?:mins?|minutes?|m)\b)?(?!\s*ago)/i;

    const plain = safe.match(plainRe);

    if (plain) {
      return buildDurationValue(plain[1], plain[2]);
    }
  }

  return null;
}

function parseAvailability(text) {
  const match = String(text || "").match(
    /(?:only\s+)?(\d{1,2})\s+seats?\s+(?:left|available|remaining)/i
  );

  return match ? `${match[1]} seats available` : null;
}

function parseBusType(text) {
  const lower = String(text || "").toLowerCase();

  const rules = [
    ["AC Sleeper", /ac\s+sleeper|sleeper\s+cum\s+ac|sleeper[- ]ac/i],
    ["Non-AC Sleeper", /non.?ac\s+sleeper|sleeper\s+\(?non.?ac/i],
    ["Semi-Sleeper", /semi.?sleeper/i],
    ["Sleeper Cum Seater", /sleeper\s+cum\s+seater|sleeper[- ]cum[- ]seater/i],
    ["Sleeper", /\bsleeper\b/i],
    ["Volvo", /\bvolvo\b/i],
    ["Mercedes", /\bmercedes\b|benz/i],
    ["Scania", /\bscania\b/i],
    ["AC Seater", /ac\s+seater|seater\s+cum\s+ac|sitting\s+ac/i],
    ["Seater", /\bseater\b|\bsitting\b/i],
    ["AC", /\bac\b/i],
    ["Non-AC", /\bnon.?ac\b/i],
    ["Deluxe", /\bdeluxe\b/i],
    ["Luxury", /\bluxury\b/i],
    ["Express", /\bexpress\b/i],
    ["Ordinary", /\bordinary\b/i],
    ["Shuttle", /\bshuttle\b/i],
    ["Mini", /\bmini\s+bus\b/i],
  ];

  for (const [label, re] of rules) {
    if (re.test(lower)) {
      return label;
    }
  }

  return null;
}

const OPERATOR_BLOCKLIST =
  /\b(bus|buses|road|car|cab|taxi|plane|train|flight|hotel|travels?|tours|online|ticket|book|fare|price|timing|schedule|depot|agency|service|transport|check|checking|checks?|availability|available|seats?|here|now|view|offers?|see|select|choose|search|compare|every|each|more|all|get|any|know|today|journey|route|going|normal|recent|recently)\b|\b(to|from|between)\b/;

function parseOperator(text) {
  const source = String(text || "");
  const lower = source.toLowerCase();

  const byMatch = source.match(
    /\b(?:by|operated\s+by)\s+([A-Za-z][A-Za-z0-9&.'\s-]{1,48}?)(?=\s*(?:[–—-]|\s+|$|\(|,))/i
  );

  if (byMatch && byMatch[1].trim()) {
    const candidate = byMatch[1].trim();

    if (isPlausibleOperator(candidate, lower)) {
      return candidate.replace(/\bthe\s+/i, "").trim();
    }
  }

  const companyMatch = source.match(
    /([A-Z][A-Za-z0-9&.'-]*(?:\s+[A-Za-z][A-Za-z0-9&.'-]*){0,4})\s+(?:Travels|Tours|Voyages|Motors|Coaches|Carriers)\b/i
  );

  if (companyMatch) {
    const candidate = companyMatch[1].trim();

    if (isPlausibleOperator(candidate, lower)) {
      return candidate.replace(/\bthe\s+/i, "").trim();
    }
  }

  const brandMatch = source.match(
    /\b(zingbus|intrcity\s+smartbus|flixbus|hariom\s+travels|sharma\s+transports)\b/i
  );

  if (brandMatch) {
    return brandMatch[1]
      .replace(/\b\w/g, (char) => char.toUpperCase())
      .trim();
  }

  return null;
}

function isPlausibleOperator(candidate, fullLower) {
  const trimmed = candidate.trim();

  if (trimmed.length < 2 || trimmed.length > 48) {
    return false;
  }

  if (OPERATOR_BLOCKLIST.test(trimmed.toLowerCase())) {
    return false;
  }

  const words = trimmed.split(/\s+/);

  if (words.every((word) => word.length <= 2)) {
    return false;
  }

  return true;
}

function cleanPlaceName(raw) {
  let cleaned = String(raw || "")
    .trim()
    .replace(/[,;\s|]+$/g, "")
    .replace(/\s+/g, " ");

  if (cleaned.length < 3 || cleaned.length > 60) {
    return null;
  }

  if (
    /\b(bus|bus stand|depot|ticket|book|redbus|travels)\b/i.test(
      cleaned
    )
  ) {
    return null;
  }

  return cleaned;
}

function parseBoardingPoint(text) {
  const match = String(text || "").match(
    /(?:boarding\s+(?:at|point|location|from)?\s*[:@\-–—]?\s*)([A-Za-z][A-Za-z0-9\s.,'()\-–—]{2,50}?)(?=\s*(?:dropping|arrival|,|\.|;|\||$))/i
  );

  return match ? cleanPlaceName(match[1]) : null;
}

function parseDroppingPoint(text) {
  const match = String(text || "").match(
    /(?:dropping\s+(?:at|point|location)?\s*[:@\-–—]?\s*)([A-Za-z][A-Za-z0-9\s.,'()\-–—]{2,50}?)(?=\s*(?:,|\.|;|\||$))/i
  );

  return match ? cleanPlaceName(match[1]) : null;
}

/* --------------------------------------------------
   Assembling the final bus object
-------------------------------------------------- */

function cleanDescription(snippet) {
  if (!snippet) {
    return null;
  }

  const cleaned = String(snippet)
    .replace(/\s+/g, " ")
    .trim();

  return cleaned.length > 240
    ? `${cleaned.slice(0, 237).trimEnd()}…`
    : cleaned;
}

function aggregatorLabel(website) {
  const url = String(website || "").toLowerCase();

  const labels = [
    ["redbus", "redBus"],
    ["abhibus", "AbhiBus"],
    ["makemytrip", "MakeMyTrip"],
    ["goibibo", "Goibibo"],
    ["yatra.com", "Yatra"],
    ["ixigo", "ixigo"],
    ["railyatri", "RailYatri"],
    ["easemytrip", "EaseMyTrip"],
    ["ticketroutes", "TicketRoutes"],
    ["intrcity", "IntrCity"],
    ["zingbus", "Zingbus"],
    ["paytm", "Paytm"],
  ];

  for (const [needle, label] of labels) {
    if (url.includes(needle)) {
      return label;
    }
  }

  return null;
}

function extractBusInfo(textContent, from, to, options = {}) {
  const strict = Boolean(options.strict);
  const times = parseTimes(textContent, strict);

  return {
    operator: parseOperator(textContent),
    busType: parseBusType(textContent),
    fare: parseFare(textContent),
    departure: times.departure,
    arrival: times.arrival,
    duration: parseDuration(textContent, strict),
    availability: parseAvailability(textContent),
    boardingPoint: parseBoardingPoint(textContent),
    droppingPoint: parseDroppingPoint(textContent),
  };
}

function buildBusObject(result, from, to) {
  const title = String(result.title || "");
  const snippet = String(result.description || "");

  const snippetInfo = extractBusInfo(`${title} ${snippet}`, from, to);

  const website = String(result.website || "").trim();

  const operator = snippetInfo.operator;
  const busType = snippetInfo.busType;

  let name;

  if (operator && busType) {
    name = `${operator} – ${busType}`;
  } else if (operator) {
    name = operator;
  } else if (busType) {
    name = `${busType} – ${from} to ${to}`;
  } else {
    const label = aggregatorLabel(website);

    name = label
      ? `${from} to ${to} bus – ${label}`
      : `${from} to ${to} bus`;
  }

  return {
    name,
    operator,
    from: String(from).trim(),
    to: String(to).trim(),
    departure: snippetInfo.departure,
    arrival: snippetInfo.arrival,
    duration: snippetInfo.duration,
    price: snippetInfo.fare,
    availability: snippetInfo.availability,
    rating:
      typeof result.rating === "number" ? result.rating : null,
    ratingCount:
      typeof result.ratingCount === "number"
        ? result.ratingCount
        : null,
    bookingUrl: website || null,
    sourceUrl: website || null,
    busType,
    boardingPoint: snippetInfo.boardingPoint,
    droppingPoint: snippetInfo.droppingPoint,
    description: cleanDescription(snippet),
    date: result.date || null,
  };
}

function enrichBus(bus, pageInfo) {
  const hadOperator = bus.operator !== null;

  if (bus.operator === null && pageInfo.operator) {
    bus.operator = pageInfo.operator;
  }

  if (bus.busType === null && pageInfo.busType) {
    bus.busType = pageInfo.busType;
  }

  if (bus.price === null && pageInfo.fare) {
    bus.price = pageInfo.fare;
  }

  if (bus.departure === null && pageInfo.departure) {
    bus.departure = pageInfo.departure;
  }

  if (bus.arrival === null && pageInfo.arrival) {
    bus.arrival = pageInfo.arrival;
  }

  if (bus.duration === null && pageInfo.duration) {
    bus.duration = pageInfo.duration;
  }

  if (bus.availability === null && pageInfo.availability) {
    bus.availability = pageInfo.availability;
  }

  if (bus.boardingPoint === null && pageInfo.boardingPoint) {
    bus.boardingPoint = pageInfo.boardingPoint;
  }

  if (bus.droppingPoint === null && pageInfo.droppingPoint) {
    bus.droppingPoint = pageInfo.droppingPoint;
  }

  if (!hadOperator && bus.operator !== null) {
    bus.name = bus.busType
      ? `${bus.operator} – ${bus.busType}`
      : bus.operator;
  }
}

function dedupeBuses(buses) {
  const seenSites = new Set();
  const seenContent = new Set();
  const unique = [];

  for (const bus of buses) {
    const siteKey = String(bus.sourceUrl || bus.bookingUrl || "")
      .toLowerCase()
      .split("?")[0];

    if (siteKey) {
      if (seenSites.has(siteKey)) {
        continue;
      }

      seenSites.add(siteKey);
    }

    const contentKey = [
      bus.operator,
      bus.departure,
      bus.arrival,
      bus.price,
    ]
      .map((value) => String(value || "").trim().toLowerCase())
      .join("|");

    if (/[^\|]/.test(contentKey)) {
      if (seenContent.has(contentKey)) {
        continue;
      }

      seenContent.add(contentKey);
    }

    unique.push(bus);
  }

  return unique;
}

/* --------------------------------------------------
   Public search
-------------------------------------------------- */

async function searchBusRoutes(from, to, options = {}) {
  const source = String(from || "").trim();
  const destination = String(to || "").trim();

  if (!source || !destination) {
    throw new Error("from and to are required");
  }

  const queries = buildQueries(source, destination);

  const seenResults = new Map();
  let anySucceeded = false;
  const errors = [];

  for (const item of queries) {
    const queryOptions = {
      engine: BUS_SEARCH_ENGINE,
      num: options.num || DEFAULT_NUM,
      region: options.region || SERP_REGION,
      lang: options.lang || SERP_LANG,
    };

    if (item.extract) {
      queryOptions.extract = item.extract;
    }

    try {
      const data = await searchWeb(item.text, queryOptions);

      anySucceeded = true;

      for (const result of data.results || []) {
        if (result.type === "ad") {
          continue;
        }

        const website = String(result.website || "").trim();

        if (REDIRECT_URL_RE.test(website)) {
          continue;
        }

        const key = website.toLowerCase().split("?")[0] ||
          `query:${item.text}|${result.title || ""}`.toLowerCase();

        if (!seenResults.has(key)) {
          seenResults.set(key, result);
        }
      }
    } catch (error) {
      errors.push(error);

      console.warn(
        `[BusSearch] query failed ("${item.text}"): ${error.message}`
      );
    }
  }

  if (!anySucceeded && errors.length > 0) {
    throw new Error(
      errors[0].message || "Bus search is temporarily unavailable."
    );
  }

  const ranked = [];

  for (const result of seenResults.values()) {
    const verdict = assessRelevance(result, source, destination);

    if (verdict.ok) {
      ranked.push({ result, score: verdict.score });
    }
  }

  ranked.sort((a, b) => b.score - a.score);

  const buses = [];

  for (const { result } of ranked) {
    const bus = buildBusObject(result, source, destination);

    if (result.extracted) {
      const pageInfo = extractBusInfo(
        result.extracted,
        source,
        destination,
        { strict: true }
      );

      enrichBus(bus, pageInfo);
    }

    buses.push(bus);
  }

  const unique = dedupeBuses(buses);

  return unique.slice(0, MAX_BUSES);
}

module.exports = {
  searchBusRoutes,
};