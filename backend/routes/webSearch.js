const express = require("express");
const {
  searchWeb,
} = require("../services/webSearchService");

const router = express.Router();

/**
 * GET /api/web-search?q=best+places+to+visit+in+Jaipur
 */
router.get("/", async (req, res) => {
  try {
    const { q } = req.query;

    if (!q || !String(q).trim()) {
      return res.status(400).json({
        success: false,
        error: "q (search query) is required",
      });
    }

    const results = await searchWeb(
      String(q).trim()
    );

    return res.json({
      success: true,
      ...results,
    });
  } catch (error) {
    console.error("Web search error:", error);

    return res.status(502).json({
      success: false,
      error: "Web search is temporarily unavailable.",
    });
  }
});

module.exports = router;