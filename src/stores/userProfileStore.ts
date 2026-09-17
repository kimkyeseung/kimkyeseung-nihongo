import { create } from "zustand";
import { persist } from "zustand/middleware";

interface UserProfileState {
  name: string;
  setName: (name: string) => void;
}

export const useUserProfileStore = create<UserProfileState>()(
  persist(
    (set) => ({
      name: "",
      setName: (name) => set({ name: name.trim() }),
    }),
    { name: "user-profile" }
  )
);
