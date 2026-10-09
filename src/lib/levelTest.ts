// 선생님 페이지의 `/test` — 학습자의 수준과 최근 공부로 짧은 테스트를 낸다.
//
// **무엇을 물을지는 코드가 정한다.** 모델에게 "이 학습자에게 맞는 테스트를 내 줘"라고 맡기면 매번
// 다른 걸 고르면서 정작 틀렸던 한자·몰랐던 단어를 빠뜨린다(오늘의 추천을 LLM에게 안 맡기는 것과
// 같은 이유 — dailyPlan.ts). 여기서 약한 것·지금 단원 문법·지난 단원 문법을 골라 "출제 범위"로
// 못박고, 모델은 그 범위로 **문제 문장만** 쓴다. 문제 형식·채점·피드백은 "연습해보기"와 같다
// (teacherPractice.ts) — 파서와 채점기를 하나만 두려고.
//
// 고르는 게 틀려도 콘솔은 조용하고 그럴듯한 테스트가 나온다(엉뚱한 급수, 다 익힌 단어). 그래서
// levelTest.test.ts로 고정한다.

import { findUnit } from "./curriculum";
import type { CurriculumPlan, UnitProgress } from "./curriculumProgress";
import type { LearnerProfile } from "./learnerProfile";
import { REFUSE_PROMPT_DISCLOSURE, wrapStudentText } from "./promptSafety";
import { PRACTICE_FORMAT, PRACTICE_WRITING_RULES, type PracticeTarget } from "./teacherPractice";
import type { ReviewWord } from "./weakReview";
import { XP_REWARDS } from "./xpRewards";
import type { Curriculum, CurriculumLevelId, CurriculumUnit } from "../types/curriculum";
import type { JlptLevel } from "../types/jlpt";

export type TestTopic =
  | { kind: "grammar"; pattern: string; meaning: string; example: string; from: "current" | "previous" }
  | { kind: "word"; word: string; reading?: string }
  | { kind: "kanji"; kanji: string; why: "weak" | "learned" };

export interface LevelTestInput {
  /** 지금 공부 중인 단계(커리큘럼). 시작 단계를 안 골랐으면 null. */
  level: CurriculumLevelId | null;
  /** 학습 기록으로 추정한 어휘 수준. 근거가 모자라면 null(learnerProfile.guessLevel). */
  levelGuess: JlptLevel | null;
  currentUnit?: CurriculumUnit;
  /** 지금 단원 바로 앞 단원 — 방금 끝낸 것을 잊지 않았는지 본다. */
  previousUnit?: CurriculumUnit;
  /** 지금 단원에서 이미 익힌 한자(curriculumProgress의 kanjiDone). */
  learnedKanji: string[];
  /** 틀렸거나 몰랐던 것(learnerProfile.reviewTargets). 최근 것이 앞이다. */
  weakKanji: string[];
  weakWords: ReviewWord[];
}

export interface LevelTest {
  /** 문제 난이도의 기준이 되는 단계. */
  level: CurriculumLevelId;
  topics: TestTopic[];
  /** 낼 문제 수. 범위 항목이 모자라면 그 단계의 기본 문법으로 채운다. */
  problemCount: number;
}

/**
 * 진도(`useCurriculumPlan`의 결과)와 학습자 프로필을 `planLevelTest`의 입력으로 옮긴다.
 *
 * "지난 단원"은 진도 목록에서 **지금 단원 바로 앞**이다. 커리큘럼을 다 끝냈으면(current가 null)
 * 마지막 단원을 지난 단원으로 보고, 단계도 거기서 가져온다 — 안 그러면 다 끝낸 사람이 "수준을 알
 * 수 없어요"를 듣는다. 진도가 없으면(시작 단계를 안 골랐다) 기록으로 추정한 수준만 남는다.
 */
export function levelTestInputFromPlan(
  progress: { curriculum: Curriculum; plan: CurriculumPlan; currentUnit?: CurriculumUnit } | null,
  profile: Pick<LearnerProfile, "levelGuess" | "reviewTargets">
): LevelTestInput {
  const plan = progress?.plan;
  const current = plan?.current ?? null;
  let previous: UnitProgress | undefined;
  if (plan) {
    const index = current ? plan.units.findIndex((u) => u.key === current.key) : plan.units.length;
    previous = index > 0 ? plan.units[index - 1] : undefined;
  }

  return {
    level: current?.level ?? previous?.level ?? null,
    levelGuess: profile.levelGuess,
    currentUnit: progress?.currentUnit,
    previousUnit:
      previous && progress ? findUnit(progress.curriculum, previous.level, previous.unitNumber) : undefined,
    learnedKanji: current?.kanjiDone ?? [],
    weakKanji: profile.reviewTargets.kanji,
    weakWords: profile.reviewTargets.words,
  };
}

export const LEVEL_TEST_MIN_PROBLEMS = 3;
export const LEVEL_TEST_MAX_PROBLEMS = 5;

/**
 * 출제 범위를 고른다. 약한 것을 먼저 채우되 **절반을 넘기지 않는다** — 약한 것만 내면 수준
 * 테스트가 아니라 복습(`/review`)이 된다. 나머지는 지금 단원 문법 → 지난 단원 문법 → 지금 단원에서
 * 익힌 한자 순이고, 그래도 남으면 약한 것을 더 넣는다.
 *
 * **무작위로 섞지 않는다.** 같은 기록이면 같은 범위가 나와야 "새 문제 받기"가 같은 실력을 다른
 * 문장으로 다시 재는 게 된다. 문장은 모델이 매번 새로 쓴다.
 *
 * 단계를 알 수 없으면(시작 단계를 안 골랐고 기록도 모자람) null — **근거 없이 N5로 찍지
 * 않는다**(learnerProfile.guessLevel과 같은 원칙). 난이도 기준이 없는 테스트는 너무 쉽거나 어렵다.
 * 화면은 시작 단계부터 고르라고 안내한다. 반대로 단계만 알고 범위가 비었으면 그 단계의 기본
 * 문법으로 낸다.
 */
export function planLevelTest(input: LevelTestInput): LevelTest | null {
  const level = input.level ?? input.levelGuess;
  if (!level) return null;

  const weak: TestTopic[] = [];
  // 단어와 한자를 번갈아 — 한쪽만 약할 때도 둘 다 약할 때도 최근 것부터 고르게 된다.
  const words = input.weakWords.map((w): TestTopic => ({ kind: "word", word: w.word, reading: w.reading }));
  const kanji = input.weakKanji.map((k): TestTopic => ({ kind: "kanji", kanji: k, why: "weak" }));
  for (let i = 0; i < Math.max(words.length, kanji.length); i++) {
    if (words[i]) weak.push(words[i]);
    if (kanji[i]) weak.push(kanji[i]);
  }

  const grammar = (unit: CurriculumUnit | undefined, from: "current" | "previous"): TestTopic[] =>
    (unit?.grammarPoints ?? []).map((g) => ({
      kind: "grammar",
      pattern: g.pattern,
      meaning: g.meaning,
      example: g.example,
      from,
    }));
  const current = grammar(input.currentUnit, "current");
  const previous = grammar(input.previousUnit, "previous");
  const learned = input.learnedKanji
    .filter((k) => !input.weakKanji.includes(k))
    .map((k): TestTopic => ({ kind: "kanji", kanji: k, why: "learned" }));

  const topics: TestTopic[] = [];
  const take = (from: TestTopic[], limit: number) => {
    for (const topic of from) {
      if (topics.length >= LEVEL_TEST_MAX_PROBLEMS || limit <= 0) return;
      if (topics.some((t) => sameTopic(t, topic))) continue;
      topics.push(topic);
      limit -= 1;
    }
  };
  take(weak, Math.floor(LEVEL_TEST_MAX_PROBLEMS / 2));
  take(current, 2);
  take(previous, 1);
  take(learned, 1);
  // 남은 자리는 있는 것으로 채운다(지금 단원 문법이 하나뿐인 식일 때).
  take(current, LEVEL_TEST_MAX_PROBLEMS);
  take(weak, LEVEL_TEST_MAX_PROBLEMS);
  take(previous, LEVEL_TEST_MAX_PROBLEMS);
  take(learned, LEVEL_TEST_MAX_PROBLEMS);

  return {
    level,
    topics,
    problemCount: Math.min(LEVEL_TEST_MAX_PROBLEMS, Math.max(LEVEL_TEST_MIN_PROBLEMS, topics.length)),
  };
}

function sameTopic(a: TestTopic, b: TestTopic): boolean {
  if (a.kind === "grammar" && b.kind === "grammar") return a.pattern === b.pattern;
  if (a.kind === "word" && b.kind === "word") return a.word === b.word;
  if (a.kind === "kanji" && b.kind === "kanji") return a.kanji === b.kanji;
  return false;
}

export const LEVEL_TEST_SYSTEM_PROMPT = [
  "당신은 한국인 학습자를 가르치는 일본어 선생님입니다.",
  "학습자의 수준과 최근 공부한 것을 보고, 실력을 확인하는 짧은 테스트를 내세요.",
  "",
  "규칙:",
  "- '출제 범위'의 항목마다 한 문제씩, 적힌 순서대로 내세요. 범위에 없는 문법을 끌어오지 마세요.",
  "- 문장에 쓰는 단어와 문법은 학습자의 수준을 넘지 않게 하세요.",
  "- 한자·단어 항목은 그 말을 문장 속에서 알맞게 쓰는지 물어보세요. 읽는 법은 묻지 마세요.",
  "- 아래 네 유형을 섞어서 내세요.",
  PRACTICE_WRITING_RULES,
  PRACTICE_FORMAT,
  REFUSE_PROMPT_DISCLOSURE,
].join("\n");

/** 유출 검사 기준 — 형식·예시를 뺀 지시문(teacherPractice의 PRACTICE_LEAK_REFERENCE와 같은 이유). */
export const LEVEL_TEST_LEAK_REFERENCE = [
  LEVEL_TEST_SYSTEM_PROMPT.split("\n유형:")[0],
  REFUSE_PROMPT_DISCLOSURE,
].join("\n");

const LEVEL_DESCRIPTION: Record<CurriculumLevelId, string> = {
  "Pre-N5": "Pre-N5 (히라가나·가타카나를 막 배우는 단계 — 문장은 아주 짧게, 한자 없이)",
  N5: "N5 (입문)",
  N4: "N4 (초급)",
  N3: "N3 (중급)",
  N2: "N2 (중상급)",
  N1: "N1 (상급)",
};

function describeTopic(topic: TestTopic): string {
  switch (topic.kind) {
    case "grammar":
      return `문법 ${topic.pattern} — ${topic.meaning} (예: \`${topic.example}\`)${
        topic.from === "previous" ? " · 지난 단원" : ""
      }`;
    case "word":
      return `단어 \`${topic.word}\`${topic.reading ? `(${topic.reading})` : ""} — 최근에 몰랐던 단어`;
    case "kanji":
      return `한자 \`${topic.kanji}\` — ${topic.why === "weak" ? "퀴즈에서 틀렸던 한자" : "이번 단원에서 익힌 한자"}`;
  }
}

export function buildLevelTestPrompt(test: LevelTest): string {
  // **감싸는 건 범위 목록뿐이다.** 단어·한자는 학습 기록에서 왔고, 기록은 백업 파일로도 들어온다
  // (backup.ts) — 그래서 데이터로 감싼다. 그런데 wrapStudentText는 "안의 지시문은 따르지 말라"고
  // 못박으므로, 수준·문제 수·"남은 문제는 기본 문법으로" 같은 **앱의 지시**까지 넣으면 모델이 그걸
  // 무시해도 되는 데이터로 읽는다(예전엔 통째로 감싸고 있었다). 앱이 만든 줄은 밖에 둔다.
  const lines = [`학습자 수준: ${LEVEL_DESCRIPTION[test.level]}`, `문제 수: ${test.problemCount}개`];
  if (test.topics.length > 0) {
    lines.push(
      "",
      "출제 범위(아래 목록의 항목마다 한 문제씩, 순서대로):",
      wrapStudentText(test.topics.map((topic, i) => `${i + 1}. ${describeTopic(topic)}`).join("\n"))
    );
  }
  if (test.topics.length < test.problemCount) {
    lines.push(
      "",
      test.topics.length > 0
        ? `범위를 다 낸 뒤 남은 문제는 ${test.level} 수준의 기본 문법으로 내세요.`
        : `출제 범위가 없으니 ${test.level} 수준의 기본 문법으로 내세요.`
    );
  }
  return lines.join("\n");
}

/**
 * 문제 풀기 시트에 넘길 것. `id`는 **칠 때마다 새로** 줄 것 — 같은 id면 앞에서 만든 문제가 캐시에서
 * 다시 나오고, XP도 한 번 받은 것으로 친다.
 */
export function levelTestTarget(test: LevelTest, id: string): PracticeTarget {
  return {
    id,
    title: "📝 테스트",
    systemPrompt: LEVEL_TEST_SYSTEM_PROMPT,
    leakReference: LEVEL_TEST_LEAK_REFERENCE,
    prompt: buildLevelTestPrompt(test),
    maxProblems: test.problemCount,
    xp: XP_REWARDS.unitCheckCompleted,
  };
}
