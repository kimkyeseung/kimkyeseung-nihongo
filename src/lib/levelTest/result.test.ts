import { describe, expect, it } from "vitest";
import {
  NOT_MEASURED,
  kanaResult,
  lowConfidenceSections,
  overallLevel,
  shortSectionResult,
  staircaseResult,
  type LevelTestSections,
} from "./result";
import { answerShortSection, answerStaircase, startShortSection, startStaircase } from "./adaptive";
import type { EstimatedLevel, SectionResult } from "../../types/levelTest";

// 종합 급수가 곧 커리큘럼 시작 단계가 된다. 한 단계만 어긋나도 화면에는 그럴듯한 급수가 뜨고,
// 학습자는 너무 쉽거나 너무 어려운 단계에서 시작한다.

const r = (estimate: EstimatedLevel | null, confident = true): SectionResult => ({
  estimate,
  correct: 0,
  total: 0,
  confident,
});

function sections(levels: Partial<Record<"vocab" | "kanji" | "grammar" | "reading" | "listening", EstimatedLevel>>) {
  const out: LevelTestSections = {};
  for (const [k, v] of Object.entries(levels)) out[k as keyof typeof levels] = r(v);
  return out;
}

describe("overallLevel — 중앙값", () => {
  it("다섯 영역의 중앙값이다", () => {
    expect(overallLevel(sections({ vocab: "N3", kanji: "N4", grammar: "N4", reading: "N4", listening: "N3" }))).toBe("N4");
    expect(overallLevel(sections({ vocab: "N2", kanji: "N3", grammar: "N2", reading: "N3", listening: "N2" }))).toBe("N2");
  });

  it("짝수 개면 낮은 쪽을 고른다", () => {
    expect(overallLevel(sections({ vocab: "N3", kanji: "N3", grammar: "N2", reading: "N2" }))).toBe("N3");
  });

  it("측정 안 한 영역은 빼고 계산한다 — 0점으로 치지 않는다", () => {
    const s = sections({ vocab: "N2", kanji: "N2", grammar: "N2", reading: "N2" });
    s.listening = NOT_MEASURED;
    expect(overallLevel(s)).toBe("N2");
  });

  it("측정한 영역이 없으면 판정하지 않는다", () => {
    expect(overallLevel({})).toBeNull();
    expect(overallLevel({ listening: NOT_MEASURED })).toBeNull();
  });
});

describe("overallLevel — 한 영역이 크게 빌 때", () => {
  it("가장 낮은 영역이 중앙값보다 2단계 이상 낮으면 한 단계 내린다", () => {
    // 중앙값 N2, 청해 N4(2단계 아래) → N3
    expect(overallLevel(sections({ vocab: "N2", kanji: "N2", grammar: "N2", reading: "N2", listening: "N4" }))).toBe("N3");
  });

  it("1단계 차이면 내리지 않는다", () => {
    expect(overallLevel(sections({ vocab: "N2", kanji: "N2", grammar: "N2", reading: "N2", listening: "N3" }))).toBe("N2");
  });

  it("3단계 이상 차이여도 한 단계만 내린다", () => {
    expect(overallLevel(sections({ vocab: "N1", kanji: "N1", grammar: "N1", reading: "N1", listening: "N4" }))).toBe("N2");
  });

  it("Pre-N5 영역도 차이 계산에 들어간다", () => {
    // 중앙값 N4, 독해 Pre-N5(2단계 아래) → N5
    expect(overallLevel(sections({ vocab: "N4", kanji: "N4", grammar: "N4", reading: "Pre-N5" }))).toBe("N5");
  });
});

describe("overallLevel — 가나", () => {
  it("가나를 통과하지 못했으면 다른 영역과 상관없이 Pre-N5다", () => {
    const s = sections({ vocab: "N5", kanji: "N5", grammar: "N4" });
    s.kana = kanaResult(3, 8);
    expect(overallLevel(s)).toBe("Pre-N5");
  });

  it("가나를 통과했으면 중앙값 계산에 넣지 않는다", () => {
    const s = sections({ vocab: "N4", kanji: "N4", grammar: "N4" });
    s.kana = kanaResult(8, 8); // "N5"로 적히지만 급수가 아니다
    expect(overallLevel(s)).toBe("N4");
  });

  it("가나만 풀었으면 그 결과를 그대로 쓴다", () => {
    expect(overallLevel({ kana: kanaResult(8, 8) })).toBe("N5");
  });
});

describe("kanaResult", () => {
  it("3/4 이상이면 통과다", () => {
    expect(kanaResult(6, 8).estimate).toBe("N5");
    expect(kanaResult(5, 8).estimate).toBe("Pre-N5");
  });

  it("한 문제도 안 풀었으면 통과가 아니다", () => {
    expect(kanaResult(0, 0).estimate).toBe("Pre-N5");
  });
});

describe("lowConfidenceSections", () => {
  it("경계를 못 찾은 영역만 고른다", () => {
    const s: LevelTestSections = { vocab: r("N3", false), kanji: r("N3"), grammar: r("N4", false) };
    expect(lowConfidenceSections(s)).toEqual(["vocab", "grammar"]);
  });

  it("측정 안 한 영역은 고르지 않는다", () => {
    expect(lowConfidenceSections({ listening: { ...NOT_MEASURED, confident: false } })).toEqual([]);
  });
});

describe("영역 결과 요약", () => {
  it("계단식 영역의 맞힌 수·푼 수·확실성을 모은다", () => {
    let s = startStaircase("grammar", "N4");
    for (const c of [true, true, false, true, true, false]) s = answerStaircase(s, c);
    expect(staircaseResult(s)).toEqual({ estimate: "N4", correct: 4, total: 6, confident: true });
  });

  it("독해·청해는 항상 확실한 것으로 둔다(문항이 적어 경계를 따지지 않는다)", () => {
    let s = startShortSection("reading", "N4");
    s = answerShortSection(s, true);
    s = answerShortSection(s, false);
    expect(shortSectionResult(s)).toEqual({ estimate: "N4", correct: 1, total: 2, confident: true });
  });
});
