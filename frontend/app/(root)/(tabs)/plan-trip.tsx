import { Text, View } from "react-native";

import DesktopPlanTrip from "../../../components/desktop/DesktopPlanTrip";
import { useIsDesktop } from "../../../hook/useDesktop";

export default function PlanTripScreen() {
  const isDesktop = useIsDesktop();

  if (isDesktop) {
    return <DesktopPlanTrip />;
  }

  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
      <Text>Plan Trip Screen</Text>
    </View>
  );
}