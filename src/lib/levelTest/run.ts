import type { JlptLevel } from "../../types/jlpt";
import type { KanjiEntry } from "../../types/kanji";
import type { WordEntry } from "../../types/dictionary";
import type {
  AdaptiveState,
  LevelTestBank,
  LevelTestSection,
  ShortSection,
  StaircaseSection,
} from "../../types/levelTest";
import {
  SECTION_MAX_ITEMS,
  answerShortSection,
  answerStaircase,
  estimateStaircase,
  needsKanaSection,
  shortSectionStartLevel,
  startShortSection,
  startStaircase,
} from "./adaptive";
import {
  SEION_CELLS,
  buildGrammarQuestion,
  buildKanaQuestion,
  buildKanjiQuestion,
  buildListeningQuestion,
  buildReadingQuestion,
  buildVocabQuestion,
  type LevelTestQuestion,
  type VocabPool,
} from "./questions";
import {
  NOT_MEASURED,
  kanaResult,
  shortSectionResult,
  staircaseResult,
  type LevelTestSections,
} from "./result";

// 레벨 진단 한 판의 흐름 — 영역 순서, 영역이 끝났을 때 다음으로 넘기기, 가나 영역을 끝에 붙이기,
// 독해·청해의 시작 급수. 화면(LevelTestPage)은 이 값을 메모리 스토어에 들고 있다가 답을 넘기기만 한다.
// 순서나 시작점이 어긋나도 문제는 멀쩡히 나오므로 순수 함수로 두고 `run.test.ts`가 고정한다.

export type LevelTestData = {
  dictionary: readonly WordEntry[];
  kanjiList: readonly KanjiEntry[];
  bank: LevelTestBank;
  vocabPool: VocabPool;
};

export const SECTION_LABEL: Record<LevelTestSection, string> = {
  kana: "문자",
  vocab: "어휘",
  kanji: "한자",
  grammar: "문법",
  reading: "독해",
  listening: "청해",
};

/** 기본 영역 순서. 문자(가나)는 처음엔 건너뛰고, 어휘 결과를 보고 끝에 붙인다. */
export const MAIN_SECTIONS: LevelTestSection[] = ["vocab", "kanji", "grammar", "reading", "listening"];

const STAIRCASE: ReadonlySet<LevelTestSection> = new Set<StaircaseSection>(["vocab", "kanji", "grammar"]);

export type AnsweredQuestion = {
  section: LevelTestSection;
  question: LevelTestQuestion;
  /** 고른 보기. null이면 "모르겠어요" */
  chosen: number | null;
  correct: boolean;
};

export type LevelTestRun = {
  /** section-intro: 영역 전환 화면("다음은 한자예요") · question: 푸는 중 · result: 끝 */
  phase: "section-intro" | "question" | "result";
  startedAt: number;
  finishedAt: number | null;
  /** 계단식 영역의 시작 급수 */
  startLevel: JlptLevel;
  /** 남은 영역. 맨 앞이 지금(또는 다음에 시작할) 영역이다. */
  queue: LevelTestSection[];
  states: Partial<Record<StaircaseSection | ShortSection, AdaptiveState>>;
  kanaAnswers: boolean[];
  /** 측정하지 않은 영역(청해에 쓸 음성이 없을 때) — 결과에 "측정 안 함"으로 나온다 */
  skipped: LevelTestSection[];
  /** 이미 낸 문제·정답 단어·정답 한자 — 같은 진단 안에서 다시 내지 않는다 */
  used: string[];
  question: LevelTestQuestion | null;
  history: AnsweredQuestion[];
};

/** 한 판을 시작한다. 첫 화면은 첫 영역의 전환 화면이다. */
export function startRun(options: { startLevel: JlptLevel; listeningAvailable: boolean; now: number }): LevelTestRun {
  const skipped: LevelTestSection[] = options.listeningAvailable ? [] : ["listening"];
  return {
    phase: "section-intro",
    startedAt: options.now,
    finishedAt: null,
    startLevel: options.startLevel,
    queue: MAIN_SECTIONS.filter((s) => !skipped.includes(s)),
    states: {},
    kanaAnswers: [],
    skipped,
    used: [],
    question: null,
    history: [],
  };
}

/** 지금 영역 */
export function currentSection(run: LevelTestRun): LevelTestSection | null {
  return run.queue[0] ?? null;
}

function sectionState(run: LevelTestRun, section: LevelTestSection): AdaptiveState | undefined {
  return section === "kana" ? undefined : run.states[section];
}

function makeQuestion(
  run: LevelTestRun,
  section: LevelTestSection,
  data: LevelTestData,
  random: () => number,
): LevelTestQuestion | null {
  const used = new Set(run.used);
  if (section === "kana") return buildKanaQuestion(SEION_CELLS, run.kanaAnswers.length, used, random);
  const level = run.states[section]!.level;
  switch (section) {
    case "vocab":
      return buildVocabQuestion(level, data.vocabPool, used, random);
    case "kanji":
      return buildKanjiQuestion(level, data.kanjiList, data.dictionary, used, random);
    case "grammar":
      return buildGrammarQuestion(level, data.bank, used, random);
    case "reading":
      return buildReadingQuestion(level, data.bank, used, random);
    case "listening":
      return buildListeningQuestion(level, data.bank, used, random);
  }
}

/** 지금 영역을 끝내고 다음으로 — 어휘가 끝났을 때 가나 영역이 필요하면 맨 끝에 붙인다. */
function finishSection(run: LevelTestRun, now: number): LevelTestRun {
  const [done, ...rest] = run.queue;
  const queue = [...rest];
  const vocab = run.states.vocab;
  if (done === "vocab" && vocab && needsKanaSection(vocab) && !queue.includes("kana")) queue.push("kana");
  if (queue.length === 0) return { ...run, queue, question: null, phase: "result", finishedAt: now };
  return { ...run, queue, question: null, phase: "section-intro" };
}

/**
 * 전환 화면을 지나 지금 영역을 시작한다(첫 문제를 만든다).
 * 독해·청해는 **이 시점의** 문법·어휘 추정치로 시작 급수를 정한다 — 두 영역이 끝난 뒤라야 안다.
 * 낼 문제가 하나도 없으면(데이터가 비었을 때) 그 영역을 건너뛴다.
 */
export function beginSection(run: LevelTestRun, data: LevelTestData, random: () => number, now: number): LevelTestRun {
  const section = currentSection(run);
  if (!section || run.phase !== "section-intro") return run;
  const states = { ...run.states };
  if (section !== "kana" && !states[section]) {
    if (STAIRCASE.has(section)) {
      states[section] = startStaircase(section as StaircaseSection, run.startLevel);
    } else {
      const grammar = run.states.grammar ? estimateStaircase(run.states.grammar) : null;
      const vocab = run.states.vocab ? estimateStaircase(run.states.vocab) : null;
      states[section] = startShortSection(section as ShortSection, shortSectionStartLevel(grammar, vocab));
    }
  }
  const next = { ...run, states };
  const question = makeQuestion(next, section, data, random);
  if (!question) return finishSection(next, now);
  return { ...next, question, phase: "question" };
}

/**
 * 답 하나를 반영한다. `chosen`이 null이면 "모르겠어요" — 틀린 것과 같다.
 * 진단 중에는 맞았는지 보여주지 않으므로 화면은 이 결과의 다음 문제만 그리면 된다.
 */
export function answerRun(
  run: LevelTestRun,
  chosen: number | null,
  data: LevelTestData,
  random: () => number,
  now: number,
): LevelTestRun {
  const section = currentSection(run);
  const question = run.question;
  if (run.phase !== "question" || !section || !question) return run;

  const correct = chosen !== null && chosen === question.answerIndex;
  const history = [...run.history, { section, question, chosen, correct }];
  const used = [...run.used, ...question.keys];
  let next: LevelTestRun = { ...run, history, used, question: null };

  let sectionDone: boolean;
  if (section === "kana") {
    const kanaAnswers = [...run.kanaAnswers, correct];
    next = { ...next, kanaAnswers };
    sectionDone = kanaAnswers.length >= SECTION_MAX_ITEMS.kana;
  } else {
    const state = run.states[section]!;
    const updated = STAIRCASE.has(section) ? answerStaircase(state, correct) : answerShortSection(state, correct);
    next = { ...next, states: { ...run.states, [section]: updated } };
    sectionDone = updated.done !== null;
  }
  if (sectionDone) return finishSection(next, now);

  const following = makeQuestion(next, section, data, random);
  if (following) return { ...next, question: following };
  // 낼 문제가 바닥났다(은행이 모자란 급수 등) — 지금까지로 그 영역을 마친다.
  if (section !== "kana") {
    const state = next.states[section]!;
    next = { ...next, states: { ...next.states, [section]: { ...state, done: state.done ?? "limit" } } };
  }
  return finishSection(next, now);
}

/** 영역별 결과. 풀지 않은 영역(건너뛴 청해 등)은 "측정 안 함". 가나는 풀었을 때만 들어간다. */
export function runSections(run: LevelTestRun): LevelTestSections {
  const out: LevelTestSections = {};
  for (const section of MAIN_SECTIONS) {
    const state = sectionState(run, section);
    if (!state || state.answers.length === 0) out[section] = NOT_MEASURED;
    else out[section] = STAIRCASE.has(section) ? staircaseResult(state) : shortSectionResult(state);
  }
  if (run.kanaAnswers.length > 0) {
    out.kana = kanaResult(run.kanaAnswers.filter(Boolean).length, run.kanaAnswers.length);
  }
  return out;
}

/**
 * 진행률(0~1). 영역마다 상한까지 간다고 보고 센다 — 일찍 끝난 영역은 그만큼 건너뛴다.
 * 가나 영역이 나중에 붙으면 분모가 늘어 바가 조금 뒤로 간다(그 영역이 붙는다는 걸 미리 알 수 없다).
 */
export function runProgress(run: LevelTestRun): number {
  if (run.phase === "result") return 1;
  const answered = run.history.length;
  const [current, ...later] = run.queue;
  let remaining = later.reduce((sum, s) => sum + SECTION_MAX_ITEMS[s], 0);
  if (current) {
    const inCurrent = run.history.filter((h) => h.section === current).length;
    remaining += SECTION_MAX_ITEMS[current] - inCurrent;
  }
  const total = answered + remaining;
  return total === 0 ? 0 : answered / total;
}
