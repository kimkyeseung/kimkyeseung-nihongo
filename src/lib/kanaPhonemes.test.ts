import { describe, expect, it } from "vitest";
import { GOJUON_SECTIONS } from "../data/gojuon";
import { decodeCtc, judgePhonemes, kanaToPhonemes } from "./kanaPhonemes";

const p = (s: string) => s.split(" ");

describe("kanaToPhonemes", () => {
  it("모델(pyopenjtalk) 표기로 바꾼다", () => {
    expect(kanaToPhonemes("か")).toEqual(["k", "a"]);
    expect(kanaToPhonemes("し")).toEqual(["sh", "i"]);
    expect(kanaToPhonemes("ち")).toEqual(["ch", "i"]);
    expect(kanaToPhonemes("つ")).toEqual(["ts", "u"]);
    expect(kanaToPhonemes("ふ")).toEqual(["f", "u"]);
    expect(kanaToPhonemes("じ")).toEqual(["j", "i"]);
    expect(kanaToPhonemes("ぢ")).toEqual(["j", "i"]);
    expect(kanaToPhonemes("きゃ")).toEqual(["ky", "a"]);
    expect(kanaToPhonemes("ん")).toEqual(["N"]);
    expect(kanaToPhonemes("を")).toEqual(["o"]);
    expect(kanaToPhonemes("ふぁ")).toEqual(["f", "a"]);
    expect(kanaToPhonemes("てぃ")).toEqual(["t", "i"]);
    expect(kanaToPhonemes("うぃ")).toEqual(["w", "i"]);
    expect(kanaToPhonemes("くぁ")).toEqual(["kw", "a"]);
  });

  it("오십음도의 히라가나 칸은 전부 바꿀 수 있다", () => {
    const cells = GOJUON_SECTIONS.flatMap((s) => s.rows.flatMap((r) => r.cells)).filter((c) => c !== null);
    const missing = cells.filter((c) => !c.speech && kanaToPhonemes(c.hiragana) === null).map((c) => c.hiragana);
    expect(missing).toEqual([]);
  });
});

describe("judgePhonemes — 실제 녹음에서 나온 모양들", () => {
  it("정확히 / 길게 끈 꼬리 / 되풀이", () => {
    expect(judgePhonemes(p("k a"), "か")).toBe("exact");
    expect(judgePhonemes(p("k a a"), "か")).toBe("exact");
    expect(judgePhonemes(p("k a k a k a"), "か")).toBe("exact");
    expect(judgePhonemes(p("ch i i"), "ち")).toBe("exact");
    expect(judgePhonemes(p("k I"), "き")).toBe("exact"); // 무성화 모음
  });

  it("탁점·반탁점만 다르면 거의 맞음", () => {
    expect(judgePhonemes(p("k a"), "が")).toBe("near");
    expect(judgePhonemes(p("p u"), "ぶ")).toBe("near");
    expect(judgePhonemes(p("f u"), "ぷ")).toBe("near");
    expect(judgePhonemes(p("ch i i"), "ぢ")).toBe("near"); // 실제 녹음
    expect(judgePhonemes(p("t a"), "だ")).toBe("near");
    expect(judgePhonemes(p("h o o"), "ぼ")).toBe("near");
    expect(judgePhonemes(p("b u b u p u"), "ぶ")).toBe("near"); // 세 번 중 하나만 변형
  });

  it("다른 행이면 틀림 — に를 り로, く를 ふ로", () => {
    expect(judgePhonemes(p("r i i"), "に")).toBe("wrong");
    expect(judgePhonemes(p("f u"), "く")).toBe("wrong");
    expect(judgePhonemes(p("ch i i"), "ざ")).toBe("wrong"); // ざ를 ち로 — 실제 녹음, 다른 행
    expect(judgePhonemes(p("b u"), "む")).toBe("wrong");
    expect(judgePhonemes(p("ch i"), "し")).toBe("wrong");
    expect(judgePhonemes([], "あ")).toBe("wrong");
  });

  it("앞에 다른 소리가 붙으면 틀림(꼬리만 봐준다)", () => {
    expect(judgePhonemes(p("a k a"), "か")).toBe("wrong");
  });
});

describe("decodeCtc", () => {
  it("연속된 같은 id를 합치고 쉼을 뺀다", () => {
    const vocab = ["PAD", "k", "a", "pau"];
    expect(decodeCtc([0, 1, 1, 0, 2, 2, 3, 1, 2], vocab)).toEqual(["k", "a", "k", "a"]);
  });
});
