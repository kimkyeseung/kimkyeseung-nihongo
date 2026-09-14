import { create } from "zustand";
import { persist } from "zustand/middleware";

interface KanjiProgressState {
  learned: string[];
  toggleLearned: (kanji: string) => void;
  isLearned: (kanji: string) => boolean;
}

export const useKanjiProgressStore = create<KanjiProgressState>()(
  persist(
    (set, get) => ({
      learned: [],
      toggleLearned: (kanji) =>
        set((state) => ({
          learned: state.learned.includes(kanji)
            ? state.learned.filter((k) => k !== kanji)
            : [...state.learned, kanji],
        })),
      isLearned: (kanji) => get().learned.includes(kanji),
    }),
    { name: "kanji-progress" }
  )
);
