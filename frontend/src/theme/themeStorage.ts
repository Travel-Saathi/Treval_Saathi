import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

import type { ThemeMode } from "./tokens";

const THEME_KEY = "treval_theme_mode";

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === "light" || value === "dark" || value === "system";
}

export async function loadThemeMode(): Promise<ThemeMode | null> {
  try {
    if (Platform.OS === "web") {
      if (typeof window === "undefined") return null;
      const value = window.localStorage.getItem(THEME_KEY);
      return value && isThemeMode(value) ? value : null;
    }
    const value = await SecureStore.getItemAsync(THEME_KEY);
    return value && isThemeMode(value) ? value : null;
  } catch {
    return null;
  }
}

export async function saveThemeMode(mode: ThemeMode): Promise<void> {
  try {
    if (Platform.OS === "web") {
      if (typeof window !== "undefined") window.localStorage.setItem(THEME_KEY, mode);
      return;
    }
    await SecureStore.setItemAsync(THEME_KEY, mode);
  } catch {
    // ignore persistence failures (private mode / unavailable secure store)
  }
}