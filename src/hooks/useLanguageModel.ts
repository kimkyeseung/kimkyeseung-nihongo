import { useCallback, useEffect, useRef, useState } from "react";
import type {
  LanguageModelAvailability,
  LanguageModelDownloadProgressEvent,
  LanguageModelSession,
} from "../types/languageModel";
import { isPromptApiSupported } from "../lib/languageModel";
import { fitHistory, historyBudget, type ChatTurn } from "../lib/chatHistory";

/**
 * 세션을 만들기 전에는 창 크기를 알 수 없어서(세션의 `inputQuota`/`contextWindow`로만 보인다)
 * 앞선 대화를 고를 때 쓰는 가정값. Gemini Nano의 창은 이보다 크다 — 작게 잡는 쪽이 안전하다
 * (넘치면 `create()`가 QuotaExceededError로 실패한다). 한 번 만들고 나면 실제 값을 기억해 쓴다.
 * 대화 도중에 창이 차면 Chrome이 오래된 턴부터 알아서 밀어낸다(시스템 지시는 남긴다).
 */
const ASSUMED_CONTEXT_WINDOW = 6144;

export type LanguageModelStatus = "checking" | "unsupported" | LanguageModelAvailability;

/**
 * Chrome 온디바이스 Prompt API(window.LanguageModel)를 감싸는 훅.
 * systemPrompt가 바뀌면 기존 세션을 destroy하고 다음 프롬프트에서 새로 만든다.
 * 세션 생성은 지연 생성(lazy)이며, LLM은 생성형 작업에만 쓴다는 프로젝트 규칙을 따른다.
 */
export function useLanguageModel(systemPrompt: string, getHistory?: () => ChatTurn[]) {
  // 브라우저 지원 여부는 마운트 시점에 동기적으로 알 수 있으므로 lazy initializer로
  // 바로 결정한다 — effect 안에서 setState를 동기 호출하면 불필요한 재렌더가 한 번 더 생긴다.
  const [status, setStatus] = useState<LanguageModelStatus>(() =>
    isPromptApiSupported() ? "checking" : "unsupported"
  );
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const sessionRef = useRef<LanguageModelSession | null>(null);
  /** 마지막으로 만든 세션에서 읽은 실제 창 크기. */
  const contextWindowRef = useRef(ASSUMED_CONTEXT_WINDOW);
  const getHistoryRef = useRef(getHistory);
  useEffect(() => {
    getHistoryRef.current = getHistory;
  });

  useEffect(() => {
    if (!window.LanguageModel) return;
    window.LanguageModel.availability()
      .then(setStatus)
      .catch(() => setStatus("unsupported"));
  }, []);

  // systemPrompt(시나리오/레벨)가 바뀌면 이전 세션은 더 이상 맞지 않으므로 정리한다.
  useEffect(() => {
    return () => {
      sessionRef.current?.destroy();
      sessionRef.current = null;
    };
  }, [systemPrompt]);

  const ensureSession = useCallback(
    async (input: string): Promise<LanguageModelSession> => {
      if (sessionRef.current) return sessionRef.current;
      const LanguageModel = window.LanguageModel;
      if (!LanguageModel) throw new Error("Prompt API를 지원하지 않는 브라우저입니다.");

      const monitor = (m: EventTarget) => {
        m.addEventListener("downloadprogress", (e) => {
          setDownloadProgress((e as LanguageModelDownloadProgressEvent).loaded);
        });
      };
      const history = getHistoryRef.current
        ? fitHistory(getHistoryRef.current(), historyBudget(contextWindowRef.current, systemPrompt, input))
        : [];

      setDownloadProgress(null);
      let session: LanguageModelSession;
      if (history.length === 0) {
        session = await LanguageModel.create({ systemPrompt, monitor });
      } else {
        // 앞선 대화를 채울 때는 시스템 지시도 `initialPrompts`의 맨 앞에 넣는다 — 옛 API에서는
        // `systemPrompt`와 `initialPrompts`의 system 역할을 같이 주면 오류였다.
        try {
          session = await LanguageModel.create({
            initialPrompts: [{ role: "system", content: systemPrompt }, ...history],
            monitor,
          });
        } catch {
          // 어림이 빗나가 창을 넘겼거나(QuotaExceededError) 이 Chrome이 initialPrompts를 못
          // 받는 경우. 맥락 없이라도 답은 하는 편이 낫다.
          session = await LanguageModel.create({ systemPrompt, monitor });
        }
      }
      const window_ = session.contextWindow ?? session.inputQuota;
      if (typeof window_ === "number" && window_ > 0 && Number.isFinite(window_)) {
        contextWindowRef.current = window_;
      }
      sessionRef.current = session;
      setDownloadProgress(null);
      return session;
    },
    [systemPrompt]
  );

  const promptStreaming = useCallback(
    async function* promptStreaming(input: string): AsyncGenerator<string> {
      const session = await ensureSession(input);
      yield* session.promptStreaming(input);
    },
    [ensureSession]
  );

  const prompt = useCallback(
    async (input: string): Promise<string> => {
      const session = await ensureSession(input);
      return session.prompt(input);
    },
    [ensureSession]
  );

  // 인젝션으로 오염된 턴을 대화 히스토리에서 통째로 버릴 때 쓴다 — 화면 텍스트만 거절 문구로
  // 바꾸고 세션을 살려두면 다음 턴에 "아까 하던 거 계속해줘"로 이어받을 수 있다.
  // 다음 prompt() 때 ensureSession이 새 세션을 지연 생성한다.
  const resetSession = useCallback(() => {
    sessionRef.current?.destroy();
    sessionRef.current = null;
  }, []);

  return { status, downloadProgress, prompt, promptStreaming, resetSession };
}
