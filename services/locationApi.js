import Constants from "expo-constants";

function resolveApiBaseUrl() {
  if (process.env.EXPO_PUBLIC_API_BASE_URL) {
    return process.env.EXPO_PUBLIC_API_BASE_URL;
  }
  const hostUri =
    Constants.expoConfig?.hostUri ||
    Constants.manifest2?.extra?.expoGo?.debuggerHost ||
    Constants.manifest?.debuggerHost;

  if (hostUri) {
    const ip = hostUri.split(":")[0];
    return `http://${ip}:5000`;
  }
  return "http://localhost:5000";
}

export const API_BASE_URL = resolveApiBaseUrl();

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