import { describe, expect, it } from "vitest";
import {
  TOUR_FIRST_STOP_STEP,
  TOUR_LAST_STEP,
  TOUR_STOPS,
  TOUR_WELCOME_STEP,
  isNewTeacherLearner,
  needsPlacement,
  shouldOfferTour,
  tourStopForStep,
} from "./onboarding";

describe("shouldOfferTour", () => {
  const fresh = { done: false, active: false, xp: 0, pathname: "/gojuon" };

  it("처음 온 사람이 하단 네비 탭에 있으면 권한다", () => {
    expect(shouldOfferTour(fresh)).toBe(true);
    expect(shouldOfferTour({ ...fresh, pathname: "/teacher" })).toBe(true);
  });

  it("이미 끝냈거나 진행 중이면 다시 권하지 않는다", () => {
    expect(shouldOfferTour({ ...fresh, done: true })).toBe(false);
    expect(shouldOfferTour({ ...fresh, active: true })).toBe(false);
  });

  it("XP가 있는 기존 사용자에게는 업데이트 뒤에도 뜨지 않는다", () => {
    expect(shouldOfferTour({ ...fresh, xp: 1 })).toBe(false);
  });

  it("공유 링크나 진단 도중처럼 탭이 아닌 화면에서는 끌고 가지 않는다", () => {
    for (const pathname of ["/word/123", "/level", "/about", "/privacy", "/diagnostics", "/gojuon/x"]) {
      expect(shouldOfferTour({ ...fresh, pathname })).toBe(false);
    }
  });
});

describe("tourStopForStep", () => {
  it("인사 단계는 페이지를 옮기지 않는다", () => {
    expect(tourStopForStep(TOUR_WELCOME_STEP)).toBeNull();
  });

  it("첫 칸과 마지막 칸이 어긋나지 않는다", () => {
    expect(tourStopForStep(TOUR_FIRST_STOP_STEP)?.path).toBe("/gojuon");
    expect(tourStopForStep(TOUR_LAST_STEP)?.path).toBe("/teacher");
    expect(tourStopForStep(TOUR_LAST_STEP + 1)).toBeNull();
  });

  it("같은 탭을 두 번 안내하지 않는다", () => {
    const paths = TOUR_STOPS.map((stop) => stop.path);
    expect(new Set(paths).size).toBe(paths.length);
  });
});

describe("needsPlacement", () => {
  it("진단도 시작 단계도 없을 때만 권한다", () => {
    expect(needsPlacement({ levelTestCount: 0, startLevel: null })).toBe(true);
    expect(needsPlacement({ levelTestCount: 1, startLevel: null })).toBe(false);
    expect(needsPlacement({ levelTestCount: 0, startLevel: "N5" })).toBe(false);
  });
});

describe("isNewTeacherLearner", () => {
  const today = "2026-11-04";
  // load()가 끝나면 dates에는 말을 안 했어도 오늘이 들어 있다.
  const fresh = {
    dates: [today],
    todayKey: today,
    todayMessageCount: 0,
    levelTestCount: 0,
    startLevel: null,
  };

  it("오늘 날짜만 있고 대화가 없으면 처음 온 사람이다", () => {
    expect(isNewTeacherLearner(fresh)).toBe(true);
    expect(isNewTeacherLearner({ ...fresh, dates: [] })).toBe(true);
  });

  it("오늘 물어봤거나 지난 대화가 있으면 아니다", () => {
    expect(isNewTeacherLearner({ ...fresh, todayMessageCount: 1 })).toBe(false);
    expect(isNewTeacherLearner({ ...fresh, dates: [today, "2026-11-01"] })).toBe(false);
  });

  it("진단을 봤거나 시작 단계를 골랐으면 아니다", () => {
    expect(isNewTeacherLearner({ ...fresh, levelTestCount: 1 })).toBe(false);
    expect(isNewTeacherLearner({ ...fresh, startLevel: "Pre-N5" })).toBe(false);
  });
});
