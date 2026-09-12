/**
 * City discovery route ("Explore City").
 *
 *   GET /api/city/explore?city=New Delhi&category=hotels
 *   GET /api/city/explore?city=Bhopal&custom=dhaba
 *
 * The provider behind any single search is never revealed to the caller:
 * the response only ever contains normalized places and application-level
 * messages.
 */

const express = require("express");

const {
  findCityPlaces,
} = require("../services/cityDiscoveryService");

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const city = String(req.query.city || "").trim();
    const category = String(req.query.category || "").trim();
    const custom = String(req.query.custom || "").trim();

    const limit = Number(req.query.limit);

    const latParam = req.query.lat;
    const lonParam = req.query.lon;

    const lat =
      latParam === undefined || latParam === null || latParam === ""
        ? undefined
        : Number(latParam);

    const lon =
      lonParam === undefined || lonParam === null || lonParam === ""
        ? undefined
        : Number(lonParam);

    if (!city) {
      return res.status(400).json({
        success: false,
        message: "A city is required.",
      });
    }

    if (!category && !custom) {
      return res.status(400).json({
        success: false,
        message: "A category is required.",
      });
    }

    const result = await findCityPlaces({
      city,
      category,
      custom,
      limit,
      lat,
      lon,
    });

    return res.json({
      success: true,
      city,
      category: category || null,
      custom: custom || null,
      query: result.query,
      count: result.places.length,
      places: result.places,
      stats: result.stats,
    });
  } catch (error) {
    if (error && error.code === "missing-params") {
      return res.status(400).json({
        success: false,
        message: "A city and a category are required.",
      });
    }

    console.error("[CityExplore] error:", error.message || error);

    return res.status(502).json({
      success: false,
      message: "Places are temporarily unavailable.",
    });
  }
});

module.exports = router;