import { afterEach, describe, expect, it, vi } from "vitest";
import { builtinUnavailableReason, detectAiCapabilitySnapshot, resolveAiCapability } from "./aiCapability";
import type { LanguageModelAvailability } from "../types/languageModel";

// 이 판정 하나가 세 화면(첫 접속 모달·대문 카드·회화/작문 인라인 안내)의 문구를 전부 결정한다.
// 잘못되면 ① Safari·Firefox 사용자가 쓸 수 있는 길을 두고 Chrome을 받으라는 말을 듣거나,
// ② Whale처럼 API 객체만 있는 브라우저가 "쓸 수 있음"으로 보였다가 보내는 순간 실패한다.

const MAC_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)";
const CHROME_UA = `${MAC_UA} AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36`;
const WHALE_UA = `${CHROME_UA} Whale/3.25.232.19`;
const SAFARI_UA = `${MAC_UA} AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15`;

function stubBrowser(options: {
  /** window.LanguageModel 객체를 노출할지 — 있다고 쓸 수 있는 건 아니다 */
  promptApiPresent?: boolean;
  availability?: LanguageModelAvailability;
  webgpu?: boolean;
  opfs?: boolean;
  ua?: string;
  maxTouchPoints?: number;
  uaDataMobile?: boolean;
}) {
  const { promptApiPresent = false, availability = "available", webgpu = false, opfs = false } = options;

  vi.stubGlobal(
    "window",
    promptApiPresent ? { LanguageModel: { availability: () => Promise.resolve(availability) } } : {}
  );

  const nav: Record<string, unknown> = {
    userAgent: options.ua ?? CHROME_UA,
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

describe("resolveAiCapability - 안내 경로", () => {
  it("내장 AI가 되면 바로 쓸 수 있다고 본다", async () => {
    stubBrowser({ promptApiPresent: true, availability: "available", webgpu: true, opfs: true });
    expect((await resolveAiCapability()).path).toBe("builtin-ready");
  });

  it("모델을 아직 받지 않았어도(downloadable) 쓸 수 있는 것으로 본다", async () => {
    // 브라우저가 알아서 받아온다 — 진행률은 useLanguageModel이 따로 보여준다.
    stubBrowser({ promptApiPresent: true, availability: "downloadable" });
    expect((await resolveAiCapability()).path).toBe("builtin-ready");
  });

  it("Whale처럼 API 객체만 있고 모델이 없으면 Gemma로 유도한다", async () => {
    // 크로미움 포크에는 window.LanguageModel이 노출되지만 구글이 모델을 배포하지 않아
    // availability()가 "unavailable"을 준다. 동기 검사만 믿으면 화면은 멀쩡한데 실패한다.
    stubBrowser({
      promptApiPresent: true,
      availability: "unavailable",
      webgpu: true,
      opfs: true,
      ua: WHALE_UA,
    });
    const capability = await resolveAiCapability();

    expect(capability.promptApiPresent).toBe(true);
    expect(capability.promptApi).toBe(false);
    expect(capability.path).toBe("gemma-required");
  });

  it("availability()가 던지면 못 쓰는 것으로 본다", async () => {
    vi.stubGlobal("window", {
      LanguageModel: {
        availability: () => Promise.reject(new Error("boom")),
      },
    });
    vi.stubGlobal("navigator", {
      userAgent: CHROME_UA,
      maxTouchPoints: 0,
      gpu: {},
      storage: { getDirectory: () => undefined },
    });

    expect((await resolveAiCapability()).path).toBe("gemma-required");
  });

  it("내장 AI가 없어도 WebGPU+OPFS가 있으면 Gemma로 유도한다", async () => {
    // Safari 26 / Firefox 141+ 가 여기 해당한다 — 예전엔 이 경우에도 Chrome을 권했다.
    stubBrowser({ webgpu: true, opfs: true, ua: SAFARI_UA });
    const capability = await resolveAiCapability();

    expect(capability.path).toBe("gemma-required");
    expect(capability.gemma).toBe(true);
  });

  it("WebGPU가 없으면 그때만 Chrome을 권한다", async () => {
    stubBrowser({ opfs: true, ua: SAFARI_UA });
    expect((await resolveAiCapability()).path).toBe("chrome-fallback");
  });

  it("OPFS가 없으면 모델을 저장할 곳이 없으므로 Chrome을 권한다", async () => {
    stubBrowser({ webgpu: true, ua: SAFARI_UA });
    expect((await resolveAiCapability()).path).toBe("chrome-fallback");
  });
});

describe("builtinUnavailableReason", () => {
  it("크로미움 포크에는 플래그 이야기를 하지 않는다", () => {
    // Whale에는 켤 플래그 자체가 없다 — "플래그를 켜세요"는 막다른 안내다.
    stubBrowser({ promptApiPresent: true, webgpu: true, opfs: true, ua: WHALE_UA });
    const reason = builtinUnavailableReason(detectAiCapabilitySnapshot());

    expect(reason).toContain("Whale");
    expect(reason).not.toContain("플래그");
  });

  it("진짜 Chrome에는 플래그/기기 조건을 짚어준다", () => {
    stubBrowser({ promptApiPresent: true, ua: CHROME_UA });
    expect(builtinUnavailableReason(detectAiCapabilitySnapshot())).toContain("플래그");
  });
});

describe("detectAiCapabilitySnapshot - 모바일 판정", () => {
  it("userAgentData.mobile을 우선 믿는다", () => {
    stubBrowser({ webgpu: true, opfs: true, uaDataMobile: true });
    expect(detectAiCapabilitySnapshot().isMobile).toBe(true);
  });

  it("iPhone을 알아본다", () => {
    stubBrowser({ ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X)" });
    expect(detectAiCapabilitySnapshot().isMobile).toBe(true);
  });

  it("데스크톱 Safari를 흉내내는 iPadOS를 터치 지점 수로 가려낸다", () => {
    stubBrowser({ ua: SAFARI_UA, maxTouchPoints: 5 });
    expect(detectAiCapabilitySnapshot().isMobile).toBe(true);
  });

  it("데스크톱은 모바일로 보지 않는다", () => {
    stubBrowser({ webgpu: true, opfs: true, ua: SAFARI_UA });
    expect(detectAiCapabilitySnapshot().isMobile).toBe(false);
  });
});
