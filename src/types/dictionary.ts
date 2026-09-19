import type { JlptLevel } from "./jlpt";

export interface Furigana {
  ruby: string;
  rt: string;
}

export interface WordSense {
  pos: string[];
  glosses: string[];
}

export interface WordEntry {
  id: string;
  word: string;
  reading: string;
  jlptLevel: JlptLevel;
  common: boolean;
  furigana: Furigana[] | null;
  pos: string[];
  meaning: string;
  /**
   * 한국어 뜻풀이. **없을 수 있다** — 한국어 위키낱말사전에 표기가 정확히 일치하는 항목이
   * 있을 때만 채워지고(전체의 약 47%), 그 외에는 영어 `meaning`으로 폴백해야 한다.
   * 왜 읽기로는 안 잇는지는 scripts/data/build-dictionary.mjs 주석 참고.
   */
  koreanMeaning?: string[];
  /**
   * JMDict의 `uk` — **표기는 한자인데 실제로는 가나로 쓰는 단어**(為 → ため). 문장을 단어로
   * 쪼갤 때 읽기로도 찾아야 하는 항목이고, 그 판단에만 쓴다(sentenceWords.ts 주석 참고).
   * 표기가 이미 가나면 붙지 않는다.
   */
  usuallyKana?: boolean;
  senses: WordSense[];
}
