
const express = require("express");
const cors = require("cors");
require("dotenv").config();

const {
  normalizeOsmPlace,
} = require("./utils/normalizeOsmPlace");

const {
  searchOverpassPlaces,
  normalizeOsmCategories,
} = require("./providers/overpassPlaces");

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;

/* --------------------------------------------------
   Health Check
-------------------------------------------------- */

app.get("/", (req, res) => {
  res.json({
    message: "Treval Saathi backend is running",
  });
});

/* --------------------------------------------------
   Location Search
   Search any city, destination, landmark, etc.
-------------------------------------------------- */

app.get("/api/location/search", async (req, res) => {
  try {
    const { text } = req.query;

    if (!text || text.trim().length < 2) {
      return res.json([]);
    }

    const url =
      `https://api.geoapify.com/v1/geocode/search` +
      `?text=${encodeURIComponent(text.trim())}` +
      `&limit=10` +
      `&format=json` +
      `&apiKey=${process.env.GEOAPIFY_API_KEY}`;

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(
        `Geoapify geocoding failed: ${response.status}`
      );
    }

    const data = await response.json();

    const locations = (data.results || []).map((item) => ({
      id: item.place_id,
      name:
        item.name ||
        item.city ||
        item.state ||
        item.country,
      city: item.city,
      state: item.state,
      country: item.country,
      formatted: item.formatted,
      latitude: item.lat,
      longitude: item.lon,
    }));

    return res.json(locations);
  } catch (error) {
    console.error(
      "Location search error:",
      error
    );

    return res.status(500).json({
      message: "Unable to search location",
    });
  }
});

/* --------------------------------------------------
   Nearby Places
   Existing Geoapify implementation
-------------------------------------------------- */

/*
 * Normalize a Geoapify Places GeoJSON feature into our
 * app-facing shape. Never invents values: missing fields
 * become null.
 */

function normalizeGeoapifyPlace(feature) {
  const properties =
    feature && feature.properties
      ? feature.properties
      : {};

  const geometryCoordinates =
    feature &&
    feature.geometry &&
    Array.isArray(feature.geometry.coordinates)
      ? feature.geometry.coordinates
      : [];

  /*
   * Geoapify returns lon/lat both in properties and geometry.
   * properties.lat / properties.lon are preferred;
   * fall back to geometry.coordinates = [lon, lat].
   */

  const latitude =
    typeof properties.lat === "number"
      ? properties.lat
      : geometryCoordinates[1] ?? null;

  const longitude =
    typeof properties.lon === "number"
      ? properties.lon
      : geometryCoordinates[0] ?? null;

  const categories = Array.isArray(properties.categories)
    ? properties.categories
    : null;

  return {
    id: properties.place_id ?? null,

    name: properties.name ?? null,

    category:
      categories && categories.length > 0
        ? categories[0]
        : null,

    formatted: properties.formatted ?? null,

    latitude,

    longitude,

    city: properties.city ?? null,

    state: properties.state ?? null,

    country: properties.country ?? null,

    postcode: properties.postcode ?? null,

    distance:
      typeof properties.distance === "number"
        ? properties.distance
        : null,

    categories,

    opening_hours:
      properties.opening_hours ?? null,

    website:
      properties.website ?? null,

    phone:
      properties.contact &&
      properties.contact.phone
        ? properties.contact.phone
        : null,
  };
}

app.get("/api/places/nearby", async (req, res) => {
  try {
    const {
      lat,
      lon,
      category = "tourism",
      radius = 5000,
      limit = 20,
    } = req.query;

    if (lat === undefined || lon === undefined) {
      return res.status(400).json({
        message:
          "Latitude and longitude are required",
      });
    }

    const latitude = Number(lat);
    const longitude = Number(lon);
    const searchRadius = Number(radius);
    const resultLimit = Number(limit);

    if (
      !Number.isFinite(latitude) ||
      latitude < -90 ||
      latitude > 90
    ) {
      return res.status(400).json({
        message:
          "Invalid latitude (must be between -90 and 90)",
      });
    }

    if (
      !Number.isFinite(longitude) ||
      longitude < -180 ||
      longitude > 180
    ) {
      return res.status(400).json({
        message:
          "Invalid longitude (must be between -180 and 180)",
      });
    }

    if (
      !Number.isFinite(searchRadius) ||
      searchRadius <= 0
    ) {
      return res.status(400).json({
        message:
          "Invalid radius (must be a positive number)",
      });
    }

    if (
      !Number.isInteger(resultLimit) ||
      resultLimit < 1 ||
      resultLimit > 100
    ) {
      return res.status(400).json({
        message:
          "Invalid limit (must be an integer between 1 and 100)",
      });
    }

    const categories = String(category)
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .join(",");

    if (!categories) {
      return res.status(400).json({
        message:
          "At least one category is required",
      });
    }

    const url =
      `https://api.geoapify.com/v2/places` +
      `?categories=${encodeURIComponent(categories)}` +
      `&filter=circle:${longitude},${latitude},${searchRadius}` +
      `&bias=proximity:${longitude},${latitude}` +
      `&limit=${resultLimit}` +
      `&apiKey=${process.env.GEOAPIFY_API_KEY}`;

    const response = await fetch(url);

    if (!response.ok) {
      let upstreamMessage =
        `Geoapify places request failed: ${response.status}`;

      try {
        const errorBody = await response.json();

        if (errorBody && errorBody.error) {
          upstreamMessage = errorBody.error;
        }
      } catch {
        /* Ignore unparsable upstream error body */
      }

      return res.status(502).json({
        message: upstreamMessage,
      });
    }

    const data = await response.json();

    const places = (data.features || []).map(
      normalizeGeoapifyPlace
    );

    return res.json(places);
  } catch (error) {
    console.error(
      "Nearby places error:",
      error
    );

    return res.status(500).json({
      message: "Failed to fetch nearby places",
    });
  }
});

/* --------------------------------------------------
   OSM Places / Overpass
   Maximum 3 user-selected categories
-------------------------------------------------- */

/*
 * Valid search radii in meters for nearby POI discovery.
 * Anything else falls back to the 4 km default. Kept small to
 * avoid broad, expensive Overpass queries.
 */
const ALLOWED_PLACE_RADII = [
  1000,
  2000,
  4000,
  5000,
  10000,
];
const DEFAULT_PLACE_RADIUS = 4000;

app.get("/api/osm/places", async (req, res) => {
  try {
    const {
      lat,
      lon,
      radius,
    } = req.query;

    /* -----------------------------
       Validate coordinates
    ----------------------------- */

    if (lat === undefined || lon === undefined) {
      return res.status(400).json({
        message:
          "Latitude and longitude are required",
      });
    }

    const latitude = Number(lat);
    const longitude = Number(lon);
    const parsedRadius = Number(radius);

    if (
      !Number.isFinite(latitude) ||
      latitude < -90 ||
      latitude > 90
    ) {
      return res.status(400).json({
        message:
          "Invalid latitude (must be between -90 and 90)",
      });
    }

    if (
      !Number.isFinite(longitude) ||
      longitude < -180 ||
      longitude > 180
    ) {
      return res.status(400).json({
        message:
          "Invalid longitude (must be between -180 and 180)",
      });
    }

    /* -----------------------------
       Validate search radius
       Only the allow-listed values are
       accepted; anything else falls
       back to the 4 km default.
    ----------------------------- */

    const searchRadius =
      ALLOWED_PLACE_RADII.includes(parsedRadius)
        ? parsedRadius
        : DEFAULT_PLACE_RADIUS;

    /* -----------------------------
       Read selected categories
    ----------------------------- */

    const categoriesParam =
      req.query.categories ||
      "tourist_attractions";

    const rawCategories = String(categoriesParam)
      .split(",")
      .map((category) => category.trim())
      .filter(Boolean);

    /*
     * Normalize singular/plural aliases (hospital -> hospitals,
     * restaurant -> restaurants) and cap at 3 categories so a
     * single request never builds an oversized Overpass query.
     */
    const categories = normalizeOsmCategories(
      rawCategories
    ).slice(0, 3);

    if (categories.length === 0) {
      return res.status(400).json({
        message:
          "At least one valid category is required",
      });
    }

    /* -----------------------------
       Call Overpass
    ----------------------------- */

    const { elements = [] } =
      await searchOverpassPlaces({
        latitude,
        longitude,
        radius: searchRadius,
        categories,
      });

    /* -----------------------------
       Normalize OSM data
    ----------------------------- */

    const places = elements
      .map(normalizeOsmPlace)
      .filter(
        (place) =>
          place.latitude !== null &&
          place.longitude !== null
      );

    /* -----------------------------
       Return normalized places
    ----------------------------- */

    return res.json({
      lat: latitude,
      lon: longitude,
      radius: searchRadius,
      categories,
      count: places.length,
      places,
    });
  } catch (error) {
    console.error(
      "OSM places error:",
      error
    );

    return res.status(502).json({
      message: "Overpass request failed",
      error:
        error instanceof Error
          ? error.message
          : String(error),
    });
  }
});

/* --------------------------------------------------
   OSM Diagnostic Route
-------------------------------------------------- */

app.get("/api/osm/test", (req, res) => {
  return res.json({
    message: "OSM diagnostic route is active",
  });
});

/* --------------------------------------------------
   Start Server
-------------------------------------------------- */

app.listen(PORT, () => {
  console.log(
    `Treval Saathi backend running on http://localhost:${PORT}`
  );
});