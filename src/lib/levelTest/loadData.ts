import type { WordEntry } from "../../types/dictionary";
import type { KanjiEntry } from "../../types/kanji";
import type { LevelTestBank } from "../../types/levelTest";
import { buildVocabPool } from "./questions";
import type { LevelTestData } from "./run";

// 진단에 필요한 데이터(사전 7.7MB · 한자 · 문제 은행)를 **동적 import**로 받는다. 페이지 청크에
// 정적으로 넣으면 인사 화면조차 사전을 다 받은 뒤에 뜬다 — 사용자가 인사말을 읽는 동안 받는다.
// 한 번 받으면 모듈 Promise로 재사용하고, 실패하면 비워서 다시 시도할 수 있게 한다.

let pending: Promise<LevelTestData> | null = null;

export function loadLevelTestData(): Promise<LevelTestData> {
  pending ??= Promise.all([
    import("../../data/dictionary.json"),
    import("../../data/kanji.json"),
    import("../../data/level-test-bank.json"),
  ])
    .then(([dict, kanji, bank]) => {
      const dictionary = dict.default as unknown as WordEntry[];
      return {
        dictionary,
        kanjiList: kanji.default as unknown as KanjiEntry[],
        bank: bank.default as unknown as LevelTestBank,
        vocabPool: buildVocabPool(dictionary),
      };
    })
    .catch((error: unknown) => {
      pending = null;
      throw error;
    });
  return pending;
}
