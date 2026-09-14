export interface BadgeContext {
  xp: number;
  streak: number;
  wordbookCount: number;
  kanjiLearnedCount: number;
}

export interface Badge {
  id: string;
  emoji: string;
  label: string;
  description: string;
  isUnlocked: (ctx: BadgeContext) => boolean;
}

// 뱃지는 별도로 저장하지 않고 현재 상태(xp/스트릭/단어장/한자 학습 수)에서 매번 계산한다.
// 조건이 전부 "누적치가 기준 이상"이라 한 번 얻은 뱃지는 사실상 계속 유지된다.
export const BADGES: Badge[] = [
  {
    id: "first-step",
    emoji: "🌱",
    label: "첫 걸음",
    description: "학습 활동 시작하기",
    isUnlocked: (c) => c.xp > 0,
  },
  {
    id: "streak-3",
    emoji: "🔥",
    label: "3일 연속 학습",
    description: "3일 연속으로 학습하기",
    isUnlocked: (c) => c.streak >= 3,
  },
  {
    id: "streak-7",
    emoji: "🏆",
    label: "일주일 개근",
    description: "7일 연속으로 학습하기",
    isUnlocked: (c) => c.streak >= 7,
  },
  {
    id: "collector",
    emoji: "🗂️",
    label: "단어 수집가",
    description: "단어장에 단어 10개 모으기",
    isUnlocked: (c) => c.wordbookCount >= 10,
  },
  {
    id: "kanji-50",
    emoji: "🈴",
    label: "한자 마스터",
    description: "한자 50자 학습 완료하기",
    isUnlocked: (c) => c.kanjiLearnedCount >= 50,
  },
  {
    id: "xp-100",
    emoji: "⭐",
    label: "XP 100 달성",
    description: "누적 XP 100 모으기",
    isUnlocked: (c) => c.xp >= 100,
  },
];
