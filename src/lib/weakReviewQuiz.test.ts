import { describe, expect, it } from "vitest";
import dictionaryData from "../data/dictionary.json";
import type { WordEntry } from "../types/dictionary";
import type { KanjiQuizQuestion } from "./kanjiQuiz";
import { buildWordMeaningQuestion, interleaveReviewQuestions, resolveReviewWord, shortMeaning } from "./weakReviewQuiz";

// 보기가 겹치거나 정답이 빠지면 화면은 멀쩡한데 문제가 성립하지 않는다.

const dictionary = dictionaryData as WordEntry[];

function seeded(seed = 1) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

describe("resolveReviewWord", () => {
  it("표기가 같은 단어는 남겨 둔 읽기로 가른다", () => {
    const readings = dictionary.filter((w) => w.word === "上手").map((w) => w.reading);
    expect(readings.length).toBeGreaterThan(1);
    for (const reading of readings) {
      expect(resolveReviewWord({ word: "上手", reading }, dictionary)?.reading).toBe(reading);
    }
  });

  it("읽기가 없으면 흔한 단어를 고른다", () => {
    const found = resolveReviewWord({ word: "上手" }, dictionary);
    expect(found?.common).toBe(true);
  });

  it("사전에 없는 표기는 undefined", () => {
    expect(resolveReviewWord({ word: "존재하지않는말" }, dictionary)).toBeUndefined();
  });
});

describe("buildWordMeaningQuestion", () => {
  const samples = ["食べる", "約束", "難しい", "上手", "水"].map((w) => resolveReviewWord({ word: w }, dictionary)!);

  it("보기 네 개가 전부 다르고, 정답 자리에 그 단어의 뜻이 있다", () => {
    for (const [i, word] of samples.entries()) {
      const q = buildWordMeaningQuestion(word, dictionary, seeded(i + 1))!;
      expect(q.choices).toHaveLength(4);
      expect(new Set(q.choices).size).toBe(4);
      expect(q.choices[q.answerIndex]).toBe(shortMeaning(word));
    }
  });

  it("보기는 정답과 같은 언어다 — 한국어 정답에 영어 오답이 섞이면 뜻을 몰라도 맞힌다", () => {
    const hangul = /[가-힣]/;
    const korean = dictionary.find((w) => w.common && w.koreanMeaning?.length)!;
    const english = dictionary.find((w) => w.common && !w.koreanMeaning?.length)!;
    for (const [word, expectKorean] of [[korean, true], [english, false]] as const) {
      const q = buildWordMeaningQuestion(word, dictionary, seeded(9))!;
      for (const c of q.choices) {
        // 영어 뜻 안에도 괄호 속 한글은 없다 — 한글이 있는지로 언어를 가른다.
        expect(hangul.test(c), `${word.word}: ${c}`).toBe(expectKorean);
      }
    }
  });

  it("보기는 짧다 — 고어 뜻까지 딸린 몇 줄짜리 뜻풀이를 그대로 쓰지 않는다", () => {
    for (const word of dictionary.slice(0, 500)) {
      expect(shortMeaning(word).length).toBeLessThanOrEqual(32);
    }
  });

  it("오답 보기는 같은 급수의 흔한 단어에서 온다", () => {
    const word = samples[0];
    const q = buildWordMeaningQuestion(word, dictionary, seeded(3))!;
    const sameLevel = new Set(
      dictionary.filter((w) => w.common && w.jlptLevel === word.jlptLevel).map((w) => shortMeaning(w))
    );
    q.choices.forEach((c, i) => {
      if (i !== q.answerIndex) expect(sameLevel.has(c)).toBe(true);
    });
  });
});

describe("interleaveReviewQuestions", () => {
  it("한자와 단어를 번갈아 놓고, 남는 쪽은 뒤에 붙인다", () => {
    const k = (id: string) => ({ kanji: { kanji: id } }) as unknown as KanjiQuizQuestion;
    const w = (id: string) => ({ word: { word: id }, choices: [], answerIndex: 0 }) as never;
    const out = interleaveReviewQuestions([k("一"), k("二"), k("三")], [w("a")]);
    expect(out.map((q) => q.kind)).toEqual(["kanji", "word", "kanji", "kanji"]);
  });
});
