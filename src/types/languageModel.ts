// Chrome의 온디바이스 Prompt API(window.LanguageModel) 타입.
// 아직 표준 lib.dom.d.ts에 포함되어 있지 않아 직접 선언한다.
export type LanguageModelAvailability = "unavailable" | "downloadable" | "downloading" | "available";

export interface LanguageModelDownloadProgressEvent extends Event {
  loaded: number;
}

export interface LanguageModelSession {
  prompt(input: string): Promise<string>;
  promptStreaming(input: string): AsyncIterable<string>;
  destroy(): void;
  /**
   * 세션의 컨텍스트 창(토큰). Chrome 버전에 따라 이름이 다르다 — 예전 이름이 `inputQuota`,
   * 바뀐 이름이 `contextWindow`. 둘 다 없을 수 있으니 읽는 쪽은 둘 다 보고 없으면 넘어갈 것.
   */
  inputQuota?: number;
  contextWindow?: number;
}

export interface LanguageModelInitialPrompt {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LanguageModelCreateOptions {
  systemPrompt?: string;
  /** 세션을 만들 때 미리 넣어 둘 대화. 시스템 지시를 넣으려면 맨 앞에 `role: "system"`으로. */
  initialPrompts?: LanguageModelInitialPrompt[];
  temperature?: number;
  topK?: number;
  monitor?: (monitor: EventTarget) => void;
}

export interface LanguageModelStatic {
  availability(): Promise<LanguageModelAvailability>;
  create(options?: LanguageModelCreateOptions): Promise<LanguageModelSession>;
}

declare global {
  interface Window {
    LanguageModel?: LanguageModelStatic;
  }
}
