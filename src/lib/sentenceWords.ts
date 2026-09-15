import { dictionary } from "./dictionary";
import { getKanjiEntry } from "./kanji";
import type { WordEntry } from "../types/dictionary";
import type { KanjiEntry } from "../types/kanji";

export interface SentenceSegment {
  text: string;
  word: WordEntry | null;
  /** word가 없을 때만: 활용형이라 사전 단어로는 안 잡히지만 그 글자 자체는 한자.json에 있는 경우. */
  kanji: KanjiEntry | null;
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
 *
 * 단어로 안 잡히는 나머지 글자 중 한자(예: 활용형이라 사전 표제어와 형태가 다른 開いた의 開)는
 * kanji.json과 대조해 한 글자 단위로 한자 정보만이라도 조회할 수 있게 한다 — 단어 사전에 없다고
 * 아예 클릭 불가로 두면, 이미 한자 페이지에서 학습한 글자인데도 예문에서는 못 눌러보는 게 된다.
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
      segments.push({ text: text.slice(i, i + matchedLen), word: matchedEntry, kanji: null });
      i += matchedLen;
      continue;
    }

    const kanjiEntry = getKanjiEntry(text[i]);
    if (kanjiEntry) {
      segments.push({ text: text[i], word: null, kanji: kanjiEntry });
      i += 1;
      continue;
    }

    const last = segments[segments.length - 1];
    if (last && last.word === null && last.kanji === null) last.text += text[i];
    else segments.push({ text: text[i], word: null, kanji: null });
    i += 1;
  }
  return segments;
}
