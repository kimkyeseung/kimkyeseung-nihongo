import type { JlptLevel } from "./jlpt";

export interface KanjiEntry {
  kanji: string;
  jlptLevel: JlptLevel;
  strokeCount: number | null;
  grade: number | null;
  frequency: number | null;
  onyomi: string[];
  kunyomi: string[];
  koreanReading: string[];
  meaning: string[];
}
