import { create } from "zustand";

export interface TeacherMessage {
  id: string;
  role: "user" | "assistant";
  /** assistant는 마크다운 원문 — 렌더링은 MarkdownAnswer가 한다. */
  text: string;
}

interface TeacherChatState {
  messages: TeacherMessage[];
  /** 입력창에 쓰다 만 질문 (탭을 옮겨도 남는다) */
  input: string;
  /**
   * 다른 화면(회화 말풍선의 "선생님" 버튼 등)에서 대신 넣어둔 질문.
   * TeacherPage가 마운트되면 이걸 꺼내 바로 물어본다.
   */
  pendingQuestion: string | null;
  isAnswering: boolean;
  setInput: (input: string) => void;
  requestQuestion: (question: string) => void;
  /** 꺼내면서 동시에 비운다 — StrictMode에서 effect가 두 번 돌아도 한 번만 질문하도록. */
  consumePendingQuestion: () => string | null;
  ask: (question: string) => { assistantId: string };
  appendAnswer: (assistantId: string, text: string) => void;
  finishAnswer: () => void;
  clear: () => void;
}

/**
 * "선생님" 페이지의 대화. 라우트를 벗어나면 페이지가 언마운트되므로(pageStateStore 주석 참고)
 * 대화 내용은 여기에 둔다 — 메모리 전용이라 새로고침하면 사라진다.
 *
 * 회화 페이지와 달리 스트리밍 자체는 페이지 안에서 돌린다. 답변 도중에 다른 탭으로 나가면
 * LLM 세션이 destroy되어 생성이 끊기고, 그때까지 받은 답변만 남는다(작문 첨삭과 같은 절충).
 * 백그라운드에서도 계속 받아야 한다면 회화의 ConversationSessionController처럼 Layout에
 * 상주하는 컨트롤러가 필요하다.
 */
export const useTeacherChatStore = create<TeacherChatState>((set, get) => ({
  messages: [],
  input: "",
  pendingQuestion: null,
  isAnswering: false,
  setInput: (input) => set({ input }),
  requestQuestion: (question) => set({ pendingQuestion: question }),
  consumePendingQuestion: () => {
    const question = get().pendingQuestion;
    if (question) set({ pendingQuestion: null });
    return question;
  },
  ask: (question) => {
    const assistantId = crypto.randomUUID();
    set((s) => ({
      messages: [
        ...s.messages,
        { id: crypto.randomUUID(), role: "user" as const, text: question },
        { id: assistantId, role: "assistant" as const, text: "" },
      ],
      input: "",
      isAnswering: true,
    }));
    return { assistantId };
  },
  appendAnswer: (assistantId, text) =>
    set((s) => ({
      messages: s.messages.map((m) => (m.id === assistantId ? { ...m, text } : m)),
    })),
  finishAnswer: () => set({ isAnswering: false }),
  clear: () => set({ messages: [], input: "", isAnswering: false, pendingQuestion: null }),
}));
