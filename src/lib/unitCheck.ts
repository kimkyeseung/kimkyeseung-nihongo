import { GOJUON_SECTIONS, type KanaCell } from "../data/gojuon";
import type { CurriculumLevelId, CurriculumUnit } from "../types/curriculum";
import type { JlptLevel } from "../types/jlpt";
import type { GrammarItem } from "../types/levelTest";
import type { CurriculumPlan, UnitProgress } from "./curriculumProgress";
import { KANJI_NOT_IN_APP } from "./curriculumProgress";
import {
  buildKanjiQuestionFor,
  buildVocabQuestion,
  type LevelTestQuestion,
} from "./levelTest/questions";
import type { LevelTestData } from "./levelTest/run";

// 선생님 `/test` — **단원 점검**. 지금 커리큘럼 단원을 다 익혔는지 3~5분 안에 확인하고, 통과하면
// 단원 완료를 제안한다. **LLM을 쓰지 않는다** — 문법은 문제 은행, 한자 읽기·어휘는 사전 데이터에서 낸다
// (예전 `/test`는 범위만 코드가 정하고 문장은 모델이 써서, 정답을 틀리게 달거나 형식을 어겼다).
// 약한 것 섞기는 하지 않는다 — 그건 `/review`다.
//
// 조용히 틀리는 코드다: 단원 범위를 잘못 잡으면 엉뚱한 단원을 점검하고, 통과 기준이 새면 못 익힌 단원이
// 완료로 넘어간다. `unitCheck.test.ts`가 고정한다.

export type UnitCheckQuestion = LevelTestQuestion & {
  /** 문법 문제가 묻는 커리큘럼 문형 — 틀리면 "선생님에게 이 문형 물어보기"에 쓴다 */
  pattern?: string;
};

/** 문항 수 — 이만큼 채우려고 한자·어휘로 보충한다 */
export const UNIT_CHECK_TARGET = 8;
export const UNIT_CHECK_MAX = 10;
/** 이보다 적게 나오면 점검을 내지 않는다("이 단원은 아직 점검 문제가 준비되지 않았어요") */
export const UNIT_CHECK_MIN = 5;
// 통과 기준 — 80% 이상 + 문법 문제는 하나도 틀리지 않기(구현 프롬프트 9절 결정). gradeUnitCheck 참고.

const BASE_KANJI = 3;
const BASE_VOCAB = 2;
const MAX_VOCAB = 5;

export type UnitCheckTarget = {
  /** 커리큘럼 진도의 유닛 키(`"N4-3"`) — 통과하면 이 키로 완료 표시한다 */
  key: string;
  level: CurriculumLevelId;
  unitNumber: number;
  title: string;
  /** 커리큘럼을 다 끝내서 마지막 단원을 점검하는 것인가 — 결과에서 레벨 진단을 다시 권한다 */
  isLast: boolean;
};

/**
 * 점검할 단원 — 지금 단원(`plan.current`). 다 끝냈으면 마지막 단원. 진도가 없으면 null(진단부터).
 */
export function unitCheckTargetFromPlan(plan: CurriculumPlan | null): UnitCheckTarget | null {
  if (!plan) return null;
  const unit: UnitProgress | undefined = plan.current ?? plan.units.at(-1);
  if (!unit) return null;
  return { key: unit.key, level: unit.level, unitNumber: unit.unitNumber, title: unit.title, isLast: !plan.current };
}

function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function withChoices(answer: string, distractors: string[], random: () => number) {
  const choices = shuffle([answer, ...distractors], random);
  return { choices, answerIndex: choices.indexOf(answer) };
}

/**
 * 문형 하나의 문법 문제. 은행에서 `pattern`이 같은 항목을 고른다 — `avoid`(앞 점검에 낸 것)를 피하되
 * 다른 게 없으면 그거라도 낸다. 은행에 그 문형이 없으면 null(콘솔 경고 없이 빼고 낸다 — N5·N4는 은행
 * 검사가 빠짐없음을 강제한다).
 */
function grammarQuestion(
  pattern: string,
  items: readonly GrammarItem[],
  avoid: ReadonlySet<string>,
  random: () => number,
): UnitCheckQuestion | null {
  const all = items.filter((g) => g.pattern === pattern);
  if (all.length === 0) return null;
  const fresh = all.filter((g) => !avoid.has(g.id));
  const pool = fresh.length > 0 ? fresh : all;
  const item = pool[Math.floor(random() * pool.length)];
  const answer = item.choices[item.answer];
  return {
    kind: "grammar",
    item,
    pattern,
    level: item.level,
    keys: [item.id],
    ...withChoices(answer, item.choices.filter((_, i) => i !== item.answer), random),
  };
}

const ALL_KANA_CELLS: KanaCell[] = GOJUON_SECTIONS.flatMap((s) => s.rows.flatMap((r) => r.cells)).filter(
  (c): c is KanaCell => c !== null,
);

/** 가나 한 글자(히라가나든 가타카나든 단원이 준 그대로) → 로마자 4지선다. 오답은 로마자가 다른 칸에서. */
function kanaQuestion(char: string, random: () => number): UnitCheckQuestion | null {
  const cell = ALL_KANA_CELLS.find((c) => c.hiragana === char || c.katakana === char);
  if (!cell) return null;
  const script = cell.katakana === char ? "katakana" : "hiragana";
  const distractors = [
    ...new Set(shuffle(ALL_KANA_CELLS, random).map((c) => c.romaji).filter((r) => r !== cell.romaji)),
  ].slice(0, 3);
  return { kind: "kana", char, script, level: null, keys: [`kana:${char}`], ...withChoices(cell.romaji, distractors, random) };
}

type CurriculumItem = { text: string; reading: string; meaning: string };

function unitItems(unit: CurriculumUnit): CurriculumItem[] {
  return [
    ...(unit.vocabItems ?? []).map((v) => ({ text: v.word, reading: v.reading, meaning: v.meaning })),
    ...(unit.phrases ?? []).map((p) => ({ text: p.phrase, reading: p.reading, meaning: p.meaning })),
  ];
}

/** Pre-N5 낱말·인사말 → 뜻 4지선다. 오답은 다른 Pre-N5 단원의 뜻에서, 정답과 뜻이 같은 것은 빼고. */
function itemQuestion(item: CurriculumItem, pool: readonly CurriculumItem[], random: () => number): UnitCheckQuestion | null {
  const distractors = [
    ...new Set(shuffle(pool, random).map((p) => p.meaning).filter((m) => m !== item.meaning)),
  ].slice(0, 3);
  if (distractors.length < 3) return null;
  return {
    kind: "item",
    text: item.text,
    reading: item.reading,
    level: null,
    keys: [`item:${item.text}`],
    ...withChoices(item.meaning, distractors, random),
  };
}

export type UnitCheckSource = {
  unit: CurriculumUnit;
  level: CurriculumLevelId;
  /** Pre-N5 낱말 문제의 오답 보기를 고를 곳 — Pre-N5의 모든 단원 */
  preN5Units: readonly CurriculumUnit[];
};

/**
 * 단원 점검 문제. N5~N1: 문형마다 문법 1 → 한자 읽기 3 → 어휘 2, 모자라면 한자·어휘로 8문항까지 채운다
 * (문형이 하나뿐인 단원은 그대로면 6문항이다). Pre-N5: 가나 단원은 가나, 나머지는 낱말·인사말의 뜻.
 * `avoid`는 앞 점검에 낸 문법 문제 id — "새 문제 받기"가 같은 문형의 다른 항목을 고르게 한다.
 */
export function buildUnitCheck(
  source: UnitCheckSource,
  data: LevelTestData,
  random: () => number = Math.random,
  avoid: ReadonlySet<string> = new Set(),
): UnitCheckQuestion[] {
  const { unit, level } = source;

  if (level === "Pre-N5") {
    if ((unit.kanaFocus ?? []).length > 0) {
      return shuffle(unit.kanaFocus ?? [], random)
        .map((c) => kanaQuestion(c, random))
        .filter((q): q is UnitCheckQuestion => q !== null)
        .slice(0, UNIT_CHECK_TARGET);
    }
    const pool = source.preN5Units.flatMap(unitItems);
    return shuffle(unitItems(unit), random)
      .map((item) => itemQuestion(item, pool, random))
      .filter((q): q is UnitCheckQuestion => q !== null)
      .slice(0, UNIT_CHECK_TARGET);
  }

  const out: UnitCheckQuestion[] = [];
  const used = new Set<string>();
  const push = (q: UnitCheckQuestion | null) => {
    if (!q || out.length >= UNIT_CHECK_MAX) return false;
    out.push(q);
    q.keys.forEach((k) => used.add(k));
    return true;
  };

  for (const g of unit.grammarPoints) push(grammarQuestion(g.pattern, data.bank.grammar, avoid, random));

  const kanjiQueue = shuffle(
    (unit.kanjiFocus ?? [])
      .filter((k) => !KANJI_NOT_IN_APP.has(k))
      .map((k) => data.kanjiList.find((e) => e.kanji === k))
      .filter((e): e is NonNullable<typeof e> => e !== undefined),
    random,
  );
  const vocabLevel: JlptLevel = unit.vocabQuery?.jlptLevel ?? (level as JlptLevel);
  const nextKanji = () => {
    while (kanjiQueue.length > 0) {
      if (push(buildKanjiQuestionFor(kanjiQueue.shift()!, data.kanjiList, data.dictionary, used, random))) return true;
    }
    return false;
  };
  let vocabCount = 0;
  const nextVocab = () => {
    if (vocabCount >= MAX_VOCAB) return false;
    const ok = push(buildVocabQuestion(vocabLevel, data.vocabPool, used, random));
    if (ok) vocabCount += 1;
    return ok;
  };

  for (let i = 0; i < BASE_KANJI; i++) nextKanji();
  for (let i = 0; i < BASE_VOCAB; i++) nextVocab();
  // 8문항까지 보충 — 단원 한자를 먼저, 다 쓰면 어휘.
  while (out.length < UNIT_CHECK_TARGET) {
    if (!nextKanji() && !nextVocab()) break;
  }
  return out;
}

/**
 * "같은 문제 다시" — 문제 순서와 보기 순서만 섞는다(같은 순서면 "1번은 그거였지"로 풀게 된다 — 연습해보기에서
 * "완전히 같은 문제가 나왔다"고 보고받은 것과 같은 이유). 정답 인덱스는 보기를 따라간다.
 */
export function reshuffleUnitCheck(questions: readonly UnitCheckQuestion[], random: () => number = Math.random): UnitCheckQuestion[] {
  return shuffle(questions, random).map((q) => {
    const answer = q.choices[q.answerIndex];
    const choices = shuffle(q.choices, random);
    return { ...q, choices, answerIndex: choices.indexOf(answer) };
  });
}

/** "새 문제 받기"를 보일까 — 문형마다 은행에 다른 항목이 있어야 의미가 있다(한자·어휘는 원래 섞인다). */
export function hasAlternateGrammar(unit: CurriculumUnit, items: readonly GrammarItem[]): boolean {
  return unit.grammarPoints.some((g) => items.filter((i) => i.pattern === g.pattern).length >= 2);
}

export type UnitCheckResult = {
  correct: number;
  total: number;
  /** 틀린 문법 문제의 문형(중복 없이) */
  wrongPatterns: string[];
  passed: boolean;
};

/**
 * 채점 결과. **통과 = 80% 이상 + 문법 무오답** — 문법은 그 단원의 핵심이라 하나라도 틀리면 아직이다.
 * `answers[i]`는 i번 문제에서 고른 보기(null = 모르겠어요).
 */
export function gradeUnitCheck(questions: readonly UnitCheckQuestion[], answers: readonly (number | null)[]): UnitCheckResult {
  let correct = 0;
  const wrongPatterns: string[] = [];
  questions.forEach((q, i) => {
    const ok = answers[i] !== null && answers[i] === q.answerIndex;
    if (ok) correct += 1;
    else if (q.kind === "grammar" && q.pattern && !wrongPatterns.includes(q.pattern)) wrongPatterns.push(q.pattern);
  });
  const total = questions.length;
  // 정수로 비교한다(correct/total ≥ 4/5) — 0.8을 곱하면 경계에서 부동소수 오차로 떨어질 수 있다.
  const passed = total > 0 && correct * 5 >= total * 4 && wrongPatterns.length === 0;
  return { correct, total, wrongPatterns, passed };
}
