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
 * 목록에 한 줄로 보여줄 뜻. 한국어가 있으면 한국어를, 없으면 영어를 그대로 쓴다.
 *
 * 한국어 뜻은 전체의 약 47%에만 있다(scripts/data/build-dictionary.mjs 참고). 폴백 없이
 * 한국어만 보여주면 나머지 절반은 뜻이 빈 칸으로 보인다 — 반드시 이 함수를 거칠 것.
 */
export function displayMeaning(entry: WordEntry): string {
  return entry.koreanMeaning?.join(", ") ?? entry.meaning;
}

/**
 * 한국어 뜻풀이를 검색에 쓸 토막으로 자른다.
 *
 * `"머리에) 이다, 얹다"`처럼 한 뜻풀이에 여러 말이 쉼표로 묶여 있어서, 통째로 `includes`만
 * 하면 **음절만 겹쳐도 걸린다** — "물"로 검색했을 때 "물러나다"·"결합물"·"물체"가 먼저 나오고
 * 정작 `水`가 안 보였다. 쉼표·세미콜론으로 자르고, 앞에 붙은 괄호 설명(`"(마시는) 물"`)은
 * 떼어낸 형태도 같이 후보로 둔다.
 */
export function koreanTokens(koreanMeaning: string[]): string[] {
  const tokens: string[] = [];
  for (const meaning of koreanMeaning) {
    for (const raw of meaning.split(/[,;]/)) {
      const token = raw.trim();
      if (!token) continue;
      tokens.push(token);
      // "(마시는) 물" → "물", "(겸양어) 먹다" → "먹다"
      const stripped = token.replace(/^\([^)]*\)\s*/, "").trim();
      if (stripped && stripped !== token) tokens.push(stripped);
    }
  }
  return tokens;
}

/**
 * 한국어 뜻과 질의가 얼마나 맞는지. 0이면 안 맞음.
 *
 * **맨 앞 뜻을 우대한다** — 사전은 대표 뜻을 먼저 적으므로, "먹다"로 검색했을 때
 * `食べる`("먹다, 섭취하다")가 `飲む`("마시다, 먹다, …")보다 앞에 와야 자연스럽다.
 */
export function scoreKorean(koreanMeaning: string[] | undefined, q: string): number {
  if (!koreanMeaning) return 0;
  const tokens = koreanTokens(koreanMeaning);
  if (tokens[0] === q) return 52;
  if (tokens.some((t) => t === q)) return 50;
  if (tokens.some((t) => t.startsWith(q))) return 45;
  if (tokens.some((t) => t.includes(q))) return 42;
  return 0;
}

const LEVEL_ORDER: Record<string, number> = { N5: 0, N4: 1, N3: 2, N2: 3, N1: 4 };

/**
 * 한자/가나/로마자(변환된 히라가나 기준)/한국어 뜻/영문 뜻으로 검색한다.
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
    // 한국어 뜻은 영어 뜻보다 먼저 본다 — 한글로 검색했다면 찾는 건 그쪽이다.
    else if ((score = scoreKorean(entry.koreanMeaning, q))) {
      /* scoreKorean이 점수를 정했다 */
    } else if (entry.meaning.toLowerCase().includes(qLower)) score = 40;
    else if (entry.senses.some((s) => s.glosses.some((g) => g.toLowerCase().includes(qLower))))
      score = 20;

    if (score > 0) scored.push({ entry, score });
  }

  // 같은 점수대라면 흔한 단어와 낮은 급수를 먼저 — 초급 학습자가 찾는 건 대개 그쪽이다.
  // (예전엔 common에 +5점을 얹었는데, 점수에 섞으면 새 점수대를 추가할 때마다 경계가 어긋난다.)
  scored.sort(
    (a, b) =>
      b.score - a.score ||
      Number(b.entry.common) - Number(a.entry.common) ||
      LEVEL_ORDER[a.entry.jlptLevel] - LEVEL_ORDER[b.entry.jlptLevel]
  );
  return scored.slice(0, limit).map((s) => s.entry);
}
