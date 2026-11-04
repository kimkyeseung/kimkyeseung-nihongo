import { describe, expect, it } from "vitest";
import {
  buildLessonSteps,
  grammarLessonQuestion,
  grammarStepKey,
  nextLessonStep,
  taughtStepFromExchange,
} from "./lessonPlan";
import type { UnitProgress } from "./curriculumProgress";
import type { CurriculumUnit, GrammarPoint } from "../types/curriculum";
import curriculum from "../data/curriculum.json";

// 순서가 어긋나도 화면은 멀쩡하다 — 배운 문형을 또 권하거나 안 배운 걸 건너뛰고, 사용자는 왜 그런지 모른다.

const point = (pattern: string): GrammarPoint => ({
  pattern,
  meaning: `${pattern}의 뜻`,
  example: "私は学生です。",
  exampleReading: "わたしはがくせいです。",
  exampleTranslation: "저는 학생입니다.",
});

function progress(overrides: Partial<UnitProgress> = {}): UnitProgress {
  return {
    key: "N5-1",
    level: "N5",
    unitNumber: 1,
    title: "인사와 자기소개",
    canDoGoals: [],
    kanjiDone: [],
    kanjiTodo: ["私", "日"],
    kanaDone: [],
    kanaTodo: [],
    wordsDone: 3,
    wordsTarget: 15,
    ratio: 0,
    complete: false,
    manual: false,
    ...overrides,
  };
}

const unit = (patterns: string[] = ["〜は〜です", "〜も"]): CurriculumUnit => ({
  unitNumber: 1,
  title: "인사와 자기소개",
  canDoGoals: [],
  vocabThemes: ["인사말"],
  grammarPoints: patterns.map(point),
});

const kinds = (keys: string[]) => keys.map((k) => k.split(":").slice(1).join(":"));

describe("buildLessonSteps", () => {
  it("문형 → 한자 → 단어 → 점검 순서다", () => {
    const steps = buildLessonSteps(progress(), unit(), []);
    expect(kinds(steps.map((s) => s.key))).toEqual(["〜は〜です", "〜も", "kanji", "words", "check"]);
  });

  it("문자를 익혀야 하는 단원은 문자가 먼저다", () => {
    const steps = buildLessonSteps(progress({ kanaTodo: ["あ"] }), unit(), []);
    expect(steps[0].key).toBe("N5-1:kana");
  });

  it("배운 문형만 끝난 것으로 친다", () => {
    const steps = buildLessonSteps(progress(), unit(), [grammarStepKey("N5-1", "〜は〜です")]);
    expect(steps[0].done).toBe(true);
    expect(steps[1].done).toBe(false);
  });

  it("다른 단원에서 배운 같은 문형은 치지 않는다", () => {
    const steps = buildLessonSteps(progress(), unit(), [grammarStepKey("N5-2", "〜は〜です")]);
    expect(steps[0].done).toBe(false);
  });

  it("없는 항목은 단계로 만들지 않는다", () => {
    const steps = buildLessonSteps(progress({ kanjiTodo: [], wordsTarget: 0 }), unit([]), []);
    expect(kinds(steps.map((s) => s.key))).toEqual(["check"]);
  });

  it("다 익힌 한자·단어는 끝난 것으로 친다", () => {
    const steps = buildLessonSteps(progress({ kanjiTodo: [], kanjiDone: ["私"], wordsDone: 15 }), unit([]), []);
    expect(steps.filter((s) => s.done).map((s) => s.key)).toEqual(["N5-1:kanji", "N5-1:words"]);
  });

  it("단어 수는 목표를 넘겨 적지 않는다", () => {
    const steps = buildLessonSteps(progress({ wordsDone: 40 }), unit([]), []);
    expect(steps.find((s) => s.key.endsWith("words"))?.title).toContain("15/15");
  });

  it("한자 단계는 남은 첫 글자를 연다", () => {
    const step = buildLessonSteps(progress(), unit([]), []).find((s) => s.key.endsWith("kanji"))!;
    expect(step.action).toEqual({ kind: "go", to: `/kanji?k=${encodeURIComponent("私")}` });
  });
});

describe("nextLessonStep", () => {
  it("안 끝낸 첫 단계다", () => {
    const steps = buildLessonSteps(progress(), unit(), [grammarStepKey("N5-1", "〜は〜です")]);
    expect(nextLessonStep(steps)?.key).toBe(grammarStepKey("N5-1", "〜も"));
  });

  it("다 끝내면 단원 점검이 남는다", () => {
    const done = progress({ kanjiTodo: [], wordsDone: 15 });
    const steps = buildLessonSteps(done, unit(["〜も"]), [grammarStepKey("N5-1", "〜も")]);
    expect(nextLessonStep(steps)?.action).toEqual({ kind: "check" });
  });
});

describe("taughtStepFromExchange", () => {
  const steps = buildLessonSteps(progress(), unit(), []);
  const question = grammarLessonQuestion(point("〜も"));

  it("문형 수업의 답변이 끝나면 그 단계를 찾는다", () => {
    expect(taughtStepFromExchange(steps, question, "〜も는 ~도라는 뜻이에요.", [])?.key).toBe(grammarStepKey("N5-1", "〜も"));
  });

  it("답변이 실패하면 배운 것으로 치지 않는다 (실제로 그랬다)", () => {
    const failed = "(답변을 만드는 중 오류가 발생했습니다)";
    expect(taughtStepFromExchange(steps, question, failed, [failed])).toBeNull();
    expect(taughtStepFromExchange(steps, question, "  ", [])).toBeNull();
    expect(taughtStepFromExchange(steps, question, undefined, [])).toBeNull();
  });

  it("평범한 질문은 수업이 아니다", () => {
    expect(taughtStepFromExchange(steps, "だけ가 뭐야?", "~만이라는 뜻이에요.", [])).toBeNull();
  });
});

describe("grammarLessonQuestion", () => {
  it("문형과 예문을 담는다", () => {
    const question = grammarLessonQuestion(point("〜は〜です"));
    expect(question).toContain("〜は〜です");
    expect(question).toContain("私は学生です。");
  });

  it("실제 커리큘럼의 모든 단원에서 비지 않고 키가 겹치지 않는다", () => {
    for (const level of curriculum.levels) {
      for (const u of level.units as unknown as CurriculumUnit[]) {
        const unitKey = `${level.level}-${u.unitNumber}`;
        const steps = buildLessonSteps(progress({ key: unitKey }), u, []);
        expect(steps.length).toBeGreaterThan(0);
        expect(new Set(steps.map((s) => s.key)).size).toBe(steps.length);
      }
    }
  });
});
