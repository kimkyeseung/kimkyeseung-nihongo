import type { JlptLevel } from "./jlpt";

/**
 * 커리큘럼의 단계. **`JlptLevel`이 아니다** — JLPT 공식 급수가 아닌 `"Pre-N5"`(문자부터
 * 배우는 준비 단계)가 앞에 하나 더 있다. 둘을 같은 타입으로 뭉개면 급수별 목표치 계산이나
 * 사전 조회에 `"Pre-N5"`가 흘러들어간다.
 */
export type CurriculumLevelId = "Pre-N5" | JlptLevel;

/** 쉬운 단계부터. 진도는 항상 이 순서로 나아간다. */
export const CURRICULUM_LEVELS: CurriculumLevelId[] = ["Pre-N5", "N5", "N4", "N3", "N2", "N1"];

export interface GrammarPoint {
  pattern: string;
  meaning: string;
  example: string;
  exampleReading: string;
  exampleTranslation: string;
}

/** Pre-N5 유닛에만 있는, 커리큘럼이 직접 들고 있는 단어. */
export interface CurriculumVocabItem {
  word: string;
  reading: string;
  meaning: string;
  emoji: string;
}

export interface CurriculumPhrase {
  phrase: string;
  reading: string;
  meaning: string;
}

/**
 * 유닛. Pre-N5와 N5~N1이 **서로 다른 필드를 쓴다** — Pre-N5는 `kanaFocus`/`vocabItems`/
 * `phrases`로 직접 내용을 들고 있고, N5~N1은 `kanjiFocus`/`vocabQuery`로 앱의 정적
 * 데이터를 가리키기만 한다. 그래서 양쪽 모두 옵셔널이다.
 */
export interface CurriculumUnit {
  unitNumber: number;
  title: string;
  canDoGoals: string[];
  vocabThemes: string[];
  grammarPoints: GrammarPoint[];
  kanaFocus?: string[];
  vocabItems?: CurriculumVocabItem[];
  phrases?: CurriculumPhrase[];
  kanjiFocus?: string[];
  vocabQuery?: { jlptLevel: JlptLevel; recommendedCount: number };
}

export interface CurriculumLevel {
  level: CurriculumLevelId;
  /** Pre-N5에만 있다. */
  displayName?: string;
  /** 화면에 띄우는 이름 — Pre-N5는 "🌱 일본어 첫걸음". 없으면 `level`을 그대로 쓴다. */
  uiLabel?: string;
  vocabTarget: number;
  kanjiTarget: number;
  summary: string;
  canDoOverview: string[];
  units: CurriculumUnit[];
}

export interface Curriculum {
  meta: { title: string; description: string; note: string; sources: string[] };
  levels: CurriculumLevel[];
}
