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
  /**
   * 답변 한 턴을 끝낸다. `persist: false`면 화면에만 남기고 저장하지 않는다 — 실패 안내문처럼
   * "그 순간의 상황"일 뿐 대화 내용이 아닌 것에 쓴다.
   */
  finishAnswer: (assistantId: string, options?: { persist?: boolean }) => void;
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

  /**
   * 지난 대화를 IndexedDB에서 읽어온다. 앱을 켤 때 한 번.
   *
   * **읽어온 것으로 화면을 통째로 덮지 않는다 (실제로 겪은 버그).** 예전에는
   * `messagesByDate: { [today]: … }`로 갈아치웠는데, 이 읽기는 비동기라 **그 사이에 질문이
   * 먼저 들어올 수 있다** — 대문의 "오늘의 학습"이나 회화 말풍선에서 넘어온 "대신 물어보기"가
   * 그렇고, 페이지에 들어가자마자 빨리 쳐서 보내도 같다. 그러면 방금 던진 질문과 **스트리밍
   * 중이라 아직 저장되지도 않은 답변**이 화면에서 통째로 사라졌다. 지금은 id로 합친다.
   */
  load: async () => {
    if (get().loaded) return;

    const today = localDateKey();
    let dates: string[] = [];
    let stored: StoredMessage[] = [];
    try {
      // 오래된 날짜 정리는 앱을 켤 때 한 번이면 충분하다.
      await pruneChatDays();
      [dates, stored] = await Promise.all([loadChatDates(), loadMessagesForDate(today)]);
    } catch {
      // IndexedDB를 못 쓰는 환경이면 기록 없이 간다. **`loaded`는 반드시 세운다** —
      // 안 그러면 이걸 기다리는 쪽(대신 물어보기)이 영영 안 풀린다.
    }

    set((s) => {
      // 오늘이 비어 있어도 목록 맨 위에 있어야 "오늘로 돌아가기"가 가능하다.
      const nextDates = dates.includes(today) ? dates : [today, ...dates];
      // 읽는 사이에 "대화 지우기"를 눌렀으면 그쪽이 최신이다 — 지운 걸 되살리지 않는다.
      if (s.loaded) return { dates: nextDates };

      const fromDb = stored.map(toMessage);
      const savedIds = new Set(fromDb.map((m) => m.id));
      // 읽는 사이에 들어온 오늘 대화를 뒤에 잇는다(질문이 이미 저장됐으면 id로 걸러진다).
      const pending = (s.messagesByDate[today] ?? []).filter((m) => !savedIds.has(m.id));

      return {
        loaded: true,
        dates: nextDates,
        // 읽는 사이에 지난 날짜를 열어봤다면 그 화면을 존중한다.
        activeDate: s.activeDate,
        messagesByDate: { ...s.messagesByDate, [today]: [...fromDb, ...pending] },
      };
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

  finishAnswer: (assistantId, options) => {
    const { activeDate, messagesByDate } = get();
    const message = messagesByDate[activeDate]?.find((m) => m.id === assistantId);
    set({ isAnswering: false });
    /**
     * **실패 안내문은 기록에 남기지 않는다.** "(답변을 만드는 중 오류가 발생했습니다)"는
     * 그때 그 순간의 상황이지 선생님이 한 말이 아니다. 남겨두면 다음에 그 날짜를 열었을 때
     * 안내문만 덩그러니 붙은 대화가 영구히 보인다. 화면에는 그대로 남으니 지금 무슨 일이
     * 있었는지는 알 수 있고, 질문은 이미 저장돼 있어 물어본 사실은 남는다(스트리밍 도중에
     * 나갔을 때와 같은 모양이 된다).
     */
    if (options?.persist === false) return;
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
      // 지운 것이 곧 확정된 상태다. 아직 돌고 있던 `load()`가 지운 대화를 되살리지 못하게
      // `loaded`를 세운다(load 쪽이 이 값을 보고 대화는 건드리지 않는다).
      loaded: true,
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
