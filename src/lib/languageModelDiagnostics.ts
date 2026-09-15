import { detectBrowser, isChromeVersionSufficient, type BrowserInfo } from "./browserCheck";
import type { LanguageModelAvailability } from "../types/languageModel";

export type DiagnosticStatus = "pass" | "fail" | "warn" | "unknown";

export interface DiagnosticStep {
  id: string;
  title: string;
  status: DiagnosticStatus;
  detail: string;
}

export interface DiagnosticsResult {
  browser: BrowserInfo;
  steps: DiagnosticStep[];
}

/**
 * 브라우저/버전/API 노출/모델 상태를 순서대로 확인한다. 실제 세션 생성(모델 다운로드를
 * 유발할 수 있음)은 여기 포함하지 않는다 — 사용자 동의 없이 조용히 몇 GB를 받기 시작하면
 * 안 되므로, 그건 별도 버튼으로 명시적으로 트리거한다(runSessionCreationTrial 참고).
 */
export async function runLanguageModelDiagnostics(): Promise<DiagnosticsResult> {
  const browser = detectBrowser();
  const steps: DiagnosticStep[] = [];

  steps.push({
    id: "browser",
    title: "1. 브라우저 확인",
    status: browser.isGenuineChrome ? "pass" : "fail",
    detail: browser.isGenuineChrome
      ? `${browser.name}${browser.version ? ` ${browser.version}` : ""} — 온디바이스 AI를 지원하는 브라우저입니다.`
      : `${browser.name}${browser.version ? ` ${browser.version}` : ""}를 사용 중입니다. Whale·Edge·Opera·Samsung Internet 등은 크로미움 기반이어도 구글의 온디바이스 Gemini Nano 모델을 배포하지 않아 이 기능을 쓸 수 없습니다. 반드시 진짜 Chrome(가급적 Chrome Canary)을 사용하세요.`,
  });

  const versionOk = isChromeVersionSufficient(browser);
  steps.push({
    id: "version",
    title: "2. Chrome 버전 확인",
    status: !browser.isGenuineChrome ? "unknown" : versionOk ? "pass" : "fail",
    detail: !browser.isGenuineChrome
      ? "Chrome이 아니라서 버전 확인을 건너뜁니다."
      : versionOk
        ? `Chrome ${browser.version} — 버전 조건을 충족합니다.`
        : `Chrome ${browser.version ?? "알 수 없음"} — 최신 Chrome(가급적 Canary)으로 업데이트하세요.`,
  });

  const apiExists = typeof window !== "undefined" && "LanguageModel" in window && Boolean(window.LanguageModel);
  steps.push({
    id: "api",
    title: "3. Prompt API 노출 여부",
    status: apiExists ? "pass" : "fail",
    detail: apiExists
      ? "window.LanguageModel이 존재합니다."
      : 'window.LanguageModel이 없습니다. chrome://flags 에서 "Prompt API for Gemini Nano"를 Enabled로 설정한 뒤 브라우저를 재시작하세요.',
  });

  if (!apiExists) {
    return { browser, steps };
  }

  try {
    const availability: LanguageModelAvailability = await window.LanguageModel!.availability();
    steps.push({
      id: "availability",
      title: "4. 모델 사용 가능 여부",
      status: availability === "available" ? "pass" : availability === "unavailable" ? "fail" : "warn",
      detail:
        availability === "available"
          ? "모델을 바로 사용할 수 있습니다."
          : availability === "downloadable"
            ? "모델을 아직 받지 않았습니다 — 기능을 실제로 실행하면 자동으로 다운로드가 시작됩니다(수 GB, 시간이 걸릴 수 있음)."
            : availability === "downloading"
              ? "모델을 다운로드하는 중입니다. 완료될 때까지 기다려주세요."
              : "이 기기/브라우저에서는 모델을 사용할 수 없습니다. chrome://flags 설정과 하드웨어 요구사항(여유 저장공간 등)을 확인하세요.",
    });
  } catch (err) {
    steps.push({
      id: "availability",
      title: "4. 모델 사용 가능 여부",
      status: "fail",
      detail: `availability() 호출 중 오류: ${err instanceof Error ? err.message : String(err)}`,
    });
  }

  return { browser, steps };
}

export interface SessionTrialResult {
  status: "pass" | "fail";
  detail: string;
}

/** 실제로 세션을 만들어봐야만 드러나는 오류(예: 실행 게이팅 플래그 비활성화)를 잡아낸다. */
export async function runSessionCreationTrial(): Promise<SessionTrialResult> {
  if (typeof window === "undefined" || !window.LanguageModel) {
    return { status: "fail", detail: "window.LanguageModel이 없어 테스트할 수 없습니다." };
  }
  try {
    const session = await window.LanguageModel.create();
    session.destroy();
    return {
      status: "pass",
      detail: "실제로 세션을 만드는 데 성공했습니다. 온디바이스 AI 기능을 사용할 준비가 됐습니다.",
    };
  } catch (err) {
    const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    const isFlagGating = message.includes("feature flag");
    return {
      status: "fail",
      detail: isFlagGating
        ? `${message}\n→ chrome://flags/#optimization-guide-on-device-model 을 "Enabled BypassPerfRequirement"로, chrome://flags/#prompt-api-for-gemini-nano 을 "Enabled"로 설정한 뒤 Chrome을 재시작하세요.`
        : `${message}\n→ chrome://on-device-internals 에서 자세한 상태를 확인하세요.`,
    };
  }
}
