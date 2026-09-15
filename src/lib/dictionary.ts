import dictionaryData from "../data/dictionary.json";
import type { WordEntry } from "../types/dictionary";

export const dictionary = dictionaryData as WordEntry[];

let kanjiIndex: Map<string, WordEntry[]> | null = null;

function buildKanjiIndex(): Map<string, WordEntry[]> {
  const index = new Map<string, WordEntry[]>();
  for (const entry of dictionary) {
    const seen = new Set<string>();
    for (const ch of entry.word) {
      if (seen.has(ch)) continue;
      seen.add(ch);
      const list = index.get(ch);
      if (list) list.push(entry);
      else index.set(ch, [entry]);
    }
  }
  return index;
}

/** 특정 한자가 포함된 단어를 자주 쓰이는 순으로 반환한다 (한자 상세 페이지의 "활용 단어"용). */
export function findWordsContainingKanji(kanji: string, limit = 4): WordEntry[] {
  kanjiIndex ??= buildKanjiIndex();
  const list = kanjiIndex.get(kanji) ?? [];
  return [...list].sort((a, b) => Number(b.common) - Number(a.common)).slice(0, limit);
}

export function findWordById(id: string): WordEntry | undefined {
  return dictionary.find((e) => e.id === id);
}

/**
 * 한자/가나/로마자(변환된 히라가나 기준)/영문 뜻으로 검색한다.
 * dictionary.json이 (2026-09 기준 8,405개 단어로) 크지 않아 매 검색마다 전체를 훑어도 충분히 빠르므로
 * 별도 인덱스 없이 배열 스캔으로 구현한다 (IndexedDB는 훨씬 큰 원본 데이터를 다룰 때를 위한 것).
 */
export function searchDictionary(query: string, limit = 8): WordEntry[] {
  const q = query.trim();
  if (!q) return [];
  const qLower = q.toLowerCase();

  const scored: { entry: WordEntry; score: number }[] = [];
  for (const entry of dictionary) {
    let score = 0;
    if (entry.word === q || entry.reading === q) score = 100;
    else if (entry.word.startsWith(q) || entry.reading.startsWith(q)) score = 80;
    else if (entry.word.includes(q) || entry.reading.includes(q)) score = 60;
    else if (entry.meaning.toLowerCase().includes(qLower)) score = 40;
    else if (entry.senses.some((s) => s.glosses.some((g) => g.toLowerCase().includes(qLower))))
      score = 20;

    if (score > 0) {
      scored.push({ entry, score: score + (entry.common ? 5 : 0) });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.entry);
}
