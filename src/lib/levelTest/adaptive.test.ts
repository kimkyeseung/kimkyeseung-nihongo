import { describe, expect, it } from "vitest";
import {
  answerShortSection,
  answerStaircase,
  estimateShortSection,
  isShortSectionConfident,
  estimateStaircase,
  isStaircaseConfident,
  needsKanaSection,
  pickStartLevel,
  SECTION_MAX_ITEMS,
  shortSectionStartLevel,
  startShortSection,
  startStaircase,
} from "./adaptive";
import type { AdaptiveState, ShortSection, StaircaseSection } from "../../types/levelTest";
import type { JlptLevel } from "../../types/jlpt";

// 계단이 한 칸 어긋나도 문제는 멀쩡히 나오고 결과 화면에는 그럴듯한 급수가 뜬다. 학습자는 그
// 급수로 커리큘럼을 시작해 버리므로, 이동·종료·추정 규칙을 전부 여기서 고정한다.

/** "o"=맞힘, "x"=틀림/모르겠어요 */
function run(marks: string, start: JlptLevel = "N4", section: StaircaseSection = "grammar"): AdaptiveState {
  let state = startStaircase(section, start);
  for (const m of marks) state = answerStaircase(state, m === "o");
  return state;
}

function runShort(marks: string, start: JlptLevel, section: ShortSection = "reading"): AdaptiveState {
  let state = startShortSection(section, start);
  for (const m of marks) state = answerShortSection(state, m === "o");
  return state;
}

const levelsAsked = (s: AdaptiveState) => s.answers.map((a) => a.level);

describe("pickStartLevel", () => {
  it("아무 정보도 없으면 N4에서 시작한다", () => {
    expect(pickStartLevel(null, null)).toBe("N4");
  });

  it("커리큘럼 시작 단계가 기록 추정보다 먼저다", () => {
    expect(pickStartLevel("N2", "N5")).toBe("N2");
  });

  it("시작 단계가 없으면 기록으로 추정한 수준을 쓴다", () => {
    expect(pickStartLevel(null, "N3")).toBe("N3");
  });

  it("Pre-N5를 골랐어도 문제는 N5부터 낸다", () => {
    expect(pickStartLevel("Pre-N5", "N3")).toBe("N5");
  });
});

describe("계단식 — 이동", () => {
  it("두 개 연속 맞히면 한 급수 위로 간다", () => {
    expect(run("o").level).toBe("N4");
    expect(run("oo").level).toBe("N3");
  });

  it("틀리면 바로 한 급수 아래로 가고 연속 정답이 끊긴다", () => {
    const s = run("ox");
    expect(s.level).toBe("N5");
    expect(s.streak).toBe(0);
    // 끊긴 뒤에는 다시 두 개를 맞혀야 올라간다
    expect(run("oxo").level).toBe("N5");
    expect(run("oxoo").level).toBe("N4");
  });

  it("N1에서 계속 맞혀도 그 위로 넘어가지 않는다", () => {
    const s = run("oooo", "N2");
    expect(levelsAsked(s)).toEqual(["N2", "N2", "N1", "N1"]);
    expect(s.level).toBe("N1");
  });

  it("N5에서 틀려도 그 아래로 넘어가지 않는다", () => {
    expect(run("x", "N5").level).toBe("N5");
  });

  it("끝에서 막혀 움직이지 않은 것은 방향 전환으로 세지 않는다", () => {
    // N2에서 올라가 N1에 닿은 뒤 계속 맞힘 → 움직이지 않으니 방향도 그대로다.
    const s = run("oooooo", "N2");
    expect(s.reversals).toBe(0);
    expect(s.lastDirection).toBe(1);
  });
});

describe("계단식 — 종료", () => {
  it("방향이 세 번 바뀌면 끝난다", () => {
    // N4: oo → N3(위), x → N4(전환 1), oo → N3(전환 2), x → N4(전환 3)
    const s = run("ooxoox");
    expect(s.reversals).toBe(3);
    expect(s.done).toBe("reversals");
  });

  it("방향이 두 번만 바뀌었으면 아직 계속한다", () => {
    expect(run("ooxoo").done).toBeNull();
  });

  it("상한에 닿으면 끝난다", () => {
    const s = run("o".repeat(SECTION_MAX_ITEMS.grammar));
    expect(s.answers).toHaveLength(12);
    expect(s.done).toBe("limit");
  });

  it("한자는 상한이 10이다", () => {
    expect(run("o".repeat(10), "N4", "kanji").done).toBe("limit");
    expect(run("o".repeat(9), "N4", "kanji").done).toBeNull();
  });

  it("N5에서 두 개 연달아 틀리면 끝난다", () => {
    const s = run("xx", "N5");
    expect(s.done).toBe("floor");
  });

  it("N4에서 틀리고 내려와 N5에서 하나 틀린 것은 N5 연속 오답 하나다", () => {
    const s = run("xx", "N4");
    expect(levelsAsked(s)).toEqual(["N4", "N5"]);
    expect(s.floorMisses).toBe(1);
    expect(s.done).toBeNull();
    expect(run("xxx", "N4").done).toBe("floor");
  });

  it("N5에서 사이에 하나 맞히면 연속 오답이 끊긴다", () => {
    expect(run("xox", "N5").done).toBeNull();
  });

  it("끝난 뒤의 답은 반영하지 않는다", () => {
    const done = run("xx", "N5");
    expect(answerStaircase(done, true)).toBe(done);
  });
});

describe("계단식 — 추정", () => {
  it("2문항 이상 풀고 2/3 이상 맞힌 가장 높은 급수다", () => {
    // N4: o o → N3: o x → N4: o o → N3: o o → N2: x
    const s = run("ooox" + "oo" + "oo" + "x");
    // N3: o x o o = 3/4 ✓, N2: x 1문항(제외), N4: o o o o ✓
    expect(estimateStaircase(s)).toBe("N3");
  });

  it("정답률이 정확히 2/3이면 통과다", () => {
    // N4에서 시작: x → N5 / o o → N4 / o x → N5 ... N4에 o,o,x가 쌓이게 만든다
    const s = run("xoooxo", "N4");
    // N4: x, o, x → 1/3 · N5: o, o, o → 3/3
    expect(levelsAsked(s)).toEqual(["N4", "N5", "N5", "N4", "N4", "N5"]);
    expect(estimateStaircase(s)).toBe("N5");

    const two3: AdaptiveState = {
      ...startStaircase("vocab", "N3"),
      answers: [
        { level: "N3", correct: true },
        { level: "N3", correct: true },
        { level: "N3", correct: false },
      ],
    };
    expect(estimateStaircase(two3)).toBe("N3");
  });

  it("정답률이 1/2이면 그 급수는 통과하지 못한다", () => {
    const half: AdaptiveState = {
      ...startStaircase("vocab", "N3"),
      answers: [
        { level: "N3", correct: true },
        { level: "N3", correct: false },
        { level: "N4", correct: true },
        { level: "N4", correct: true },
      ],
    };
    expect(estimateStaircase(half)).toBe("N4");
  });

  it("한 문항만 맞힌 높은 급수는 결과가 되지 않는다", () => {
    const lucky: AdaptiveState = {
      ...startStaircase("vocab", "N4"),
      answers: [
        { level: "N1", correct: true },
        { level: "N4", correct: true },
        { level: "N4", correct: true },
      ],
    };
    expect(estimateStaircase(lucky)).toBe("N4");
  });

  it("통과한 급수가 하나도 없으면 Pre-N5다", () => {
    expect(estimateStaircase(run("xx", "N5"))).toBe("Pre-N5");
  });

  it("모두 맞히면 N1이고 확실한 것으로 본다", () => {
    const s = run("o".repeat(12));
    expect(estimateStaircase(s)).toBe("N1");
    expect(isStaircaseConfident(s)).toBe(true);
  });

  it("상한까지 갔는데 경계를 못 찾았으면 확실하지 않다", () => {
    // N4에서 o x o x … 반복 — 위로 한 번도 못 가고 N4·N5만 오간다
    const s = run("oxoxoxoxoxox");
    expect(s.done).toBe("limit");
    expect(isStaircaseConfident(s)).toBe(false);
  });

  it("방향 전환으로 끝났으면 확실하다", () => {
    expect(isStaircaseConfident(run("ooxoox"))).toBe(true);
  });
});

describe("needsKanaSection", () => {
  it("어휘가 N5에서 바닥으로 끝나면 가나 영역을 붙인다", () => {
    expect(needsKanaSection(run("xx", "N5", "vocab"))).toBe(true);
  });

  it("어휘가 N5에서 끝나면 가나 영역을 붙인다", () => {
    // N5: oo → N4(위), x → N5(전환 1), oo → N4(전환 2), x → N5(전환 3) — N5에서 끝남
    const s = run("ooxoox", "N5", "vocab");
    expect(s.done).toBe("reversals");
    expect(s.level).toBe("N5");
    expect(needsKanaSection(s)).toBe(true);
  });

  it("N5 정답률이 1/2 미만이면 붙인다", () => {
    const s: AdaptiveState = {
      ...startStaircase("vocab", "N4"),
      level: "N4",
      done: "limit",
      answers: [
        { level: "N5", correct: true },
        { level: "N5", correct: false },
        { level: "N5", correct: false },
        { level: "N4", correct: true },
      ],
    };
    expect(needsKanaSection(s)).toBe(true);
  });

  it("N5 정답률이 정확히 1/2이면 붙이지 않는다", () => {
    const s: AdaptiveState = {
      ...startStaircase("vocab", "N4"),
      level: "N4",
      done: "limit",
      answers: [
        { level: "N5", correct: true },
        { level: "N5", correct: false },
      ],
    };
    expect(needsKanaSection(s)).toBe(false);
  });

  it("N5를 풀 일이 없었던 학습자에게는 붙이지 않는다", () => {
    expect(needsKanaSection(run("o".repeat(12), "N4", "vocab"))).toBe(false);
  });

  it("어휘가 아직 안 끝났으면 판단하지 않는다", () => {
    expect(needsKanaSection(run("x", "N5", "vocab"))).toBe(false);
  });
});

describe("독해·청해 — 시작 급수", () => {
  it("문법·어휘 추정치 중 낮은 쪽에서 시작한다", () => {
    expect(shortSectionStartLevel("N3", "N2")).toBe("N3");
    expect(shortSectionStartLevel("N2", "N4")).toBe("N4");
  });

  it("Pre-N5는 N5로 친다", () => {
    expect(shortSectionStartLevel("Pre-N5", "N3")).toBe("N5");
  });

  it("측정 못 한 쪽은 빼고 본다 — 둘 다 없으면 N5", () => {
    expect(shortSectionStartLevel(null, "N2")).toBe("N2");
    expect(shortSectionStartLevel("N3", null)).toBe("N3");
    expect(shortSectionStartLevel(null, null)).toBe("N5");
  });
});

describe("독해·청해 — 두세 문항 규칙", () => {
  it("맞히면 한 급수 위, 틀리면 한 급수 아래 문제를 낸다", () => {
    expect(levelsAsked(runShort("o", "N3"))).toEqual(["N3"]);
    expect(runShort("o", "N3").level).toBe("N2");
    expect(runShort("x", "N3").level).toBe("N4");
  });

  it("독해는 2문항, 청해는 3문항에서 끝난다", () => {
    expect(runShort("ox", "N3").done).toBe("limit");
    expect(runShort("o", "N3").done).toBeNull();
    expect(runShort("ox", "N3", "listening").done).toBeNull();
    expect(levelsAsked(runShort("oxo", "N3", "listening"))).toEqual(["N3", "N2", "N3"]);
  });

  it("끝에서는 넘어가지 않는다", () => {
    expect(runShort("o", "N1").level).toBe("N1");
    expect(runShort("x", "N5").level).toBe("N5");
  });

  it("푼 문항의 절반 이상 맞힌 가장 높은 급수다", () => {
    expect(estimateShortSection(runShort("ox", "N4"))).toBe("N4"); // N4 ✓, N3 ✗
    expect(estimateShortSection(runShort("oo", "N4"))).toBe("N3");
    expect(estimateShortSection(runShort("xo", "N4"))).toBe("N5"); // N4 ✗, N5 ✓
    expect(estimateShortSection(runShort("xx", "N4"))).toBe("Pre-N5"); // N4 → N5까지 내려가 못 풂
  });

  it("통과한 급수가 없으면 풀어 본 가장 낮은 급수의 한 칸 아래다 — 그 아래는 묻지 않았다", () => {
    // N1 지문부터 시작해 N1·N2를 놓친 학습자를 "N5 전"으로 보면 종합까지 끌어내린다(실제로 겪었다).
    const s = runShort("xx", "N1");
    expect(levelsAsked(s)).toEqual(["N1", "N2"]);
    expect(estimateShortSection(s)).toBe("N3");
    expect(isShortSectionConfident(s)).toBe(false);
  });

  it("N5까지 내려가서도 못 풀었으면 Pre-N5이고, 그건 확실하다", () => {
    const s = runShort("xx", "N5");
    expect(estimateShortSection(s)).toBe("Pre-N5");
    expect(isShortSectionConfident(s)).toBe(true);
  });

  it("하나라도 통과했으면 확실한 것으로 본다", () => {
    expect(isShortSectionConfident(runShort("ox", "N4"))).toBe(true);
  });

  it("같은 급수를 두 번 풀어 하나만 맞혀도 절반이라 통과다", () => {
    // 청해 N3: o → N2: x → N3: x  ⇒ N3 1/2 ✓
    const s = runShort("oxx", "N3", "listening");
    expect(levelsAsked(s)).toEqual(["N3", "N2", "N3"]);
    expect(estimateShortSection(s)).toBe("N3");
  });
});
