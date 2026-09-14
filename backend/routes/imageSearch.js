const express = require("express");

const router = express.Router();

const SERPER_IMAGE_API_URL = "https://google.serper.dev/images";

const SERPER_IMAGE_TIMEOUT_MS = clampTimeout(
  process.env.SERPER_IMAGE_TIMEOUT_MS,
  8000
);

function clampTimeout(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);

  if (!Number.isFinite(parsed) || parsed < 1000) {
    return fallback;
  }

  return parsed;
}

router.get("/", async (req, res) => {
  try {
    const { q } = req.query;

    if (!q || !String(q).trim()) {
      return res.status(400).json({
        success: false,
        error: "q (search query) is required",
      });
    }

    if (!process.env.SERPER_API_KEY) {
      return res.status(502).json({
        success: false,
        error: "Image search is temporarily unavailable.",
      });
    }

    const response = await fetch(SERPER_IMAGE_API_URL, {
      method: "POST",
      headers: {
        "X-API-KEY": process.env.SERPER_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        q: String(q).trim(),
        gl: "in",
        hl: "en",
        num: 10,
      }),
      signal: AbortSignal.timeout(SERPER_IMAGE_TIMEOUT_MS),
    });

    if (!response.ok) {
      const errorText = await response.text();

      throw new Error(
        `Serper image API error ${response.status}: ${errorText}`
      );
    }

    const data = await response.json();

    const images = (data.images || []).map((image) => ({
      title: image.title || null,
      imageUrl: image.imageUrl || null,
      thumbnailUrl: image.thumbnailUrl || null,
      source: image.source || null,
      link: image.link || null,
      width: image.imageWidth || null,
      height: image.imageHeight || null,
    }));

    return res.json({
      success: true,
      query: String(q).trim(),
      source: "serper",
      count: images.length,
      images,
    });
  } catch (error) {
    console.error("Image search error:", error);

    return res.status(502).json({
      success: false,
      error: "Image search is temporarily unavailable.",
    });
  }
});

module.exports = router;