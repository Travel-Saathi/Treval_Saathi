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

export interface PlaceMapProps {
  places: TravelPlace[];
  destination?: PlaceMapDestination | null;
  selectedPlace?: TravelPlace | null;
  initialRegion: PlaceMapRegion;
  onPlacePress?: (place: TravelPlace) => void;
}