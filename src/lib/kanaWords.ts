import kanaWordsData from "../data/kana-words.json";
import type { ScriptMode } from "../data/gojuon";

/** 오십음도 글자별 대표 단어. dictionary.json에서 미리 뽑아둔 것(scripts/data/build-kana-words.mjs). */
export interface KanaWord {
  id: string;
  word: string;
  reading: string;
  meaning: string;
  /** 한국어 뜻. 없을 수 있다 — WordEntry.koreanMeaning과 같은 규칙. */
  koreanMeaning?: string[];
}

const KANA_WORDS = kanaWordsData as Record<
  string,
  { hiragana: KanaWord[]; katakana: KanaWord[] }
>;

/**
 * 그 글자로 시작하는 대표 단어를 최대 5개 돌려준다. 가타카나를 보고 있으면 외래어를,
 * 히라가나를 보고 있으면 고유어/한자어를 우선하되, 그쪽 후보가 아예 없으면 다른 쪽이라도
 * 보여준다(예: 가타카나 ヌ로 시작하는 단어는 사전에 없어서 ぬの 등으로 대신한다).
 */
export function getKanaWords(hiragana: string, mode: ScriptMode): KanaWord[] {
  const pair = KANA_WORDS[hiragana];
  if (!pair) return [];
  const [preferred, fallback] =
    mode === "katakana" ? [pair.katakana, pair.hiragana] : [pair.hiragana, pair.katakana];
  return preferred.length > 0 ? preferred : fallback;
}
