import { describe, expect, it } from "vitest";
import { parseKanjiNumber, readNumberPrefix } from "./numberReading";

// 틀려도 콘솔은 조용하고, 학습자는 四時를 しとき로 외운다(레벨 진단에서 실제로 보고받았다).

const read = (text: string) => readNumberPrefix(text)?.reading ?? null;

describe("parseKanjiNumber", () => {
  it("자릿값을 계산한다", () => {
    expect(parseKanjiNumber("十五")).toBe(15);
    expect(parseKanjiNumber("三十")).toBe(30);
    expect(parseKanjiNumber("六百")).toBe(600);
    expect(parseKanjiNumber("二千三百四十五")).toBe(2345);
  });

  it("숫자 모양이 아니면 null", () => {
    expect(parseKanjiNumber("十百")).toBeNull();
    expect(parseKanjiNumber("二三")).toBeNull();
  });
});

describe("readNumberPrefix", () => {
  it("시각", () => {
    expect(read("四時に")).toBe("よじ");
    expect(read("六時から")).toBe("ろくじ");
    expect(read("七時")).toBe("しちじ");
    expect(read("九時")).toBe("くじ");
    expect(read("十時")).toBe("じゅうじ");
  });

  it("「時間」을 「時」로 자르지 않는다", () => {
    expect(readNumberPrefix("二時間")?.text).toBe("二時間");
    expect(read("四時間")).toBe("よじかん");
  });

  it("사람·해·돈", () => {
    expect(read("三人")).toBe("さんにん");
    expect(read("四人")).toBe("よにん");
    expect(read("三十人")).toBe("さんじゅうにん");
    expect(read("十年")).toBe("じゅうねん");
    expect(read("六百年")).toBe("ろっぴゃくねん");
    expect(read("百円")).toBe("ひゃくえん");
    expect(read("三千円")).toBe("さんぜんえん");
  });

  it("달과 날짜의 불규칙", () => {
    expect(read("四月")).toBe("しがつ");
    expect(read("九月")).toBe("くがつ");
    expect(read("十一月")).toBe("じゅういちがつ");
    expect(read("三日")).toBe("みっか");
    expect(read("十日")).toBe("とおか");
    expect(read("十四日")).toBe("じゅうよっか");
    expect(read("十五日")).toBe("じゅうごにち");
    expect(read("二十日")).toBe("はつか");
  });

  it("범위 밖의 달·날짜에는 읽기를 달지 않는다", () => {
    expect(read("十三月")).toBeNull();
    expect(read("四十日")).toBeNull();
  });

  it("촉음·탁음이 되는 단위", () => {
    expect(read("十冊")).toBe("じゅっさつ");
    expect(read("八冊")).toBe("はっさつ");
    expect(read("十五歳")).toBe("じゅうごさい");
    expect(read("二十歳")).toBe("にじゅっさい");
    expect(read("三階")).toBe("さんがい");
    expect(read("十分")).toBe("じゅっぷん");
    expect(read("三十分")).toBe("さんじゅっぷん");
  });

  it("단위 없는 숫자", () => {
    expect(readNumberPrefix("五十")).toEqual({ text: "五十", reading: "ごじゅう", hasCounter: false });
    expect(readNumberPrefix("六百")?.reading).toBe("ろっぴゃく");
  });

  it("숫자로 시작하지 않으면 null", () => {
    expect(readNumberPrefix("時間")).toBeNull();
    expect(readNumberPrefix("あした")).toBeNull();
  });
});
