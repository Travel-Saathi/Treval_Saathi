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
} = require("../services/busSearchService");

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

    const buses = await searchBusRoutes(from, to);

    return res.json({
      success: true,
      from: String(from).trim(),
      to: String(to).trim(),
      count: buses.length,
      buses,
    });
  } catch (error) {
    console.error("Bus search error:", error);

    return res.status(502).json({
      success: false,
      error:
        "Bus search is temporarily unavailable.",
    });
  }
});

module.exports = router;