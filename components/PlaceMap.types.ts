import type { RouteAttraction, TravelPlace } from "../services/placesApi";

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

/** Progress of one route leg relative to the current journey segment. */
export type RouteLegState = "completed" | "active" | "upcoming";

/**
 * A coloured portion of the journey route. When `routeLegs` is provided,
 * each leg is drawn with its own state styling; otherwise the whole
 * `routeCoordinates` line falls back to the "active" look.
 */
export interface RouteLeg {
  id: string;
  coordinates: RouteCoordinate[];
  state: RouteLegState;
}

/** Base-map visual style. "road" keeps the street map; "satellite" swaps
 *  the imagery layer while every route/marker overlay stays on top. */
export type PlaceMapStyle = "road" | "satellite";

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

  // Journey mode: optional per-leg breakdown of `routeCoordinates` so the
  // line can express completed / active / upcoming sections visually.
  routeLegs?: RouteLeg[];

  // Journey mode additions: discovered points of interest inside the
  // route corridor. Markers render only for entries with coordinates.
  attractions?: RouteAttraction[];
  onAttractionPress?: (attraction: RouteAttraction) => void;

  // Base-map style switching (Road / Satellite). The map draws its own
  // compact style control and forwards changes through `onMapStyleChange`.
  mapStyle?: PlaceMapStyle;
  onMapStyleChange?: (style: PlaceMapStyle) => void;

  /** Region the built-in "My location / Re-centre" control animates to. */
  recenterRegion?: PlaceMapRegion | null;

  /** Prefer "Next Stop" over "Destination" on the final journey marker. */
  nextStopLabel?: boolean;

  /** Extra top/bottom spacing applied to floating controls (full-screen use). */
  topInset?: number;
  bottomInset?: number;
}