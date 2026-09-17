import { useCallback, useEffect, useRef, useState } from "react";
import { createGemmaSession, type GemmaSession } from "../lib/gemmaEngine";
import { getCachedModelFile, isOpfsSupported, isWebGpuSupported } from "../lib/gemmaModel";

export type GemmaSessionStatus =
  /** 받아둔 모델이 있는지 확인 중 */
  | "checking"
  /** WebGPU/OPFS가 없어 이 엔진을 쓸 수 없음 */
  | "unsupported"
  /** 엔진은 쓸 수 있지만 모델 파일을 아직 안 받음 → 대문에서 받아야 함 */
  | "model-missing"
  | "available";

/**
 * Gemma 4 세션 훅. `useLanguageModel`과 같은 모양(`prompt`/`promptStreaming`)을 돌려주므로
 * 페이지 쪽은 어느 엔진인지 몰라도 된다 — 둘을 갈아끼우는 건 `useAiModel`이 한다.
 *
 * `enabled`가 false면(= 지금 Prompt API를 쓰는 중이면) 아무것도 확인하지 않고 세션도 안 만든다.
 */
export function useGemmaSession(systemPrompt: string, enabled: boolean) {
  const [status, setStatus] = useState<GemmaSessionStatus>(() =>
    isWebGpuSupported() && isOpfsSupported() ? "checking" : "unsupported"
  );
  /** 엔진을 GPU에 올리는 동안 페이지에 보여줄 문구 (다운로드와 달리 퍼센트가 없다) */
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const sessionRef = useRef<GemmaSession | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (!isWebGpuSupported() || !isOpfsSupported()) return;
    let alive = true;
    getCachedModelFile()
      .then((file) => {
        if (alive) setStatus(file ? "available" : "model-missing");
      })
      .catch(() => {
        if (alive) setStatus("model-missing");
      });
    return () => {
      alive = false;
    };
  }, [enabled]);

  // systemPrompt(시나리오/레벨)가 바뀌면 이전 대화 세션은 더 이상 맞지 않으므로 정리한다.
  // 엔진 자체는 살려둔다 — 2GB를 GPU에 다시 올리는 건 너무 비싸다(gemmaEngine.ts의 싱글턴).
  useEffect(() => {
    return () => {
      void sessionRef.current?.destroy();
      sessionRef.current = null;
    };
  }, [systemPrompt]);

  const ensureSession = useCallback(async (): Promise<GemmaSession> => {
    if (sessionRef.current) return sessionRef.current;
    // 엔진이 아직 안 떠 있으면 여기서 모델이 GPU에 올라간다 — 수 초 걸린다.
    setBusyLabel("Gemma 4 모델을 GPU에 올리는 중...");
    try {
      const session = await createGemmaSession(systemPrompt);
      sessionRef.current = session;
      return session;
    } finally {
      setBusyLabel(null);
    }
  }, [systemPrompt]);

  const promptStreaming = useCallback(
    async function* promptStreaming(input: string): AsyncGenerator<string> {
      const session = await ensureSession();
      yield* session.promptStreaming(input);
    },
    [ensureSession]
  );

  const prompt = useCallback(
    async (input: string): Promise<string> => {
      const session = await ensureSession();
      return session.prompt(input);
    },
    [ensureSession]
  );

  return { status, busyLabel, prompt, promptStreaming };
}
