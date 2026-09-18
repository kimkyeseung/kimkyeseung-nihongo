import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ScriptMode } from "../data/gojuon";
import type { JlptLevel } from "../types/jlpt";
import type { WordExample } from "../lib/wordExamples";

/**
 * 페이지를 떠났다 돌아와도 화면이 그대로이도록, 라우트 전환 때 사라지는 페이지 로컬 state를
 * 여기로 옮겨둔다. 라우트는 전부 lazy + AnimatePresence로 언마운트되기 때문에 `useState`에
 * 두면 탭을 옮기는 순간 초기화된다.
 *
 * 나누는 기준은 `conversationSessionStore`와 같다:
 * - **persist**: 설정처럼 다음에도 같은 값을 쓰고 싶은 것(급수·모드·옵션). 새로고침해도 남는다.
 * - **메모리 전용**: 방금 그 자리에서 만든 내용(검색어, LLM 결과, 복습 큐). 탭 이동에는
 *   살아남지만 새로고침하면 사라진다 — 오래된 결과가 되살아나는 게 더 이상하기 때문.
 *
 * 열려 있던 다이얼로그/시트(선택된 한자·가나 등)는 일부러 여기 넣지 않는다. 돌아왔을 때
 * 모달이 떠 있으면 오히려 당황스럽다.
 */

interface GojuonView {
  mode: ScriptMode;
  setMode: (mode: ScriptMode) => void;
}

export const useGojuonView = create<GojuonView>()(
  persist((set) => ({ mode: "hiragana", setMode: (mode) => set({ mode }) }), {
    name: "gojuon-view",
  })
);

interface KanjiView {
  level: JlptLevel;
  setLevel: (level: JlptLevel) => void;
}

export const useKanjiView = create<KanjiView>()(
  persist((set) => ({ level: "N5", setLevel: (level) => set({ level }) }), { name: "kanji-view" })
);

export const ALL_GROUP = "all";

interface WordbookView {
  mode: "review" | "list";
  activeGroup: string;
  setMode: (mode: "review" | "list") => void;
  setActiveGroup: (activeGroup: string) => void;
}

export const useWordbookView = create<WordbookView>()(
  persist(
    (set) => ({
      mode: "review",
      activeGroup: ALL_GROUP,
      setMode: (mode) => set({ mode }),
      setActiveGroup: (activeGroup) => set({ activeGroup }),
    }),
    { name: "wordbook-view" }
  )
);

export interface WritingOptionFlags {
  showKanjiSuggestions: boolean;
  showSimilarSentences: boolean;
  showAppliedExpressions: boolean;
  showMorePolite: boolean;
  showMoreCasual: boolean;
}

interface WritingOptions extends WritingOptionFlags {
  toggle: (key: keyof WritingOptionFlags) => void;
}

export const useWritingOptions = create<WritingOptions>()(
  persist(
    (set) => ({
      showKanjiSuggestions: true,
      showSimilarSentences: true,
      showAppliedExpressions: true,
      showMorePolite: true,
      showMoreCasual: true,
      toggle: (key) => set((s) => ({ [key]: !s[key] }) as Pick<WritingOptionFlags, typeof key>),
    }),
    { name: "writing-options" }
  )
);

interface DictionaryView {
  query: string;
  committedQuery: string | null;
  setQuery: (query: string) => void;
  setCommittedQuery: (committedQuery: string | null) => void;
}

export const useDictionaryView = create<DictionaryView>((set) => ({
  query: "",
  committedQuery: null,
  setQuery: (query) => set({ query }),
  setCommittedQuery: (committedQuery) => set({ committedQuery }),
}));

interface WritingDraft {
  /** 입력창에 쓰던 문장 (첨삭 전이라도 유지한다) */
  input: string;
  /** 첨삭을 요청한 문장 — null이면 아직 결과 없음 */
  submittedText: string | null;
  /** 모델 응답 원문. 파싱은 화면에서 한다. */
  rawResponse: string;
  isLoading: boolean;
  setInput: (input: string) => void;
  startSubmission: (text: string) => void;
  setRawResponse: (rawResponse: string) => void;
  finishSubmission: () => void;
  reset: () => void;
}

export const useWritingDraft = create<WritingDraft>((set) => ({
  input: "",
  submittedText: null,
  rawResponse: "",
  isLoading: false,
  setInput: (input) => set({ input }),
  startSubmission: (text) => set({ submittedText: text, rawResponse: "", isLoading: true }),
  setRawResponse: (rawResponse) => set({ rawResponse }),
  finishSubmission: () => set({ isLoading: false }),
  reset: () => set({ input: "", submittedText: null, rawResponse: "", isLoading: false }),
}));

interface WordExamplesState {
  /** 단어 id -> 그 단어로 생성해둔 예문들 */
  byWordId: Record<string, WordExample[]>;
  setExamples: (wordId: string, examples: WordExample[]) => void;
}

export const useWordExamples = create<WordExamplesState>((set) => ({
  byWordId: {},
  setExamples: (wordId, examples) =>
    set((s) => ({ byWordId: { ...s.byWordId, [wordId]: examples } })),
}));

interface ReviewSession {
  /** 이 큐가 어느 그룹의 것인지 — 그룹을 바꾸면 큐를 새로 만든다. */
  group: string;
  queue: string[];
  total: number;
}

interface WordbookReviewState {
  session: ReviewSession | null;
  start: (group: string, queue: string[]) => void;
  setQueue: (queue: string[]) => void;
}

export const useWordbookReview = create<WordbookReviewState>((set) => ({
  session: null,
  start: (group, queue) => set({ session: { group, queue, total: queue.length } }),
  setQueue: (queue) => set((s) => (s.session ? { session: { ...s.session, queue } } : s)),
}));
