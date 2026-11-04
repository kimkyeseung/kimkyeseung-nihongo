import { describe, expect, it } from "vitest";
import {
  answerSection,
  estimateSection,
  needsKanaSection,
  pickStartLevel,
  SECTION_MAX_ITEMS,
  SECTION_MIN_ITEMS,
  startSection,
} from "./adaptive";
import { priorAround, priorFromEarlier } from "./inference";
import { sectionResult } from "./result";
import type { AdaptiveState, MeasuredSection } from "../../types/levelTest";
import type { JlptLevel } from "../../types/jlpt";

// 출제가 어긋나도 문제는 멀쩡히 나오고 결과 화면에는 그럴듯한 급수가 뜬다. 학습자는 그 급수로 커리큘럼을
// 시작해 버리므로, 이동·종료·추정을 여기서 고정한다. 전체 정확도는 simulation.test.ts가 본다.

/** "o"=맞힘, "x"=틀림/모르겠어요. 끝나면 남은 답은 무시된다. */
function run(marks: string, start: JlptLevel = "N4", section: MeasuredSection = "grammar"): AdaptiveState {
  let state = startSection(section, priorAround(start));
  for (const m of marks) state = answerSection(state, m === "o");
  return state;
}

/** 실력이 `ceiling` 급수인 학습자처럼 푼다 — 그 급수까지 맞히고 위는 틀린다. */
function playUpTo(ceiling: JlptLevel, section: MeasuredSection = "grammar", start: JlptLevel = "N4"): AdaptiveState {
  const order: JlptLevel[] = ["N5", "N4", "N3", "N2", "N1"];
  let state = startSection(section, priorAround(start));
  while (!state.done) state = answerSection(state, order.indexOf(state.level) <= order.indexOf(ceiling));
  return state;
}

describe("pickStartLevel", () => {
  it("아무 정보도 없으면 N4를 힌트로 쓴다", () => {
    expect(pickStartLevel(null, null)).toBe("N4");
  });

  it("커리큘럼 시작 단계가 기록 추정보다 먼저다", () => {
    expect(pickStartLevel("N2", "N5")).toBe("N2");
  });

  it("시작 단계가 없으면 기록으로 추정한 수준을 쓴다", () => {
    expect(pickStartLevel(null, "N3")).toBe("N3");
  });

  it("Pre-N5여도 문제는 N5부터 낸다", () => {
    expect(pickStartLevel("Pre-N5", "N3")).toBe("N5");
    expect(pickStartLevel(null, "Pre-N5")).toBe("N5");
  });
});

describe("다음 문제의 급수", () => {
  it("맞히면 더 어려운 쪽, 틀리면 더 쉬운 쪽으로 간다", () => {
    const first = startSection("grammar", priorAround("N3")).level;
    const order: JlptLevel[] = ["N5", "N4", "N3", "N2", "N1"];
    expect(order.indexOf(run("o", "N3").level)).toBeGreaterThan(order.indexOf(first));
    expect(order.indexOf(run("x", "N3").level)).toBeLessThan(order.indexOf(first));
  });

  it("시작 힌트가 틀려도 벗어난다", () => {
    // 스스로 N5로 고른 N1 학습자가 N5 언저리에 붙잡히면 안 된다.
    expect(estimateSection(playUpTo("N1", "grammar", "N5"))).toBe("N1");
    expect(estimateSection(playUpTo("N5", "grammar", "N1"))).toBe("N5");
  });

  it("답은 그 문제를 낸 급수로 기록된다", () => {
    const state = startSection("grammar", priorAround("N3"));
    expect(answerSection(state, true).answers[0].level).toBe(state.level);
  });
});

describe("언제 끝나나", () => {
  it("최소 문항 전에는 아무리 확실해도 끝나지 않는다", () => {
    const min = SECTION_MIN_ITEMS.grammar;
    expect(run("o".repeat(min - 1)).done).toBeNull();
  });

  it("상한에 닿으면 끝난다", () => {
    let state = startSection("kanji", priorAround("N4"));
    // 번갈아 풀면 믿음이 잘 안 모여 상한까지 간다.
    for (let i = 0; i < 40 && !state.done; i++) state = answerSection(state, i % 2 === 0);
    expect(state.answers.length).toBeLessThanOrEqual(SECTION_MAX_ITEMS.kanji);
    expect(state.done).not.toBeNull();
  });

  it("끝난 뒤의 답은 반영하지 않는다", () => {
    const done = playUpTo("N3");
    expect(answerSection(done, true)).toBe(done);
  });

  it("어느 영역이든 상한을 넘지 않는다", () => {
    for (const section of ["vocab", "kanji", "grammar", "reading", "listening"] as const) {
      expect(playUpTo("N3", section).answers.length).toBeLessThanOrEqual(SECTION_MAX_ITEMS[section]);
    }
  });
});

describe("추정", () => {
  it("맞히는 급수의 경계를 찾는다", () => {
    for (const level of ["N5", "N4", "N3", "N2", "N1"] as const) {
      expect(estimateSection(playUpTo(level))).toBe(level);
    }
  });

  it("다 틀리면 입문이다", () => {
    expect(estimateSection(run("x".repeat(12)))).toBe("Pre-N5");
  });

  it("독해를 다 맞히면 시작 급수 바로 위에서 멈추지 않는다 (실제로 보고받았다)", () => {
    // 예전엔 두 문제로 끝나 N5에서 시작하면 2/2여도 N4가 상한이었다.
    let state = startSection("reading", priorAround("N5"));
    while (!state.done) state = answerSection(state, true);
    expect(["N3", "N2", "N1"]).toContain(estimateSection(state));
  });

  it("앞 영역의 근거를 반쯤만 믿는다", () => {
    const firmly = [0, 0, 0, 0, 0, 1];
    const prior = priorFromEarlier(firmly);
    expect(prior[5]).toBeLessThan(0.7);
    expect(Math.min(...prior)).toBeGreaterThan(0);
  });

  it("범위는 추정 급수를 포함하고, 많이 풀수록 좁아진다", () => {
    const few = sectionResult(run("oxo"));
    const many = sectionResult(playUpTo("N3"));
    const order = ["Pre-N5", "N5", "N4", "N3", "N2", "N1"];
    const width = (r: typeof few) => order.indexOf(r.high!) - order.indexOf(r.low!);
    expect(order.indexOf(many.estimate!)).toBeGreaterThanOrEqual(order.indexOf(many.low!));
    expect(order.indexOf(many.estimate!)).toBeLessThanOrEqual(order.indexOf(many.high!));
    expect(width(many)).toBeLessThanOrEqual(width(few));
  });
});

describe("needsKanaSection", () => {
  it("어휘가 입문으로 끝나면 가나 영역을 붙인다", () => {
    expect(needsKanaSection(run("x".repeat(12), "N5", "vocab"))).toBe(true);
  });

  it("어휘가 N5로 끝나면 붙인다", () => {
    expect(needsKanaSection(playUpTo("N5", "vocab"))).toBe(true);
  });

  it("N4 이상이면 붙이지 않는다", () => {
    expect(needsKanaSection(playUpTo("N4", "vocab"))).toBe(false);
    expect(needsKanaSection(playUpTo("N1", "vocab"))).toBe(false);
  });

  it("어휘가 아직 안 끝났으면 판단하지 않는다", () => {
    expect(needsKanaSection(run("x", "N5", "vocab"))).toBe(false);
  });
});
