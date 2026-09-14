/**
 * Single place-details service.
 *
 * Reuses the existing provider-independent OpenSERP web search
 * (`webSearchService.searchWeb`) to collect ONLY factual, publicly
 * available information about one place:
 *
 *   - a short description (search snippet, or the leading extract text)
 *   - the source link (used as the official website when present)
 *   - the place type reported by the source
 *   - rating / rating count ONLY when the provider actually returns them
 *
 * Nothing is invented: any field the source does not provide stays null.
 * There is exactly ONE detail implementation; callers never talk to a
 * provider directly.
 */

const { searchWeb } = require("./webSearchService");

/* Ad / search-engine redirect links are never a place's own page. */
const REDIRECT_URL_RE =
  /(bing\.com\/aclk|duckduckgo\.com\/y\.js|google\.(?:com|co\.in)\/url|ecosia\.org\/redirect|yandex\.com\/clck|googleadservices)/i;

/* Default result window; one query is enough for a single place. */
const DETAIL_NUM_RESULTS = 6;

/* How much of a page extract is used when the snippet is missing. */
const MAX_DESCRIPTION_CHARS = 320;

/* Clamp the extract we read from OpenSERP (mirrors the bus search cap). */
const DETAIL_EXTRACT_LEVEL = 1;

function cleanText(value) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.replace(/\s+/g, " ").trim();

  return normalized || null;
}

function cleanNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

/** Normalize a name for loose title matching. */
function nameKey(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Score one web result for relevance to the requested place. Higher is
 * better; a rejected result (ad/redirect) returns -1 and is never used.
 *
 * A result that never mentions the requested PLACE name anywhere is also
 * rejected: it cannot describe the entity and is at best generic city
 * content ("top things to do in <city>"), which we deliberately exclude.
 */
function scoreResult(result, requestedName) {
  if (!result || result.type === "ad") {
    return -1;
  }

  const website = String(result.website || "").toLowerCase();

  if (!website || REDIRECT_URL_RE.test(website)) {
    return -1;
  }

  const title = nameKey(result.title);
  const description = nameKey(result.description);

  /*
   * Entity gate: the result MUST reference the place by name. Without a
   * single name hit it is not about this place even if the query included
   * the city/state. Keeping this strict rejects generic city-level pages.
   */
  if (
    requestedName &&
    !title.includes(requestedName) &&
    !description.includes(requestedName)
  ) {
    return -1;
  }

  let score = 0;

  if (requestedName && title.includes(requestedName)) {
    score += 4;
  } else if (requestedName && description.includes(requestedName)) {
    score += 2;
  }

  if (requestedName) {
    const requestedWords = requestedName.split(" ").filter(Boolean);

    score += requestedWords.filter((word) => title.includes(word)).length;
  }

  if (typeof result.extracted === "string" && result.extracted.trim()) {
    score += 1;
  }

  return score;
}

/** Pick the most relevant usable result, or null when none qualifies. */
function pickBestResult(results, requestedName) {
  const requestedKey = nameKey(requestedName);

  let best = null;
  let bestScore = 0;

  for (const result of results || []) {
    const score = scoreResult(result, requestedKey);

    if (score > bestScore) {
      best = result;
      bestScore = score;
    }
  }

  return best;
}

/** Description from the result snippet, falling back to the page extract. */
function resultDescription(result) {
  const snippet = cleanText(result.description);

  if (snippet) {
    return snippet;
  }

  const extracted = cleanText(result.extracted);

  if (!extracted) {
    return null;
  }

  return extracted.length > MAX_DESCRIPTION_CHARS
    ? `${extracted.slice(0, MAX_DESCRIPTION_CHARS).trimEnd()}…`
    : extracted;
}

/**
 * Fetch factual details for a single place.
 *
 * The web query is built from the place identity plus the full location
 * context (city, state, country) so results describe THAT place, not the
 * city around it: e.g. placeName="Lower Lake", city="Bhopal",
 * state="Madhya Pradesh", country="India".
 *
 * @param {object} params
 * @param {string} params.name       Place name (required).
 * @param {string} [params.city]     Nearest city.
 * @param {string} [params.state]    State, narrows down the query.
 * @param {string} [params.country]  Country; defaults to "India".
 * @param {number} [params.latitude]
 * @param {number} [params.longitude]
 * @returns {Promise<object|null>}   Null when no usable result exists.
 */
async function getPlaceDetails({
  name,
  city = null,
  state = null,
  country = "India",
  latitude = null,
  longitude = null,
} = {}) {
  const trimmedName = String(name ?? "").trim();

  if (!trimmedName) {
    throw new Error("A place name is required");
  }

  const locationParts = [trimmedName];

  if (city && String(city).trim()) {
    locationParts.push(String(city).trim());
  }

  if (state && String(state).trim()) {
    locationParts.push(String(state).trim());
  }

  const countryPart = (country && String(country).trim()) || "India";

  locationParts.push(countryPart);

  const options = {
    num: DETAIL_NUM_RESULTS,
    extract: DETAIL_EXTRACT_LEVEL,
    lang: "en",
    region: "in",
  };

  const data = await searchWeb(locationParts.join(", "), options);
  const best = pickBestResult(data.results, trimmedName);

  if (!best) {
    return null;
  }

  return {
    name: cleanText(best.title) || trimmedName,
    description: resultDescription(best),
    website: cleanText(best.website),
    type: cleanText(best.type),
    rating: cleanNumber(best.rating),
    ratingCount: cleanNumber(best.ratingCount),
  };
}

module.exports = {
  getPlaceDetails,
};
