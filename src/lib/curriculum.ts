// 커리큘럼(JLPT N5~N1 + Pre-N5) 조회 헬퍼.
//
// **동적 import로 지연 로드한다** — 62KB짜리 정적 데이터라 대문 진입 청크에 그냥 넣으면
// 첫 화면이 그만큼 무거워진다. kanjivg.ts와 같은 방식이고, 부르는 쪽이 전부 비동기라
// React의 `use()`까지 쓸 필요는 없었다.
//
// **이 파일은 dictionary.ts를 import하지 않는다.** 하면 2.9MB짜리 사전 청크가 커리큘럼을
// 쓰는 모든 화면(대문 포함)에 딸려온다. 단어 추천은 사전을 이미 들고 있는 화면 쪽에서 한다.

import type {
  Curriculum,
  CurriculumLevel,
  CurriculumLevelId,
  CurriculumUnit,
} from "../types/curriculum";
import { CURRICULUM_LEVELS } from "../types/curriculum";

let curriculumPromise: Promise<Curriculum> | null = null;

export function loadCurriculum(): Promise<Curriculum> {
  curriculumPromise ??= import("../data/curriculum.json").then((m) => m.default as unknown as Curriculum);
  return curriculumPromise;
}

/** `"N5-3"` 같은 유닛 식별자. 진도 저장의 키라 **형식을 바꾸면 기존 진도가 날아간다.** */
export function unitKey(level: CurriculumLevelId, unitNumber: number): string {
  return `${level}-${unitNumber}`;
}

export function findLevel(curriculum: Curriculum, level: CurriculumLevelId): CurriculumLevel | undefined {
  return curriculum.levels.find((l) => l.level === level);
}

export function findUnit(
  curriculum: Curriculum,
  level: CurriculumLevelId,
  unitNumber: number
): CurriculumUnit | undefined {
  return findLevel(curriculum, level)?.units.find((u) => u.unitNumber === unitNumber);
}

/** 화면에 띄울 이름. Pre-N5는 "🌱 일본어 첫걸음"처럼 따로 붙은 라벨이 있다. */
export function levelLabel(level: CurriculumLevel): string {
  return level.uiLabel ?? level.level;
}

/**
 * 커리큘럼 전체를 쉬운 순서대로 한 줄로 편 목록. "다음 유닛"은 결국 이 순서에서 한 칸
 * 나아가는 일이라, 레벨 경계를 매번 따지지 않도록 미리 펴둔다.
 */
export function flattenUnits(
  curriculum: Curriculum
): { level: CurriculumLevelId; unit: CurriculumUnit }[] {
  const ordered: { level: CurriculumLevelId; unit: CurriculumUnit }[] = [];
  for (const levelId of CURRICULUM_LEVELS) {
    const level = findLevel(curriculum, levelId);
    if (!level) continue;
    // unitNumber를 믿지 말고 정렬한다 — 파일 순서가 바뀌어도 진도가 뒤집히지 않도록.
    for (const unit of [...level.units].sort((a, b) => a.unitNumber - b.unitNumber)) {
      ordered.push({ level: levelId, unit });
    }
  }
  return ordered;
}
