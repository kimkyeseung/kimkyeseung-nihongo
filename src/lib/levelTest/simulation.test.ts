import { describe, expect, it } from "vitest";
import { answerSection, needsKanaSection, startSection } from "./adaptive";
import { combineEvidence, evidenceOf, priorAround, priorFromEarlier, type Distribution } from "./inference";
import { kanaResult, overallLevel, sectionResult, type LevelTestSections } from "./result";
import { CURRICULUM_LEVELS } from "../../types/curriculum";
import type { JlptLevel } from "../../types/jlpt";
import type { MeasuredSection } from "../../types/levelTest";

// 가상 학습자로 진단 전체의 정확도를 잰다. 판정 확률을 만지면 개별 테스트는 멀쩡해도 전체가 조용히 나빠질 수 있다.
//
// **응답 곡선은 판정 모델(inference.ts)과 일부러 다르다** — 같으면 자기 답을 자기가 맞히는 시험이 된다. 그래도
// 사람 데이터가 아니라 "이런 학습자라면"이라는 가정이다. 실사용 정확도를 말해 주는 숫자는 아니다.
//
// 옛 계단식 판정의 같은 조건 수치(참고): 정확 59% · ±1 95% · 2단계 이상 틀림 4.8%.

const SECTIONS: MeasuredSection[] = ["vocab", "kanji", "grammar", "reading", "listening"];
type Abilities = Record<MeasuredSection, number>;

function seeded(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const levelIndex = (level: string) => CURRICULUM_LEVELS.indexOf(level as never);

/** 실력 θ(0~6, 정수 부분이 급수)인 학습자가 이 급수 문제를 맞힐 확률. 문제마다 난이도가 조금씩 다르다. */
function answersCorrectly(theta: number, level: JlptLevel, random: () => number): boolean {
  const difficulty = levelIndex(level) + (random() - 0.5) * 0.8;
  return random() < 0.08 + 0.87 / (1 + Math.exp(-1.7 * (theta - difficulty)));
}

function diagnose(abilities: Abilities, base: number, start: JlptLevel, random: () => number) {
  const sections: LevelTestSections = {};
  const evidence: Partial<Record<MeasuredSection, Distribution>> = {};
  let items = 0;
  let prior = priorAround(start);
  for (const section of SECTIONS) {
    let state = startSection(section, prior);
    while (!state.done) {
      state = answerSection(state, answersCorrectly(abilities[section], state.level, random));
      items += 1;
    }
    sections[section] = sectionResult(state);
    evidence[section] = evidenceOf(state.answers);
    prior = priorFromEarlier(combineEvidence(evidence)!);
    if (section === "vocab" && needsKanaSection(state)) {
      let correct = 0;
      for (let i = 0; i < 8; i++) if (random() < (base >= 1 ? 0.95 : 0.25 + 0.5 * base)) correct += 1;
      sections.kana = kanaResult(correct, 8);
      items += 8;
    }
  }
  return { overall: overallLevel(sections)!, items };
}

function measure(makeAbilities: (base: number, r: () => number) => Abilities, start: (base: number) => JlptLevel) {
  const random = seeded(2026);
  const runs = 1500;
  let exact = 0;
  let within1 = 0;
  let items = 0;
  for (let i = 0; i < runs; i++) {
    const base = random() * 6;
    const result = diagnose(makeAbilities(base, random), base, start(base), random);
    const off = Math.abs(levelIndex(result.overall) - Math.floor(base));
    if (off === 0) exact += 1;
    if (off <= 1) within1 += 1;
    items += result.items;
  }
  return { exact: exact / runs, within1: within1 / runs, items: items / runs };
}

const flat = (t: number): Abilities => ({ vocab: t, kanji: t, grammar: t, reading: t, listening: t });
const clamp = (t: number) => Math.max(0, Math.min(5.99, t));
const hint = (i: number) => CURRICULUM_LEVELS[Math.max(1, Math.min(5, i))] as JlptLevel;

describe("가상 학습자 — 진단 전체의 정확도", () => {
  it("고른 실력", () => {
    const r = measure(flat, () => "N4");
    expect(r.exact).toBeGreaterThan(0.72);
    expect(r.within1).toBeGreaterThan(0.98);
    expect(r.items).toBeLessThan(42); // 10~15분 안에 든다
  });

  it("영역마다 실력이 들쭉날쭉해도", () => {
    const r = measure(
      (base, random) => {
        const out = {} as Abilities;
        for (const s of SECTIONS) out[s] = clamp(base + (random() + random() + random() - 1.5) * 0.8);
        return out;
      },
      () => "N4"
    );
    expect(r.exact).toBeGreaterThan(0.68);
    expect(r.within1).toBeGreaterThan(0.98);
  });

  it("한자어 덕에 어휘만 높아도 종합이 끌려 올라가지 않는다", () => {
    const r = measure(
      (base) => ({ ...flat(base), vocab: clamp(base + 2.5), kanji: clamp(base + 0.5) }),
      () => "N4"
    );
    expect(r.exact).toBeGreaterThan(0.7);
    expect(r.within1).toBeGreaterThan(0.98);
  });

  it("시작 단계를 낮게 고른 사람도 제 수준을 찾는다", () => {
    const r = measure(flat, (base) => hint(Math.floor(base) - 2));
    expect(r.exact).toBeGreaterThan(0.72);
  });

  it("시작 단계를 높게 고른 사람도 제 수준을 찾는다", () => {
    const r = measure(flat, (base) => hint(Math.floor(base) + 2));
    expect(r.exact).toBeGreaterThan(0.72);
  });
});
