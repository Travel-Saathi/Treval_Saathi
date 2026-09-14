export interface ThemeTokens {
  background: string;
  surface: string;
  surfaceSecondary: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  border: string;
  primary: string;
  primaryDark: string;
  primaryLight: string;
  icon: string;
  inputBackground: string;
  overlay: string;
  danger: string;
  warning: string;
  info: string;
  onPrimary: string;
  headerBg: string;
  headerText: string;
  route: string;

  text: string;
  inputBg: string;
  tabInactive: string;
}

export const lightTheme: ThemeTokens = {
  background: "#F7F8FA",
  surface: "#FFFFFF",
  surfaceSecondary: "#F1F4F2",
  textPrimary: "#111111",
  textSecondary: "#5F6661",
  textMuted: "#858C87",
  border: "#E1E6E2",
  primary: "#00BC26",
  primaryDark: "#007A1E",
  primaryLight: "#E7F9EB",
  icon: "#303530",
  inputBackground: "#FFFFFF",
  overlay: "rgba(0,0,0,0.45)",
  danger: "#E53935",
  warning: "#F59E0B",
  info: "#2563EB",
  onPrimary: "#FFFFFF",
  headerBg: "#00BC26",
  headerText: "#FFFFFF",
  route: "#00BC26",

  text: "#111111",
  inputBg: "#FFFFFF",
  tabInactive: "#454545",
};

export const darkTheme: ThemeTokens = {
  background: "#0F1411",
  surface: "#18201B",
  surfaceSecondary: "#202A23",
  textPrimary: "#FFFFFF",
  textSecondary: "#C5CEC8",
  textMuted: "#8F9B94",
  border: "#2D3831",
  primary: "#00BC26",
  primaryDark: "#00A821",
  primaryLight: "#123D1D",
  icon: "#F2F5F3",
  inputBackground: "#202A23",
  overlay: "rgba(0,0,0,0.6)",
  danger: "#F87171",
  warning: "#FBBF24",
  info: "#60A5FA",
  onPrimary: "#FFFFFF",
  headerBg: "#00A821",
  headerText: "#FFFFFF",
  route: "#00E33A",

  text: "#FFFFFF",
  inputBg: "#202A23",
  tabInactive: "#8A978E",
};

export type ThemeMode = "light" | "dark" | "system";