import { describe, expect, it } from "vitest";
import dictionaryData from "../data/dictionary.json";
import type { WordEntry } from "../types/dictionary";
import { VERB_FORMS, conjugateVerb, dictionaryForm, getVerbConjugations, type VerbForm } from "./verbConjugation";

// 활용형은 틀려도 화면은 멀쩡하다 — 「信ずて」「有らない」 같은 없는 말을 학습자가 그대로 외운다.
// 표를 사전의 실제 항목으로 고정한다(품사 태그가 바뀌면 여기서 먼저 걸린다).

const dictionary = dictionaryData as WordEntry[];
function entry(word: string, reading?: string): WordEntry {
  const found = dictionary.find((w) => w.word === word && (!reading || w.reading === reading));
  if (!found) throw new Error(`사전에 없는 단어: ${word}`);
  return found;
}

type Row = [VerbForm, string, string?];
function expectForms(e: WordEntry, rows: Row[]) {
  for (const [form, kanji, reading] of rows) {
    const got = conjugateVerb(e, form);
    expect(got, `${e.word} ${form}`).not.toBeNull();
    expect(got!.kanji, `${e.word} ${form}`).toBe(kanji);
    if (reading !== undefined) expect(got!.reading, `${e.word} ${form} 읽기`).toBe(reading);
  }
}

describe("1단 동사", () => {
  it("食べる", () => {
    expectForms(entry("食べる"), [
      ["masu", "食べます", "たべます"],
      ["nai", "食べない"],
      ["ta", "食べた"],
      ["te", "食べて"],
      ["potential", "食べられる"],
      ["volitional", "食べよう"],
    ]);
  });

  it("ずる 동사는 じる처럼 활용한다(信ずて가 아니다)", () => {
    expectForms(entry("信ずる"), [
      ["te", "信じて"],
      ["nai", "信じない"],
      ["masu", "信じます"],
    ]);
  });
});

describe("5단 동사 — 어미별", () => {
  const cases: [string, Row[]][] = [
    ["書く", [["masu", "書きます"], ["nai", "書かない"], ["te", "書いて"], ["ta", "書いた"], ["potential", "書ける"], ["volitional", "書こう"]]],
    ["泳ぐ", [["te", "泳いで"], ["ta", "泳いだ"], ["nai", "泳がない"]]],
    ["話す", [["te", "話して"], ["masu", "話します"], ["potential", "話せる"]]],
    ["待つ", [["te", "待って"], ["nai", "待たない"], ["volitional", "待とう"]]],
    ["死ぬ", [["te", "死んで"], ["ta", "死んだ"], ["nai", "死なない"]]],
    ["遊ぶ", [["te", "遊んで"], ["masu", "遊びます"]]],
    ["読む", [["te", "読んで"], ["ta", "読んだ"], ["potential", "読める"]]],
    ["帰る", [["te", "帰って"], ["nai", "帰らない"], ["masu", "帰ります"]]],
    // う의 あ단은 あ가 아니라 わ다.
    ["買う", [["nai", "買わない"], ["te", "買って"], ["volitional", "買おう"]]],
  ];
  for (const [word, rows] of cases) it(word, () => expectForms(entry(word), rows));
});

describe("예외", () => {
  it("行く는 って", () => {
    expectForms(entry("行く"), [["te", "行って", "いって"], ["ta", "行った"], ["masu", "行きます"]]);
  });

  it("ある의 부정은 ない", () => {
    expectForms(entry("有る"), [["nai", "ない"], ["masu", "有ります", "あります"]]);
  });

  it("なさる·くださる는 ます형에서 い", () => {
    expectForms(entry("為さる"), [["masu", "為さいます", "なさいます"]]);
    expectForms(entry("下さる"), [["masu", "下さいます", "くださいます"]]);
  });

  it("問う는 うて", () => {
    expectForms(entry("問う"), [["te", "問うて"], ["ta", "問うた"]]);
  });

  it("来る는 표기는 来 그대로, 읽기만 き·こ로 바뀐다", () => {
    expectForms(entry("来る", "くる"), [
      ["masu", "来ます", "きます"],
      ["nai", "来ない", "こない"],
      ["te", "来て", "きて"],
      ["potential", "来られる", "こられる"],
      ["volitional", "来よう", "こよう"],
    ]);
  });

  it("する(為る)와 する 명사", () => {
    // 為る는 한자 표기로 활용하지 않는다(「為て」가 아니라 「して」) — 어간이 비므로 저절로 그렇게 된다.
    expectForms(entry("為る"), [["te", "して"], ["masu", "します"], ["potential", "できる"]]);
    expectForms(entry("勉強"), [
      ["masu", "勉強します", "べんきょうします"],
      ["nai", "勉強しない"],
      ["potential", "勉強できる"],
      ["volitional", "勉強しよう"],
    ]);
  });

  it("愛する류(vs-s)는 규칙이 갈리는 활용형을 보여주지 않는다", () => {
    const love = entry("愛する");
    expect(conjugateVerb(love, "te")?.kanji).toBe("愛して");
    expect(conjugateVerb(love, "nai")).toBeNull();
    expect(conjugateVerb(love, "potential")).toBeNull();
  });
});

describe("getVerbConjugations", () => {
  it("동사가 아니면 null", () => {
    expect(getVerbConjugations(entry("水"))).toBeNull();
  });

  it("고어 동사(為 す, vs-c)에는 없는 말을 만들지 않는다", () => {
    expect(getVerbConjugations(entry("為", "す"))).toBeNull();
  });

  it("사전의 모든 동사에서 어떤 활용형도 표기와 읽기가 둘 다 어미로 끝난다", () => {
    const endings = /(ます|ない|た|だ|て|で|る|う)$/;
    for (const e of dictionary) {
      for (const row of getVerbConjugations(e) ?? []) {
        expect(row.kanji, `${e.word} ${row.form}`).toMatch(endings);
        if (row.reading) expect(row.reading, `${e.word} ${row.form}`).toMatch(endings);
      }
    }
  });

  it("활용표는 VERB_FORMS 순서다", () => {
    expect(getVerbConjugations(entry("書く"))!.map((r) => r.form)).toEqual([...VERB_FORMS]);
  });
});

describe("dictionaryForm", () => {
  it("する 명사에는 する를 붙이고, 이미 붙은 동사는 그대로 둔다", () => {
    expect(dictionaryForm(entry("勉強")).kanji).toBe("勉強する");
    expect(dictionaryForm(entry("勉強")).reading).toBe("べんきょうする");
    expect(dictionaryForm(entry("愛する")).kanji).toBe("愛する");
    expect(dictionaryForm(entry("食べる")).kanji).toBe("食べる");
  });
});
