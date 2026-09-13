export interface ThemeTokens {
  background: string;
  surface: string;
  surfaceSecondary: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  border: string;
  primary: string;
  primaryDark: string;
  primaryLight: string;
  danger: string;
  onPrimary: string;
  headerBg: string;
  headerText: string;
  inputBg: string;
  tabInactive: string;
  overlay: string;
}

export const lightTheme: ThemeTokens = {
  background: "#F7F8FA",
  surface: "#FFFFFF",
  surfaceSecondary: "#F7F9F8",
  text: "#1C1C1E",
  textSecondary: "#6B7280",
  textMuted: "#9CA1A9",
  border: "#E5E7EB",
  primary: "#00BC26",
  primaryDark: "#007A1E",
  primaryLight: "#E7F9EB",
  danger: "#E53935",
  onPrimary: "#FFFFFF",
  headerBg: "#00BC26",
  headerText: "#FFFFFF",
  inputBg: "#F7F9F8",
  tabInactive: "#454545",
  overlay: "rgba(0,0,0,0.45)",
};

export const darkTheme: ThemeTokens = {
  background: "#101412",
  surface: "#18201B",
  surfaceSecondary: "#1E2822",
  text: "#F5F7F5",
  textSecondary: "#AAB5AD",
  textMuted: "#7C8A80",
  border: "#2A352D",
  primary: "#00BC26",
  primaryDark: "#0A8A20",
  primaryLight: "#1E3925",
  danger: "#F87171",
  onPrimary: "#FFFFFF",
  headerBg: "#0A8A20",
  headerText: "#FFFFFF",
  inputBg: "#1E2822",
  tabInactive: "#8A978E",
  overlay: "rgba(0,0,0,0.6)",
};

export type ThemeMode = "light" | "dark";