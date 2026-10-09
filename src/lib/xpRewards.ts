// 학습 행동별 XP 보상. 한 곳에 모아둬야 나중에 밸런스 조정하기 쉽다.
export const XP_REWARDS = {
  gojuonPlayed: 1,
  kanjiLearned: 10,
  kanjiQuizCompleted: 5,
  kanjiWritingCompleted: 5,
  kanaSpeakingCompleted: 5,
  wordAdded: 5,
  sentenceAdded: 5,
  wordReviewed: 5,
  sentenceReviewed: 5,
  conversationMessage: 5,
  teacherQuestion: 5,
  writingCorrection: 10,
  exampleGenerated: 5,
  teacherPracticeCompleted: 5,
  // 선생님 `/test`(단원 점검)를 끝냈을 때. 예전 이름이 levelTestCompleted였는데 레벨 진단과 겹쳐 바꿨다.
  unitCheckCompleted: 10,
  // 레벨 진단(`/level`)을 끝까지 풀었을 때 — 하루 한 번까지만(levelTestStore.lastXpDay). 10~15분짜리라 크게 준다.
  levelTestCompleted: 20,
  conjugationDrillCompleted: 5,
  weakReviewCompleted: 5,
} as const;
