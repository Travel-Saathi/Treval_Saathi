function normalizeOsmPlace(element) {
  const tags = element.tags || {};

  const latitude =
    element.lat ??
    element.center?.lat ??
    null;

  const longitude =
    element.lon ??
    element.center?.lon ??
    null;

  let category = "other";

  if (tags.tourism) {
    category = tags.tourism;
  } else if (tags.historic) {
    category = tags.historic;
  } else if (tags.amenity === "hospital") {
    category = "hospital";
  } else if (tags.amenity === "restaurant") {
    category = "restaurant";
  } else if (tags.amenity === "cafe") {
    category = "cafe";
  } else if (tags.amenity === "pharmacy") {
    category = "pharmacy";
  } else if (tags.amenity === "fuel") {
    category = "fuel";
  } else if (tags.amenity === "parking") {
    category = "parking";
  } else if (tags.amenity === "place_of_worship") {
    category = "place_of_worship";
  } else if (tags.railway === "station") {
    category = "railway_station";
  } else if (tags.amenity === "bus_station") {
    category = "bus_station";
  } else if (tags.shop) {
    category = tags.shop;
  } else if (tags.office) {
    category = tags.office;
  } else if (tags.leisure) {
    category = tags.leisure;
  } else if (tags.natural) {
    category = tags.natural;
  }

  return {
    id: `osm-${element.type}-${element.id}`,

    name:
      tags.name ||
      tags["name:en"] ||
      null,

    category,

    formatted:
      tags["addr:full"] ||
      tags["addr:street"] ||
      tags.name ||
      null,

    latitude,
    longitude,

    city:
      tags["addr:city"] ||
      null,

    state:
      tags["addr:state"] ||
      null,

    country:
      tags["addr:country"] ||
      "India",

    postcode:
      tags["addr:postcode"] ||
      null,

    website:
      tags.website ||
      null,

    phone:
      tags.phone ||
      tags["contact:phone"] ||
      null,

    opening_hours:
      tags.opening_hours ||
      null,

    wheelchair:
      tags.wheelchair ||
      null,

    religion:
      tags.religion ||
      null,

    osmType: element.type,
    osmId: element.id,

    tags,
  };
}

module.exports = {
  normalizeOsmPlace,
};