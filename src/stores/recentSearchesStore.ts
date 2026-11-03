import { create } from "zustand";
import { persist } from "zustand/middleware";

const MAX_RECENT = 10;

/**
 * 검색 기록 한 줄. 자동완성·최근 기록에서 **고른 단어**는 `wordId`를 같이 남겨 뜻까지 보여주고
 * 누르면 그 단어로 바로 간다. 직접 친 검색어(Enter)는 `term`만 있다.
 * 표기가 같은 단어(上手 じょうず/うわて)를 가르려고 표기가 아니라 id를 남긴다.
 */
export type RecentSearch = { term: string; wordId?: string };

interface RecentSearchesState {
  recent: RecentSearch[];
  add: (term: string, wordId?: string) => void;
  clear: () => void;
}

function sameItem(a: RecentSearch, b: RecentSearch): boolean {
  return a.wordId || b.wordId ? a.wordId === b.wordId : a.term === b.term;
}

export const useRecentSearchesStore = create<RecentSearchesState>()(
  persist(
    (set) => ({
      recent: [],
      add: (term, wordId) =>
        set((state) => {
          const trimmed = term.trim();
          if (!trimmed) return state;
          const item: RecentSearch = wordId ? { term: trimmed, wordId } : { term: trimmed };
          return { recent: [item, ...state.recent.filter((r) => !sameItem(r, item))].slice(0, MAX_RECENT) };
        }),
      clear: () => set({ recent: [] }),
    }),
    {
      name: "recent-searches",
      // v0은 문자열 배열이었다. 백업 파일에서도 옛 모양이 돌아오므로 모양이 틀린 값은 버린다.
      version: 1,
      migrate: (persisted) => {
        const old = (persisted as { recent?: unknown })?.recent;
        const recent: RecentSearch[] = Array.isArray(old)
          ? old.filter((t): t is string => typeof t === "string" && t.trim() !== "").map((term) => ({ term }))
          : [];
        return { recent } as RecentSearchesState;
      },
    }
  )
);
