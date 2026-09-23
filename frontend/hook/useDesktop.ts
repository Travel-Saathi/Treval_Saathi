import { Platform, useWindowDimensions } from "react-native";

/**
 * Minimum window width (in points) above which the desktop experience kicks
 * in. Tablets and phones below this width keep the original mobile UI.
 */
export const DESKTOP_BREAKPOINT = 1024;

/**
 * True when the app is running on a browser window that is clearly desktop
 * sized. During static export / server prerender the window has no size yet,
 * so this safely falls back to false and the mobile markup is emitted first.
 */
export function useIsDesktop(): boolean {
  const { width } = useWindowDimensions();

  if (Platform.OS !== "web") {
    return false;
  }

  return width >= DESKTOP_BREAKPOINT;
}