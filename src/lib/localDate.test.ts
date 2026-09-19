import { describe, expect, it } from "vitest";
import { formatDayLabel, localDateKey } from "./localDate";

// 날짜는 조용히 틀리는 자리다 — 하루 어긋나도 화면에는 그럴듯한 이름이 뜨고, 스트릭이
// 안 오르거나 인사가 두 번 나오는 식으로 뒤늦게 드러난다.

describe("localDateKey", () => {
  it("YYYY-MM-DD 형식으로 0을 채운다", () => {
    expect(localDateKey()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("로컬 타임존을 쓴다 (UTC가 아니다)", () => {
    // toISOString()을 쓰던 구현이라면 한국 시간 오전 9시 이전에 어제 날짜가 나온다.
    const now = new Date();
    const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
      now.getDate()
    ).padStart(2, "0")}`;
    expect(localDateKey()).toBe(expected);
  });

  it("어제는 하루 전이다", () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    expect(localDateKey(-1)).toBe(
      `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(
        yesterday.getDate()
      ).padStart(2, "0")}`
    );
  });
});

describe("formatDayLabel", () => {
  it("오늘과 어제는 이름으로 부른다", () => {
    expect(formatDayLabel("2026-09-19", "2026-09-19")).toBe("오늘");
    expect(formatDayLabel("2026-09-18", "2026-09-19")).toBe("어제");
  });

  it("달이 바뀌는 경계에서도 어제를 맞힌다", () => {
    // 문자열로 비교하면(예: 날짜 부분에서 1을 빼면) 1일에 0일이 되어 영영 못 맞힌다.
    expect(formatDayLabel("2026-08-31", "2026-09-01")).toBe("어제");
  });

  it("해가 바뀌는 경계에서도 어제를 맞힌다", () => {
    expect(formatDayLabel("2025-12-31", "2026-01-01")).toBe("어제");
  });

  it("그 밖의 올해 날짜는 월·일과 요일로 적는다", () => {
    // 2026-09-16은 수요일.
    expect(formatDayLabel("2026-09-16", "2026-09-19")).toBe("9월 16일 (수)");
  });

  it("해가 다르면 연도까지 적는다", () => {
    // 같은 "9월 16일"이 여러 개 보이면 어느 해인지 알 수 없다.
    expect(formatDayLabel("2025-09-16", "2026-09-19")).toBe("2025년 9월 16일");
  });

  it("망가진 값이 들어와도 그대로 돌려준다", () => {
    // 저장소에서 읽은 값이라 이상한 게 섞일 수 있다 — 여기서 throw하면 사이드바가 통째로 죽는다.
    expect(formatDayLabel("", "2026-09-19")).toBe("");
    expect(formatDayLabel("어제", "2026-09-19")).toBe("어제");
  });
});
