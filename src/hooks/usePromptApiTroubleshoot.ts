import { useCallback, useState } from "react";

/**
 * LLM 호출이 런타임에 던지는 에러(예: NotSupportedError)를 잡아 PromptApiTroubleshootDialog에
 * 넘길 상태로 바꿔주는 훅. 회화/작문/단어 예문 등 useLanguageModel을 쓰는 곳에서 공용으로 쓸 것.
 */
export function usePromptApiTroubleshoot() {
  const [error, setError] = useState<string | null>(null);

  const reportError = useCallback((err: unknown) => {
    console.error("[LLM] 실행 실패", err);
    setError(err instanceof Error ? `${err.name}: ${err.message}` : String(err));
  }, []);

  const dismiss = useCallback(() => setError(null), []);

  return { troubleshootError: error, reportError, dismissTroubleshoot: dismiss };
}
