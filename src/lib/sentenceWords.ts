import { dictionary } from "./dictionary";
import type { WordEntry } from "../types/dictionary";

export interface SentenceSegment {
  text: string;
  word: WordEntry | null;
}

let wordIndex: Map<string, WordEntry[]> | null = null;
let maxWordLength = 1;

function buildIndex(): Map<string, WordEntry[]> {
  const index = new Map<string, WordEntry[]>();
  for (const entry of dictionary) {
    const list = index.get(entry.word);
    if (list) list.push(entry);
    else index.set(entry.word, [entry]);
    maxWordLength = Math.max(maxWordLength, entry.word.length);
  }
  return index;
}

function pickEntry(candidates: WordEntry[]): WordEntry {
  return candidates.find((c) => c.common) ?? candidates[0];
}

/**
 * LLM이 생성한 일본어 문장을 dictionary.json과 그리디 최장일치로 대조해 클릭 가능한
 * 단어/조사 구간으로 나눈다. furigana.ts의 annotateFurigana와 같은 방식이지만, 후리가나가
 * 없는 항목(조사 등)까지 전부 포함한 전체 사전을 쓰고 한 글자짜리 매치도 허용한다는 점이
 * 다르다(は/が/を 같은 조사가 대부분 한 글자라서). 사전에 없는 부분은 클릭 불가능한 원문
 * 그대로 남긴다 — 이 프로젝트 규칙상 단어 뜻은 LLM이 지어내면 안 되고 항상 정적 사전에서만
 * 조회해야 하기 때문이다.
 */
export function segmentSentenceIntoWords(text: string): SentenceSegment[] {
  wordIndex ??= buildIndex();

  const segments: SentenceSegment[] = [];
  let i = 0;
  while (i < text.length) {
    let matchedLen = 0;
    let matchedEntry: WordEntry | null = null;
    const upper = Math.min(maxWordLength, text.length - i);
    for (let len = upper; len >= 1; len--) {
      const candidate = text.slice(i, i + len);
      const list = wordIndex.get(candidate);
      if (list) {
        matchedEntry = pickEntry(list);
        matchedLen = len;
        break;
      }
    }
    if (matchedLen > 0) {
      segments.push({ text: text.slice(i, i + matchedLen), word: matchedEntry });
      i += matchedLen;
      continue;
    }
    const last = segments[segments.length - 1];
    if (last && last.word === null) last.text += text[i];
    else segments.push({ text: text[i], word: null });
    i += 1;
  }
  return segments;
}
