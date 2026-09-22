/*
 * Platform-neutral entry point for PlaceMap.
 *
 * Metro resolves the platform-specific implementation first
 * (PlaceMap.native.tsx on iOS/Android, PlaceMap.web.tsx on web),
 * so this barrel is only used to satisfy TypeScript resolution.
 */
export { default } from "./PlaceMap.native";

export type {
  JourneyStopMarker,
  PlaceMapDestination,
  PlaceMapProps,
  PlaceMapRegion,
  PlaceMapStyle,
  RouteCoordinate,
  RouteLeg,
  RouteLegState,
} from "./PlaceMap.types";