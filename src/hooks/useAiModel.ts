import { useLanguageModel, type LanguageModelStatus } from "./useLanguageModel";
import { useGemmaSession } from "./useGemmaSession";
import { useAiEngineStore, type AiEngine } from "../stores/aiEngineStore";

export type AiModelStatus = LanguageModelStatus | "model-missing";

export interface AiModel {
  engine: AiEngine;
  status: AiModelStatus;
  /** Prompt API가 내장 모델을 받는 중일 때의 0~1 진행률 (Gemma 쪽은 항상 null) */
  downloadProgress: number | null;
  /** 퍼센트가 없는 준비 작업(Gemma 엔진 로딩)의 안내 문구 */
  busyLabel: string | null;
  prompt: (input: string) => Promise<string>;
  promptStreaming: (input: string) => AsyncGenerator<string>;
}

/**
 * 회화·작문 페이지가 쓰는 생성형 AI 창구.
 * `aiEngineStore`의 선택에 따라 Chrome 내장 Prompt API와 Gemma 4(WebGPU) 중 하나를 쓴다.
 *
 * 훅 규칙상 둘 다 항상 호출해야 하지만, 쓰지 않는 쪽은 세션을 만들지 않으므로 비용이 없다
 * (Prompt API는 첫 prompt 때 지연 생성, Gemma는 `enabled=false`면 확인조차 하지 않는다).
 * 페이지에서 `useLanguageModel`을 직접 부르지 말고 이 훅을 쓸 것.
 */
export function useAiModel(systemPrompt: string): AiModel {
  const engine = useAiEngineStore((s) => s.engine);
  const promptApi = useLanguageModel(systemPrompt);
  const gemma = useGemmaSession(systemPrompt, engine === "gemma4");

  if (engine === "gemma4") {
    return {
      engine,
      status: gemma.status,
      downloadProgress: null,
      busyLabel: gemma.busyLabel,
      prompt: gemma.prompt,
      promptStreaming: gemma.promptStreaming,
    };
  }

  return {
    engine,
    status: promptApi.status,
    downloadProgress: promptApi.downloadProgress,
    busyLabel: null,
    prompt: promptApi.prompt,
    promptStreaming: promptApi.promptStreaming,
  };
}
