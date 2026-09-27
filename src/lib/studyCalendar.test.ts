import { describe, expect, it } from "vitest";
import {
  activityLevel,
  buildActivityByDay,
  buildMonthGrid,
  dateKeyOfTime,
  describeDay,
  longestStreak,
  shiftMonth,
  summarizeMonth,
} from "./studyCalendar";

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime();

describe("dateKeyOfTime", () => {
  it("로컬 날짜로 자른다 — 이른 아침도 그날이다", () => {
    expect(dateKeyOfTime(at(2026, 9, 27, 0))).toBe("2026-09-27");
    expect(dateKeyOfTime(at(2026, 9, 27, 23))).toBe("2026-09-27");
    expect(dateKeyOfTime(at(2026, 1, 5, 7))).toBe("2026-01-05");
  });
});

describe("buildActivityByDay", () => {
  it("XP와 기록을 날짜별로 합친다", () => {
    const byDay = buildActivityByDay({ "2026-09-27": 30 }, [
      { at: at(2026, 9, 27, 8), type: "kanji-quiz-correct" },
      { at: at(2026, 9, 27, 9), type: "kanji-quiz-wrong" },
      { at: at(2026, 9, 27, 21), type: "word-review-known" },
      { at: at(2026, 9, 20), type: "teacher-question" },
    ]);
    expect(byDay["2026-09-27"]).toEqual({ xp: 30, counts: { kanji: 2, word: 1 } });
    // XP 기록이 없는 옛날 날(기록만 있음)도 공부한 날이다.
    expect(byDay["2026-09-20"]).toEqual({ xp: 0, counts: { teacher: 1 } });
  });

  it("백업에서 온 망가진 값은 버린다", () => {
    expect(buildActivityByDay("oops", [])).toEqual({});
    expect(buildActivityByDay(["2026-09-27"], [])).toEqual({});
    const byDay = buildActivityByDay({ "2026-09-27": "30", hello: 5, "2026-09-26": -3, "2026-09-25": 10 }, [
      { at: at(2026, 9, 24), type: "unknown-type" },
    ]);
    expect(byDay).toEqual({ "2026-09-25": { xp: 10, counts: {} } });
  });
});

describe("activityLevel", () => {
  it("XP로 진하기를 정하고, 기록만 있는 날은 1", () => {
    expect(activityLevel(undefined)).toBe(0);
    expect(activityLevel({ xp: 0, counts: {} })).toBe(0);
    expect(activityLevel({ xp: 0, counts: { kanji: 3 } })).toBe(1);
    expect(activityLevel({ xp: 5, counts: {} })).toBe(1);
    expect(activityLevel({ xp: 20, counts: {} })).toBe(2);
    expect(activityLevel({ xp: 50, counts: {} })).toBe(3);
    expect(activityLevel({ xp: 250, counts: {} })).toBe(4);
  });
});

describe("describeDay", () => {
  it("정해진 순서로 한 일을 나열한다", () => {
    expect(describeDay({ xp: 10, counts: { teacher: 1, kanji: 2, kana: 4 } })).toEqual([
      "오십음도 4",
      "한자 2",
      "선생님 질문 1",
    ]);
    expect(describeDay(undefined)).toEqual([]);
  });
});

describe("buildMonthGrid", () => {
  it("일요일 시작 주로 나누고 빈칸은 null", () => {
    // 2026년 9월 1일은 화요일.
    const weeks = buildMonthGrid(2026, 9);
    expect(weeks[0]).toEqual([null, null, "2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05"]);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    expect(weeks.flat().filter(Boolean)).toHaveLength(30);
    expect(weeks.at(-1)).toContain("2026-09-30");
  });

  it("윤년 2월", () => {
    expect(buildMonthGrid(2028, 2).flat().filter(Boolean)).toHaveLength(29);
    expect(buildMonthGrid(2026, 2).flat().filter(Boolean)).toHaveLength(28);
  });
});

describe("shiftMonth", () => {
  it("해를 넘긴다", () => {
    expect(shiftMonth(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
    expect(shiftMonth(2026, 9, 0)).toEqual({ year: 2026, month: 9 });
  });
});

describe("summarizeMonth / longestStreak", () => {
  const byDay = buildActivityByDay(
    { "2026-01-30": 10, "2026-01-31": 20, "2026-02-01": 5, "2026-02-03": 40 },
    [{ at: at(2026, 2, 2), type: "kana-studied" }]
  );

  it("그달 것만 센다", () => {
    expect(summarizeMonth(byDay, 2026, 1)).toEqual({ studyDays: 2, xp: 30 });
    expect(summarizeMonth(byDay, 2026, 2)).toEqual({ studyDays: 3, xp: 45 });
  });

  it("달이 바뀌어도 이어진 날로 센다", () => {
    // 1/30 · 1/31 · 2/1 · 2/2(기록만) · 2/3 — 닷새 연속.
    expect(longestStreak(byDay)).toBe(5);
  });

  it("하루 빠지면 끊긴다", () => {
    expect(longestStreak(buildActivityByDay({ "2026-09-01": 5, "2026-09-03": 5, "2026-09-04": 5 }, []))).toBe(2);
    expect(longestStreak({})).toBe(0);
  });
});
