import { describe, expect, it } from "vitest";
import dictionaryData from "../data/dictionary.json";
import type { WordEntry } from "../types/dictionary";
import { buildConjugationDrill, isConjugationCorrect, isDrillableVerb } from "./conjugationDrill";
import { conjugateVerb } from "./verbConjugation";

// 정답은 규칙으로 계산되지만, 채점 정규화가 한 글자만 어긋나도 제대로 쓴 학습자가 "틀렸다"를
// 듣는다(teacherPractice와 같은 종류의 조용한 버그).

const dictionary = dictionaryData as WordEntry[];
const entry = (word: string, reading?: string) =>
  dictionary.find((w) => w.word === word && (!reading || w.reading === reading))!;

/** 결정적인 난수(테스트가 매번 같은 순서로 섞이게). */
function seeded(seed = 1) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

describe("isConjugationCorrect", () => {
  const nai = conjugateVerb(entry("食べる"), "nai")!;

  it("한자·가나·가타카나·로마자 어느 것으로 써도 맞다", () => {
    for (const input of ["食べない", "たべない", "タベナイ", "tabenai", " たべない。"]) {
      expect(isConjugationCorrect(input, nai), input).toBe(true);
    }
  });

  it("틀린 활용과 빈 답은 틀리다", () => {
    for (const input of ["たべます", "たべなかった", "食べない?ない", "", "   "]) {
      expect(isConjugationCorrect(input, nai), JSON.stringify(input)).toBe(false);
    }
  });

  it("来る는 읽기가 바뀐 가나(こない)로 맞다", () => {
    const kuru = conjugateVerb(entry("来る", "くる"), "nai")!;
    expect(isConjugationCorrect("こない", kuru)).toBe(true);
    expect(isConjugationCorrect("来ない", kuru)).toBe(true);
    expect(isConjugationCorrect("くない", kuru)).toBe(false);
  });

  it("ん이 든 로마자(yonde)도 맞다", () => {
    expect(isConjugationCorrect("yonde", conjugateVerb(entry("読む"), "te")!)).toBe(true);
  });
});

describe("buildConjugationDrill", () => {
  const verbs = ["食べる", "書く", "読む", "行く", "勉強"].map((w) => entry(w));

  it("같은 (동사, 활용형)을 두 번 내지 않는다", () => {
    const drill = buildConjugationDrill(verbs, 20, seeded(3));
    const keys = drill.map((q) => `${q.entry.id}:${q.form}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("동사를 고르게 돌린다 — 10문제면 다섯 동사가 두 번씩", () => {
    const drill = buildConjugationDrill(verbs, 10, seeded(7));
    const counts = new Map<string, number>();
    for (const q of drill) counts.set(q.entry.word, (counts.get(q.entry.word) ?? 0) + 1);
    expect([...counts.values()]).toEqual([2, 2, 2, 2, 2]);
  });

  it("동사가 하나뿐이면 그 동사의 활용형 수만큼만 낸다", () => {
    expect(buildConjugationDrill([entry("書く")], 10, seeded(2))).toHaveLength(6);
  });

  it("동사가 아닌 단어는 빠진다", () => {
    const water = entry("水");
    expect(isDrillableVerb(water)).toBe(false);
    expect(buildConjugationDrill([water], 10, seeded())).toEqual([]);
  });

  it("문제의 정답은 conjugateVerb가 계산한 값 그대로다", () => {
    for (const q of buildConjugationDrill(verbs, 10, seeded(5))) {
      expect(q.answer).toEqual(conjugateVerb(q.entry, q.form));
    }
  });
});
