import { create } from "zustand";
import type { AiEngine } from "./aiEngineStore";
import type { AiModelStatus } from "../hooks/useAiModel";

/**
 * 선생님 수업 세션의 상태 창구. 세션·스트리밍은 Layout에 상주하는 `TeacherSessionController`가
 * 들고 있고(페이지를 떠나도 답변이 끊기지 않게), TeacherPage는 이 store를 읽고 질문을 넣기만 한다
 * — 회화의 conversationSessionStore와 같은 나눔이다. 메모리 전용(persist 안 함).
 */
interface TeacherSessionState {
  /** useAiModel의 status를 그대로 옮긴 것 — 페이지가 안내 화면을 고르는 데 쓴다. */
  status: AiModelStatus;
  engine: AiEngine | null;
  downloadProgress: number | null;
  busyLabel: string | null;
  /**
   * 물어볼 질문. **함수를 store에 넣어 부르게 하지 않고 큐로 둔다** — 페이지가 기억 스냅샷을
   * 새로 만든 직후에 물어보면, 컨트롤러가 새 시스템 프롬프트로 다시 렌더되기 전에 옛 함수가
   * 불릴 수 있다. 큐는 컨트롤러가 자기 최신 렌더의 effect에서 꺼내므로 항상 최신 세션이 받는다.
   */
  queued: string | null;
  submit: (question: string) => void;
  take: () => string | null;
}

export const useTeacherSessionStore = create<TeacherSessionState>((set, get) => ({
  status: "checking",
  engine: null,
  downloadProgress: null,
  busyLabel: null,
  queued: null,
  submit: (question) => set({ queued: question }),
  // 꺼내면서 비운다 — StrictMode에서 effect가 두 번 돌아도 한 번만 묻는다.
  take: () => {
    const question = get().queued;
    if (question) set({ queued: null });
    return question;
  },
}));
