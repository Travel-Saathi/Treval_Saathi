export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL || "http://localhost:5000";
export async function searchLocation(query, signal) {
  const q = query.trim();

  if (q.length < 2) {
    return [];
  }

  const response = await fetch(
    `${API_BASE_URL}/api/location/search?text=${encodeURIComponent(q)}`,
    { signal }
  );

  if (!response.ok) {
    throw new Error(`Location search failed with status ${response.status}`);
  }

  return response.json();
}

module.exports = {
  searchLocation,
  API_BASE_URL,
};