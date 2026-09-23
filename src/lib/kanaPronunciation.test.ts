import { describe, expect, it } from "vitest";
import homophones from "../data/kana-homophones.json";
import { GOJUON_SECTIONS } from "../data/gojuon";
import { matchesKana, normalizeHeard, pickRounds, speakableCells } from "./kanaPronunciation";

const H = homophones as Record<string, string[]>;
const ka = { hiragana: "か", romaji: "ka" };

describe("matchesKana — 인식기가 실제로 돌려주는 모양들", () => {
  it("히라가나 그대로", () => {
    expect(matchesKana(["か"], ka)).toBe(true);
  });

  it("가타카나로 받아 적어도 맞다", () => {
    expect(matchesKana(["カ"], ka)).toBe(true);
  });

  it("로마자로 받아 적어도 맞다", () => {
    expect(matchesKana(["Ka"], ka)).toBe(true);
  });

  it("동음이의 한자로 오면 사전의 읽기로 맞춘다 (か → 蚊, て → 手)", () => {
    expect(matchesKana(["蚊"], ka, H["か"])).toBe(true);
    expect(matchesKana(["手"], { hiragana: "て", romaji: "te" }, H["て"])).toBe(true);
  });

  it("숫자로 오면 한자 숫자로 바꿔 찾는다 (に → 2 → 二)", () => {
    expect(matchesKana(["2"], { hiragana: "に", romaji: "ni" }, H["に"])).toBe(true);
    expect(matchesKana(["２"], { hiragana: "に", romaji: "ni" }, H["に"])).toBe(true);
  });

  it("구두점·장음·말끝 촉음은 무시한다", () => {
    expect(matchesKana(["か。"], ka)).toBe(true);
    expect(matchesKana(["かー"], ka)).toBe(true);
    expect(matchesKana(["かっ"], ka)).toBe(true);
    expect(matchesKana([" か "], ka)).toBe(true);
  });

  it("같은 글자를 되풀이해도 맞다", () => {
    expect(matchesKana(["かか"], ka)).toBe(true);
    expect(matchesKana(["きゃきゃ"], { hiragana: "きゃ", romaji: "kya" })).toBe(true);
  });

  it("소리가 같은 ぢ·づ·を는 じ·ず·お로 들어와도 맞다", () => {
    expect(matchesKana(["じ"], { hiragana: "ぢ", romaji: "ji" })).toBe(true);
    expect(matchesKana(["ず"], { hiragana: "づ", romaji: "zu" })).toBe(true);
    expect(matchesKana(["お"], { hiragana: "を", romaji: "wo" })).toBe(true);
  });

  it("후보 중 하나만 맞아도 맞다", () => {
    expect(matchesKana(["が", "課"], ka, H["か"])).toBe(true);
  });

  it("외래어 표기는 작은 모음을 떼지 않은 형태로 맞춘다 (ファ → ふぁ)", () => {
    expect(matchesKana(["ファ"], { hiragana: "ふぁ", romaji: "fa" })).toBe(true);
  });

  describe("틀린 것은 틀린다", () => {
    it("탁음·청음은 다른 소리다", () => {
      expect(matchesKana(["が"], ka)).toBe(false);
      expect(matchesKana(["か"], { hiragana: "が", romaji: "ga" })).toBe(false);
    });

    it("요음과 그 앞 글자는 다르다", () => {
      expect(matchesKana(["き"], { hiragana: "きゃ", romaji: "kya" })).toBe(false);
      expect(matchesKana(["きや"], { hiragana: "きゃ", romaji: "kya" })).toBe(false);
    });

    it("외래어 표기에서 작은 모음을 떼면 다른 소리다 (ふ ≠ ふぁ)", () => {
      expect(matchesKana(["ふ"], { hiragana: "ふぁ", romaji: "fa" })).toBe(false);
    });

    it("그 글자로 시작하는 긴 말은 아니다", () => {
      expect(matchesKana(["かさ"], ka)).toBe(false);
      expect(matchesKana(["かっこいい"], ka)).toBe(false);
    });

    it("동음어 표에 없는 한자는 아니다", () => {
      expect(matchesKana(["木"], ka, H["か"])).toBe(false);
    });

    it("빈 결과·잡음만 있는 결과는 아니다", () => {
      expect(matchesKana([], ka)).toBe(false);
      expect(matchesKana(["", "。", "ー"], ka)).toBe(false);
    });
  });
});

describe("normalizeHeard", () => {
  it("전각 로마자·가타카나를 히라가나로", () => {
    expect(normalizeHeard("ＫＡ")).toBe("か");
    expect(normalizeHeard("キャ")).toBe("きゃ");
  });
});

describe("출제", () => {
  const all = GOJUON_SECTIONS.flatMap((s) => s.rows.flatMap((r) => r.cells));

  it("소리를 따로 정한 칸(작은 ヵ・ヶ)은 내지 않는다", () => {
    const cells = speakableCells(all);
    expect(cells.some((c) => c.katakana === "ヶ" || c.katakana === "ヵ")).toBe(false);
    expect(cells.some((c) => c.hiragana === "か")).toBe(true);
  });

  it("겹치지 않게 최대 10개를 고른다", () => {
    const cells = speakableCells(all);
    const picked = pickRounds(cells, 10, () => 0.42);
    expect(picked).toHaveLength(10);
    expect(new Set(picked.map((c) => c.hiragana)).size).toBe(10);
  });

  it("칸이 모자라면 있는 만큼만", () => {
    const three = speakableCells(all).slice(0, 3);
    expect(pickRounds(three)).toHaveLength(3);
  });

  it("모든 출제 칸의 채점 키가 자기 자신을 맞게 판정한다", () => {
    // 표 데이터를 고치다 키와 로마자가 어긋나면(예: ぢ의 키를 바꿨는데 SAME_SOUND를 안 고침)
    // 그 칸은 아무리 잘 읽어도 틀린다 — 표 전체로 확인한다.
    for (const cell of speakableCells(all)) {
      expect(matchesKana([cell.hiragana], cell, H[cell.hiragana]), cell.hiragana).toBe(true);
      expect(matchesKana([cell.katakana], cell, H[cell.hiragana]), cell.katakana).toBe(true);
    }
  });
});
