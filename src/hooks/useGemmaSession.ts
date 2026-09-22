import { useCallback, useEffect, useRef, useState } from "react";
import { createGemmaSession, discardGemmaEngine, type GemmaSession } from "../lib/gemmaEngine";
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
      void sessionRef.current?.destroy().catch(() => {});
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
    } catch (err) {
      // 엔진 생성 자체가 실패했다면 죽은 WebGPU 디바이스를 붙들고 있었을 수 있다 — 아래
      // recoverFromFailure와 같은 이유로 캐시를 버려 다음 시도가 새 엔진으로 다시 뜨게 한다.
      discardGemmaEngine();
      throw err;
    } finally {
      setBusyLabel(null);
    }
  }, [systemPrompt]);

  /**
   * **모바일에서 다른 앱을 보다가 돌아오면 실제로 겪은 문제**: 백그라운드 탭의 WebGPU
   * 컨텍스트를 OS가 회수해가는 경우가 있는데, 그 상태에서는 이미 만들어둔 `Conversation`도
   * `Engine`(모듈 싱글턴, gemmaEngine.ts)도 죽어 있다. `sessionRef.current`만 비우면 다음
   * `ensureSession()`이 죽은 엔진 위에 새 대화를 또 만들려다 똑같이 실패한다 — 그래서
   * `discardGemmaEngine()`으로 엔진 캐시까지 같이 버려야 다음 시도가 새로 뜬 엔진으로 간다.
   * 이걸 안 하면 사용자가 할 수 있는 건 페이지 새로고침뿐이었다(실제로 그렇게 보고받았다).
   */
  const recoverFromFailure = useCallback(() => {
    void sessionRef.current?.destroy().catch(() => {});
    sessionRef.current = null;
    discardGemmaEngine();
  }, []);

  const promptStreaming = useCallback(
    async function* promptStreaming(input: string): AsyncGenerator<string> {
      const session = await ensureSession();
      try {
        yield* session.promptStreaming(input);
      } catch (err) {
        recoverFromFailure();
        throw err;
      }
    },
    [ensureSession, recoverFromFailure]
  );

  const prompt = useCallback(
    async (input: string): Promise<string> => {
      const session = await ensureSession();
      try {
        return await session.prompt(input);
      } catch (err) {
        recoverFromFailure();
        throw err;
      }
    },
    [ensureSession, recoverFromFailure]
  );

  // useLanguageModel.resetSession과 같은 역할(오염된 대화 히스토리 버리기) — 이쪽은 정상적으로
  // 쓰던 세션을 인젝션 때문에 버리는 것뿐이라 엔진까지 버릴 이유는 없다(recoverFromFailure와
  // 다른 경우다).
  const resetSession = useCallback(() => {
    void sessionRef.current?.destroy().catch(() => {});
    sessionRef.current = null;
  }, []);

  return { status, busyLabel, prompt, promptStreaming, resetSession };
}
