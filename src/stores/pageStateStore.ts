import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ScriptMode } from "../data/gojuon";
import type { InputScript } from "../hooks/useScriptInput";
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

interface InputScriptPrefs {
  /** 선생님 페이지 질문창 */
  teacher: InputScript;
  /** 회화 시나리오 선택 화면의 이름칸 */
  conversationName: InputScript;
  setTeacher: (script: InputScript) => void;
  setConversationName: (script: InputScript) => void;
  /** 입력창에서 Tab을 눌렀을 때. 다음 값을 화면이 계산하지 않도록 store가 뒤집는다. */
  toggleTeacher: () => void;
  toggleConversationName: () => void;
}

/**
 * 입력창 문자 모드. "설정처럼 다음에도 같은 값을 쓰고 싶은 것"이라 persist 쪽이다 —
 * 일본어로 물어보는 사람은 계속 일본어로 물어본다.
 *
 * 두 입력창의 설정을 하나로 합치지 않았다: 선생님에게는 일본어로 묻고 이름은 한글로 쓰는
 * 조합이 자연스럽다(선생님 페이지는 원래 "한국어로 묻는 수업"이다).
 */
export const useInputScriptPrefs = create<InputScriptPrefs>()(
  persist(
    (set) => ({
      teacher: "default",
      conversationName: "default",
      setTeacher: (teacher) => set({ teacher }),
      setConversationName: (conversationName) => set({ conversationName }),
      toggleTeacher: () => set((s) => ({ teacher: s.teacher === "ja" ? "default" : "ja" })),
      toggleConversationName: () =>
        set((s) => ({ conversationName: s.conversationName === "ja" ? "default" : "ja" })),
    }),
    {
      name: "input-script",
      // v0에는 "ko"/"ja"/"en" 세 값이 저장됐다. 한글·영어를 한 버튼으로 합치면서 "ko"·"en"은
      // 없는 값이 됐는데, 그대로 두면 **토글에서 아무 버튼도 선택 안 된 것처럼 보인다**
      // (어느 옵션과도 일치하지 않아서). 저장된 값을 읽는 쪽에서 조용히 넘어가지 않도록 여기서 옮긴다.
      version: 1,
      migrate: (persisted) => {
        const toScript = (value: unknown): InputScript => (value === "ja" ? "ja" : "default");
        const state = (persisted ?? {}) as Partial<Record<"teacher" | "conversationName", unknown>>;
        // 액션은 여기서 돌려주지 않아도 된다 — persist의 merge가 초기 state(액션 포함) 위에
        // 이 값만 덮어쓴다.
        return {
          teacher: toScript(state.teacher),
          conversationName: toScript(state.conversationName),
        } as InputScriptPrefs;
      },
    }
  )
);
