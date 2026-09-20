import { describe, expect, it } from "vitest";
import {
  backLabel,
  originForPath,
  originFromState,
  planDictionaryTabMemory,
  wordPath,
} from "./wordLink";

// 여기서 틀려도 콘솔은 조용하다 — 돌아가기 버튼이 엉뚱한 화면으로 보내거나, 조사가 깨진
// 문구("한자으로")가 그대로 화면에 나갈 뿐이다. 그래서 고정해둔다.

describe("originForPath", () => {
  it("단어를 누른 화면으로 돌아간다", () => {
    expect(originForPath("/wordbook")).toEqual({ to: "/wordbook", label: "단어장" });
    expect(originForPath("/teacher")).toEqual({ to: "/teacher", label: "선생님" });
  });

  it("단어 상세에서 또 다른 단어로 갔으면 '이전 단어'다", () => {
    // /word/ 가 목록 맨 앞에 있어야 하는 이유 — /wordbook과 앞부분이 겹치지 않는지도 같이 본다.
    expect(originForPath("/word/abc123")).toEqual({ to: "/word/abc123", label: "이전 단어" });
  });

  it("모르는 경로에서는 사전으로 보낸다", () => {
    expect(originForPath("/")).toEqual({ to: "/dictionary", label: "사전" });
    expect(originForPath("/nope")).toEqual({ to: "/dictionary", label: "사전" });
  });
});

describe("originFromState", () => {
  it("실어 보낸 출처를 되읽는다", () => {
    const state = { from: { to: "/kanji", label: "한자" } };
    expect(originFromState(state)).toEqual({ to: "/kanji", label: "한자" });
  });

  it("state가 없거나 모양이 다르면 사전으로 폴백한다", () => {
    // 새로고침·주소 직접 열기·다른 기능이 넣어둔 state가 전부 여기로 온다.
    const fallback = { to: "/dictionary", label: "사전" };
    expect(originFromState(null)).toEqual(fallback);
    expect(originFromState(undefined)).toEqual(fallback);
    expect(originFromState({})).toEqual(fallback);
    expect(originFromState({ from: null })).toEqual(fallback);
    expect(originFromState({ from: { to: "/kanji" } })).toEqual(fallback);
    expect(originFromState({ from: { to: 42, label: "한자" } })).toEqual(fallback);
  });
});

describe("backLabel", () => {
  it("받침에 따라 조사를 고른다", () => {
    const label = (name: string) => backLabel({ to: "/x", label: name });
    expect(label("사전")).toBe("← 사전으로"); // ㄴ 받침
    expect(label("단어장")).toBe("← 단어장으로"); // ㅇ 받침
    expect(label("선생님")).toBe("← 선생님으로"); // ㅁ 받침
    expect(label("한자")).toBe("← 한자로"); // 받침 없음
    expect(label("오십음도")).toBe("← 오십음도로");
    expect(label("이전 단어")).toBe("← 이전 단어로");
  });

  it("ㄹ 받침은 '으로'가 아니라 '로'다", () => {
    expect(backLabel({ to: "/x", label: "오늘" })).toBe("← 오늘로");
  });

  it("한글이 아닌 끝 글자도 깨지지 않는다", () => {
    expect(backLabel({ to: "/x", label: "N5" })).toBe("← N5로");
  });
});

describe("planDictionaryTabMemory", () => {
  const plan = planDictionaryTabMemory;

  it("사전에서 들어간 단어를 기억한다", () => {
    expect(plan("/word/1", "/dictionary", null)).toEqual({ lastWordId: "1" });
  });

  it("다른 탭에서 들어간 단어는 기억하지 않는다", () => {
    // 단어장·회화·선생님에는 자기 탭이 있다 — 사전 탭의 자리를 건드릴 이유가 없다.
    expect(plan("/word/2", "/wordbook", null)).toBeNull();
    expect(plan("/word/2", "/conversation", null)).toBeNull();
    expect(plan("/word/2", "/kanji", null)).toBeNull();
  });

  it("다른 탭에서 단어를 열어도 사전 탭의 자리는 그대로다", () => {
    // null(그대로 두기)과 { lastWordId: null }(지우기)을 헷갈리면 보던 단어가 조용히 사라진다.
    expect(plan("/word/2", "/wordbook", "1")).toBeNull();
  });

  it("사전 → 단어A → 단어B는 B까지 이어받는다", () => {
    expect(plan("/word/B", "/word/A", "A")).toEqual({ lastWordId: "B" });
  });

  it("단어장 → 단어A → 단어B는 이어받지 않는다", () => {
    // A를 기억하고 있지 않았으므로(=사전 탭의 자리가 아니었으므로) B도 남의 것이다.
    expect(plan("/word/B", "/word/A", null)).toBeNull();
    expect(plan("/word/B", "/word/A", "다른단어")).toBeNull();
  });

  it("검색 목록에 도착하면 지운다", () => {
    expect(plan("/dictionary", "/wordbook", "1")).toEqual({ lastWordId: null });
  });

  it("state가 없는 진입(새로고침·옛 주소·주소 직접 열기)은 사전으로 친다", () => {
    // originFromState가 이때 "/dictionary"를 돌려준다 — 돌아가기 폴백과 같은 판단이다.
    expect(plan("/word/3", originFromState(null).to, null)).toEqual({ lastWordId: "3" });
  });

  it("단어도 사전도 아닌 화면은 건드리지 않는다", () => {
    expect(plan("/teacher", "/dictionary", "1")).toBeNull();
    expect(plan("/wordbook", "/dictionary", "1")).toBeNull();
  });
});

describe("wordPath", () => {
  it("단어 상세 주소를 만든다", () => {
    expect(wordPath("abc123")).toBe("/word/abc123");
  });
});
