import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ScriptMode } from "../data/gojuon";
import type { InputScript } from "../hooks/useScriptInput";
import type { JlptLevel } from "../types/jlpt";
import type { WordExample } from "../lib/wordExamples";
import { localDateKey } from "../lib/localDate";

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
  /** 상단 탭 — 단어장의 단어 칸/문장 칸. */
  tab: "word" | "sentence";
  mode: "review" | "list";
  activeGroup: string;
  setTab: (tab: "word" | "sentence") => void;
  setMode: (mode: "review" | "list") => void;
  setActiveGroup: (activeGroup: string) => void;
}

// 옛 저장값에는 `tab`이 없지만 persist의 기본 merge가 얕은 병합이라 초기값("word")이 남는다.
export const useWordbookView = create<WordbookView>()(
  persist(
    (set) => ({
      tab: "word",
      mode: "review",
      activeGroup: ALL_GROUP,
      setTab: (tab) => set({ tab }),
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
  /**
   * 단어 id -> 그 단어로 생성해둔 예문들. 뜻이 다른 예문이 한 배열에 섞여 있고, 각 예문이
   * `senseIndex`를 들고 있어 화면에서 뜻별로 갈라 그린다.
   */
  byWordId: Record<string, WordExample[]>;
  /** 뜻에서 새로 만든 예문들을 그 단어 목록 끝에 덧붙인다. */
  addExamples: (wordId: string, examples: WordExample[]) => void;
  /**
   * 바꿔 만든 예문을 **원본 바로 뒤에** 끼워 넣는다 — 원문과 변형이 목록 위아래로 떨어져
   * 있으면 "무엇이 어떻게 복잡해졌는지"를 볼 수가 없다(그게 이 버튼의 전부다).
   */
  insertVariant: (wordId: string, sourceId: string, variant: WordExample) => void;
}

export const useWordExamples = create<WordExamplesState>((set) => ({
  byWordId: {},
  addExamples: (wordId, examples) =>
    set((s) => ({
      byWordId: { ...s.byWordId, [wordId]: [...(s.byWordId[wordId] ?? []), ...examples] },
    })),
  insertVariant: (wordId, sourceId, variant) =>
    set((s) => {
      const current = s.byWordId[wordId] ?? [];
      const at = current.findIndex((ex) => ex.id === sourceId);
      // 원본이 사라졌으면(있을 수 없지만) 끝에 붙이느니 버린다 — 맥락 없는 변형만 남는다.
      if (at < 0) return s;
      const next = [...current];
      next.splice(at + 1, 0, variant);
      return { byWordId: { ...s.byWordId, [wordId]: next } };
    }),
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

/**
 * 선생님 인사를 오늘 이미 했는가.
 *
 * **인사는 모델이 아니라 앱이 한다.** 시스템 프롬프트에 맡기면 매 답변마다
 * "안녕하세요! 일본어 공부를 도와드릴 선생님입니다 😊"로 시작해서 금세 지겨워지는데,
 * "하루에 한 번만"은 모델이 지킬 수 있는 종류의 규칙이 아니다(이전 답변을 셀 수 없다).
 * 날짜로 판단할 수 있는 건 코드가 한다 — 표기 유지·후리가나와 같은 방침이다.
 *
 * 날짜는 gamificationStore의 스트릭과 같은 로컬 타임존 `YYYY-MM-DD` 문자열이다.
 */
interface TeacherGreeting {
  lastGreetedDate: string | null;
  /** 오늘 아직 인사하지 않았으면 true를 돌려주면서 오늘 날짜로 표시한다(한 번만 참). */
  claimGreeting: () => boolean;
}

export const useTeacherGreeting = create<TeacherGreeting>()(
  persist(
    (set, get) => ({
      lastGreetedDate: null,
      claimGreeting: () => {
        const today = localDateKey();
        if (get().lastGreetedDate === today) return false;
        set({ lastGreetedDate: today });
        return true;
      },
    }),
    { name: "teacher-greeting" }
  )
);
