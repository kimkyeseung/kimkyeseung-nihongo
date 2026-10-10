import { describe, expect, it } from "vitest";
import { GOJUON_SECTIONS } from "../data/gojuon";
import { ctcLogScore, decodeCtc, judgeByAlignment, judgePhonemes, kanaToPhonemes, speakableKanaPhonemes } from "./kanaPhonemes";

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

describe("judgeByAlignment — 확률 비교 채점", () => {
  // 모델(prj-beatrice/japanese-hubert-base-phoneme-ctc-v3)의 어휘 그대로.
  const VOCAB = Object.entries({
    EOS: 3, I: 9, N: 28, PAD: 0, SOS: 2, U: 10, UNK: 1, a: 4, b: 19, by: 36, ch: 31, cl: 29, d: 16, dy: 43, e: 7,
    f: 25, fy: 41, g: 12, gw: 45, gy: 34, h: 18, hy: 35, i: 5, j: 26, k: 11, kw: 44, ky: 33, m: 21, my: 38, n: 17,
    ny: 39, o: 8, p: 20, pau: 46, py: 37, r: 23, ry: 40, s: 13, sh: 30, sil: 47, t: 15, ts: 32, ty: 42, u: 6, v: 27,
    w: 24, y: 22, z: 14,
  }).reduce<string[]>((v, [tok, id]) => ((v[id] = tok), v), []);
  const CANDIDATES = speakableKanaPhonemes(
    GOJUON_SECTIONS.flatMap((s) => s.rows.flatMap((r) => r.cells)).filter((c) => c !== null)
  );

  /** 프레임마다 {토큰: 로짓}. 적지 않은 토큰은 -10. 앞뒤에 무음(PAD) 프레임을 붙인다. */
  function logits(frames: Record<string, number>[]) {
    const all = [{ PAD: 10 }, { PAD: 10 }, ...frames, { PAD: 10 }, { PAD: 10 }];
    const C = VOCAB.length;
    const out = new Float32Array(all.length * C).fill(-10);
    all.forEach((f, t) => Object.entries(f).forEach(([tok, v]) => (out[t * C + VOCAB.indexOf(tok)] = v)));
    return { out, frames: all.length, classes: C };
  }
  const judge = (frames: Record<string, number>[], kana: string) => {
    const l = logits(frames);
    return judgeByAlignment(l.out, l.frames, l.classes, VOCAB, kana, CANDIDATES);
  };

  it("또렷하면 정확", () => {
    expect(judge([{ k: 10 }, { a: 10 }, { a: 10 }], "か")).toEqual({ judgement: "exact", heardAs: "か" });
  });

  it("모델이 망설였으면(く와 ふ가 비슷) 정확 — 가장 그럴듯한 하나만 보면 틀렸다고 했던 경우", () => {
    expect(judge([{ f: 9, k: 8.5 }, { u: 10 }], "く").judgement).toBe("exact");
  });

  it("다른 글자가 분명하면 틀림, 무엇으로 들렸는지 알려준다", () => {
    expect(judge([{ f: 10 }, { u: 10 }], "く")).toEqual({ judgement: "wrong", heardAs: "ふ" });
  });

  it("탁점만 다르면 거의 맞음", () => {
    expect(judge([{ g: 10 }, { a: 10 }], "か")).toEqual({ judgement: "near", heardAs: "が" });
  });

  it("목소리가 없으면(무음뿐) 아무 글자도 정확이 아니다", () => {
    expect(judge([{ PAD: 10 }], "あ")).toEqual({ judgement: "wrong", heardAs: null });
    expect(judge([{ sil: 10 }, { pau: 10 }], "あ")).toEqual({ judgement: "wrong", heardAs: null });
  });
});

describe("ctcLogScore", () => {
  it("한 프레임·한 토큰이면 그 토큰의 확률", () => {
    const lp = new Float64Array([Math.log(0.2), Math.log(0.8)]);
    const blank = new Float64Array([Math.log(0.2)]);
    expect(ctcLogScore(lp, blank, 1, 2, [1])).toBeCloseTo(Math.log(0.8));
  });
});
