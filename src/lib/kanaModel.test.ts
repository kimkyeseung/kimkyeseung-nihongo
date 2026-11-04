import { describe, expect, it } from "vitest";
import { isIosDevice } from "./kanaModel";

// 틀리면 콘솔은 조용하고, iPhone 사용자의 모바일 데이터에서 189MB가 모르는 사이 나간다.

const ua = {
  iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1",
  iphoneChrome: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 CriOS/130.0 Mobile/15E148 Safari/604.1",
  ipadOs: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15",
  android: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36",
  windows: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36",
};

describe("isIosDevice", () => {
  it("iPhone은 브라우저와 상관없이 iOS다", () => {
    expect(isIosDevice(ua.iphone, 5)).toBe(true);
    expect(isIosDevice(ua.iphoneChrome, 5)).toBe(true);
  });

  it("Mac처럼 보이는 iPad는 터치 지점으로 가려낸다", () => {
    expect(isIosDevice(ua.ipadOs, 5)).toBe(true);
    expect(isIosDevice(ua.ipadOs, 0)).toBe(false);
  });

  it("Android와 PC는 iOS가 아니다", () => {
    expect(isIosDevice(ua.android, 5)).toBe(false);
    expect(isIosDevice(ua.windows, 10)).toBe(false);
  });
});
