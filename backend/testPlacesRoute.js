const {
  getRouteForPlaces,
} = require("./services/osrmService");

async function test() {
  const places = [
    {
      name: "Place A",
      lat: 23.259346,
      lng: 77.412823,
    },
    {
      name: "Place B",
      lat: 23.215529,
      lng: 77.434004,
    },
    {
      name: "Place C",
      lat: 23.241912,
      lng: 77.429546,
    },
  ];

  try {
    const result = await getRouteForPlaces(places);

    console.log(
      JSON.stringify(result, null, 2)
    );
  } catch (error) {
    console.error("Test failed:");
    console.error(error.message);
  }
}

test();