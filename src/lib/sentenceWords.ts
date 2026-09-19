import { dictionary } from "./dictionary";
import { getKanjiEntry } from "./kanji";
import type { Furigana, WordEntry } from "../types/dictionary";
import type { KanjiEntry } from "../types/kanji";

export interface SentenceSegment {
  text: string;
  word: WordEntry | null;
  /** word가 없을 때만: 활용형이라 사전 단어로는 안 잡히지만 그 글자 자체는 한자.json에 있는 경우. */
  kanji: KanjiEntry | null;
}

/** 표기(`word`)로 찾는 색인. 한자로 쓰인 자리는 여기서 잡힌다. */
let wordIndex: Map<string, WordEntry[]> | null = null;
/**
 * 읽기(`reading`)로 찾는 색인. **`usuallyKana`인 항목만 넣는다.**
 *
 * 없으면 가나로 쓰인 단어를 놓친다 (실제로 겪은 버그): `ため`는 사전에 `word: "為"` /
 * `reading: "ため"`로 들어 있어서 표기 색인만으로는 매치되지 않는다. 그러면 그리디가 길이
 * 1까지 내려가 **조동사 `た`를 집어서**, 「〜のため」의 ため를 눌렀는데 "과거를 나타냄"이 뜬다.
 *
 * 그렇다고 **모든 읽기를 넣으면 더 나빠진다 (실제로 해봤다).** 일본어의 활용 어미는 전부
 * 가나라서 온갖 명사의 읽기와 부딪힌다 — `します`가 `しま(縞)`+`す(酢)`로, `寝たほう`가
 * `たほう(他方)`로, `ました`가 `ます(増す)`+`した(舌)`로 잡혔다. `common`으로도 걸러지지
 * 않는다(전부 common이다).
 *
 * 그래서 JMDict의 `uk`(usually written using kana alone) 태그를 데이터로 가져와
 * (`build-dictionary.mjs`) **가나로 쓰는 단어만** 읽기로 찾게 했다. 為는 `uk`가 붙어 있고
 * 増す·舌·縞·栓·街·他方는 하나도 없다.
 */
let readingIndex: Map<string, WordEntry[]> | null = null;
let maxWordLength = 1;

/**
 * 읽기로는 찾지 않을 가나.
 *
 * `uk` 항목이라도 **활용 어미의 조각과 겹치는** 것들이 있다. 커리큘럼 예문 123개를 전수로
 * 훑어 실제로 잘못 잡힌 것만 담았다:
 * - `まし` → 増し : 「行きましょう」「見ました」의 ます 활용
 * - `まれ` → 稀 : 「踏まれました」의 수동형
 *
 * 나머지 매치(この·よう·ここ·ため·ください·せい·おかげ·たくさん…)는 전부 올바른 단어였다.
 *
 * **일반 규칙으로 풀려면 형태소 분석기가 필요하다** — 브라우저 안에서만 도는 이 앱에는
 * 과한 무게라, 실제로 부딪힌 것만 막는다. 새 오탐을 발견하면 여기에 한 줄 더할 것.
 */
const NOT_A_STANDALONE_READING = new Set(["まし", "まれ"]);

function addTo(index: Map<string, WordEntry[]>, key: string, entry: WordEntry) {
  const list = index.get(key);
  if (list) list.push(entry);
  else index.set(key, [entry]);
}

function buildIndexes() {
  const words = new Map<string, WordEntry[]>();
  const readings = new Map<string, WordEntry[]>();
  for (const entry of dictionary) {
    addTo(words, entry.word, entry);
    maxWordLength = Math.max(maxWordLength, entry.word.length);
    // 한 글자짜리 읽기는 넣지 않는다 — 활용 어미와 부딪히기만 한다. 為(す) 하나 때문에
    // 「です」·「ます」의 끝 글자가 전부 단어로 잡혔다.
    if (
      entry.usuallyKana &&
      entry.reading.length >= 2 &&
      entry.reading !== entry.word &&
      !NOT_A_STANDALONE_READING.has(entry.reading)
    ) {
      addTo(readings, entry.reading, entry);
      maxWordLength = Math.max(maxWordLength, entry.reading.length);
    }
  }
  wordIndex = words;
  readingIndex = readings;
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
  if (!wordIndex || !readingIndex) buildIndexes();

  const segments: SentenceSegment[] = [];
  let i = 0;
  while (i < text.length) {
    let matchedLen = 0;
    let matchedEntry: WordEntry | null = null;
    const upper = Math.min(maxWordLength, text.length - i);
    for (let len = upper; len >= 1; len--) {
      const candidate = text.slice(i, i + len);
      // **표기를 읽기보다 먼저 본다.** 같은 길이라면 한자로 쓰인 표기가 더 확실한 단서다
      // (읽기가 우연히 겹치는 다른 단어가 있을 수 있다). 길이는 언제나 긴 쪽이 이긴다.
      const list = wordIndex!.get(candidate) ?? readingIndex!.get(candidate);
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

/**
 * 이 조각 위에 덧씌울 후리가나. 없으면 null(원문을 글자 그대로 그린다).
 *
 * **표기가 정확히 같을 때만 돌려준다 (실제로 겪은 버그).** 사전 항목의 `furigana`는 그
 * **표제어의 표기**를 설명하는 것이라(為 → ruby:"為", rt:"ため"), 가나로 쓴 자리에 그대로
 * 그리면 화면의 문장이 바뀐다 — 읽기 색인을 넣은 직후 「〜のため、」가 「〜の為ため、」로,
 * 「ください」가 「下ください」로 렌더됐다. 사전 정보를 덧씌우는 것이지 원문을 고치는 게
 * 아니다(furigana.ts의 annotateFurigana와 같은 원칙).
 */
export function rubyFor(segment: SentenceSegment): Furigana[] | null {
  if (!segment.word?.furigana) return null;
  return segment.text === segment.word.word ? segment.word.furigana : null;
}
