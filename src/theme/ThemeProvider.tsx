import React, { createContext, useCallback, useContext, useMemo, useState } from "react";

import { darkTheme, lightTheme, type ThemeMode, type ThemeTokens } from "./tokens";

interface ThemeContextValue {
  mode: ThemeMode;
  theme: ThemeTokens;
  dark: boolean;
  toggleTheme: () => void;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  mode: "light",
  theme: lightTheme,
  dark: false,
  toggleTheme: () => {},
  setMode: () => {},
});

export function useAppTheme() {
  return useContext(ThemeContext);
}

export function AppThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>("light");

  const toggleTheme = useCallback(() => {
    setMode((prev) => (prev === "dark" ? "light" : "dark"));
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      mode,
      theme: mode === "dark" ? darkTheme : lightTheme,
      dark: mode === "dark",
      toggleTheme,
      setMode,
    }),
    [mode, toggleTheme, setMode]
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}