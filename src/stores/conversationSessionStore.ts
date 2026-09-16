import { create } from "zustand";
import type { Level, Scenario } from "../lib/conversationPrompts";
import type { LanguageModelStatus } from "../hooks/useLanguageModel";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  correction?: string;
  correctionLoading?: boolean;
}

interface ConversationSessionState {
  scenario: Scenario | null;
  level: Level | null;
  messages: ChatMessage[];
  showFurigana: boolean;
  showCorrection: boolean;
  isStreaming: boolean;
  chatStatus: LanguageModelStatus;
  chatDownloadProgress: number | null;
  // 실제 세션/스트리밍 로직은 ConversationSessionController(Layout에 항상 마운트됨)가
  // 구현해서 여기 등록한다. ConversationPage(/conversation, 라우트 전환 시 unmount됨)는
  // 이 store를 구독하고 아래 함수들을 호출만 하는 얇은 뷰라서, 탭을 옮겨도 대화가 끊기지 않는다.
  // 에러 다이얼로그(PromptApiTroubleshootDialog)도 컨트롤러가 직접 렌더링하므로 여기엔 없다.
  startConversation: (scenario: Scenario, level: Level) => void;
  resetConversation: () => void;
  sendMessage: (text: string) => void;
  setShowFurigana: (value: boolean) => void;
  setShowCorrection: (value: boolean) => void;
}

export const useConversationSessionStore = create<ConversationSessionState>((set) => ({
  scenario: null,
  level: null,
  messages: [],
  showFurigana: true,
  showCorrection: false,
  isStreaming: false,
  chatStatus: "checking",
  chatDownloadProgress: null,
  startConversation: () => {},
  resetConversation: () => {},
  sendMessage: () => {},
  setShowFurigana: (value) => set({ showFurigana: value }),
  setShowCorrection: (value) => set({ showCorrection: value }),
}));
