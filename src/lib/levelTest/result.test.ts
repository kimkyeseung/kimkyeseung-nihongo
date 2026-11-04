import { describe, expect, it } from "vitest";
import {
  NOT_MEASURED,
  kanaResult,
  lowConfidenceSections,
  overallLevel,
  overallRange,
  sectionResult,
  type LevelTestSections,
} from "./result";
import { answerSection, startSection } from "./adaptive";
import { priorAround } from "./inference";
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

describe("overallLevel — 근거 합치기", () => {
  it("영역들이 같은 급수면 그 급수다", () => {
    expect(overallLevel(sections({ vocab: "N3", kanji: "N3", grammar: "N3", reading: "N3", listening: "N3" }))).toBe("N3");
  });

  it("문법·독해가 어휘보다 무겁다", () => {
    // 어휘 N1로 나온 학습자의 사진 그대로 — 문법·한자 N5면 어휘가 종합을 끌어올리지 않는다.
    expect(overallLevel(sections({ vocab: "N1", kanji: "N5", grammar: "N5", reading: "N4" }))).toBe("N5");
    expect(overallLevel(sections({ vocab: "N5", grammar: "N3", reading: "N3" }))).toBe("N3");
  });

  it("같은 급수 판정이어도 답의 근거가 다르면 종합이 달라진다", () => {
    // 중앙값은 이 차이를 버렸다.
    const play = (marks: string) => {
      let s = startSection("grammar", priorAround("N4"));
      for (const m of marks) s = answerSection(s, m === "o");
      return sectionResult(s);
    };
    const strong = play("ooooooo");
    const weak = play("xoxoxox");
    expect(overallLevel({ grammar: strong })).not.toBe(overallLevel({ grammar: weak }));
  });

  it("범위가 한 급수로 좁혀졌으면 범위를 주지 않는다", () => {
    const firm: SectionResult = { ...r("N3"), evidence: [0, 0, 0, 1, 0, 0] };
    expect(overallRange({ grammar: firm })).toBeNull();
    const loose: SectionResult = { ...r("N3"), evidence: [0, 0, 0.45, 0.55, 0, 0] };
    expect(overallRange({ grammar: loose })).toEqual({ low: "N4", high: "N3" });
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
  it("맞힌 수·푼 수·범위·근거를 모은다", () => {
    let s = startSection("grammar", priorAround("N4"));
    for (const c of [true, true, false, true, true, false]) s = answerSection(s, c);
    const result = sectionResult(s);
    expect(result.correct).toBe(4);
    expect(result.total).toBe(6);
    expect(result.low).toBeDefined();
    expect(result.high).toBeDefined();
    expect(result.evidence).toHaveLength(6);
  });

  it("범위가 넓으면 확실하지 않다고 표시한다", () => {
    let s = startSection("reading", priorAround("N3"));
    s = answerSection(s, true);
    expect(sectionResult(s).confident).toBe(false);
  });
});
