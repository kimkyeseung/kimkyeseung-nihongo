import { detectBrowser } from "./browserCheck";
import { isPromptApiSupported } from "./languageModel";
import { isOpfsSupported, isWebGpuSupported } from "./gemmaModel";
import type { LanguageModelAvailability } from "../types/languageModel";

/**
 * "이 브라우저에서 생성형 기능(회화·작문·선생님)을 어떻게 쓰게 할 것인가"를 한 곳에서 판단한다.
 *
 * 예전에는 화면마다 제각기 "Prompt API가 없으면 Chrome Canary를 받으세요"라고만 안내했다.
 * 그런데 Gemma 4는 Chrome 내장 AI와 무관하게 **WebGPU만 있으면** 도는 별도 엔진이라,
 * Safari 26·Firefox 141+ 사용자에게도 Chrome을 받으라고 떠미는 잘못된 안내였다.
 *
 * 안내 순서:
 *   1. 내장 AI가 되면      → 바로 쓸 수 있다. Gemma는 "더 나은 선택지"로만 권한다.
 *   2. 내장 AI가 없으면    → Gemma를 받으면 이 브라우저에서도 쓸 수 있다(용량·제한 함께 안내).
 *   3. Gemma도 못 쓰면     → 그때가 Chrome Canary를 권할 자리다(최후의 보루).
 *
 * **`window.LanguageModel`이 있다고 쓸 수 있는 게 아니다 (실제로 겪은 버그, Whale)**:
 * 크로미움 기반 브라우저(Whale·Edge·Opera·Samsung Internet…)에는 API 객체가 노출되지만,
 * 구글이 Gemini Nano 모델을 진짜 Chrome에만 배포하기 때문에 `availability()`가 `"unavailable"`을
 * 돌려준다. 동기 검사만으로 "쓸 수 있다"고 판단하면 화면은 멀쩡한데 보내는 순간 실패한다.
 * 그래서 **경로 판단(`path`)은 `availability()`를 기다린 `resolveAiCapability()`에서만** 한다.
 */
export type AiSetupPath =
  /** 내장 AI로 바로 쓸 수 있다. Gemma는 선택적 업그레이드. */
  | "builtin-ready"
  /** 내장 AI는 없지만 Gemma를 받으면 쓸 수 있다. */
  | "gemma-required"
  /** 내장 AI도 Gemma도 못 쓴다 — Chrome Canary를 권할 유일한 경우. */
  | "chrome-fallback";

/** 동기적으로 알 수 있는 것만. **이것만으로 `path`를 정하지 말 것** (위 주석 참고). */
export interface AiCapabilitySnapshot {
  /** `window.LanguageModel` 객체가 있는가 — 쓸 수 있다는 뜻은 아니다 */
  promptApiPresent: boolean;
  /** Gemma 4를 내려받아 WebGPU에서 돌릴 수 있는가 */
  gemma: boolean;
  /** 모바일로 보이는가 — 2GB 다운로드와 약 1.8GB GPU 메모리는 폰에서 버거울 수 있다 */
  isMobile: boolean;
  browserName: string;
  /** 크로미움 포크가 아닌 진짜 Chrome인가 — 내장 AI 모델은 여기에만 배포된다 */
  isGenuineChrome: boolean;
}

export interface AiCapability extends AiCapabilitySnapshot {
  /** `availability()`의 답. 아직 안 물어봤거나 API가 없으면 null */
  availability: LanguageModelAvailability | null;
  /** 내장 AI를 **실제로** 쓸 수 있는가 */
  promptApi: boolean;
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

export function detectAiCapabilitySnapshot(): AiCapabilitySnapshot {
  const browser = detectBrowser();
  return {
    promptApiPresent: isPromptApiSupported(),
    gemma: isWebGpuSupported() && isOpfsSupported(),
    isMobile: detectMobile(),
    browserName: browser.name,
    isGenuineChrome: browser.isGenuineChrome,
  };
}

/**
 * `availability()`까지 물어보고 최종 판단한다. 화면 문구는 반드시 이쪽을 쓸 것
 * (React에서는 `useAiCapability()` 훅으로).
 *
 * `"downloadable"`·`"downloading"`은 **쓸 수 있는 것으로 본다** — 브라우저가 알아서 모델을
 * 받아오고, 진행률은 `useLanguageModel`이 따로 보여준다. `"unavailable"`만 못 쓰는 상태다.
 */
export async function resolveAiCapability(): Promise<AiCapability> {
  const snapshot = detectAiCapabilitySnapshot();

  let availability: LanguageModelAvailability | null = null;
  if (snapshot.promptApiPresent) {
    try {
      availability = (await window.LanguageModel!.availability()) ?? null;
    } catch {
      // 물어보다 실패하면 못 쓰는 것으로 본다 — 낙관적으로 봐서 좋을 게 없다.
      availability = "unavailable";
    }
  }

  const promptApi = availability !== null && availability !== "unavailable";

  return {
    ...snapshot,
    availability,
    promptApi,
    path: promptApi ? "builtin-ready" : snapshot.gemma ? "gemma-required" : "chrome-fallback",
  };
}

/** 모바일 다운로드 경고 문구. 여러 화면이 같은 말을 해야 해서 여기 모아둔다. */
export const MOBILE_DOWNLOAD_WARNING =
  "모바일 기기에서는 실행이 실패할 수 있어요 (약 1.8GB의 GPU 메모리가 필요합니다). " +
  "받는 동안에는 화면을 켜두세요 — 화면이 꺼지거나 다른 앱으로 전환하면 브라우저가 내려받기를 멈춥니다. " +
  "멈춰도 받아둔 만큼은 남아서 이어받을 수 있지만, 가능하면 데스크톱을 권합니다.";

/**
 * 크로미움 포크에서 내장 AI가 영영 안 되는 이유. Whale·Edge·Opera 등에 그대로 보여준다 —
 * "플래그를 켜세요"라고 안내해봐야 켤 플래그가 없다.
 */
export function builtinUnavailableReason(capability: AiCapabilitySnapshot): string {
  if (!capability.isGenuineChrome) {
    return `${capability.browserName}는 크로미움 기반이어도 구글의 온디바이스 모델(Gemini Nano)을 배포받지 못해 내장 AI를 쓸 수 없습니다.`;
  }
  return "Chrome에 내장 AI는 있지만 지금은 모델을 쓸 수 없는 상태입니다 (플래그가 꺼져 있거나 기기 조건을 만족하지 못했습니다).";
}
