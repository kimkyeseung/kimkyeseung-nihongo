import { create } from "zustand";
import { persist } from "zustand/middleware";

const MAX_RECENT = 10;

interface RecentSearchesState {
  recent: string[];
  add: (term: string) => void;
  clear: () => void;
}

export const useRecentSearchesStore = create<RecentSearchesState>()(
  persist(
    (set) => ({
      recent: [],
      add: (term) =>
        set((state) => {
          const trimmed = term.trim();
          if (!trimmed) return state;
          return { recent: [trimmed, ...state.recent.filter((t) => t !== trimmed)].slice(0, MAX_RECENT) };
        }),
      clear: () => set({ recent: [] }),
    }),
    { name: "recent-searches" }
  )
);
