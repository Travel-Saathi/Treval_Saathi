import { Stack } from "expo-router";

/**
 * Nested stack for the Profile tab. Profile sub-pages (Edit Profile,
 * Travel Preferences, ...) push onto this stack so the tab bar stays
 * visible while deeper screens are shown. Native headers are turned off
 * — each screen renders its own themed header (brand header on the main
 * Profile page, back-button header on sub-pages) to match the rest of
 * the app.
 */
export default function ProfileStackLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: "slide_from_right",
      }}
    />
  );
}