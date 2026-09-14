import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { useColorScheme } from "react-native";

import {
  darkTheme,
  lightTheme,
  type ThemeMode,
  type ThemeTokens,
} from "./tokens";
import { loadThemeMode, saveThemeMode } from "./themeStorage";

interface ThemeContextValue {
  mode: ThemeMode;
  resolvedMode: "light" | "dark";
  theme: ThemeTokens;
  dark: boolean;
  toggleTheme: () => void;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  mode: "system",
  resolvedMode: "light",
  theme: lightTheme,
  dark: false,
  toggleTheme: () => {},
  setMode: () => {},
});

export function useAppTheme() {
  return useContext(ThemeContext);
}

export function AppThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setMode] = useState<ThemeMode>("system");

  useEffect(() => {
    let cancelled = false;

    loadThemeMode().then((saved) => {
      if (cancelled || !saved) return;
      setMode(saved);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    saveThemeMode(mode);
  }, [mode]);

  const resolvedDark =
    mode === "system" ? systemScheme === "dark" : mode === "dark";

  const resolvedMode: "light" | "dark" =
    mode === "system"
      ? systemScheme === "dark"
        ? "dark"
        : "light"
      : mode;

  const toggleTheme = useCallback(() => {
    const isCurrentlyDark =
      mode === "system" ? systemScheme === "dark" : mode === "dark";
    setMode(isCurrentlyDark ? "light" : "dark");
  }, [mode, systemScheme]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      mode,
      resolvedMode,
      theme: resolvedDark ? darkTheme : lightTheme,
      dark: resolvedDark,
      toggleTheme,
      setMode,
    }),
    [mode, resolvedMode, resolvedDark, toggleTheme]
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}