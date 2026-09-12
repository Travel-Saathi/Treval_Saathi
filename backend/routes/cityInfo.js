/**
 * City information route.
 *
 *   GET /api/city/fact?city=Jaipur
 *
 * Returns a small, human-friendly "did you know" style fact for a city,
 * discovered through the backend search service. The response never
 * mentions which provider supplied the information.
 */

const express = require("express");

const {
  searchWeb,
} = require("../services/webSearchService");

const router = express.Router();

function cleanFactText(text) {
  return text
    .replace(/^\s*\d{1,2}\s+\w{3}\s+\d{4}\s*-\s*/, "")
    .replace(/\s*\?…\s*$/, "")
    .trim();
}

function pickFact(results) {
  const candidates = (results || []).filter(
    (result) =>
      result &&
      typeof result.description === "string" &&
      result.description.trim().length > 0
  );

  if (candidates.length === 0) {
    return null;
  }

  return candidates[0];
}

/**
 * GET /api/city/fact?city=Jaipur
 */
router.get("/fact", async (req, res) => {
  try {
    const city = String(req.query.city || "").trim();

    if (!city) {
      return res.status(400).json({
        success: false,
        error: "city is required",
      });
    }

    const data = await searchWeb(
      `interesting facts about ${city}`
    );

    const fact = pickFact(data.results);

    return res.json({
      success: true,
      city,
      fact: fact
        ? {
            text: cleanFactText(fact.description),
            title: fact.title || null,
            link: fact.website || null,
          }
        : null,
    });
  } catch (error) {
    console.error("City fact error:", error);

    return res.status(502).json({
      success: false,
      error:
        "City information is temporarily unavailable.",
    });
  }
});

module.exports = router;