import { describe, expect, it } from "vitest";
import {
  UNIT_CHECK_MAX,
  UNIT_CHECK_MIN,
  buildUnitCheck,
  gradeUnitCheck,
  hasAlternateGrammar,
  reshuffleUnitCheck,
  unitCheckTargetFromPlan,
  type UnitCheckQuestion,
} from "./unitCheck";
import { buildVocabPool } from "./levelTest/questions";
import type { LevelTestData } from "./levelTest/run";
import type { CurriculumPlan, UnitProgress } from "./curriculumProgress";
import { dictionary } from "./dictionary";
import { kanjiList } from "./kanji";
import bankData from "../data/level-test-bank.json";
import curriculumData from "../data/curriculum.json";
import type { Curriculum } from "../types/curriculum";
import type { LevelTestBank } from "../types/levelTest";

// 단원 점검. 범위가 어긋나면 엉뚱한 단원을 점검하고, 통과 기준이 새면 못 익힌 단원이 완료로 넘어간다 —
// 화면에는 그럴듯한 문제와 점수가 뜬다.

const curriculum = curriculumData as unknown as Curriculum;
const bank = bankData as unknown as LevelTestBank;
const data: LevelTestData = { dictionary, kanjiList, bank, vocabPool: buildVocabPool(dictionary) };
const preN5Units = curriculum.levels.find((l) => l.level === "Pre-N5")!.units;

function seeded(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const allUnits = curriculum.levels.flatMap((l) => l.units.map((unit) => ({ level: l.level, unit })));

describe("buildUnitCheck — 커리큘럼 전 단원", () => {
  it("모든 단원이 최소 문항 이상, 최대 문항 이하로 나온다", () => {
    const short: string[] = [];
    for (const { level, unit } of allUnits) {
      const qs = buildUnitCheck({ level, unit, preN5Units }, data, seeded(unit.unitNumber));
      if (qs.length < UNIT_CHECK_MIN || qs.length > UNIT_CHECK_MAX) short.push(`${level}-${unit.unitNumber}: ${qs.length}`);
    }
    expect(short).toEqual([]);
  });

  it("N5~N1 단원은 8문항 이상으로 채운다(문형이 하나뿐인 단원도)", () => {
    const short: string[] = [];
    for (const { level, unit } of allUnits) {
      if (level === "Pre-N5") continue;
      const qs = buildUnitCheck({ level, unit, preN5Units }, data, seeded(7));
      if (qs.length < 8) short.push(`${level}-${unit.unitNumber}: ${qs.length}`);
    }
    expect(short).toEqual([]);
  });

  it("보기 4개가 서로 다르고, 한 점검 안에 같은 문제·단어·한자가 두 번 나오지 않는다", () => {
    for (const { level, unit } of allUnits) {
      const qs = buildUnitCheck({ level, unit, preN5Units }, data, seeded(3));
      const keys = qs.flatMap((q) => q.keys);
      expect(new Set(keys).size, `${level}-${unit.unitNumber}`).toBe(keys.length);
      for (const q of qs) {
        expect(q.choices).toHaveLength(4);
        expect(new Set(q.choices).size, `${level}-${unit.unitNumber} ${q.keys[0]}`).toBe(4);
        expect(q.answerIndex).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("단원의 문형마다 문법 문제가 하나씩 — 은행에서 그 문형으로 찾은 것", () => {
    for (const { level, unit } of allUnits) {
      if (level === "Pre-N5") continue;
      const qs = buildUnitCheck({ level, unit, preN5Units }, data, seeded(5));
      const grammar = qs.filter((q): q is UnitCheckQuestion & { kind: "grammar" } => q.kind === "grammar");
      expect(grammar.map((q) => q.pattern), `${level}-${unit.unitNumber}`).toEqual(unit.grammarPoints.map((g) => g.pattern));
      for (const q of grammar) expect(q.item.pattern).toBe(q.pattern);
    }
  });

  it("한자 문제는 그 단원의 한자로만 낸다", () => {
    for (const { level, unit } of allUnits) {
      const focus = new Set(unit.kanjiFocus ?? []);
      for (const q of buildUnitCheck({ level, unit, preN5Units }, data, seeded(9))) {
        if (q.kind === "kanji") expect(focus.has(q.kanji), `${level}-${unit.unitNumber} ${q.kanji}`).toBe(true);
      }
    }
  });

  it("Pre-N5 가나 단원은 그 단원의 가나를, 나머지는 단원 낱말의 뜻을 묻는다", () => {
    const kanaUnit = preN5Units.find((u) => (u.kanaFocus ?? []).length > 0)!;
    const kana = buildUnitCheck({ level: "Pre-N5", unit: kanaUnit, preN5Units }, data, seeded(1));
    expect(kana.every((q) => q.kind === "kana" && kanaUnit.kanaFocus!.includes(q.char))).toBe(true);

    const wordUnit = preN5Units.find((u) => (u.kanaFocus ?? []).length === 0)!;
    const words = buildUnitCheck({ level: "Pre-N5", unit: wordUnit, preN5Units }, data, seeded(1));
    const texts = new Set((wordUnit.vocabItems ?? []).map((v) => v.word));
    expect(words.every((q) => q.kind === "item" && texts.has(q.text))).toBe(true);
  });

  it("새 문제 받기 — 같은 문형의 다른 항목이 있으면 앞에 낸 것을 피한다", () => {
    const n4 = curriculum.levels.find((l) => l.level === "N4")!.units[0]; // 〜たら·〜ば·〜なら — 은행에 둘씩 있다
    expect(hasAlternateGrammar(n4, bank.grammar)).toBe(true);
    const first = buildUnitCheck({ level: "N4", unit: n4, preN5Units }, data, seeded(11));
    const avoid = new Set(first.filter((q) => q.kind === "grammar").flatMap((q) => q.keys));
    const second = buildUnitCheck({ level: "N4", unit: n4, preN5Units }, data, seeded(12), avoid);
    for (const q of second.filter((q) => q.kind === "grammar")) expect(avoid.has(q.keys[0])).toBe(false);
  });

  it("다른 항목이 없는 단원에서는 새 문제 받기를 보이지 않는다", () => {
    const n5u1 = curriculum.levels.find((l) => l.level === "N5")!.units[0];
    expect(hasAlternateGrammar(n5u1, bank.grammar)).toBe(false);
  });
});

describe("reshuffleUnitCheck — 같은 문제 다시", () => {
  it("문제·보기 순서만 바꾸고 정답은 보기를 따라간다", () => {
    const n4 = curriculum.levels.find((l) => l.level === "N4")!.units[0];
    const qs = buildUnitCheck({ level: "N4", unit: n4, preN5Units }, data, seeded(21));
    const again = reshuffleUnitCheck(qs, seeded(22));
    expect(again.map((q) => q.keys[0]).sort()).toEqual(qs.map((q) => q.keys[0]).sort());
    for (const q of again) {
      const original = qs.find((o) => o.keys[0] === q.keys[0])!;
      expect(q.choices[q.answerIndex]).toBe(original.choices[original.answerIndex]);
    }
  });
});

describe("gradeUnitCheck — 통과는 80% 이상 + 문법 무오답", () => {
  const q = (kind: "grammar" | "kanji", pattern?: string): UnitCheckQuestion =>
    ({ kind, pattern, choices: ["a", "b", "c", "d"], answerIndex: 0, keys: [Math.random().toString()], level: "N5" }) as unknown as UnitCheckQuestion;

  it("10문제 중 8개(문법은 다 맞힘)면 통과", () => {
    const qs = [q("grammar", "〜は〜です"), ...Array.from({ length: 9 }, () => q("kanji"))];
    const answers = [0, 0, 0, 0, 0, 0, 0, 0, 1, null];
    expect(gradeUnitCheck(qs, answers)).toMatchObject({ correct: 8, total: 10, passed: true, wrongPatterns: [] });
  });

  it("7/10이면 통과하지 못한다", () => {
    const qs = Array.from({ length: 10 }, () => q("kanji"));
    expect(gradeUnitCheck(qs, [0, 0, 0, 0, 0, 0, 0, 1, 1, 1]).passed).toBe(false);
  });

  it("9/10이어도 문법을 하나 틀렸으면 통과하지 못하고 그 문형을 알려준다", () => {
    const qs = [q("grammar", "〜たら"), ...Array.from({ length: 9 }, () => q("kanji"))];
    const result = gradeUnitCheck(qs, [2, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(result.passed).toBe(false);
    expect(result.wrongPatterns).toEqual(["〜たら"]);
  });

  it("'모르겠어요'는 틀린 것", () => {
    expect(gradeUnitCheck([q("kanji")], [null]).correct).toBe(0);
  });

  it("문제가 없으면 통과가 아니다", () => {
    expect(gradeUnitCheck([], []).passed).toBe(false);
  });
});

describe("unitCheckTargetFromPlan", () => {
  const unit = (key: string, n: number): UnitProgress =>
    ({ key, level: "N4", unitNumber: n, title: `단원 ${n}` }) as unknown as UnitProgress;
  const plan = (current: UnitProgress | null, units: UnitProgress[]): CurriculumPlan =>
    ({ current, units, completedCount: 0, totalCount: units.length }) as CurriculumPlan;

  it("지금 단원을 점검한다", () => {
    const t = unitCheckTargetFromPlan(plan(unit("N4-3", 3), [unit("N4-3", 3), unit("N4-4", 4)]))!;
    expect(t).toMatchObject({ key: "N4-3", unitNumber: 3, isLast: false });
  });

  it("다 끝냈으면 마지막 단원을 점검하고 표시한다", () => {
    const t = unitCheckTargetFromPlan(plan(null, [unit("N4-9", 9), unit("N4-10", 10)]))!;
    expect(t).toMatchObject({ key: "N4-10", isLast: true });
  });

  it("진도가 없으면 null — 레벨 진단부터", () => {
    expect(unitCheckTargetFromPlan(null)).toBeNull();
  });
});
