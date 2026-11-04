import { describe, expect, it } from "vitest";
import { WEAK_REVIEW_PATH, buildDailyPlan, buildTeacherGreeting, planHomeStart } from "./dailyPlan";
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
  return { ...EMPTY_PROFILE, reviewTargets: { kanji, words: [] } };
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
    expect(actions[0].id).toBe("review-weak");
  });

  it("한자와 단어를 합쳐서 센다 — 한 개씩이어도 복습을 권한다", () => {
    const profile: LearnerProfile = {
      ...EMPTY_PROFILE,
      reviewTargets: { kanji: ["薔"], words: [{ word: "約束" }] },
    };
    const actions = buildDailyPlan(progress({ kanjiTodo: ["私"] }), unit(), profile);
    expect(actions[0].id).toBe("review-weak");
    expect(actions[0].to).toBe(WEAK_REVIEW_PATH);
    expect(actions[0].detail).toContain("約束");
  });

  it("취약 한자가 하나뿐이면 진도를 막지 않는다", () => {
    const actions = buildDailyPlan(progress({ kanjiTodo: ["私"] }), unit(), profileWithWeakKanji(["薔"]));
    expect(actions[0].id).not.toBe("review-weak");
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

describe("planHomeStart", () => {
  const kanjiAction = { id: "kanji", emoji: "漢", title: "한자 4자 익히기", detail: "", to: "/kanji?k=%E5%91%BD" };

  it("단계를 고르기 전의 처음 온 사람에게는 버튼을 주지 않는다", () => {
    // 버튼이 있으면 N3 학습자도 고르기 전에 눌러 히라가나 표에 도착한다.
    expect(planHomeStart({ hasStartLevel: false, returning: false, actions: null })).toBeNull();
  });

  it("예전부터 쓰던 사람은 단계를 안 골랐어도 막지 않는다", () => {
    expect(planHomeStart({ hasStartLevel: false, returning: true, actions: null })).toEqual({
      to: "/gojuon",
      label: "이어서 학습하기",
    });
  });

  it("단계를 골랐으면 오늘의 첫 할 일로 간다", () => {
    const start = planHomeStart({ hasStartLevel: true, returning: false, actions: [kanjiAction] });
    expect(start).toMatchObject({ to: kanjiAction.to, label: "학습 시작하기", hint: "한자 4자 익히기" });
  });

  it("문법이 첫 할 일이면 대신 물어볼 질문도 같이 넘긴다", () => {
    const grammar = { ...kanjiAction, id: "grammar", to: "/teacher", teacherQuestion: "〜たら 알려줘" };
    expect(planHomeStart({ hasStartLevel: true, returning: true, actions: [grammar] })?.teacherQuestion).toBe(
      "〜たら 알려줘"
    );
  });

  it("수업이 있으면 수업의 다음 단계로 간다 — 로드맵·진단 결과와 같은 곳이다", () => {
    const lesson = { to: "/teacher", title: "〜は〜です 배우기" };
    const start = planHomeStart({ hasStartLevel: true, returning: false, actions: [kanjiAction], lesson });
    expect(start).toMatchObject({ to: "/teacher", hint: "〜は〜です 배우기" });
  });

  it("약한 것이 쌓였으면 수업보다 복습이 먼저다", () => {
    const review = { ...kanjiAction, id: "review-weak", title: "약한 것 3개 모아 풀기", to: WEAK_REVIEW_PATH };
    const lesson = { to: "/teacher", title: "〜は〜です 배우기" };
    expect(planHomeStart({ hasStartLevel: true, returning: true, actions: [review], lesson })?.to).toBe(WEAK_REVIEW_PATH);
  });

  it("커리큘럼을 다 끝내 수업이 없으면 오늘의 첫 할 일로 간다", () => {
    const practice = { ...kanjiAction, id: "free-practice", to: "/conversation" };
    expect(planHomeStart({ hasStartLevel: true, returning: true, actions: [practice], lesson: null })?.to).toBe("/conversation");
  });

  it("추천을 아직 못 읽었으면 오십음도가 아니라 로드맵으로 보낸다", () => {
    expect(planHomeStart({ hasStartLevel: true, returning: false, actions: null })?.to).toBe("/curriculum");
    expect(planHomeStart({ hasStartLevel: true, returning: false, actions: [] })?.to).toBe("/curriculum");
  });
});

describe("buildDailyPlan의 한자 목적지", () => {
  it("남은 첫 글자를 주소에 실어 그 급수로 바로 연다", () => {
    const actions = buildDailyPlan(progress({ kanjiTodo: ["命", "令"] }), unit(), EMPTY_PROFILE);
    const kanji = actions.find((a) => a.id === "kanji");
    expect(new URLSearchParams(kanji?.to.split("?")[1]).get("k")).toBe("命");
    expect(kanji?.to.startsWith("/kanji?")).toBe(true);
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
