import { describe, expect, it } from "vitest";
import { koreanTokens, scoreKorean, searchDictionary } from "./dictionary";

/**
 * 한글 검색은 "조용히 나빠지는" 기능이다 — 결과가 0건이 되는 게 아니라 **순서만 엉망이 되어서**,
 * 화면에는 뭔가 나오지만 정작 찾던 단어가 안 보인다. 실제로 그랬다: "물"로 검색했더니
 * `水`는 안 보이고 "물러나다"·"결합물"·"물체"처럼 음절만 겹친 단어가 먼저 나왔다.
 * 그래서 점수 계산과 대표 결과를 여기에 고정해둔다.
 */
describe("koreanTokens", () => {
  it("쉼표·세미콜론으로 자른다", () => {
    expect(koreanTokens(["먹다, 섭취하다"])).toEqual(["먹다", "섭취하다"]);
    expect(koreanTokens(["학교; 학원"])).toEqual(["학교", "학원"]);
  });

  it("앞에 붙은 괄호 설명을 뗀 형태도 후보로 둔다", () => {
    // "(마시는) 물"이 "물"로 검색되지 않으면 水를 영영 못 찾는다.
    expect(koreanTokens(["(마시는) 물"])).toContain("물");
    expect(koreanTokens(["(겸양어) 먹다"])).toContain("먹다");
  });

  it("괄호가 중간에 있으면 건드리지 않는다", () => {
    expect(koreanTokens(["학생(특히 중고등학교의)"])).toEqual(["학생(특히 중고등학교의)"]);
  });
});

describe("scoreKorean", () => {
  it("맨 앞 뜻이 일치하면 가장 높다", () => {
    expect(scoreKorean(["먹다", "섭취하다"], "먹다")).toBeGreaterThan(
      scoreKorean(["마시다", "먹다"], "먹다")
    );
  });

  it("음절만 겹치는 경우는 정확히 맞는 것보다 낮다", () => {
    expect(scoreKorean(["물러나다"], "물")).toBeLessThan(scoreKorean(["(마시는) 물"], "물"));
  });

  it("한국어 뜻이 없으면 0", () => {
    expect(scoreKorean(undefined, "물")).toBe(0);
  });
});

describe("searchDictionary (한글)", () => {
  const first = (q: string) => searchDictionary(q, 5)[0]?.word;

  it("기본적인 한국어 단어로 일본어를 찾는다", () => {
    expect(first("물")).toBe("水");
    expect(first("먹다")).toBe("食べる");
    expect(first("학교")).toBe("学校");
    expect(first("공부")).toBe("勉強");
    expect(first("책")).toBe("本");
  });

  it("기존 검색(한자·가나·영어)은 그대로 동작한다", () => {
    expect(first("食べる")).toBe("食べる");
    expect(first("たべる")).toBe("食べる");
    expect(searchDictionary("water", 5).length).toBeGreaterThan(0);
  });

  it("한국어 뜻이 없는 단어도 검색 결과에서 빠지지 않는다", () => {
    // 한국어 뜻은 절반가량에만 있다 — 없다고 결과에서 사라지면 사전이 반쪽이 된다.
    const results = searchDictionary("たべ", 8);
    expect(results.length).toBeGreaterThan(0);
  });
});
