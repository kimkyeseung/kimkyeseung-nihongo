import { useCallback, useEffect, useRef, useState } from "react";
import type {
  LanguageModelAvailability,
  LanguageModelDownloadProgressEvent,
  LanguageModelSession,
} from "../types/languageModel";

export type LanguageModelStatus = "checking" | "unsupported" | LanguageModelAvailability;

/**
 * Chrome 온디바이스 Prompt API(window.LanguageModel)를 감싸는 훅.
 * systemPrompt가 바뀌면 기존 세션을 destroy하고 다음 프롬프트에서 새로 만든다.
 * 세션 생성은 지연 생성(lazy)이며, LLM은 생성형 작업에만 쓴다는 프로젝트 규칙을 따른다.
 */
export function useLanguageModel(systemPrompt: string) {
  // 브라우저 지원 여부는 마운트 시점에 동기적으로 알 수 있으므로 lazy initializer로
  // 바로 결정한다 — effect 안에서 setState를 동기 호출하면 불필요한 재렌더가 한 번 더 생긴다.
  const [status, setStatus] = useState<LanguageModelStatus>(() =>
    "LanguageModel" in window && window.LanguageModel ? "checking" : "unsupported"
  );
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const sessionRef = useRef<LanguageModelSession | null>(null);

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

  const ensureSession = useCallback(async (): Promise<LanguageModelSession> => {
    if (sessionRef.current) return sessionRef.current;
    if (!window.LanguageModel) throw new Error("Prompt API를 지원하지 않는 브라우저입니다.");

    setDownloadProgress(null);
    const session = await window.LanguageModel.create({
      systemPrompt,
      monitor(monitor) {
        monitor.addEventListener("downloadprogress", (e) => {
          setDownloadProgress((e as LanguageModelDownloadProgressEvent).loaded);
        });
      },
    });
    sessionRef.current = session;
    setDownloadProgress(null);
    return session;
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

  return { status, downloadProgress, prompt, promptStreaming };
}
