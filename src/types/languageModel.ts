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
}

export interface LanguageModelCreateOptions {
  systemPrompt?: string;
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
