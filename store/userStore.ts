import { create } from "zustand";

interface UserStore {
  isAdmin: boolean;
  profileComplete: boolean;
  profileLoading: boolean;
  syncError: string | null;
  setIsAdmin: (value: boolean) => void;
  setProfileComplete: (value: boolean) => void;
  setProfileLoading: (value: boolean) => void;
  setSyncError: (value: string | null) => void;
}

export const useUserStore = create<UserStore>((set) => ({
  isAdmin: false,
  profileComplete: false,
  profileLoading: false,
  syncError: null,

  setIsAdmin: (value) => set({ isAdmin: value }),
  setProfileComplete: (value) => set({ profileComplete: value }),
  setProfileLoading: (value) => set({ profileLoading: value }),
  setSyncError: (value) => set({ syncError: value }),
}));