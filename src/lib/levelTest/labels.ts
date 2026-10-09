import type { LevelTestSection } from "../../types/levelTest";

// 영역 이름. 진단 결과 요약(history.ts)이 선생님 프롬프트용으로 쓰는데, 그 모듈은 기억 스토어를 거쳐
// 진입 청크에 들어가므로 출제 코드(run.ts → questions.ts)를 끌어오지 않도록 이름만 따로 뒀다.
export const SECTION_LABEL: Record<LevelTestSection, string> = {
  kana: "문자",
  vocab: "어휘",
  kanji: "한자",
  grammar: "문법",
  reading: "독해",
  listening: "청해",
};
