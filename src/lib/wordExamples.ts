import { JLPT_LEVELS } from "../types/jlpt";
import type { WordEntry } from "../types/dictionary";

const EXAMPLE_COUNT = 3;

export type ExampleDifficulty = "easier" | "harder";

/** 단어 자체의 JLPT 급수를 기준으로 한 단계 쉽게/어렵게 이동한 급수(양 끝은 고정). */
function shiftJlptLevel(level: WordEntry["jlptLevel"], direction: ExampleDifficulty) {
  const idx = JLPT_LEVELS.indexOf(level);
  const delta = direction === "easier" ? 1 : -1; // 배열은 N5(쉬움) -> N1(어려움) 순
  const next = Math.min(JLPT_LEVELS.length - 1, Math.max(0, idx + delta));
  return JLPT_LEVELS[next];
}

export function buildExamplePrompt(entry: WordEntry, difficulty?: ExampleDifficulty): string {
  const difficultyLine =
    difficulty === "easier"
      ? `방금 예문들보다 쉬운 난이도(${shiftJlptLevel(entry.jlptLevel, "easier")} 수준 어휘/짧고 기초적인 문형)로 만드세요.`
      : difficulty === "harder"
        ? `방금 예문들보다 어려운 난이도(${shiftJlptLevel(entry.jlptLevel, "harder")} 수준 어휘/복잡한 문형이나 관용 표현 포함)로 만드세요.`
        : null;

  return [
    "당신은 일본어 학습자를 위한 예문 작성 선생님입니다.",
    `아래 단어를 실제로 활용한 자연스러운 일본어 예문을 ${EXAMPLE_COUNT}개 만드세요.`,
    `단어: ${entry.word}(${entry.reading}) - 뜻: ${entry.meaning}`,
    difficultyLine,
    "다른 설명 없이 반드시 아래 형식을 예문마다 반복해서 답하세요:",
    "### 예문",
    "(일본어 문장 전체)",
    "### 번역",
    "(그 문장의 한국어 번역)",
    "",
    `이 "### 예문"/"### 번역" 쌍을 정확히 ${EXAMPLE_COUNT}번 반복하세요.`,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

export interface WordExample {
  japanese: string;
  korean: string;
}

/** 모델이 지정한 포맷을 안 따르면(예: 스텁/구형 모델) 안 깨지도록, 매치 실패 시 전체 응답을 예문 하나로 폴백한다. */
export function parseExampleResponse(raw: string): WordExample[] {
  const blocks = raw.split(/###\s*예문/).slice(1);
  const examples: WordExample[] = [];
  for (const block of blocks) {
    const translationMatch = block.match(/###\s*번역\s*\n?([\s\S]*?)(?=###|$)/);
    const japanese = (translationMatch ? block.slice(0, translationMatch.index) : block).trim();
    const korean = translationMatch?.[1]?.trim() ?? "";
    if (japanese) examples.push({ japanese, korean });
  }
  if (examples.length === 0 && raw.trim()) {
    examples.push({ japanese: raw.trim(), korean: "" });
  }
  return examples;
}
