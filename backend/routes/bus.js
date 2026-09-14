/**
 * Bus search route.
 *
 *   GET /api/bus/search?from=Bhopal&to=Indore&date=2026-09-10
 *
 * Returns normalized bus options discovered through the backend search
 * service. The response only contains Treval Saathi data — no provider
 * names, server URLs or implementation details.
 */

const express = require("express");

const {
  searchBusRoutes,
} = require("../services/busService");

const {
  primaryProvider,
} = require("../services/webSearchService");

const router = express.Router();

router.get("/search", async (req, res) => {
  try {
    const { from, to } = req.query;

    if (
      !from ||
      !String(from).trim() ||
      !to ||
      !String(to).trim()
    ) {
      return res.status(400).json({
        success: false,
        error: "from and to are required",
      });
    }

    const normalizedFrom = String(from).trim();
    const normalizedTo = String(to).trim();

    const buses = await searchBusRoutes(normalizedFrom, normalizedTo);

    return res.json({
      success: true,
      source: primaryProvider,
      from: normalizedFrom,
      to: normalizedTo,
      count: buses.length,
      buses,
    });
  } catch (error) {
    console.error("Bus search error:", error);

    return res.status(502).json({
      success: false,
      source: primaryProvider,
      error:
        "Bus search is temporarily unavailable.",
    });
  }
});

module.exports = router;