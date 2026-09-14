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
  senses: WordSense[];
}
