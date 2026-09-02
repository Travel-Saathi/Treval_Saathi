import { Text, View } from "react-native";

export default function HomeScreen() {
  console.log("[AUTH_DEBUG] HOME_MOUNT");

  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
      <Text>Home Screen</Text>
    </View>
  );
}
