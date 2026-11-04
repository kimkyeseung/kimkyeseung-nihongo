import type { JlptLevel } from "../../types/jlpt";
import type { KanjiEntry } from "../../types/kanji";
import type { WordEntry } from "../../types/dictionary";
import { JLPT_LEVELS } from "../../types/jlpt";
import {
  LEVEL_TEST_RUN_VERSION,
  type AdaptiveState,
  type LevelTestBank,
  type LevelTestSection,
  type MeasuredSection,
} from "../../types/levelTest";
import { SECTION_MAX_ITEMS, answerSection, needsKanaSection, startSection } from "./adaptive";
import { combineEvidence, evidenceOf, priorAround, priorFromEarlier, type Distribution } from "./inference";
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
import { NOT_MEASURED, kanaResult, sectionResult, type LevelTestSections } from "./result";

// 레벨 진단 한 판의 흐름 — 영역 순서, 영역이 끝났을 때 다음으로 넘기기, 가나 영역을 끝에 붙이기,
// 독해·청해의 시작 급수. 화면(LevelTestPage)은 이 값을 메모리 스토어에 들고 있다가 답을 넘기기만 한다.
// 순서나 시작점이 어긋나도 문제는 멀쩡히 나오므로 순수 함수로 두고 `run.test.ts`가 고정한다.

export type LevelTestData = {
  dictionary: readonly WordEntry[];
  kanjiList: readonly KanjiEntry[];
  bank: LevelTestBank;
  vocabPool: VocabPool;
};

export { SECTION_LABEL } from "./labels";

/** 기본 영역 순서. 문자(가나)는 처음엔 건너뛰고, 어휘 결과를 보고 끝에 붙인다. */
export const MAIN_SECTIONS: LevelTestSection[] = ["vocab", "kanji", "grammar", "reading", "listening"];

export type AnsweredQuestion = {
  section: LevelTestSection;
  question: LevelTestQuestion;
  /** 고른 보기. null이면 "모르겠어요" */
  chosen: number | null;
  correct: boolean;
};

export type LevelTestRun = {
  version: number;
  /** section-intro: 영역 전환 화면("다음은 한자예요") · question: 푸는 중 · result: 끝 */
  phase: "section-intro" | "question" | "result";
  startedAt: number;
  finishedAt: number | null;
  /** 첫 영역의 시작 힌트 */
  startLevel: JlptLevel;
  /** 남은 영역. 맨 앞이 지금(또는 다음에 시작할) 영역이다. */
  queue: LevelTestSection[];
  states: Partial<Record<MeasuredSection, AdaptiveState>>;
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
    version: LEVEL_TEST_RUN_VERSION,
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

function questionAt(
  section: MeasuredSection,
  level: JlptLevel,
  used: ReadonlySet<string>,
  data: LevelTestData,
  random: () => number,
): LevelTestQuestion | null {
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

/**
 * 다음 문제를 만들어 `run`에 넣는다. 고른 급수의 문제가 바닥났으면(독해·청해는 급수마다 몇 개뿐이다) 가까운
 * 급수에서 낸다 — **그 급수로 상태도 고친다.** 안 고치면 N3 문제의 답이 N4 답으로 기록돼 판정이 조용히 틀린다.
 * 낼 문제가 아예 없으면 null.
 */
function withNextQuestion(
  run: LevelTestRun,
  section: LevelTestSection,
  data: LevelTestData,
  random: () => number,
): LevelTestRun | null {
  const used = new Set(run.used);
  if (section === "kana") {
    const question = buildKanaQuestion(SEION_CELLS, run.kanaAnswers.length, used, random);
    return question ? { ...run, question } : null;
  }
  const state = run.states[section]!;
  const wanted = JLPT_LEVELS.indexOf(state.level);
  const nearestFirst = [...JLPT_LEVELS].sort(
    (a, b) => Math.abs(JLPT_LEVELS.indexOf(a) - wanted) - Math.abs(JLPT_LEVELS.indexOf(b) - wanted)
  );
  for (const level of nearestFirst) {
    const question = questionAt(section, level, used, data, random);
    if (question) return { ...run, question, states: { ...run.states, [section]: { ...state, level } } };
  }
  return null;
}

/** 다음 영역의 시작 믿음 — 앞 영역들의 답을 반쯤 믿는다. 첫 영역은 시작 힌트에서. */
function priorForNextSection(run: LevelTestRun): Distribution {
  const evidence: Partial<Record<LevelTestSection, Distribution>> = {};
  for (const [section, state] of Object.entries(run.states)) {
    if (state.answers.length > 0) evidence[section as MeasuredSection] = evidenceOf(state.answers);
  }
  const combined = combineEvidence(evidence);
  return combined ? priorFromEarlier(combined) : priorAround(run.startLevel);
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
 * 전환 화면을 지나 지금 영역을 시작한다(첫 문제를 만든다). 시작 믿음은 **이 시점까지의 답**으로 만든다.
 * 낼 문제가 하나도 없으면(데이터가 비었을 때) 그 영역을 건너뛴다.
 */
export function beginSection(run: LevelTestRun, data: LevelTestData, random: () => number, now: number): LevelTestRun {
  const section = currentSection(run);
  if (!section || run.phase !== "section-intro") return run;
  const states = { ...run.states };
  if (section !== "kana" && !states[section]) {
    states[section] = startSection(section, priorForNextSection(run));
  }
  const next = { ...run, states };
  const withQuestion = withNextQuestion(next, section, data, random);
  if (!withQuestion) return finishSection(next, now);
  return { ...withQuestion, phase: "question" };
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
    const updated = answerSection(state, correct);
    next = { ...next, states: { ...run.states, [section]: updated } };
    sectionDone = updated.done !== null;
  }
  if (sectionDone) return finishSection(next, now);

  const following = withNextQuestion(next, section, data, random);
  if (following) return following;
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
    else out[section] = sectionResult(state);
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
