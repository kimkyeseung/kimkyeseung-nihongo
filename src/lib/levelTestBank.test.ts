import { describe, expect, it } from "vitest";
import bankData from "../data/level-test-bank.json";
import curriculumData from "../data/curriculum.json";
import type { LevelTestBank } from "../types/levelTest";
import type { Curriculum } from "../types/curriculum";
import { JLPT_LEVELS, type JlptLevel } from "../types/jlpt";

// 문제 은행은 손으로 만든 데이터라 조용히 틀린다 — 빈칸이 둘인 문장, 정답 인덱스가 어긋난 문제,
// 영어가 섞인 예문(커리큘럼에 실제로 `毎日japanese勉強`이 있었다)은 콘솔에 아무것도 안 찍히고,
// 학습자만 "정답을 골랐는데 틀렸다"를 듣는다. 단원 점검은 커리큘럼 패턴으로 은행을 찾으므로,
// 패턴 문자열이 한 글자만 달라도 그 단원은 점검 문제가 비게 된다.

const bank = bankData as unknown as LevelTestBank;
const curriculum = curriculumData as unknown as Curriculum;

/**
 * 데이터를 다 채운 급수. 은행은 급수 하나씩 만들어 검토받으며 채운다 — 개수·커리큘럼 커버리지
 * 검사는 여기 든 급수에만 건다. 급수를 채우면 여기에 더할 것.
 */
const READY_LEVELS: JlptLevel[] = ["N5", "N4", "N3", "N2", "N1"];

/** 급수별 최소 개수(구현 프롬프트 3-2). */
const MIN_COUNT = { grammar: 35, reading: 4, listening: 5 };

/** 단원 점검이 은행에 기대는 급수 — 커리큘럼 문법 패턴이 전부 은행에 있어야 한다. */
const COVERAGE_LEVELS: JlptLevel[] = ["N5", "N4"];

/**
 * 커리큘럼과 급수가 다른 패턴. 이유는 항목의 `note`에 적고 여기에 id를 더한다.
 */
const LEVEL_MISMATCH_ALLOWED = new Set<string>();

const BLANK = "＿＿";
const KANA = /[぀-ヿ]/;
const HANGUL = /[가-힣]/;
const LATIN = /[A-Za-z]/;

const allItems = [...bank.grammar, ...bank.reading, ...bank.listening];

/** 커리큘럼 패턴 → 그 패턴이 나오는 급수들 */
function curriculumPatternLevels(): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const level of curriculum.levels) {
    for (const unit of level.units) {
      for (const g of unit.grammarPoints) {
        const set = map.get(g.pattern) ?? new Set<string>();
        set.add(level.level);
        map.set(g.pattern, set);
      }
    }
  }
  return map;
}

function checkChoices(id: string, choices: string[], answer: number, problems: string[]) {
  if (choices.length !== 4) problems.push(`${id}: 보기가 ${choices.length}개`);
  if (new Set(choices.map((c) => c.trim())).size !== choices.length) problems.push(`${id}: 보기가 겹친다`);
  if (choices.some((c) => c.trim() === "")) problems.push(`${id}: 빈 보기`);
  if (!Number.isInteger(answer) || answer < 0 || answer >= choices.length) {
    problems.push(`${id}: 정답 인덱스 ${answer}가 범위 밖`);
  }
}

describe("문제 은행 — 공통", () => {
  it("id가 겹치지 않는다", () => {
    const ids = allItems.map((i) => i.id);
    expect(ids.length).toBe(new Set(ids).size);
  });

  it("급수는 N5~N1 중 하나다", () => {
    for (const item of allItems) expect(JLPT_LEVELS).toContain(item.level);
  });

  it("id의 급수 표시가 항목의 급수와 맞는다", () => {
    // "g-n4-003"을 N5로 적어 넣으면 진단이 엉뚱한 급수에서 낸다.
    const wrong = allItems.filter((i) => !i.id.includes(`-${i.level.toLowerCase()}-`)).map((i) => i.id);
    expect(wrong).toEqual([]);
  });

  it("다 채운 급수는 최소 개수를 넘는다", () => {
    for (const level of READY_LEVELS) {
      expect(bank.grammar.filter((i) => i.level === level).length, `${level} 문법`).toBeGreaterThanOrEqual(
        MIN_COUNT.grammar,
      );
      expect(bank.reading.filter((i) => i.level === level).length, `${level} 독해`).toBeGreaterThanOrEqual(
        MIN_COUNT.reading,
      );
      expect(bank.listening.filter((i) => i.level === level).length, `${level} 청해`).toBeGreaterThanOrEqual(
        MIN_COUNT.listening,
      );
    }
  });
});

describe("문제 은행 — 문법", () => {
  it("빈칸이 정확히 하나, 보기 4개가 서로 다르고 정답 인덱스가 범위 안이다", () => {
    const problems: string[] = [];
    for (const g of bank.grammar) {
      const blanks = g.sentence.split(BLANK).length - 1;
      if (blanks !== 1) problems.push(`${g.id}: 빈칸 ${blanks}개`);
      // 「＿」 하나짜리나 「＿＿＿」처럼 어긋난 빈칸도 잡는다.
      if (g.sentence.replace(BLANK, "").includes("＿")) problems.push(`${g.id}: 빈칸 모양이 어긋났다`);
      checkChoices(g.id, g.choices, g.answer, problems);
    }
    expect(problems).toEqual([]);
  });

  it("정답을 넣은 문장에 라틴 문자나 한글이 섞여 있지 않다", () => {
    const broken: string[] = [];
    for (const g of bank.grammar) {
      const filled = g.sentence.replace(BLANK, g.choices[g.answer] ?? "");
      if (LATIN.test(filled) || HANGUL.test(filled)) broken.push(g.id);
    }
    expect(broken).toEqual([]);
  });

  it("보기는 일본어다(라틴 문자·한글 없음)", () => {
    const broken = bank.grammar.filter((g) => g.choices.some((c) => LATIN.test(c) || HANGUL.test(c)));
    expect(broken.map((g) => g.id)).toEqual([]);
  });

  it("번역은 한국어다 — 한글이 있고 가나가 없다", () => {
    const broken = bank.grammar.filter((g) => !HANGUL.test(g.translation) || KANA.test(g.translation));
    expect(broken.map((g) => g.id)).toEqual([]);
  });

  it("커리큘럼에 있는 패턴이면 급수가 같다", () => {
    const levels = curriculumPatternLevels();
    const mismatched: string[] = [];
    for (const g of bank.grammar) {
      const known = levels.get(g.pattern);
      if (!known || known.has(g.level) || LEVEL_MISMATCH_ALLOWED.has(g.id)) continue;
      mismatched.push(`${g.id}(${g.level}) — 커리큘럼: ${[...known].join(",")}`);
    }
    expect(mismatched).toEqual([]);
  });

  it("단원 점검 급수의 커리큘럼 문법 패턴이 전부 은행에 있다", () => {
    // 빠지면 그 단원의 점검 문제가 비는데, 화면은 문항 수만 줄어든 채 조용히 넘어간다.
    const inBank = new Set(bank.grammar.map((g) => g.pattern));
    const missing: string[] = [];
    for (const level of curriculum.levels) {
      const id = level.level as JlptLevel;
      if (!COVERAGE_LEVELS.includes(id) || !READY_LEVELS.includes(id)) continue;
      for (const unit of level.units) {
        for (const g of unit.grammarPoints) {
          if (!inBank.has(g.pattern)) missing.push(`${level.level} ${unit.unitNumber}단원 ${g.pattern}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it("같은 문장이 두 번 들어 있지 않다", () => {
    const sentences = bank.grammar.map((g) => g.sentence);
    expect(sentences.length).toBe(new Set(sentences).size);
  });
});

describe("문제 은행 — 독해·청해", () => {
  it("보기 4개가 서로 다르고 정답 인덱스가 범위 안이다", () => {
    const problems: string[] = [];
    for (const item of [...bank.reading, ...bank.listening]) checkChoices(item.id, item.choices, item.answer, problems);
    expect(problems).toEqual([]);
  });

  it("질문과 보기는 한국어다 — 한글이 있고 가나가 없다", () => {
    // 보기는 "7시"·"100엔"처럼 숫자가 섞여도 되지만 가나는 안 된다(뜻을 몰라도 글자를 맞춰 고를 수 있다).
    const broken: string[] = [];
    for (const item of [...bank.reading, ...bank.listening]) {
      if (!HANGUL.test(item.question) || KANA.test(item.question)) broken.push(`${item.id} 질문`);
      item.choices.forEach((c, i) => {
        if (!HANGUL.test(c) || KANA.test(c)) broken.push(`${item.id} 보기 ${i + 1}`);
      });
    }
    expect(broken).toEqual([]);
  });

  it("독해 지문은 일본어다(라틴 문자·한글 없음)", () => {
    const broken = bank.reading.filter((r) => LATIN.test(r.passage) || HANGUL.test(r.passage) || !KANA.test(r.passage));
    expect(broken.map((r) => r.id)).toEqual([]);
  });

  it("청해 대사에는 한글·라틴 문자가 없다(TTS가 그대로 읽는다)", () => {
    const broken: string[] = [];
    for (const item of bank.listening) {
      if (item.script.length === 0) broken.push(`${item.id}: 대사 없음`);
      item.script.forEach((line, i) => {
        if (HANGUL.test(line.text) || LATIN.test(line.text) || !KANA.test(line.text)) broken.push(`${item.id} ${i + 1}줄`);
      });
    }
    expect(broken).toEqual([]);
  });
});
