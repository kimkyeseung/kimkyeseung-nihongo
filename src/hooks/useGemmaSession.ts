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
    if (sessionRef.current) {
      if (!sessionRef.current.isStale()) return sessionRef.current;
      // 그 사이 엔진이 버려졌다(GPU 디바이스 유실 — 모바일에서 다른 앱을 보고 돌아온 경우).
      // 죽은 엔진 위의 대화는 버리고 새 엔진에서 다시 판다.
      void sessionRef.current.destroy().catch(() => {});
      sessionRef.current = null;
    }
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

  // 실패하면 엔진을 버리고 **한 번만** 새 엔진으로 다시 시도한다. 디바이스의 `lost`가 늦게
  // 오거나 아예 안 오는 브라우저에서는 돌아와서 보낸 첫 메시지가 죽은 엔진에 닿는데, 예전엔
  // 그걸 사용자에게 실패로 보여주고 "한 번 더 보내야" 살아났다(실제로 그렇게 보고받았다).
  // 스트리밍은 **아직 한 글자도 안 내보냈을 때만** 재시도한다 — 중간에 끊긴 걸 다시 돌리면
  // 앞부분이 두 번 붙는다. 두 번째도 실패하면 진짜 실패다(그대로 던진다).
  const promptStreaming = useCallback(
    async function* promptStreaming(input: string): AsyncGenerator<string> {
      for (let attempt = 0; ; attempt++) {
        let yielded = false;
        try {
          const session = await ensureSession();
          for await (const chunk of session.promptStreaming(input)) {
            yielded = true;
            yield chunk;
          }
          return;
        } catch (err) {
          recoverFromFailure();
          if (yielded || attempt >= 1) throw err;
        }
      }
    },
    [ensureSession, recoverFromFailure]
  );

  const prompt = useCallback(
    async (input: string): Promise<string> => {
      for (let attempt = 0; ; attempt++) {
        try {
          const session = await ensureSession();
          return await session.prompt(input);
        } catch (err) {
          recoverFromFailure();
          if (attempt >= 1) throw err;
        }
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
