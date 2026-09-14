/**
 * OSM place-search routes.
 *
 *   GET /api/osm/search-place?q=...&lat=...&lon=...
 *       Resolves a typed place name to Nominatim (OSM) results, biased to
 *       the current destination via `viewbox`. No database touches.
 *
 *   GET /api/osm/place?osmType=way&osmId=123&lat=...&lon=...
 *       Fetches the full Overpass element for a selected Nominatim result,
 *       normalizes it through the existing normalizeOsmPlace utility, then
 *       enriches it with any missing city/state/country/name from the
 *       Nominatim selection. Returns a single provider-neutral `TravelPlace`
 *       envelope the frontend can render in the SAME card UI as DB places.
 */

const express = require("express");

const {
  searchNominatimPlaces,
} = require("../providers/nominatimPlaces");

const {
  fetchOverpassElement,
} = require("../providers/overpassPlaces");

const {
  normalizeOsmPlace,
} = require("../utils/normalizeOsmPlace");

const router = express.Router();

/* --------------------------------------------------
   Validate helpers
-------------------------------------------------- */

function isValidLatitude(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= -90 && n <= 90;
}

function isValidLongitude(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= -180 && n <= 180;
}

/* --------------------------------------------------
   GET /api/osm/search-place
-------------------------------------------------- */

router.get("/search-place", async (req, res) => {
  try {
    const text = String(req.query.q ?? "").trim();
    const latitude = Number(req.query.lat);
    const longitude = Number(req.query.lon);
    const city = String(req.query.city ?? "").trim() || null;

    if (text.length < 2) {
      return res.status(400).json({
        message: "A place name is required.",
      });
    }

    if (!isValidLatitude(latitude) || !isValidLongitude(longitude)) {
      return res.status(400).json({
        message: "Latitude and longitude are required.",
      });
    }

    const results = await searchNominatimPlaces({
      text,
      latitude,
      longitude,
      city,
    });

    return res.json({ query: text, results });
  } catch (error) {
    console.error(
      "[OSMSearch] search-place error:",
      error.message || error
    );

    return res.status(502).json({
      message: "Unable to search OSM right now.",
    });
  }
});

/* --------------------------------------------------
   GET /api/osm/place
-------------------------------------------------- */

router.get("/place", async (req, res) => {
  try {
    const osmType = String(req.query.osmType ?? "").trim();
    const osmId = Number(req.query.osmId);

    if (
      !["node", "way", "relation"].includes(osmType) ||
      !Number.isInteger(osmId) ||
      osmId <= 0
    ) {
      return res.status(400).json({
        message: "A valid OSM type and id are required.",
      });
    }

    /* --------------------------------------------------
       1. Fetch the full Overpass element (tags + geometry)
    -------------------------------------------------- */

    let element = null;

    try {
      element = await fetchOverpassElement({ osmType, osmId });
    } catch (error) {
      console.warn(
        `[OSMSearch] overpass element ${osmType}/${osmId} failed: ${error.message}`
      );
    }

    /* --------------------------------------------------
       2. Normalize
    -------------------------------------------------- */

    let place;

    if (element) {
      place = normalizeOsmPlace(element);
    } else {
      /*
       * Overpass couldn't resolve the element (rare for real places, but
       * can happen for very new features). Build a minimal placeholder
       * from the Nominatim selection so the frontend always gets a card.
       */
      place = {
        id: `osm-${osmType}-${osmId}`,
        name: null,
        category: "other",
        formatted: null,
        latitude: null,
        longitude: null,
        city: null,
        state: null,
        country: null,
        postcode: null,
        website: null,
        phone: null,
        opening_hours: null,
        wheelchair: null,
        religion: null,
        osmType,
        osmId,
        tags: {},
      };
    }

    /* --------------------------------------------------
       3. Enrich with Nominatim fields missing from OSM tags
    -------------------------------------------------- */

    const name = String(req.query.name ?? "").trim() || null;
    const displayName =
      String(req.query.displayName ?? "").trim() || null;
    const city = String(req.query.city ?? "").trim() || null;
    const state = String(req.query.state ?? "").trim() || null;
    const country =
      String(req.query.country ?? "").trim() || null;
    const classValue =
      String(req.query.class ?? "").trim() || null;

    if (!place.name && name) {
      place.name = name;
    }

    if (!place.formatted && displayName) {
      place.formatted = displayName;
    }

    if (!place.city && city) {
      place.city = city;
    }

    if (!place.state && state) {
      place.state = state;
    }

    if (!place.country && country) {
      place.country = country;
    }

    if (place.category === "other" && classValue) {
      place.category = classValue;
    }

    /* --------------------------------------------------
       4. Guard: must have coordinates
    -------------------------------------------------- */

    const latFromQuery = Number(req.query.lat);
    const lonFromQuery = Number(req.query.lon);

    if (
      (place.latitude === null || place.longitude === null) &&
      isValidLatitude(latFromQuery) &&
      isValidLongitude(lonFromQuery)
    ) {
      place.latitude = latFromQuery;
      place.longitude = lonFromQuery;
    }

    if (place.latitude === null || place.longitude === null) {
      return res.status(502).json({
        message: "Unable to resolve this OSM place.",
      });
    }

    return res.json({ place });
  } catch (error) {
    console.error(
      "[OSMSearch] place error:",
      error.message || error
    );

    return res.status(502).json({
      message: "Unable to resolve this OSM place.",
    });
  }
});

module.exports = router;