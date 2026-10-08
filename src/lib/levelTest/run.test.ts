import { describe, expect, it } from "vitest";
import {
  answerRun,
  beginSection,
  currentSection,
  runProgress,
  runSections,
  startRun,
  type LevelTestData,
  type LevelTestRun,
} from "./run";
import { buildVocabPool } from "./questions";
import { overallLevel } from "./result";
import { dictionary } from "../dictionary";
import { kanjiList } from "../kanji";
import bankData from "../../data/level-test-bank.json";
import type { LevelTestBank, LevelTestSection } from "../../types/levelTest";
import type { JlptLevel } from "../../types/jlpt";

// 진단 한 판의 흐름. 영역 순서가 바뀌거나 가나 영역이 안 붙거나 독해가 엉뚱한 급수에서 시작해도
// 문제는 멀쩡히 나온다 — 화면만 봐서는 모른다.

const data: LevelTestData = {
  dictionary,
  kanjiList,
  bank: bankData as unknown as LevelTestBank,
  vocabPool: buildVocabPool(dictionary),
};

function seeded(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Strategy = (run: LevelTestRun) => "right" | "wrong" | "unknown";

/** 끝까지 푼다. 전환 화면은 바로 넘긴다. 무한 루프를 막으려고 200번에서 멈춘다. */
function play(strategy: Strategy, opts: { startLevel?: JlptLevel; listening?: boolean; seed?: number } = {}) {
  const random = seeded(opts.seed ?? 1);
  let run = startRun({ startLevel: opts.startLevel ?? "N4", listeningAvailable: opts.listening ?? false, now: 0 });
  const sectionsSeen: LevelTestSection[] = [];
  for (let step = 0; step < 200 && run.phase !== "result"; step++) {
    if (run.phase === "section-intro") {
      sectionsSeen.push(currentSection(run)!);
      run = beginSection(run, data, random, step);
      continue;
    }
    const q = run.question!;
    const move = strategy(run);
    const chosen = move === "unknown" ? null : move === "right" ? q.answerIndex : (q.answerIndex + 1) % 4;
    run = answerRun(run, chosen, data, random, step);
  }
  return { run, sectionsSeen };
}

describe("한 판의 흐름", () => {
  it("다 맞히면 어휘 → 한자 → 문법 → 독해 순서로 끝나고 가나 영역은 붙지 않는다", () => {
    const { run, sectionsSeen } = play(() => "right");
    expect(run.phase).toBe("result");
    expect(sectionsSeen).toEqual(["vocab", "kanji", "grammar", "reading"]);
    expect(overallLevel(runSections(run))).toBe("N1");
  });

  it("청해를 쓸 수 있으면 독해 다음에 청해를 푼다", () => {
    const { sectionsSeen } = play(() => "right", { listening: true });
    expect(sectionsSeen).toEqual(["vocab", "kanji", "grammar", "reading", "listening"]);
  });

  it("청해를 못 쓰면 결과에 '측정 안 함'으로 남고 종합에서 빠진다", () => {
    const { run } = play(() => "right");
    const sections = runSections(run);
    expect(sections.listening?.estimate).toBeNull();
    expect(run.skipped).toEqual(["listening"]);
  });

  it("다 틀리면 가나 영역이 맨 끝에 붙고 종합은 Pre-N5다", () => {
    const { run, sectionsSeen } = play(() => "wrong");
    expect(sectionsSeen).toEqual(["vocab", "kanji", "grammar", "reading", "kana"]);
    expect(run.kanaAnswers).toHaveLength(8);
    expect(overallLevel(runSections(run))).toBe("Pre-N5");
  });

  it("'모르겠어요'는 틀린 것으로 센다", () => {
    const { run } = play(() => "unknown");
    expect(run.history.every((h) => !h.correct && h.chosen === null)).toBe(true);
    expect(overallLevel(runSections(run))).toBe("Pre-N5");
  });

  it("한 판 안에서 같은 문제·단어·한자를 다시 내지 않는다", () => {
    for (const seed of [1, 2, 3]) {
      const { run } = play((r) => (r.history.length % 3 === 0 ? "wrong" : "right"), { seed, listening: true });
      expect(run.used.length).toBe(new Set(run.used).size);
    }
  });

  it("계단식 영역은 시작 급수에서 첫 문제를 낸다", () => {
    const { run } = play(() => "right", { startLevel: "N2" });
    const first = run.history.find((h) => h.section === "grammar")!;
    expect(first.question.level).toBe("N2");
  });
});

describe("독해의 시작 급수", () => {
  it("문법·어휘 추정치 중 낮은 쪽에서 시작한다", () => {
    // 어휘는 다 틀리고(→ Pre-N5 → N5 취급) 문법은 다 맞히면, 독해는 N5에서 시작한다.
    const { run } = play((r) => (currentSection(r) === "vocab" ? "wrong" : "right"));
    const firstReading = run.history.find((h) => h.section === "reading")!;
    expect(firstReading.question.level).toBe("N5");
  });

  it("둘 다 높으면 높은 급수에서 시작한다", () => {
    const { run } = play(() => "right");
    const firstReading = run.history.find((h) => h.section === "reading")!;
    expect(firstReading.question.level).toBe("N1");
  });
});

describe("진행률", () => {
  it("0에서 시작해 결과에서 1이 되고, 중간에는 그 사이다", () => {
    const random = seeded(4);
    let run = startRun({ startLevel: "N4", listeningAvailable: false, now: 0 });
    expect(runProgress(run)).toBe(0);
    run = beginSection(run, data, random, 0);
    run = answerRun(run, run.question!.answerIndex, data, random, 0);
    const p = runProgress(run);
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThan(1);
    expect(runProgress(play(() => "right").run)).toBe(1);
  });
});
