import { describe, expect, it } from "vitest";
import { KEYBOARD_MIN_SHRINK, isKeyboardOpen } from "./appViewport";

describe("isKeyboardOpen", () => {
  it("입력창에 포커스가 있고 키보드만큼 줄었을 때만 참", () => {
    expect(isKeyboardOpen({ fullHeight: 740, height: 420, editableFocused: true })).toBe(true);
  });

  it("뒤로 가기로 키보드만 내렸으면(포커스는 남음) 거짓 — 네비가 돌아와야 한다", () => {
    expect(isKeyboardOpen({ fullHeight: 740, height: 740, editableFocused: true })).toBe(false);
  });

  it("주소창이 접히고 펴지는 정도는 키보드가 아니다", () => {
    expect(isKeyboardOpen({ fullHeight: 740, height: 740 - 60, editableFocused: true })).toBe(false);
    expect(isKeyboardOpen({ fullHeight: 740, height: 740 - KEYBOARD_MIN_SHRINK, editableFocused: true })).toBe(false);
  });

  it("포커스가 없으면 줄어도 거짓(분할 화면 등)", () => {
    expect(isKeyboardOpen({ fullHeight: 740, height: 420, editableFocused: false })).toBe(false);
  });
});
