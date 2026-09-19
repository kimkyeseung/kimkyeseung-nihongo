import { create } from "zustand";
import {
  deleteMessagesForDate,
  loadChatDates,
  loadMessagesForDate,
  pruneChatDays,
  saveMessage,
  type StoredMessage,
} from "../lib/learnerMemoryDb";
import { localDateKey } from "../lib/localDate";

export interface TeacherMessage {
  id: string;
  role: "user" | "assistant";
  /** assistant는 마크다운 원문 — 렌더링은 MarkdownAnswer가 한다. */
  text: string;
}

interface TeacherChatState {
  /** 대화가 있는 날짜들, 최근 날짜부터. 오늘은 아직 비어 있어도 항상 맨 앞에 넣어 보여준다. */
  dates: string[];
  /** 지금 보고 있는 날짜. 오늘이 아니면 읽기 전용이다. */
  activeDate: string;
  /** 날짜별 대화. 필요한 날짜만 채워진다. */
  messagesByDate: Record<string, TeacherMessage[]>;
  /** 오늘 대화를 IndexedDB에서 한 번 읽어왔는가. */
  loaded: boolean;

  /** 입력창에 쓰다 만 질문 (탭을 옮겨도 남는다). 오늘에만 쓴다. */
  input: string;
  /**
   * 다른 화면(회화 말풍선의 "선생님" 버튼, 대문의 "오늘의 학습")에서 대신 넣어둔 질문.
   * TeacherPage가 마운트되면 이걸 꺼내 바로 물어본다.
   */
  pendingQuestion: string | null;
  isAnswering: boolean;

  load: () => Promise<void>;
  openDate: (date: string) => Promise<void>;
  setInput: (input: string) => void;
  requestQuestion: (question: string) => void;
  /** 꺼내면서 동시에 비운다 — StrictMode에서 effect가 두 번 돌아도 한 번만 질문하도록. */
  consumePendingQuestion: () => string | null;
  ask: (question: string) => { assistantId: string };
  appendAnswer: (assistantId: string, text: string) => void;
  finishAnswer: (assistantId: string) => void;
  /** 오늘 대화만 비운다. 지난 날짜는 사이드바에서 따로 지운다. */
  clearToday: () => Promise<void>;
  deleteDate: (date: string) => Promise<void>;
}

const NO_MESSAGES: TeacherMessage[] = [];

/**
 * "선생님" 페이지의 대화. **일기처럼 날짜별로 쌓인다** — 세션 개념은 두지 않고 하루가 곧
 * 대화 한 묶음이며, 지난 날짜는 읽기 전용이다.
 *
 * 저장은 IndexedDB다(learnerMemoryDb.ts). 예전에는 메모리 전용이라 새로고침하면 사라졌는데,
 * 대화가 무한히 쌓이는 물건이라 localStorage에 두면 메시지 하나 늘 때마다 전체를 다시
 * 직렬화하게 된다.
 *
 * **스트리밍 중에는 저장하지 않는다.** 답변은 청크마다 바뀌므로 그때마다 쓰면 한 번의 답변에
 * 수백 번 저장한다. 화면은 store가, 저장은 `finishAnswer`가 한 번만 한다.
 *
 * 스트리밍 자체는 회화와 달리 페이지 안에서 돌린다. 답변 도중에 다른 탭으로 나가면 LLM 세션이
 * destroy되어 생성이 끊기고, 그때까지 받은 답변만 남는다(작문 첨삭과 같은 절충).
 */
export const useTeacherChatStore = create<TeacherChatState>((set, get) => ({
  dates: [],
  activeDate: localDateKey(),
  messagesByDate: {},
  loaded: false,
  input: "",
  pendingQuestion: null,
  isAnswering: false,

  load: async () => {
    // 오래된 날짜 정리는 앱을 켤 때 한 번이면 충분하다.
    await pruneChatDays();
    const today = localDateKey();
    const [dates, messages] = await Promise.all([loadChatDates(), loadMessagesForDate(today)]);
    set({
      loaded: true,
      // 오늘이 비어 있어도 목록 맨 위에 있어야 "오늘로 돌아가기"가 가능하다.
      dates: dates.includes(today) ? dates : [today, ...dates],
      activeDate: today,
      messagesByDate: { [today]: messages.map(toMessage) },
    });
  },

  openDate: async (date) => {
    // 이미 읽어둔 날짜면 다시 읽지 않는다. 지난 날짜는 더 바뀌지 않으므로 안전하다.
    if (get().messagesByDate[date]) {
      set({ activeDate: date });
      return;
    }
    const messages = await loadMessagesForDate(date);
    set((s) => ({
      activeDate: date,
      messagesByDate: { ...s.messagesByDate, [date]: messages.map(toMessage) },
    }));
  },

  setInput: (input) => set({ input }),
  requestQuestion: (question) => set({ pendingQuestion: question }),
  consumePendingQuestion: () => {
    const question = get().pendingQuestion;
    if (question) set({ pendingQuestion: null });
    return question;
  },

  ask: (question) => {
    const today = localDateKey();
    const assistantId = crypto.randomUUID();
    const userId = crypto.randomUUID();
    const at = Date.now();

    set((s) => ({
      // **항상 오늘에 쓴다.** 지난 날짜를 보다가 질문하면 그 날짜에 붙는 게 아니라 오늘로
      // 온다 — 화면에서도 입력창을 감추지만, 여기서 한 번 더 막아야 자정을 넘긴 탭처럼
      // 화면 상태가 낡은 경우까지 걸린다.
      activeDate: today,
      dates: s.dates.includes(today) ? s.dates : [today, ...s.dates],
      messagesByDate: {
        ...s.messagesByDate,
        [today]: [
          ...(s.messagesByDate[today] ?? []),
          { id: userId, role: "user" as const, text: question },
          { id: assistantId, role: "assistant" as const, text: "" },
        ],
      },
      input: "",
      isAnswering: true,
    }));

    // 질문은 바로 남긴다 — 답변을 받다 브라우저가 죽어도 물어본 사실은 남는 편이 낫다.
    void saveMessage({ id: userId, date: today, role: "user", text: question, at });
    return { assistantId };
  },

  appendAnswer: (assistantId, text) =>
    set((s) => {
      const date = s.activeDate;
      const messages = s.messagesByDate[date];
      if (!messages) return s;
      return {
        messagesByDate: {
          ...s.messagesByDate,
          [date]: messages.map((m) => (m.id === assistantId ? { ...m, text } : m)),
        },
      };
    }),

  finishAnswer: (assistantId) => {
    const { activeDate, messagesByDate } = get();
    const message = messagesByDate[activeDate]?.find((m) => m.id === assistantId);
    set({ isAnswering: false });
    // 빈 답변(즉시 실패)은 남기지 않는다 — 다음에 열었을 때 빈 말풍선만 보인다.
    if (!message || !message.text) return;
    void saveMessage({
      id: assistantId,
      date: activeDate,
      role: "assistant",
      text: message.text,
      at: Date.now(),
    });
  },

  clearToday: async () => {
    const today = localDateKey();
    await deleteMessagesForDate(today);
    set((s) => ({
      messagesByDate: { ...s.messagesByDate, [today]: [] },
      activeDate: today,
      input: "",
      isAnswering: false,
      pendingQuestion: null,
    }));
  },

  deleteDate: async (date) => {
    await deleteMessagesForDate(date);
    const today = localDateKey();
    set((s) => {
      const next = { ...s.messagesByDate };
      delete next[date];
      return {
        messagesByDate: next,
        dates: s.dates.filter((d) => d !== date || d === today),
        // 보고 있던 날짜를 지웠으면 오늘로 돌아온다.
        activeDate: s.activeDate === date ? today : s.activeDate,
      };
    });
  },
}));

function toMessage(row: StoredMessage): TeacherMessage {
  return { id: row.id, role: row.role, text: row.text };
}

/** 지금 보고 있는 날짜의 대화. 셀렉터가 매번 새 배열을 만들지 않도록 빈 목록은 하나를 돌려쓴다. */
export function useActiveMessages(): TeacherMessage[] {
  return useTeacherChatStore((s) => s.messagesByDate[s.activeDate] ?? NO_MESSAGES);
}

/** 오늘을 보고 있는가 — 지난 날짜에서는 입력창을 감춘다. */
export function useIsViewingToday(): boolean {
  return useTeacherChatStore((s) => s.activeDate === localDateKey());
}
