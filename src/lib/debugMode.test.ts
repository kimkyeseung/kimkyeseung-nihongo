import { describe, expect, it } from "vitest";
import {
  buildTeacherChatExport,
  parseDebugQuery,
  stripDebugQuery,
  teacherChatExportFileName,
} from "./debugMode";
import type { StoredMessage } from "./learnerMemoryDb";

// 디버그 모드는 틀려도 콘솔이 조용하다 — 켜지지 않거나(지시가 새서) 의도치 않게 꺼진다(빈 값이
// 끄기로 읽혀서). 내보내기는 행이 한 글자라도 바뀌면 되돌려 넣을 수 없는 파일이 된다.

describe("parseDebugQuery", () => {
  it("1·true·on은 켜기, 0·false·off는 끄기", () => {
    expect(parseDebugQuery("?debug=1")).toBe(true);
    expect(parseDebugQuery("?debug=true")).toBe(true);
    expect(parseDebugQuery("?debug=ON")).toBe(true);
    expect(parseDebugQuery("?debug=0")).toBe(false);
    expect(parseDebugQuery("?debug=false")).toBe(false);
    expect(parseDebugQuery("?debug=Off")).toBe(false);
  });

  it("지시가 없거나 알 수 없는 값이면 null — 지금 상태를 건드리지 않는다", () => {
    expect(parseDebugQuery("")).toBeNull();
    expect(parseDebugQuery("?review=weak")).toBeNull();
    expect(parseDebugQuery("?debug=")).toBeNull();
    expect(parseDebugQuery("?debug=maybe")).toBeNull();
  });

  it("다른 파라미터와 같이 와도 읽는다", () => {
    expect(parseDebugQuery("?review=weak&debug=1")).toBe(true);
  });
});

describe("stripDebugQuery", () => {
  it("debug만 떼고 나머지는 남긴다", () => {
    expect(stripDebugQuery("?debug=1")).toBe("");
    expect(stripDebugQuery("?review=weak&debug=1")).toBe("?review=weak");
    expect(stripDebugQuery("?review=weak")).toBe("?review=weak");
  });
});

describe("buildTeacherChatExport", () => {
  const row = (id: string, date: string, role: StoredMessage["role"], at: number): StoredMessage => ({
    id,
    date,
    role,
    text: `「${id}」 **굵게** \`食べる\``,
    at,
  });
  const now = new Date("2026-10-08T01:00:00Z");

  it("행을 시간순으로 두고 필드를 그대로 유지한다 (StoredMessage 스키마)", () => {
    const a = row("a", "2026-10-07", "user", 100);
    const b = row("b", "2026-10-07", "assistant", 200);
    const out = buildTeacherChatExport("2026-10-07", [b, a], now);
    expect(out.messages).toEqual([a, b]);
    expect(Object.keys(out.messages[0]).sort()).toEqual(["at", "date", "id", "role", "text"]);
  });

  it("다른 날짜의 행은 넣지 않는다", () => {
    const out = buildTeacherChatExport("2026-10-07", [row("a", "2026-10-06", "user", 1)], now);
    expect(out.messages).toEqual([]);
  });

  it("머리말에 형식·버전·날짜·내보낸 시각이 든다", () => {
    const out = buildTeacherChatExport("2026-10-07", [], now);
    expect(out).toMatchObject({
      format: "kimkyeseung-nihongo-teacher-chat",
      version: 1,
      date: "2026-10-07",
      exportedAt: "2026-10-08T01:00:00.000Z",
    });
  });

  it("파일 이름에 날짜가 들어간다", () => {
    expect(teacherChatExportFileName("2026-10-07")).toBe("teacher-chat-2026-10-07.json");
  });
});
