import { isPromptApiSupported } from "./languageModel";
import { isOpfsSupported, isWebGpuSupported } from "./gemmaModel";

/**
 * "이 브라우저에서 생성형 기능(회화·작문·선생님)을 어떻게 쓰게 할 것인가"를 한 곳에서 판단한다.
 *
 * 예전에는 화면마다 제각기 "Prompt API가 없으면 Chrome Canary를 받으세요"라고만 안내했다.
 * 그런데 Gemma 4는 Chrome 내장 AI와 무관하게 **WebGPU만 있으면** 도는 별도 엔진이라,
 * Safari 26·Firefox 141+ 사용자에게도 Chrome을 받으라고 떠미는 잘못된 안내였다.
 * (WebGPU는 2026년 1월에 Baseline이 됐고, 이 앱이 쓰는 OPFS API — getDirectory /
 *  createWritable / FileSystemFileHandle.move — 도 Safari 26+와 Firefox 111+에 다 있다.)
 *
 * 그래서 안내 순서를 이렇게 통일한다:
 *   1. 내장 AI가 되면      → 바로 쓸 수 있다. Gemma는 "더 나은 선택지"로만 권한다.
 *   2. 내장 AI가 없으면    → Gemma를 받으면 이 브라우저에서도 쓸 수 있다(용량·제한 함께 안내).
 *   3. Gemma도 못 쓰면     → 그때가 Chrome Canary를 권할 자리다(최후의 보루).
 *
 * 새로 "AI를 쓸 수 있나?"를 확인하는 화면을 만들면 `isPromptApiSupported()`나 `navigator.gpu`를
 * 직접 부르지 말고 이 함수를 쓸 것.
 */
export type AiSetupPath =
  /** 내장 AI로 바로 쓸 수 있다. Gemma는 선택적 업그레이드. */
  | "builtin-ready"
  /** 내장 AI는 없지만 Gemma를 받으면 쓸 수 있다. */
  | "gemma-required"
  /** 내장 AI도 Gemma도 못 쓴다 — Chrome Canary를 권할 유일한 경우. */
  | "chrome-fallback";

export interface AiCapability {
  /** Chrome 내장 Prompt API(`window.LanguageModel`)를 쓸 수 있는가 */
  promptApi: boolean;
  /** Gemma 4를 내려받아 WebGPU에서 돌릴 수 있는가 */
  gemma: boolean;
  /** 모바일로 보이는가 — 2GB 다운로드와 약 1.8GB GPU 메모리는 폰에서 버거울 수 있다 */
  isMobile: boolean;
  path: AiSetupPath;
}

/**
 * 모바일 추정. 정확히 알 방법은 없고(기기 성능을 웹에서 알 수 없다) 막으려는 것도 아니다 —
 * 다운로드 버튼 옆에 경고 한 줄을 붙일지 정하는 용도라 이 정도로 충분하다.
 */
function detectMobile(): boolean {
  if (typeof navigator === "undefined") return false;

  const uaData = (navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData;
  if (typeof uaData?.mobile === "boolean") return uaData.mobile;

  const ua = navigator.userAgent;
  if (/Android|iPhone|iPod/i.test(ua)) return true;
  // iPadOS는 데스크톱 Safari를 흉내내서 UA에 Macintosh가 들어간다 — 터치 지점 수로 가려낸다.
  if (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) return true;
  return false;
}

export function detectAiCapability(): AiCapability {
  const promptApi = isPromptApiSupported();
  const gemma = isWebGpuSupported() && isOpfsSupported();

  return {
    promptApi,
    gemma,
    isMobile: detectMobile(),
    path: promptApi ? "builtin-ready" : gemma ? "gemma-required" : "chrome-fallback",
  };
}

/** 모바일 다운로드 경고 문구. 여러 화면이 같은 말을 해야 해서 여기 모아둔다. */
export const MOBILE_DOWNLOAD_WARNING =
  "모바일 기기에서는 내려받기와 실행이 실패할 수 있어요 (약 1.8GB의 GPU 메모리가 필요합니다). 가능하면 데스크톱을 권합니다.";
