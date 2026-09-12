/**
 * Bus search service.
 *
 * Sits behind the provider abstraction (webSearchService) so the route
 * layer never knows whether results came from OpenSERP or Serper. Real
 * search data is normalized into a structured bus shape; nothing is
 * invented. Fields the search results do not supply remain `null`.
 */

const {
  searchWeb,
} = require("./webSearchService");

function parsePrice(text) {
  const match = String(text).match(/₹\s*([\d][\d,]*)(?!\s*(?:off|discount|save|only))/i);

  if (!match) {
    return null;
  }

  return `₹${match[1]}`;
}

const OPERATOR_CANDIDATE_BLOCKLIST = [
  "train",
  "flight",
  "bus",
  "road",
  "car",
  "taxi",
  "plane",
  "helicopter",
  "bicycle",
  "walk",
  "air",
  " to ",
  " from ",
  " between ",
];

/**
 * Best-effort operator detection from a result title such as
 * "Verma Travels – Bhopal to Indore Bus". Only an explicit
 * "by <Operator>" phrasing is trusted; route descriptors are never
 * mistaken for operators. Returns null when no operator is identified.
 */
function parseOperator(title) {
  const byPattern =
    /\b(?:by|operated\s+by|with)\s+([A-Za-z][A-Za-z0-9&\s.]{2,48}?)(?=\s*(?:[–—-]|\s+|$|\(|,))/i;

  const byMatch = String(title).match(byPattern);

  if (!byMatch || !byMatch[1].trim()) {
    return null;
  }

  const candidate = byMatch[1].trim();
  const lower = candidate.toLowerCase();

  const blocked = OPERATOR_CANDIDATE_BLOCKLIST.some((keyword) =>
    lower.includes(keyword)
  );

  return blocked ? null : candidate;
}

/**
 * Normalize one web-search result into a structured bus card. Only the
 * fields that can honestly be derived from the result are filled in;
 * timings and seat availability are not guessed.
 */
function normalizeBusResult(result, from, to) {
  const title = String(result.title || "").trim();
  const description = String(result.description || "").trim();
  const rating = typeof result.rating === "number" ? result.rating : null;
  const ratingCount =
    typeof result.ratingCount === "number" ? result.ratingCount : null;

  return {
    name: title || null,
    operator: parseOperator(title),
    from: from || null,
    to: to || null,
    departure: null,
    arrival: null,
    duration: null,
    price: parsePrice(`${title} ${description}`) || null,
    availability: null,
    rating,
    ratingCount,
    bookingUrl: result.website || null,
    description: description || null,
  };
}

/**
 * Search bus options between two cities through the configured search
 * provider (with automatic fallback).
 */
async function searchBusRoutes(from, to) {
  if (!from || !String(from).trim() || !to || !String(to).trim()) {
    throw new Error("from and to are required");
  }

  const query = `"${String(from).trim()}" to "${String(to).trim()}" bus`;

  const data = await searchWeb(query);

  return (data.results || []).map((result) =>
    normalizeBusResult(result, from, to)
  );
}

module.exports = {
  searchBusRoutes,
};