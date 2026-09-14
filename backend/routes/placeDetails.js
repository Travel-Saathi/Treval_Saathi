/**
 * Place-details route.
 *
 *   GET /api/place-details?name=...&city=...&state=...&country=...
 *       Returns factual details for a single place, sourced through the
 *       existing OpenSERP web search. No database inserts, no AI text.
 *
 * The response envelope is `{ place: {...} }`; an unknown place is a 404
 * so the client can render a clean "no details" state.
 */

const express = require("express");

const {
  getPlaceDetails,
} = require("../services/placeDetailsService");

const router = express.Router();

function optionalNumber(value) {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

router.get("/", async (req, res) => {
  try {
    const name = String(req.query.name ?? "").trim();

    if (name.length < 2) {
      return res.status(400).json({
        message: "A place name is required.",
      });
    }

    const city = String(req.query.city ?? "").trim() || null;
    const state = String(req.query.state ?? "").trim() || null;
    const country = String(req.query.country ?? "").trim() || null;

    const details = await getPlaceDetails({
      name,
      city,
      state,
      country,
      latitude: optionalNumber(req.query.lat),
      longitude: optionalNumber(req.query.lon),
    });

    if (!details) {
      return res.status(404).json({
        message: "No details found for this place.",
      });
    }

    return res.json({ place: details });
  } catch (error) {
    console.error(
      "[PlaceDetails] error:",
      error.message || error
    );

    return res.status(502).json({
      message: "Unable to load place details right now.",
    });
  }
});

module.exports = router;
