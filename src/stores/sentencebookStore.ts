import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * 단어장의 **문장** 칸. 회화 상대의 대사·선생님 답변의 예문처럼 "이 문장 통째로 다시 보고
 * 싶다"를 담아둔다.
 *
 * 단어(`wordbookStore`)와 저장소를 나눈 이유: 문장은 담을 때마다 전체를 다시 직렬화하는
 * 비용이 단어 목록과 엮일 이유가 없고, 담는 경로(케밥 메뉴)도 다르다. 둘 다 사용자가 직접
 * 담는 만큼 개수에 상한이 없지 않으므로 localStorage(persist)로 충분하다 — 끝없이 쌓이는
 * 학습 기록(IndexedDB)과는 성격이 다르다.
 */
export interface SentenceEntry {
  /** 정규화한 문장 자체가 곧 id다 — 같은 문장을 두 번 담지 않게. */
  id: string;
  /** 화면에 그대로 보여줄 원문. */
  text: string;
  /** 어디서 담았는지("상대 문장", "예문"...). 목록에서 출처를 알려주는 용도. */
  source?: string;
  addedAt: number;
}

/**
 * 같은 문장인지 판단하는 기준. 앞뒤 공백과 연속 공백만 정리한다 — 그 이상 손대면(구두점
 * 제거 등) 다른 문장을 같은 것으로 합쳐버린다.
 */
export function sentenceKey(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

interface SentencebookState {
  entries: Record<string, SentenceEntry>;
  /** 새로 담았으면 true, 이미 있었으면 false(XP는 이때만 준다). */
  addSentence: (text: string, source?: string) => boolean;
  removeSentence: (id: string) => void;
  hasSentence: (text: string) => boolean;
}

export const useSentencebookStore = create<SentencebookState>()(
  persist(
    (set, get) => ({
      entries: {},

      addSentence: (text, source) => {
        const id = sentenceKey(text);
        if (!id || get().entries[id]) return false;
        set((state) => ({
          entries: {
            ...state.entries,
            [id]: { id, text: text.trim(), source, addedAt: Date.now() },
          },
        }));
        return true;
      },

      removeSentence: (id) =>
        set((state) => {
          const next = { ...state.entries };
          delete next[id];
          return { entries: next };
        }),

      hasSentence: (text) => Boolean(get().entries[sentenceKey(text)]),
    }),
    { name: "sentencebook" }
  )
);
