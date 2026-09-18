import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * 생성형 기능(회화·작문·선생님)이 어떤 엔진을 쓸지.
 * - `prompt-api`: Chrome 내장 온디바이스 모델 (기본값, 추가 다운로드 없음)
 * - `gemma4`: 직접 내려받은 Gemma 4 E2B를 WebGPU(LiteRT-LM)에서 실행
 */
export type AiEngine = "prompt-api" | "gemma4";

interface AiEngineState {
  engine: AiEngine;
  setEngine: (engine: AiEngine) => void;
}

export const useAiEngineStore = create<AiEngineState>()(
  persist(
    (set) => ({
      // 기본값은 항상 Prompt API다 — Gemma는 사용자가 2GB를 직접 받아야만 쓸 수 있으므로
      // 저장된 설정이 gemma4라도 모델이 실제로 있는지는 쓰는 쪽에서 확인해야 한다.
      engine: "prompt-api",
      setEngine: (engine) => set({ engine }),
    }),
    { name: "ai-engine" }
  )
);
