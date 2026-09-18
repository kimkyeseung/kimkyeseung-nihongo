import { afterEach, describe, expect, it, vi } from "vitest";
import { detectAiCapability } from "./aiCapability";

// 이 판정 하나가 세 화면(첫 접속 모달·대문 카드·회화/작문 인라인 안내)의 문구를 전부 결정한다.
// 잘못되면 Safari·Firefox 사용자가 쓸 수 있는 길을 두고 Chrome을 받으라는 말을 듣게 된다.

const DESKTOP_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)";

function stubBrowser(options: {
  promptApi?: boolean;
  webgpu?: boolean;
  opfs?: boolean;
  ua?: string;
  maxTouchPoints?: number;
  uaDataMobile?: boolean;
}) {
  const { promptApi = false, webgpu = false, opfs = false } = options;

  vi.stubGlobal("window", promptApi ? { LanguageModel: {} } : {});

  const nav: Record<string, unknown> = {
    userAgent: options.ua ?? DESKTOP_UA,
    maxTouchPoints: options.maxTouchPoints ?? 0,
  };
  if (webgpu) nav.gpu = {};
  if (opfs) nav.storage = { getDirectory: () => undefined };
  if (options.uaDataMobile !== undefined) nav.userAgentData = { mobile: options.uaDataMobile };
  vi.stubGlobal("navigator", nav);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("detectAiCapability - 안내 경로", () => {
  it("내장 AI가 되면 바로 쓸 수 있다고 본다", () => {
    stubBrowser({ promptApi: true, webgpu: true, opfs: true });
    expect(detectAiCapability().path).toBe("builtin-ready");
  });

  it("내장 AI가 되면 WebGPU가 없어도 막지 않는다", () => {
    stubBrowser({ promptApi: true });
    expect(detectAiCapability().path).toBe("builtin-ready");
  });

  it("내장 AI가 없어도 WebGPU+OPFS가 있으면 Gemma로 유도한다", () => {
    // Safari 26 / Firefox 141+ 가 여기 해당한다 — 예전엔 이 경우에도 Chrome을 권했다.
    stubBrowser({ webgpu: true, opfs: true });
    const capability = detectAiCapability();

    expect(capability.path).toBe("gemma-required");
    expect(capability.gemma).toBe(true);
  });

  it("WebGPU가 없으면 그때만 Chrome을 권한다", () => {
    stubBrowser({ opfs: true });
    expect(detectAiCapability().path).toBe("chrome-fallback");
  });

  it("OPFS가 없으면 모델을 저장할 곳이 없으므로 Chrome을 권한다", () => {
    stubBrowser({ webgpu: true });
    expect(detectAiCapability().path).toBe("chrome-fallback");
  });
});

describe("detectAiCapability - 모바일 판정", () => {
  it("userAgentData.mobile을 우선 믿는다", () => {
    stubBrowser({ webgpu: true, opfs: true, uaDataMobile: true });
    expect(detectAiCapability().isMobile).toBe(true);
  });

  it("iPhone을 알아본다", () => {
    stubBrowser({ ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X)" });
    expect(detectAiCapability().isMobile).toBe(true);
  });

  it("데스크톱 Safari를 흉내내는 iPadOS를 터치 지점 수로 가려낸다", () => {
    stubBrowser({ ua: DESKTOP_UA, maxTouchPoints: 5 });
    expect(detectAiCapability().isMobile).toBe(true);
  });

  it("데스크톱은 모바일로 보지 않는다", () => {
    stubBrowser({ webgpu: true, opfs: true });
    expect(detectAiCapability().isMobile).toBe(false);
  });
});
