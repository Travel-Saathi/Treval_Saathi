import type { TravelPlace } from "../services/placesApi";

export interface PlaceMapDestination {
  name: string;
  formatted: string;
  latitude: number;
  longitude: number;
}

export interface PlaceMapRegion {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

export interface RouteCoordinate {
  latitude: number;
  longitude: number;
}

export interface JourneyStopMarker {
  key: string;
  name: string;
  latitude: number;
  longitude: number;
  kind: "source" | "stop" | "destination";
}

export interface PlaceMapProps {
  places: TravelPlace[];
  destination?: PlaceMapDestination | null;
  selectedPlace?: TravelPlace | null;
  initialRegion: PlaceMapRegion;
  onPlacePress?: (place: TravelPlace) => void;

  // Journey mode: stop markers along a planned route + an optional
  // route polyline. When `journeyStops` is provided, the map renders
  // journey mode instead of the place-discovery markers.
  journeyStops?: JourneyStopMarker[];
  routeCoordinates?: RouteCoordinate[];
}