import { create } from "zustand";

export interface SelectedLocation {
  id: string;
  name: string;
  formatted: string;
  latitude: number;
  longitude: number;
}

interface LocationStore {
  selectedLocation: SelectedLocation | null;
  setSelectedLocation: (location: SelectedLocation | null) => void;
}

export const useLocationStore = create<LocationStore>((set) => ({
  selectedLocation: null,
  setSelectedLocation: (location) => set({ selectedLocation: location }),
}));