import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createInitialSrs, reviewSrs, type SrsState } from "../lib/srs";

export interface WordbookEntry {
  wordId: string;
  addedAt: number;
  mastered: boolean;
  groupIds: string[];
  srs: SrsState;
}

export interface WordGroup {
  id: string;
  name: string;
}

interface WordbookState {
  entries: Record<string, WordbookEntry>;
  groups: WordGroup[];
  addWord: (wordId: string) => void;
  removeWord: (wordId: string) => void;
  restoreEntry: (entry: WordbookEntry) => void;
  toggleWord: (wordId: string) => void;
  isInWordbook: (wordId: string) => boolean;
  createGroup: (name: string) => void;
  deleteGroup: (groupId: string) => void;
  setWordGroups: (wordId: string, groupIds: string[]) => void;
  review: (wordId: string, know: boolean) => void;
}

export const useWordbookStore = create<WordbookState>()(
  persist(
    (set, get) => ({
      entries: {},
      groups: [],

      addWord: (wordId) =>
        set((state) => {
          if (state.entries[wordId]) return state;
          return {
            entries: {
              ...state.entries,
              [wordId]: {
                wordId,
                addedAt: Date.now(),
                mastered: false,
                groupIds: [],
                srs: createInitialSrs(),
              },
            },
          };
        }),

      removeWord: (wordId) =>
        set((state) => {
          const next = { ...state.entries };
          delete next[wordId];
          return { entries: next };
        }),

      restoreEntry: (entry) =>
        set((state) => ({ entries: { ...state.entries, [entry.wordId]: entry } })),

      toggleWord: (wordId) => {
        if (get().entries[wordId]) get().removeWord(wordId);
        else get().addWord(wordId);
      },

      isInWordbook: (wordId) => Boolean(get().entries[wordId]),

      createGroup: (name) =>
        set((state) => {
          const trimmed = name.trim();
          if (!trimmed) return state;
          return { groups: [...state.groups, { id: crypto.randomUUID(), name: trimmed }] };
        }),

      deleteGroup: (groupId) =>
        set((state) => ({
          groups: state.groups.filter((g) => g.id !== groupId),
          entries: Object.fromEntries(
            Object.entries(state.entries).map(([id, entry]) => [
              id,
              { ...entry, groupIds: entry.groupIds.filter((g) => g !== groupId) },
            ])
          ),
        })),

      setWordGroups: (wordId, groupIds) =>
        set((state) => {
          const entry = state.entries[wordId];
          if (!entry) return state;
          return { entries: { ...state.entries, [wordId]: { ...entry, groupIds } } };
        }),

      review: (wordId, know) =>
        set((state) => {
          const entry = state.entries[wordId];
          if (!entry) return state;
          return {
            entries: {
              ...state.entries,
              [wordId]: {
                ...entry,
                mastered: know ? true : entry.mastered,
                srs: reviewSrs(entry.srs, know),
              },
            },
          };
        }),
    }),
    { name: "wordbook" }
  )
);
