import { dictionary } from "./dictionary";
import type { Furigana } from "../types/dictionary";

export interface FuriganaSegment {
  plain?: string;
  parts?: Furigana[];
}

let furiganaIndex: Map<string, Furigana[]> | null = null;
let maxWordLength = 1;

function buildIndex(): Map<string, Furigana[]> {
  const index = new Map<string, Furigana[]>();
  for (const entry of dictionary) {
    if (!entry.furigana || entry.furigana.length === 0) continue;
    if (!index.has(entry.word)) index.set(entry.word, entry.furigana);
    maxWordLength = Math.max(maxWordLength, entry.word.length);
  }
  return index;
}

/**
 * LLM이 생성한 일본어 텍스트를 사전(dictionary.json)의 후리가나 데이터와 대조해
 * 표시 가능한 세그먼트로 나눈다 (그리디 최장일치). LLM이 읽기를 지어내지 않도록
 * 후리가나는 항상 정적 데이터에서만 가져온다 — 사전에 없는 단어는 그냥 원문 그대로 둔다.
 */
export function annotateFurigana(text: string): FuriganaSegment[] {
  furiganaIndex ??= buildIndex();

  const segments: FuriganaSegment[] = [];
  let i = 0;
  while (i < text.length) {
    let matchedLen = 0;
    const upper = Math.min(maxWordLength, text.length - i);
    for (let len = upper; len >= 2; len--) {
      const candidate = text.slice(i, i + len);
      const parts = furiganaIndex.get(candidate);
      if (parts) {
        segments.push({ parts });
        matchedLen = len;
        break;
      }
    }
    if (matchedLen > 0) {
      i += matchedLen;
      continue;
    }
    const last = segments[segments.length - 1];
    if (last && last.plain !== undefined) last.plain += text[i];
    else segments.push({ plain: text[i] });
    i += 1;
  }
  return segments;
}
