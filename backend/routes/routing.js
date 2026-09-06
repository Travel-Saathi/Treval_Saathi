/**
 * OSRM routing routes.
 *
 * Exposes the osrmService to the app:
 *  - GET /between       one origin → one destination
 *  - GET /route         one route across 2+ coordinate pairs
 *  - GET /distance      one origin → many destinations (matrix)
 *
 * Query params use the app-wide `lat`/`lon` ordering; the service
 * translates to OSRM's lon/lat internally.
 */

const express = require("express");
const {
  getRouteBetween,
  getRoute,
  getDistanceMatrix,
} = require("../services/osrmService");

const router = express.Router();

/* --------------------------------------------------
   Validation helpers
-------------------------------------------------- */

const MAX_ROUTE_COORDINATES = 25;
const MAX_MATRIX_DESTINATIONS = 25;

function parseCoordinate(value, label) {
  if (value === undefined || value === null || String(value).trim() === "") {
    return { error: `${label} is required` };
  }

  const number = Number(value);

  if (!Number.isFinite(number)) {
    return { error: `${label} must be a number` };
  }

  return { value: number };
}

function parseLatitude(value) {
  const parsed = parseCoordinate(value, "Latitude");

  if (parsed.error) return parsed;

  if (parsed.value < -90 || parsed.value > 90) {
    return {
      error: "Latitude must be between -90 and 90",
    };
  }

  return parsed;
}

function parseLongitude(value) {
  const parsed = parseCoordinate(value, "Longitude");

  if (parsed.error) return parsed;

  if (parsed.value < -180 || parsed.value > 180) {
    return {
      error: "Longitude must be between -180 and 180",
    };
  }

  return parsed;
}

function parseCoordinateObject({ lat, lon, label }) {
  const latitude = parseLatitude(lat);
  if (latitude.error) {
    return { error: `${label}: ${latitude.error}` };
  }

  const longitude = parseLongitude(lon);
  if (longitude.error) {
    return { error: `${label}: ${longitude.error}` };
  }

  return {
    value: { latitude: latitude.value, longitude: longitude.value },
  };
}

/*
 * Parse a `destinations` query param of the form
 * "lat,lon;lat,lon;..." into coordinate objects.
 */
function parseDestinations(raw) {
  if (raw === undefined || String(raw).trim() === "") {
    return { error: "destinations are required" };
  }

  const pairs = String(raw)
    .split(";")
    .map((pair) => pair.trim())
    .filter(Boolean);

  if (pairs.length === 0) {
    return {
      error:
        "destinations must be comma-separated lat,lon pairs joined by semicolons",
    };
  }

  if (pairs.length > MAX_MATRIX_DESTINATIONS) {
    return {
      error: `Maximum ${MAX_MATRIX_DESTINATIONS} destinations allowed`,
    };
  }

  const coordinates = [];

  for (let index = 0; index < pairs.length; index += 1) {
    const parts = pairs[index].split(",");

    if (parts.length !== 2) {
      return {
        error: `Destination ${index + 1} must be "lat,lon"`,
      };
    }

    const lat = parseLatitude(parts[0]);
    if (lat.error) {
      return { error: `Destination ${index + 1}: ${lat.error}` };
    }

    const lon = parseLongitude(parts[1]);
    if (lon.error) {
      return { error: `Destination ${index + 1}: ${lon.error}` };
    }

    coordinates.push({
      latitude: lat.value,
      longitude: lon.value,
    });
  }

  return { value: coordinates };
}

/*
 * Parse a `coords` query param of the form
 * "lat,lon;lat,lon;..." into coordinate objects.
 */
function parseCoords(raw) {
  if (raw === undefined || String(raw).trim() === "") {
    return { error: "coords are required" };
  }

  const pairs = String(raw)
    .split(";")
    .map((pair) => pair.trim())
    .filter(Boolean);

  if (pairs.length < 2) {
    return { error: "coords must contain at least 2 coordinate pairs" };
  }

  if (pairs.length > MAX_ROUTE_COORDINATES) {
    return {
      error: `Maximum ${MAX_ROUTE_COORDINATES} coordinates allowed`,
    };
  }

  const coordinates = [];

  for (let index = 0; index < pairs.length; index += 1) {
    const parts = pairs[index].split(",");

    if (parts.length !== 2) {
      return {
        error: `Coordinate ${index + 1} must be "lat,lon"`,
      };
    }

    const lat = parseLatitude(parts[0]);
    if (lat.error) {
      return { error: `Coordinate ${index + 1}: ${lat.error}` };
    }

    const lon = parseLongitude(parts[1]);
    if (lon.error) {
      return { error: `Coordinate ${index + 1}: ${lon.error}` };
    }

    coordinates.push({
      latitude: lat.value,
      longitude: lon.value,
    });
  }

  return { value: coordinates };
}

/* --------------------------------------------------
   Route between two points
   GET /api/routing/between?fromLat=&fromLon=&toLat=&toLon=
-------------------------------------------------- */

router.get("/between", async (req, res) => {
  try {
    const { fromLat, fromLon, toLat, toLon } = req.query;

    const origin = parseCoordinateObject({
      lat: fromLat,
      lon: fromLon,
      label: "Origin",
    });

    if (origin.error) {
      return res.status(400).json({ message: origin.error });
    }

    const destination = parseCoordinateObject({
      lat: toLat,
      lon: toLon,
      label: "Destination",
    });

    if (destination.error) {
      return res.status(400).json({ message: destination.error });
    }

    const includeGeometry = String(req.query.geometry || "true") === "true";

    const route = await getRoute(
      [origin.value, destination.value],
      { geometry: includeGeometry }
    );

    return res.json(route);
  } catch (error) {
    console.error("Routing between error:", error);

    return res.status(502).json({
      message: "OSRM route request failed",
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/* --------------------------------------------------
   Multi-stop route
   GET /api/routing/route?coords=lat,lon;lat,lon;...
-------------------------------------------------- */

router.get("/route", async (req, res) => {
  try {
    const coords = parseCoords(req.query.coords);

    if (coords.error) {
      return res.status(400).json({ message: coords.error });
    }

    const includeGeometry = String(req.query.geometry || "false") === "true";

    const route = await getRoute(coords.value, {
      geometry: includeGeometry,
    });

    return res.json(route);
  } catch (error) {
    console.error("Routing error:", error);

    return res.status(502).json({
      message: "OSRM route request failed",
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/* --------------------------------------------------
   Distance/duration matrix from one origin
   GET /api/routing/distance
     ?lat=&lon=&destinations=lat,lon;lat,lon;...
-------------------------------------------------- */

router.get("/distance", async (req, res) => {
  try {
    const origin = parseCoordinateObject({
      lat: req.query.lat,
      lon: req.query.lon,
      label: "Origin",
    });

    if (origin.error) {
      return res.status(400).json({ message: origin.error });
    }

    const destinations = parseDestinations(req.query.destinations);

    if (destinations.error) {
      return res.status(400).json({ message: destinations.error });
    }

    const matrix = await getDistanceMatrix(
      origin.value,
      destinations.value
    );

    return res.json(matrix);
  } catch (error) {
    console.error("Routing distance error:", error);

    return res.status(502).json({
      message: "OSRM table request failed",
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

module.exports = router;