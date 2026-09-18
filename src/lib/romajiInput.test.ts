import { describe, expect, it } from "vitest";
import { convertTypedRomaji } from "./romajiInput";

/**
 * 입력 변환은 "조용히 틀리는" 코드다 — 범위를 한 글자만 잘못 잡아도 콘솔에는 아무것도 안 찍히고
 * 사용자가 쓰던 문장만 망가진다(실제로 `hello world`가 `へlぉ をrlだ`가 됐다).
 * 각 테스트는 그때 실제로 깨졌던 경우 하나씩이다.
 */
describe("convertTypedRomaji", () => {
  it("빈 칸에서 친 로마자를 히라가나로 바꾼다", () => {
    expect(convertTypedRomaji("sushi", 5, 0)).toEqual({ value: "すし", cursor: 2 });
  });

  it("**모드를 켜기 전에 있던 영문은 건드리지 않는다** (이 버그 때문에 만들어진 함수)", () => {
    // "hello world"(11자)가 있는 상태에서 일본어 모드로 바꾸고 "a"를 친 상황.
    const result = convertTypedRomaji("hello worlda", 12, 11);
    expect(result).toEqual({ value: "hello worldあ", cursor: 12 });
  });

  it("floor가 없으면 앞 문장까지 먹힌다 — 바닥이 하는 일을 고정해둔다", () => {
    // 같은 입력을 floor 0으로 부르면 wanakana 기본 동작처럼 전부 변환된다.
    const result = convertTypedRomaji("hello worlda", 12, 0);
    expect(result?.value).not.toBe("hello worldあ");
    expect(result?.value).not.toContain("hello");
  });

  it("보호 구간 안(커서가 floor 이하)에서는 변환하지 않는다", () => {
    expect(convertTypedRomaji("hello", 3, 5)).toBeNull();
    expect(convertTypedRomaji("hello", 5, 5)).toBeNull();
  });

  it("앞에 가나가 있으면 거기서 멈춘다 (floor 밖이어도)", () => {
    expect(convertTypedRomaji("すしwo", 5, 0)).toEqual({ value: "すしを", cursor: 3 });
  });

  it("덜 친 로마자 꼬리는 그대로 남긴다 (IME 모드)", () => {
    // "s"만 친 상태 — 아직 가나가 될 수 없으니 바뀌는 게 없다.
    expect(convertTypedRomaji("s", 1, 0)).toBeNull();
    // "sus" → "す" + 남은 "s"
    expect(convertTypedRomaji("sus", 3, 0)).toEqual({ value: "すs", cursor: 2 });
  });

  it("문장 중간에 끼워 넣어도 뒤쪽 글자를 보존한다", () => {
    // "すし|です"에서 "wo"를 친 상황
    expect(convertTypedRomaji("すしwoです", 4, 0)).toEqual({ value: "すしをです", cursor: 3 });
  });

  it("floor가 길이를 넘어가도(지운 뒤) 터지지 않는다", () => {
    expect(convertTypedRomaji("", 0, 11)).toBeNull();
    expect(convertTypedRomaji("ka", 2, 99)).toBeNull();
  });

  it("바뀔 게 없으면 null을 준다 — 호출부가 DOM을 건드리지 않도록", () => {
    expect(convertTypedRomaji("すし", 2, 0)).toBeNull();
    expect(convertTypedRomaji("", 0, 0)).toBeNull();
  });
});
