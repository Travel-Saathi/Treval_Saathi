/**
 * Lightweight OSRM routing service.
 *
 * Thin wrapper around an OSRM backend:
 *  - /route for point-to-point (or multi-stop) driving routes
 *  - /table for an origin → destinations distance/duration matrix
 *
 * Coordinates follow the OSRM convention:
 * longitude first, latitude second.
 *
 * Also supports routing directly from place objects:
 *  - getRouteForPlaces(places)
 *
 * All network calls use fetch + AbortController so a slow or
 * offline OSRM server fails fast instead of hanging the request.
 */

/* --------------------------------------------------
   Endpoint defaults
-------------------------------------------------- */

const OSRM_BASE_URL =
  process.env.OSRM_SERVER ||
  "https://router.project-osrm.org";

const REQUEST_TIMEOUT_MS = 30000;


/* --------------------------------------------------
   OSRM request helpers
-------------------------------------------------- */

/**
 * Perform a GET request against an OSRM API endpoint.
 *
 * Example:
 * /route/v1/driving/77.4,23.2;77.5,23.3
 */
async function fetchOsrm(
  path,
  timeoutMs = REQUEST_TIMEOUT_MS
) {
  const controller = new AbortController();

  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const url = `${OSRM_BASE_URL}${path}`;

    const response = await fetch(url, {
      method: "GET",

      headers: {
        Accept: "application/json",
        "User-Agent": "TravelSaathi/1.0",
      },

      signal: controller.signal,
    });

    const text = await response.text();

    if (!response.ok) {
      throw new Error(
        `OSRM HTTP ${response.status}: ${text.slice(0, 200)}`
      );
    }

    let data;

    try {
      data = JSON.parse(text);
    } catch {
      throw new Error("Invalid JSON from OSRM");
    }

    return data;
  } finally {
    clearTimeout(timer);
  }
}


/* --------------------------------------------------
   Route distance/duration between two points
-------------------------------------------------- */

/**
 * Compute driving distance and duration between
 * an origin and a destination.
 *
 * Accepts:
 *
 * {
 *   latitude: 23.259,
 *   longitude: 77.412
 * }
 *
 * OR:
 *
 * [77.412, 23.259]
 */
async function getRouteBetween(
  origin,
  destination
) {
  const originCoords = toLonLat(origin);
  const destinationCoords = toLonLat(destination);

  const coords =
    `${originCoords[0]},${originCoords[1]};` +
    `${destinationCoords[0]},${destinationCoords[1]}`;

  const data = await fetchOsrm(
    `/route/v1/driving/${coords}` +
      `?overview=false&steps=false&alternatives=false`
  );

  return normalizeRoute(data);
}


/* --------------------------------------------------
   Route distance/duration across multiple stops
-------------------------------------------------- */

/**
 * Compute one driving route across 2+ coordinates.
 *
 * Example:
 *
 * getRoute([
 *   { latitude: 23.259, longitude: 77.412 },
 *   { latitude: 23.215, longitude: 77.434 },
 *   { latitude: 23.241, longitude: 77.429 }
 * ])
 *
*  Optionally returns route geometry.
 *
 *  `format` controls the geometry encoding when `geometry` is true:
 *   - "polyline" (default) -> OSRM encoded polyline
 *   - "geojson"            -> GeoJSON LineString
 */
async function getRoute(
  coordinates,
  { geometry = false, format = "polyline" } = {}
) {
  if (
    !Array.isArray(coordinates) ||
    coordinates.length < 2
  ) {
    throw new Error(
      "getRoute requires at least 2 coordinates"
    );
  }

  if (
    format !== "polyline" &&
    format !== "geojson"
  ) {
    throw new Error(
      "format must be \"polyline\" or \"geojson\""
    );
  }

  const coords = coordinates
    .map(toLonLat)
    .map(([lon, lat]) => `${lon},${lat}`)
    .join(";");

  const overview = geometry
    ? "full"
    : "false";

  const geometries = geometry
    ? `&geometries=${format}`
    : "";

  const data = await fetchOsrm(
    `/route/v1/driving/${coords}` +
      `?overview=${overview}` +
      geometries +
      `&steps=false` +
      `&alternatives=false`
  );

  return normalizeRoute(data, {
    geometry,
  });
}


/* --------------------------------------------------
   Route directly from places
-------------------------------------------------- */

/**
 * Compute a route using place objects.
 *
 * Expected place format:
 *
 * [
 *   {
 *     name: "Place A",
 *     lat: 23.259,
 *     lng: 77.412
 *   },
 *   {
 *     name: "Place B",
 *     lat: 23.215,
 *     lng: 77.434
 *   }
 * ]
 *
 * The order of the places is preserved.
 *
 * This function is useful after the place-discovery
 * layer returns OSM/Overpass places.
 */
async function getRouteForPlaces(places) {
  if (
    !Array.isArray(places) ||
    places.length < 2
  ) {
    throw new Error(
      "At least 2 places are required"
    );
  }

  /* -----------------------------------------------
     Validate places
  ------------------------------------------------ */

  places.forEach((place, index) => {
    if (!place || typeof place !== "object") {
      throw new Error(
        `Place ${index + 1} is invalid`
      );
    }

    if (
      typeof place.lat !== "number" ||
      !Number.isFinite(place.lat)
    ) {
      throw new Error(
        `Place ${index + 1} latitude is invalid`
      );
    }

    if (
      typeof place.lng !== "number" ||
      !Number.isFinite(place.lng)
    ) {
      throw new Error(
        `Place ${index + 1} longitude is invalid`
      );
    }

    if (
      place.lat < -90 ||
      place.lat > 90
    ) {
      throw new Error(
        `Place ${index + 1} latitude must be between -90 and 90`
      );
    }

    if (
      place.lng < -180 ||
      place.lng > 180
    ) {
      throw new Error(
        `Place ${index + 1} longitude must be between -180 and 180`
      );
    }
  });


  /* -----------------------------------------------
     Convert places → OSRM lon,lat coordinates
  ------------------------------------------------ */

  const coordinates = places
    .map((place) => {
      return `${place.lng},${place.lat}`;
    })
    .join(";");


  /* -----------------------------------------------
     Request OSRM
  ------------------------------------------------ */

  const data = await fetchOsrm(
    `/route/v1/driving/${coordinates}` +
      `?overview=full` +
      `&geometries=geojson` +
      `&steps=true`
  );


  /* -----------------------------------------------
     Validate OSRM response
  ------------------------------------------------ */

  if (data.code !== "Ok") {
    throw new Error(
      `OSRM routing failed: ${data.code || "unknown"}`
    );
  }

  if (
    !Array.isArray(data.routes) ||
    data.routes.length === 0
  ) {
    throw new Error(
      "OSRM returned no route"
    );
  }

  const route = data.routes[0];


  /* -----------------------------------------------
     Return normalized place route
  ------------------------------------------------ */

  return {
    code: data.code,

    distance: {
      meters:
        typeof route.distance === "number"
          ? route.distance
          : null,

      kilometers:
        typeof route.distance === "number"
          ? route.distance / 1000
          : null,
    },

    duration: {
      seconds:
        typeof route.duration === "number"
          ? route.duration
          : null,

      minutes:
        typeof route.duration === "number"
          ? route.duration / 60
          : null,
    },

    geometry:
      route.geometry ?? null,

    waypoints:
      Array.isArray(data.waypoints)
        ? data.waypoints
        : [],

    places,
  };
}


/* --------------------------------------------------
   Distance/duration matrix
-------------------------------------------------- */

/**
 * Compute driving distance and duration from one
 * origin to multiple destinations.
 *
 * Returns:
 *
 * {
 *   results: [
 *     {
 *       destinationIndex: 0,
 *       distance: {
 *         meters,
 *         kilometers
 *       },
 *       duration: {
 *         seconds,
 *         minutes
 *       }
 *     }
 *   ]
 * }
 */
async function getDistanceMatrix(
  origin,
  destinations
) {
  if (
    !Array.isArray(destinations) ||
    destinations.length === 0
  ) {
    throw new Error(
      "getDistanceMatrix requires at least 1 destination"
    );
  }

  const originLonLat = toLonLat(origin);

  const destinationLonLats =
    destinations.map(toLonLat);

  const coords = [
    originLonLat,
    ...destinationLonLats,
  ]
    .map(([lon, lat]) => {
      return `${lon},${lat}`;
    })
    .join(";");


  /*
   * Row 0 is the origin.
   *
   * Example:
   *
   * origin → destination 1
   * origin → destination 2
   * origin → destination 3
   *
   * annotations=duration,distance returns
   * both matrices.
   */

  const data = await fetchOsrm(
    `/table/v1/driving/${coords}` +
      `?annotations=duration,distance`
  );


  /* -----------------------------------------------
     Validate OSRM response
  ------------------------------------------------ */

  if (data.code !== "Ok") {
    throw new Error(
      `OSRM table request failed (${data.code || "unknown"})`
    );
  }


  const distances =
    data.distances &&
    data.distances[0];

  const durations =
    data.durations &&
    data.durations[0];


  /* -----------------------------------------------
     Build destination results
  ------------------------------------------------ */

  const results =
    destinationLonLats.map(
      (_, index) => {

        const distanceMeters =
          distances &&
          typeof distances[index + 1] === "number"
            ? distances[index + 1]
            : null;

        const durationSeconds =
          durations &&
          typeof durations[index + 1] === "number"
            ? durations[index + 1]
            : null;


        return {
          destinationIndex: index,

          distance: {
            meters: distanceMeters,

            kilometers:
              distanceMeters === null
                ? null
                : distanceMeters / 1000,
          },

          duration: {
            seconds: durationSeconds,

            minutes:
              durationSeconds === null
                ? null
                : durationSeconds / 60,
          },
        };
      }
    );


  return {
    results,
  };
}


/* --------------------------------------------------
   Response normalization
-------------------------------------------------- */

/**
 * Extract a normalized route summary from an OSRM
 * /route response.
 *
 * Missing values become null.
 */
function normalizeRoute(
  data,
  { geometry = false } = {}
) {
  if (
    !data ||
    data.code !== "Ok"
  ) {
    throw new Error(
      `OSRM route request failed (${(
        data &&
        data.code
      ) || "unknown"})`
    );
  }


  const route =
    Array.isArray(data.routes) &&
    data.routes.length > 0
      ? data.routes[0]
      : null;


  const waypoints =
    Array.isArray(data.waypoints)
      ? data.waypoints.map(
          (waypoint) => ({
            name:
              waypoint.name ?? null,

            distance:
              typeof waypoint.distance ===
              "number"
                ? waypoint.distance
                : null,

            location:
              Array.isArray(
                waypoint.location
              ) &&
              waypoint.location.length === 2
                ? {
                    longitude:
                      waypoint.location[0],

                    latitude:
                      waypoint.location[1],
                  }
                : null,
          })
        )
      : [];


  const result = {
    code: data.code,

    distance: {
      meters:
        route &&
        typeof route.distance ===
          "number"
          ? route.distance
          : null,

      kilometers:
        route &&
        typeof route.distance ===
          "number"
          ? route.distance / 1000
          : null,
    },

    duration: {
      seconds:
        route &&
        typeof route.duration ===
          "number"
          ? route.duration
          : null,

      minutes:
        route &&
        typeof route.duration ===
          "number"
          ? route.duration / 60
          : null,
    },

    waypoints,
  };


  if (
    geometry &&
    route
  ) {
    result.geometry =
      route.geometry ?? null;
  }


  return result;
}


/* --------------------------------------------------
   Coordinate helpers
-------------------------------------------------- */

/**
 * Normalize a coordinate input to:
 *
 * [longitude, latitude]
 *
 * Accepts:
 *
 * { latitude, longitude }
 *
 * OR:
 *
 * [longitude, latitude]
 */
function toLonLat(coordinate) {

  /* -----------------------------------------------
     Array format
  ------------------------------------------------ */

  if (Array.isArray(coordinate)) {

    if (coordinate.length < 2) {
      throw new Error(
        "Coordinate array needs 2 values"
      );
    }

    const longitude =
      coordinate[0];

    const latitude =
      coordinate[1];

    if (
      typeof longitude !== "number" ||
      typeof latitude !== "number" ||
      !Number.isFinite(longitude) ||
      !Number.isFinite(latitude)
    ) {
      throw new Error(
        "Coordinate array must contain valid numbers"
      );
    }

    return [
      longitude,
      latitude,
    ];
  }


  /* -----------------------------------------------
     Object format
  ------------------------------------------------ */

  if (
    coordinate &&
    typeof coordinate === "object" &&
    typeof coordinate.longitude ===
      "number" &&
    typeof coordinate.latitude ===
      "number"
  ) {

    return [
      coordinate.longitude,
      coordinate.latitude,
    ];
  }


  throw new Error(
    "Invalid coordinate; use { latitude, longitude } or [longitude, latitude]"
  );
}


/* --------------------------------------------------
   Exports
-------------------------------------------------- */

module.exports = {
  getRoute,
  getRouteBetween,
  getDistanceMatrix,
  getRouteForPlaces,
  toLonLat,
};