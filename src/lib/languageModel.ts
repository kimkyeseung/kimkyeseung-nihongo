/** 이 브라우저에 Chrome 온디바이스 Prompt API(window.LanguageModel) 자체가 있는지만 확인한다.
 *  (모델 다운로드 여부는 별개 — 그건 useLanguageModel의 availability()가 담당) */
export function isPromptApiSupported(): boolean {
  return typeof window !== "undefined" && "LanguageModel" in window && Boolean(window.LanguageModel);
}
