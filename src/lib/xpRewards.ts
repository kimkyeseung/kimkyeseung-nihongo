// 학습 행동별 XP 보상. 한 곳에 모아둬야 나중에 밸런스 조정하기 쉽다.
export const XP_REWARDS = {
  gojuonPlayed: 1,
  kanjiLearned: 10,
  kanjiQuizCompleted: 5,
  kanaSpeakingCompleted: 5,
  wordAdded: 5,
  sentenceAdded: 5,
  wordReviewed: 5,
  conversationMessage: 5,
  teacherQuestion: 5,
  writingCorrection: 10,
  exampleGenerated: 5,
  teacherPracticeCompleted: 5,
} as const;
