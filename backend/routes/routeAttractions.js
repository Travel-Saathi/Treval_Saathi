const express = require("express");

const {
  findAttractionsAlongRoute,
  ROUTE_ATTRACTION_RADIUS_KM,
} = require("../services/attractionsAlongRouteService");

const router = express.Router();

/*
 * Parse "lat,lon;lat,lon;..." into route coordinates. Returns null when
 * the parameter is missing or any pair is unusable.
 */
function parseRouteCoordinates(raw) {
  if (!raw || typeof raw !== "string" || !raw.trim()) {
    return null;
  }

  const pairs = String(raw)
    .split(";")
    .map((pair) => pair.trim())
    .filter(Boolean);

  const coords = [];

  for (const pair of pairs) {
    const [latitudeRaw, longitudeRaw] = pair.split(",");

    const latitude = Number(latitudeRaw);
    const longitude = Number(longitudeRaw);

    if (
      !Number.isFinite(latitude) ||
      Math.abs(latitude) > 90 ||
      !Number.isFinite(longitude) ||
      Math.abs(longitude) > 180
    ) {
      return null;
    }

    coords.push({ latitude, longitude });
  }

  return coords.length >= 2 ? coords : null;
}

function parseListParam(value) {
  if (!value) return [];

  return String(value)
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean);
}

router.get("/attractions", async (req, res) => {
  try {
    const coords = parseRouteCoordinates(req.query.coords);

    if (!coords) {
      return res.status(400).json({
        success: false,
        reason: "no-geometry",
        message: "Route geometry is unavailable.",
      });
    }

    const cities = parseListParam(req.query.cities);
    const categories = parseListParam(req.query.categories);
    const corridorKm = req.query.corridorKm
      ? Number(req.query.corridorKm)
      : undefined;
    const max = req.query.max ? Number(req.query.max) : undefined;

    const { attractions, corridorKm: usedCorridorKm, stats } =
      await findAttractionsAlongRoute(coords, {
        cities,
        categories,
        corridorKm,
        maxResults: max,
      });

    return res.json({
      success: true,
      reason: "ok",
      corridorKm: usedCorridorKm ?? ROUTE_ATTRACTION_RADIUS_KM,
      stats,
      count: attractions.length,
      attractions,
    });
  } catch (error) {
    if (error && error.code === "no-geometry") {
      return res.status(400).json({
        success: false,
        reason: "no-geometry",
        message: "Route geometry is unavailable.",
      });
    }

    const reason =
      error && error.code === "search-error"
        ? "search-error"
        : "osm-error";

    console.error("[RouteAttractions] error:", error.message || error);

    return res.status(502).json({
      success: false,
      reason,
      message: "Places are temporarily unavailable.",
    });
  }
});

module.exports = router;