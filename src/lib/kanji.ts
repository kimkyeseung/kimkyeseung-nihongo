import kanjiData from "../data/kanji.json";
import type { KanjiEntry } from "../types/kanji";
import type { JlptLevel } from "../types/jlpt";

export const kanjiList = kanjiData as KanjiEntry[];

export function getKanjiByLevel(level: JlptLevel): KanjiEntry[] {
  return kanjiList.filter((k) => k.jlptLevel === level);
}
