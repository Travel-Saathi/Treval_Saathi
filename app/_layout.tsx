import { ClerkProvider } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import { Slot } from "expo-router";
import "../src/global.css";
import { AppThemeProvider } from "../src/theme/ThemeProvider";

export default function RootLayout() {
	const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;

	if (!publishableKey) {
		throw new Error("Add your Clerk Publishable Key to the process.env file");
	}

	return (
		<ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
			<AppThemeProvider>
				<Slot />
			</AppThemeProvider>
		</ClerkProvider>
	);
}
