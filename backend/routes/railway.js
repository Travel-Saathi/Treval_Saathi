/**
 * Railway live-status routes.
 *
 *   GET /api/railway/live?trainNo=12301&date=08-09-2026
 *
 * Validates query parameters, delegates to railwayService, and returns
 * a normalized JSON payload. Raw mNTES HTML never leaves the backend.
 */

const express = require("express");

const {
  getLiveStatus,
  statusCodeForError,
  errorPayload,
} = require("../services/railwayService");

const {
  searchBetweenStations,
  statusCodeForError: searchStatusCodeForError,
  errorPayload: searchErrorPayload,
} = require("../services/railwaySearchService");

const router = express.Router();

router.get("/live", async (req, res) => {
  try {
    const { trainNo, date } = req.query;

    const result = await getLiveStatus({ trainNo, date });

    return res.json(result);
  } catch (error) {
    console.error(
      "[Railway] live status error:",
      error && error.message ? error.message : error
    );

    return res
      .status(statusCodeForError(error))
      .json(errorPayload(error));
  }
});

router.get("/search", async (req, res) => {
  try {
    const { from, to, date } = req.query;

    const result = await searchBetweenStations({ from, to, date });

    return res.json(result);
  } catch (error) {
    console.error(
      "[Railway] between-stations search error:",
      error && error.message ? error.message : error
    );

    return res
      .status(searchStatusCodeForError(error))
      .json(searchErrorPayload(error));
  }
});

module.exports = router;