import { create } from "zustand";
import type { Level, Scenario } from "../lib/conversationPrompts";
import type { AiModelStatus } from "../hooks/useAiModel";
import type { AiEngine } from "./aiEngineStore";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  correction?: string;
  correctionLoading?: boolean;
  /** AI 대사의 한국어 번역 ("번역" 토글이 켜져 있을 때만 채워진다) */
  translation?: string;
  translationLoading?: boolean;
}

interface ConversationSessionState {
  scenario: Scenario | null;
  level: Level | null;
  messages: ChatMessage[];
  showFurigana: boolean;
  showCorrection: boolean;
  showTranslation: boolean;
  isStreaming: boolean;
  chatStatus: AiModelStatus;
  chatDownloadProgress: number | null;
  /** 지금 쓰고 있는 엔진 — Gemma 전용 안내 화면을 띄울지 판단하는 데 쓴다. */
  chatEngine: AiEngine;
  /** 퍼센트가 없는 준비 작업(Gemma 엔진 로딩)의 안내 문구 */
  chatBusyLabel: string | null;
  // 실제 세션/스트리밍 로직은 ConversationSessionController(Layout에 항상 마운트됨)가
  // 구현해서 여기 등록한다. ConversationPage(/conversation, 라우트 전환 시 unmount됨)는
  // 이 store를 구독하고 아래 함수들을 호출만 하는 얇은 뷰라서, 탭을 옮겨도 대화가 끊기지 않는다.
  // 에러 다이얼로그(PromptApiTroubleshootDialog)도 컨트롤러가 직접 렌더링하므로 여기엔 없다.
  startConversation: (scenario: Scenario, level: Level) => void;
  resetConversation: () => void;
  sendMessage: (text: string) => void;
  setShowFurigana: (value: boolean) => void;
  setShowCorrection: (value: boolean) => void;
  setShowTranslation: (value: boolean) => void;
}

export const useConversationSessionStore = create<ConversationSessionState>((set) => ({
  scenario: null,
  level: null,
  messages: [],
  showFurigana: true,
  showCorrection: false,
  showTranslation: false,
  isStreaming: false,
  chatStatus: "checking",
  chatDownloadProgress: null,
  chatEngine: "prompt-api",
  chatBusyLabel: null,
  startConversation: () => {},
  resetConversation: () => {},
  sendMessage: () => {},
  setShowFurigana: (value) => set({ showFurigana: value }),
  setShowCorrection: (value) => set({ showCorrection: value }),
  setShowTranslation: (value) => set({ showTranslation: value }),
}));
