import { describe, expect, it } from "vitest";
import { buildDailyPlan, buildTeacherGreeting } from "./dailyPlan";
import { EMPTY_PROFILE, type LearnerProfile } from "./learnerProfile";
import type { UnitProgress } from "./curriculumProgress";
import type { CurriculumUnit } from "../types/curriculum";

// 추천이 틀리면 콘솔은 조용하고, 사용자는 이미 끝낸 걸 또 하거나 안 한 걸 못 보게 된다.

function progress(overrides: Partial<UnitProgress> = {}): UnitProgress {
  return {
    key: "N5-1",
    level: "N5",
    unitNumber: 1,
    title: "인사와 자기소개",
    canDoGoals: ["기본 인사말을 할 수 있다"],
    kanjiDone: [],
    kanjiTodo: [],
    kanaDone: [],
    kanaTodo: [],
    wordsDone: 0,
    wordsTarget: 0,
    ratio: 0,
    complete: false,
    manual: false,
    ...overrides,
  };
}

function unit(overrides: Partial<CurriculumUnit> = {}): CurriculumUnit {
  return {
    unitNumber: 1,
    title: "인사와 자기소개",
    canDoGoals: ["기본 인사말을 할 수 있다"],
    vocabThemes: ["인사말"],
    grammarPoints: [],
    ...overrides,
  };
}

function profileWithWeakKanji(kanji: string[]): LearnerProfile {
  return { ...EMPTY_PROFILE, weakKanji: kanji.map((k) => ({ kanji: k, wrong: 2, correct: 0 })) };
}

describe("buildDailyPlan", () => {
  it("이미 끝낸 항목은 추천하지 않는다", () => {
    const actions = buildDailyPlan(
      progress({ kanjiTodo: [], kanaTodo: [], wordsDone: 15, wordsTarget: 15 }),
      unit(),
      EMPTY_PROFILE
    );
    expect(actions.map((a) => a.id)).not.toContain("kanji");
    expect(actions.map((a) => a.id)).not.toContain("words");
  });

  it("남은 한자와 단어를 각각 짚어준다", () => {
    const actions = buildDailyPlan(
      progress({ kanjiTodo: ["私", "日"], wordsDone: 3, wordsTarget: 15 }),
      unit(),
      EMPTY_PROFILE
    );
    const kanji = actions.find((a) => a.id === "kanji");
    const words = actions.find((a) => a.id === "words");
    expect(kanji?.title).toContain("2자");
    expect(kanji?.detail).toContain("私 日");
    expect(words?.title).toContain("12개");
  });

  it("취약한 한자가 쌓이면 복습을 맨 앞에 놓는다", () => {
    // 새 유닛으로 계속 밀고 나가면 틀린 한자가 영영 틀린 채로 남는다.
    const actions = buildDailyPlan(
      progress({ kanjiTodo: ["私"] }),
      unit(),
      profileWithWeakKanji(["薔", "鬱"])
    );
    expect(actions[0].id).toBe("review-weak-kanji");
  });

  it("취약 한자가 하나뿐이면 진도를 막지 않는다", () => {
    const actions = buildDailyPlan(progress({ kanjiTodo: ["私"] }), unit(), profileWithWeakKanji(["薔"]));
    expect(actions[0].id).not.toBe("review-weak-kanji");
  });

  it("문법은 선생님에게 대신 물어봐 줄 질문을 함께 준다", () => {
    const grammar = {
      pattern: "〜は〜です",
      meaning: "~은/는 ~입니다",
      example: "私は学生です。",
      exampleReading: "わたしはがくせいです。",
      exampleTranslation: "저는 학생입니다.",
    };
    const actions = buildDailyPlan(progress(), unit({ grammarPoints: [grammar] }), EMPTY_PROFILE);
    const item = actions.find((a) => a.id === "grammar");
    expect(item?.to).toBe("/teacher");
    expect(item?.teacherQuestion).toContain("〜は〜です");
    expect(item?.teacherQuestion).toContain("私は学生です。");
  });

  it("유닛을 다 채웠으면 써보기를 권한다", () => {
    const actions = buildDailyPlan(progress({ ratio: 1 }), unit(), EMPTY_PROFILE);
    expect(actions.map((a) => a.id)).toContain("practice");
  });

  it("진도가 없어도 할 일을 하나는 준다", () => {
    // 커리큘럼을 다 끝냈을 때 빈 화면을 보여주면 앱이 고장 난 것처럼 보인다.
    const actions = buildDailyPlan(null, undefined, EMPTY_PROFILE);
    expect(actions.length).toBeGreaterThan(0);
  });

  it("한 번에 네 개를 넘기지 않는다", () => {
    const actions = buildDailyPlan(
      progress({ kanjiTodo: ["私"], kanaTodo: ["あ"], wordsTarget: 15, ratio: 1 }),
      unit({
        grammarPoints: [
          {
            pattern: "〜は〜です",
            meaning: "~입니다",
            example: "私は学生です。",
            exampleReading: "わたしはがくせいです。",
            exampleTranslation: "저는 학생입니다.",
          },
        ],
      }),
      profileWithWeakKanji(["薔", "鬱"])
    );
    expect(actions.length).toBeLessThanOrEqual(4);
  });
});

describe("buildTeacherGreeting", () => {
  // 인사를 모델에게 맡기면 매 답변마다 반복된다. "하루에 한 번"은 모델이 지킬 수 있는
  // 규칙이 아니라서(이전 답변을 셀 수 없다) 앱이 만든다.

  it("지금 단원을 같이 알려준다", () => {
    const text = buildTeacherGreeting({
      streak: 3,
      levelLabel: "N5",
      unitNumber: 2,
      unitTitle: "지시어와 존재 표현",
    });
    expect(text).toContain("3일 연속");
    expect(text).toContain("N5 2단원");
    expect(text).toContain("지시어와 존재 표현");
  });

  it("하루짜리 스트릭에 '1일 연속'이라고 하지 않는다", () => {
    expect(buildTeacherGreeting({ streak: 1 })).not.toContain("연속");
    expect(buildTeacherGreeting({ streak: 0 })).not.toContain("연속");
  });

  it("진도를 모르면 단원 이야기를 꺼내지 않는다", () => {
    // 시작 단계를 아직 안 골랐을 때 빈 자리가 「undefined단원」으로 새어 나가면 안 된다.
    const text = buildTeacherGreeting({ streak: 5 });
    expect(text).not.toContain("단원");
    expect(text).not.toContain("undefined");
    expect(text).not.toContain("null");
  });
});
