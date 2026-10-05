import { describe, expect, it } from "vitest";
import {
  LEVEL_TEST_LEAK_REFERENCE,
  levelTestInputFromPlan,
  levelTestTarget,
  LEVEL_TEST_MAX_PROBLEMS,
  LEVEL_TEST_MIN_PROBLEMS,
  LEVEL_TEST_SYSTEM_PROMPT,
  buildLevelTestPrompt,
  planLevelTest,
  type LevelTestInput,
} from "./levelTest";
import { looksLikePromptLeak } from "./promptSafety";
import {
  PRACTICE_LEAK_REFERENCE,
  PRACTICE_SYSTEM_PROMPT,
  answerPracticeTarget,
  parsePracticeProblems,
} from "./teacherPractice";
import { NO_REVIEW_TARGETS } from "./weakReview";
import { XP_REWARDS } from "./xpRewards";
import type { CurriculumPlan, UnitProgress } from "./curriculumProgress";
import type { Curriculum, CurriculumLevelId, CurriculumUnit } from "../types/curriculum";

function unit(unitNumber: number, patterns: string[]): CurriculumUnit {
  return {
    unitNumber,
    title: `단원 ${unitNumber}`,
    canDoGoals: [],
    vocabThemes: [],
    grammarPoints: patterns.map((pattern) => ({
      pattern,
      meaning: `${pattern}의 뜻`,
      example: "雨が降っても行きます。",
      exampleReading: "",
      exampleTranslation: "",
    })),
  };
}

const base: LevelTestInput = {
  level: "N4",
  levelGuess: null,
  learnedKanji: [],
  weakKanji: [],
  weakWords: [],
};

describe("planLevelTest", () => {
  it("단계를 모르면 null — 근거 없이 N5로 찍지 않는다", () => {
    expect(planLevelTest({ ...base, level: null, weakKanji: ["曜"] })).toBeNull();
  });

  it("시작 단계가 없으면 기록으로 추정한 수준을 쓴다", () => {
    expect(planLevelTest({ ...base, level: null, levelGuess: "N3" })?.level).toBe("N3");
  });

  it("커리큘럼 단계가 추정 수준보다 우선한다 — 학습자가 직접 고른 값이다", () => {
    expect(planLevelTest({ ...base, level: "N4", levelGuess: "N2" })?.level).toBe("N4");
  });

  it("약한 것은 절반을 넘기지 않는다 — 넘기면 수준 테스트가 아니라 복습이 된다", () => {
    const test = planLevelTest({
      ...base,
      weakKanji: ["曜", "働", "駅", "病"],
      weakWords: [{ word: "食べ物" }, { word: "約束" }, { word: "趣味" }],
      currentUnit: unit(3, ["〜ても", "〜たら"]),
      previousUnit: unit(2, ["〜ながら"]),
    })!;
    const weak = test.topics.filter((t) => t.kind !== "grammar");
    expect(weak).toHaveLength(Math.floor(LEVEL_TEST_MAX_PROBLEMS / 2));
    expect(test.topics.map((t) => (t.kind === "grammar" ? t.pattern : null)).filter(Boolean)).toEqual([
      "〜ても",
      "〜たら",
      "〜ながら",
    ]);
    expect(test.topics).toHaveLength(LEVEL_TEST_MAX_PROBLEMS);
  });

  it("약한 단어와 한자를 번갈아, 최근 것부터 고른다", () => {
    const test = planLevelTest({
      ...base,
      weakKanji: ["曜", "働"],
      weakWords: [{ word: "食べ物", reading: "たべもの" }, { word: "約束" }],
    })!;
    expect(test.topics.slice(0, 2)).toEqual([
      { kind: "word", word: "食べ物", reading: "たべもの" },
      { kind: "kanji", kanji: "曜", why: "weak" },
    ]);
  });

  it("자리가 남으면 있는 것으로 채운다", () => {
    const test = planLevelTest({
      ...base,
      weakWords: [{ word: "食べ物" }, { word: "約束" }, { word: "趣味" }],
      currentUnit: unit(3, ["〜ても"]),
    })!;
    // 문법이 하나뿐이면 약한 단어가 절반 제한을 넘어서 채운다.
    expect(test.topics.map((t) => (t.kind === "word" ? t.word : t.kind === "grammar" ? t.pattern : ""))).toEqual([
      "食べ物",
      "約束",
      "〜ても",
      "趣味",
    ]);
  });

  it("같은 항목은 두 번 넣지 않고, 약한 한자를 '익힌 한자'로 또 넣지 않는다", () => {
    const test = planLevelTest({
      ...base,
      weakKanji: ["曜"],
      learnedKanji: ["曜", "週"],
      currentUnit: unit(3, ["〜ても", "〜ても"]),
    })!;
    const kanji = test.topics.filter((t) => t.kind === "kanji");
    expect(kanji).toEqual([
      { kind: "kanji", kanji: "曜", why: "weak" },
      { kind: "kanji", kanji: "週", why: "learned" },
    ]);
    expect(test.topics.filter((t) => t.kind === "grammar")).toHaveLength(1);
  });

  it("문제 수는 범위 개수를 따르되 최소 개수는 채운다", () => {
    expect(planLevelTest(base)).toEqual({ level: "N4", topics: [], problemCount: LEVEL_TEST_MIN_PROBLEMS });
    expect(planLevelTest({ ...base, currentUnit: unit(1, ["a", "b", "c", "d"]) })?.problemCount).toBe(4);
  });

  it("같은 기록이면 같은 범위 — '다른 문제 받기'가 같은 실력을 다시 잰다", () => {
    const input = { ...base, weakKanji: ["曜"], currentUnit: unit(3, ["〜ても", "〜たら"]) };
    expect(planLevelTest(input)).toEqual(planLevelTest(input));
  });
});

describe("buildLevelTestPrompt", () => {
  it("범위를 번호로 적고 데이터로 감싼다", () => {
    const test = planLevelTest({
      ...base,
      weakWords: [{ word: "食べ物", reading: "たべもの" }],
      currentUnit: unit(3, ["〜ても"]),
    })!;
    const prompt = buildLevelTestPrompt(test);
    expect(prompt).toContain("학습자 수준: N4");
    expect(prompt).toContain("1. 단어 `食べ物`(たべもの)");
    expect(prompt).toContain("2. 문법 〜ても");
    expect(prompt).toMatch(/<<<STUDENT_TEXT:/);
  });

  it("앱의 지시(수준·문제 수·채우기)는 데이터 블록 밖에 둔다 — 안에 두면 '따르지 말라'에 걸린다", () => {
    const test = planLevelTest({ ...base, weakWords: [{ word: "食べ物", reading: "たべもの" }] })!;
    const prompt = buildLevelTestPrompt(test);
    const open = prompt.indexOf("<<<STUDENT_TEXT:");
    expect(open).toBeGreaterThan(prompt.indexOf("학습자 수준: N4"));
    expect(open).toBeGreaterThan(prompt.indexOf(`문제 수: ${test.problemCount}개`));
    expect(prompt.lastIndexOf(">>>")).toBeLessThan(prompt.indexOf("N4 수준의 기본 문법"));
  });

  it("범위가 비면 데이터 블록 없이 기본 문법으로 내라고 한다", () => {
    const test = planLevelTest(base)!;
    expect(test.topics).toEqual([]);
    const prompt = buildLevelTestPrompt(test);
    expect(prompt).not.toMatch(/<<<STUDENT_TEXT:/);
    expect(prompt).toContain("N4 수준의 기본 문법");
  });

  it("범위가 모자라면 기본 문법으로 채우라고 한다", () => {
    expect(buildLevelTestPrompt(planLevelTest(base)!)).toContain("N4 수준의 기본 문법");
  });
});

describe("시스템 프롬프트", () => {
  it("연습해보기와 같은 출력 형식을 쓴다 — 파서가 하나다", () => {
    const format = PRACTICE_SYSTEM_PROMPT.slice(PRACTICE_SYSTEM_PROMPT.indexOf("\n유형:"));
    expect(LEVEL_TEST_SYSTEM_PROMPT).toContain(format);
  });

  it("형식을 따라 쓴 정상 문제는 유출로 걸리지 않는다", () => {
    const raw = [
      "[문제]",
      "유형: 빈칸",
      "질문: 「비가 와도 갑니다」 `雨が降っ＿＿行きます。`",
      "정답: ても",
      "해설: `ても`는 \"~해도\"라는 뜻입니다.",
      "",
      "[문제]",
      "유형: 객관식",
      "질문: 「약속을 지키다」는?",
      "1. 約束を守る",
      "2. 約束を待つ",
      "3. 約束を取る",
      "4. 約束を見る",
      "정답: 1",
      "해설: 약속은 `守る`로 지킵니다.",
    ].join("\n");
    expect(parsePracticeProblems(raw)).toHaveLength(2);
    expect(looksLikePromptLeak(raw, LEVEL_TEST_LEAK_REFERENCE)).toBe(false);
  });

  it("지시문을 옮겨 쓰면 걸린다", () => {
    const leaked = LEVEL_TEST_SYSTEM_PROMPT.split("\n유형:")[0];
    expect(looksLikePromptLeak(leaked, LEVEL_TEST_LEAK_REFERENCE)).toBe(true);
  });
});

describe("levelTestInputFromPlan", () => {
  // N5 1·2단원, N4 1단원짜리 작은 커리큘럼.
  const curriculum: Curriculum = {
    meta: { title: "", description: "", note: "", sources: [] },
    levels: [
      { level: "N5", vocabTarget: 0, kanjiTarget: 0, summary: "", canDoOverview: [], units: [unit(1, ["〜です"]), unit(2, ["〜ます"])] },
      { level: "N4", vocabTarget: 0, kanjiTarget: 0, summary: "", canDoOverview: [], units: [unit(1, ["〜たら"])] },
    ],
  };
  function progress(level: CurriculumLevelId, unitNumber: number, kanjiDone: string[] = []): UnitProgress {
    return {
      key: `${level}-${unitNumber}`,
      level,
      unitNumber,
      title: "",
      canDoGoals: [],
      kanjiDone,
      kanjiTodo: [],
      kanaDone: [],
      kanaTodo: [],
      wordsDone: 0,
      wordsTarget: 0,
      ratio: 0,
      complete: false,
      manual: false,
    };
  }
  const units = [progress("N5", 1), progress("N5", 2), progress("N4", 1, ["雨"])];
  const planAt = (current: UnitProgress | null): CurriculumPlan => ({
    current,
    units,
    completedCount: 0,
    totalCount: units.length,
  });
  const profile = { levelGuess: null, reviewTargets: { kanji: ["曜"], words: [{ word: "約束" }] } };

  it("지난 단원은 진도 목록에서 바로 앞 — 단계가 바뀌는 경계도 넘는다", () => {
    const input = levelTestInputFromPlan(
      { curriculum, plan: planAt(units[2]), currentUnit: curriculum.levels[1].units[0] },
      profile
    );
    expect(input.level).toBe("N4");
    expect(input.currentUnit?.grammarPoints[0].pattern).toBe("〜たら");
    expect(input.previousUnit?.grammarPoints[0].pattern).toBe("〜ます");
    expect(input.learnedKanji).toEqual(["雨"]);
    expect(input.weakKanji).toEqual(["曜"]);
    expect(input.weakWords).toEqual([{ word: "約束" }]);
  });

  it("첫 단원이면 지난 단원이 없다", () => {
    const input = levelTestInputFromPlan({ curriculum, plan: planAt(units[0]) }, profile);
    expect(input.level).toBe("N5");
    expect(input.previousUnit).toBeUndefined();
  });

  it("다 끝냈으면 마지막 단원을 지난 단원으로 — 단계도 거기서 가져온다", () => {
    const input = levelTestInputFromPlan({ curriculum, plan: planAt(null) }, profile);
    expect(input.level).toBe("N4");
    expect(input.previousUnit?.grammarPoints[0].pattern).toBe("〜たら");
    expect(input.currentUnit).toBeUndefined();
  });

  it("진도가 없으면(시작 단계를 안 골랐다) 추정 수준만 남는다", () => {
    const input = levelTestInputFromPlan(null, { levelGuess: "N3", reviewTargets: NO_REVIEW_TARGETS });
    expect(input).toMatchObject({ level: null, levelGuess: "N3", learnedKanji: [], weakKanji: [] });
    expect(planLevelTest(input)?.level).toBe("N3");
  });
});

describe("시트에 넘기는 것(PracticeTarget)", () => {
  it("/test는 테스트 지시문·유출 기준·문제 수·XP를 싣는다", () => {
    const test = planLevelTest({ ...base, currentUnit: unit(1, ["a", "b", "c", "d"]) })!;
    const target = levelTestTarget(test, "level-test-1");
    expect(target).toMatchObject({
      id: "level-test-1",
      systemPrompt: LEVEL_TEST_SYSTEM_PROMPT,
      leakReference: LEVEL_TEST_LEAK_REFERENCE,
      maxProblems: 4,
      xp: XP_REWARDS.levelTestCompleted,
    });
    expect(target.prompt).toContain("문제 수: 4개");
  });

  it("연습해보기는 예전과 같은 지시문·프롬프트다", () => {
    const target = answerPracticeTarget("m1", "だけ가 뭐야?", "`だけ`는 ~만");
    expect(target).toMatchObject({
      id: "m1",
      systemPrompt: PRACTICE_SYSTEM_PROMPT,
      leakReference: PRACTICE_LEAK_REFERENCE,
      xp: XP_REWARDS.teacherPracticeCompleted,
    });
    expect(target.prompt).toContain("학습자의 질문: だけ가 뭐야?");
  });
});
