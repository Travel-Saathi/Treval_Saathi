import { Text, View } from "react-native";

import DesktopLiveUpdates from "../../../components/desktop/DesktopLiveUpdates";
import { useIsDesktop } from "../../../hook/useDesktop";

export default function LiveUpdatesScreen() {
  const isDesktop = useIsDesktop();

  if (isDesktop) {
    return <DesktopLiveUpdates />;
  }

  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
      <Text>Live Updates Screen</Text>
    </View>
  );
}