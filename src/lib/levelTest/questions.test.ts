import { describe, expect, it } from "vitest";
import {
  SEION_CELLS,
  buildGrammarQuestion,
  buildKanaQuestion,
  buildKanjiQuestion,
  buildListeningQuestion,
  buildReadingQuestion,
  buildVocabPool,
  buildVocabQuestion,
  isVocabCandidate,
  kanjiQuestionWords,
  posFamily,
  type LevelTestQuestion,
} from "./questions";
import { readingInWord, soundsLike } from "../kanjiReading";
import { koreanTokens } from "../koreanMeaning";
import { shortMeaning } from "../weakReviewQuiz";
import { dictionary } from "../dictionary";
import { kanjiList } from "../kanji";
import bankData from "../../data/level-test-bank.json";
import { JLPT_LEVELS, type JlptLevel } from "../../types/jlpt";
import type { LevelTestBank } from "../../types/levelTest";
import type { WordEntry } from "../../types/dictionary";

// 보기가 겹치거나 정답만 한국어면 뜻을 몰라도 맞힌다 — 그러면 진단은 조용히 높게 나오고, 학습자는
// 너무 어려운 단계에서 커리큘럼을 시작한다. 실제 사전·한자 데이터로 급수마다 수백 번 돌려 본다.

const bank = bankData as unknown as LevelTestBank;
const RUNS = 300;

/** 재현 가능한 난수(mulberry32) — 실패하면 같은 문제로 다시 볼 수 있다. */
function seeded(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const HANGUL = /[가-힣]/;
const KANA_OR_KANJI = /[぀-ヿ一-鿿]/;
const HIRAGANA_ONLY = /^[぀-ゟ]+$/;

function expectWellFormed(q: LevelTestQuestion) {
  expect(q.choices).toHaveLength(4);
  expect(new Set(q.choices).size).toBe(4);
  expect(q.answerIndex).toBeGreaterThanOrEqual(0);
  expect(q.answerIndex).toBeLessThan(4);
}

const vocabPool = buildVocabPool(dictionary);

describe("posFamily", () => {
  it("명사·동사·형용사·부사만 계열로 본다", () => {
    expect(posFamily(["n", "vs"])).toBe("noun");
    expect(posFamily(["v5r", "vt"])).toBe("verb");
    expect(posFamily(["vt", "v1"])).toBe("verb");
    expect(posFamily(["adj-na", "n"])).toBe("adj");
    expect(posFamily(["adv", "adv-to"])).toBe("adv");
  });

  it("n으로 시작해도 접미사·접두사·수사는 명사가 아니다", () => {
    expect(posFamily(["n-suf"])).toBeNull();
    expect(posFamily(["n-pref"])).toBeNull();
    expect(posFamily(["num"])).toBeNull();
  });

  it("감탄사·조사·고어 동사는 내지 않는다", () => {
    expect(posFamily(["int"])).toBeNull();
    expect(posFamily(["prt"])).toBeNull();
    expect(posFamily(["v2k-k"])).toBeNull();
  });
});

describe("어휘 후보", () => {
  it("급수마다 충분히 있다", () => {
    for (const level of JLPT_LEVELS) expect(vocabPool[level].length, level).toBeGreaterThan(200);
  });

  it("급수 외 단어·한국어 뜻 없는 단어·가타카나 외래어는 후보가 아니다", () => {
    const all = JLPT_LEVELS.flatMap((l) => vocabPool[l]);
    expect(all.every((w) => w.jlptLevel && w.common && w.koreanMeaning?.length)).toBe(true);
    expect(all.some((w) => /^[゠-ヿ]+$/.test(w.word))).toBe(false);
  });

  it("표기가 같은 단어(上手)는 내지 않는다 — 문제만 봐서는 어느 뜻인지 모른다", () => {
    const all = JLPT_LEVELS.flatMap((l) => vocabPool[l]);
    expect(all.some((w) => w.word === "上手")).toBe(false);
  });

  it("뜻 대신 문법 설명이 적힌 항목(「어간의 하나」)은 정답으로도 오답으로도 쓰지 않는다", () => {
    const all = JLPT_LEVELS.flatMap((l) => vocabPool[l]);
    const junk = all.map((w) => shortMeaning(w)).filter((m) => /어간의 하나|다음 단어를 만듦|의 준말|번째 문자/.test(m));
    expect(junk).toEqual([]);
  });

  it("짧은 뜻에 일본어가 섞인 단어는 후보가 아니다", () => {
    const fake = {
      id: "x",
      word: "部屋",
      reading: "へや",
      jlptLevel: "N5",
      common: true,
      furigana: null,
      pos: ["n"],
      meaning: "room",
      koreanMeaning: ["방(へや)"],
      senses: [],
    } as WordEntry;
    expect(isVocabCandidate(fake)).toBe(false);
  });
});

describe("어휘 문제 — 실제 사전으로 급수마다 300번", () => {
  for (const level of JLPT_LEVELS) {
    it(`${level}: 보기 4개가 서로 다르고 전부 한국어, 정답은 그 단어의 뜻`, () => {
      const random = seeded(level.charCodeAt(1));
      const byMeaning = new Map<string, WordEntry[]>();
      for (const w of JLPT_LEVELS.flatMap((l) => vocabPool[l])) {
        const m = shortMeaning(w);
        byMeaning.set(m, [...(byMeaning.get(m) ?? []), w]);
      }
      for (let i = 0; i < RUNS; i++) {
        const q = buildVocabQuestion(level, vocabPool, new Set(), random);
        expect(q, `${level} #${i}`).not.toBeNull();
        if (q?.kind !== "vocab") throw new Error("vocab이 아니다");
        expectWellFormed(q);
        expect(q.word.jlptLevel).toBe(level);
        expect(q.choices[q.answerIndex]).toBe(shortMeaning(q.word));
        for (const c of q.choices) {
          expect(HANGUL.test(c), c).toBe(true);
          expect(KANA_OR_KANJI.test(c), c).toBe(false);
          // 설명형 긴 뜻은 길이만으로 티가 난다
          expect(c.length, c).toBeLessThanOrEqual(18);
        }
        // 오답 뜻풀이가 정답 단어의 뜻과 한 토막도 겹치지 않는다(다의어 함정)
        const answerTokens = new Set(koreanTokens(q.word.koreanMeaning ?? []));
        q.choices.forEach((c, idx) => {
          if (idx === q.answerIndex) return;
          const owners = byMeaning.get(c) ?? [];
          expect(owners.length, c).toBeGreaterThan(0);
          expect(owners.some((w) => koreanTokens(w.koreanMeaning ?? []).every((t) => !answerTokens.has(t))), c).toBe(true);
        });
      }
    });
  }

  it("이미 낸 단어는 다시 내지 않는다", () => {
    const random = seeded(7);
    const used = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const q = buildVocabQuestion("N5", vocabPool, used, random)!;
      for (const k of q.keys) {
        expect(used.has(k)).toBe(false);
        used.add(k);
      }
    }
  });
});

const kanjiByChar = new Map(kanjiList.map((k) => [k.kanji, k]));

describe("한자 읽기 문제 — 실제 데이터로 급수마다 300번", () => {
  for (const level of JLPT_LEVELS) {
    it(`${level}: 보기 4개가 서로 다른 히라가나, 정답은 단어 속 그 한자의 읽기`, () => {
      const random = seeded(100 + level.charCodeAt(1));
      for (let i = 0; i < RUNS; i++) {
        const q = buildKanjiQuestion(level, kanjiList, dictionary, new Set(), random);
        expect(q, `${level} #${i}`).not.toBeNull();
        if (q?.kind !== "kanji") throw new Error("kanji가 아니다");
        expectWellFormed(q);
        expect(q.word.word).toContain(q.kanji);
        expect(q.word.word.length).toBeGreaterThanOrEqual(2);
        // 단어는 그 급수보다 어렵지 않고, 단어 속 다른 한자는 한 급수 위까지만(N5 見을 「接見」으로 묻지 않는다)
        expect(JLPT_LEVELS.indexOf(q.word.jlptLevel as JlptLevel)).toBeLessThanOrEqual(JLPT_LEVELS.indexOf(level));
        for (const ch of q.word.word.match(/[一-鿿]/g) ?? []) {
          const k = kanjiByChar.get(ch);
          expect(k, `${q.word.word}: ${ch}`).toBeDefined();
          expect(JLPT_LEVELS.indexOf(k!.jlptLevel), `${q.word.word}: ${ch}`).toBeLessThanOrEqual(JLPT_LEVELS.indexOf(level) + 1);
        }
        const answer = readingInWord(q.kanji, q.word);
        expect(q.choices[q.answerIndex]).toBe(answer);
        for (const c of q.choices) expect(HIRAGANA_ONLY.test(c), c).toBe(true);
        // 정답과 탁음·촉음만 다른 소리는 오답으로 쓰지 않는다
        q.choices.forEach((c, idx) => {
          if (idx !== q.answerIndex) expect(soundsLike(c, answer!), `${q.word.word} ${answer} vs ${c}`).toBe(false);
        });
      }
    });
  }

  it("水曜日처럼 단어 속 읽기를 묻는다", () => {
    const mizu = kanjiList.find((k) => k.kanji === "水")!;
    const words = kanjiQuestionWords(mizu, kanjiList, dictionary);
    expect(words.map((w) => w.word)).toContain("水曜日");
    expect(words.every((w) => w.word.length >= 2)).toBe(true);
  });

  it("다른 한자가 두 급수 이상 어려운 단어로는 묻지 않는다(見 → 接見)", () => {
    const mi = kanjiList.find((k) => k.kanji === "見")!;
    expect(kanjiQuestionWords(mi, kanjiList, dictionary).map((w) => w.word)).not.toContain("接見");
  });

  it("이미 낸 한자는 다시 내지 않는다", () => {
    const random = seeded(9);
    const used = new Set<string>();
    for (let i = 0; i < 30; i++) {
      const q = buildKanjiQuestion("N5", kanjiList, dictionary, used, random)!;
      for (const k of q.keys) {
        expect(used.has(k)).toBe(false);
        used.add(k);
      }
    }
  });
});

describe("문법·독해·청해 — 문제 은행", () => {
  const builders = [
    ["grammar", buildGrammarQuestion],
    ["reading", buildReadingQuestion],
    ["listening", buildListeningQuestion],
  ] as const;

  for (const [name, build] of builders) {
    it(`${name}: 보기를 섞어도 정답이 따라간다`, () => {
      const random = seeded(name.length);
      for (const level of JLPT_LEVELS) {
        for (let i = 0; i < 50; i++) {
          const q = build(level, bank, new Set(), random)!;
          expectWellFormed(q);
          if (q.kind !== "grammar" && q.kind !== "reading" && q.kind !== "listening") throw new Error(q.kind);
          expect(q.item.level).toBe(level);
          expect(q.choices[q.answerIndex]).toBe(q.item.choices[q.item.answer]);
          expect([...q.choices].sort()).toEqual([...q.item.choices].sort());
        }
      }
    });

    it(`${name}: 그 급수의 문제를 다 쓰면 null`, () => {
      const random = seeded(3);
      const used = new Set<string>();
      let count = 0;
      for (;;) {
        const q = build("N5", bank, used, random);
        if (!q) break;
        q.keys.forEach((k) => used.add(k));
        count += 1;
      }
      const items = name === "grammar" ? bank.grammar : name === "reading" ? bank.reading : bank.listening;
      expect(count).toBe(items.filter((i) => i.level === "N5").length);
    });
  }

  it("보기 순서가 은행 순서 그대로만 나오지는 않는다", () => {
    const random = seeded(11);
    const positions = new Set<number>();
    for (let i = 0; i < 40; i++) positions.add(buildGrammarQuestion("N4", bank, new Set(), random)!.answerIndex);
    expect(positions.size).toBe(4);
  });
});

describe("문자(가나)", () => {
  it("청음 46자다", () => {
    expect(SEION_CELLS).toHaveLength(46);
  });

  it("히라가나와 가타카나를 번갈아 내고, 보기는 서로 다른 로마자다", () => {
    const random = seeded(5);
    const used = new Set<string>();
    for (let i = 0; i < 8; i++) {
      const q = buildKanaQuestion(SEION_CELLS, i, used, random)!;
      if (q.kind !== "kana") throw new Error(q.kind);
      expectWellFormed(q);
      expect(q.script).toBe(i % 2 === 0 ? "hiragana" : "katakana");
      const cell = SEION_CELLS.find((c) => c[q.script] === q.char)!;
      expect(q.choices[q.answerIndex]).toBe(cell.romaji);
      q.keys.forEach((k) => {
        expect(used.has(k)).toBe(false);
        used.add(k);
      });
    }
  });
});
