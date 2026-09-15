import kanjiData from "../data/kanji.json";
import type { KanjiEntry } from "../types/kanji";
import type { JlptLevel } from "../types/jlpt";

export const kanjiList = kanjiData as KanjiEntry[];

const kanjiByChar = new Map(kanjiList.map((k) => [k.kanji, k]));

export function getKanjiByLevel(level: JlptLevel): KanjiEntry[] {
  return kanjiList.filter((k) => k.jlptLevel === level);
}

export function getKanjiEntry(char: string): KanjiEntry | undefined {
  return kanjiByChar.get(char);
}

// 단어를 이루는 글자가 전부 (한글 한자음을 아는) 한자일 때만 한자음 조합을 반환한다.
// 食べる처럼 가나가 섞인 고유어 형태는 한자어 독음 개념이 성립하지 않으므로 null.
export function getKoreanReadingForWord(word: string): string | null {
  const readings = [...word].map((ch) => kanjiByChar.get(ch)?.koreanReading[0]);
  if (readings.some((r) => !r)) return null;
  return readings.join("");
}
