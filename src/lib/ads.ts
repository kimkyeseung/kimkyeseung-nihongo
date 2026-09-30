// 애드센스 스크립트 자체는 index.html이 부른다. 게시자 ID를 바꾸면 index.html과 public/ads.txt도
// 같이 고칠 것.
export const AD_CLIENT = "ca-pub-3289333115172248";

/** 자리마다 광고 단위를 따로 둔다 — 그래야 콘솔 보고서에서 자리별로 비교할 수 있다. */
export const AD_SLOTS = {
  homeBottom: "6670611823",
  aboutBottom: "6843845526",
  dictionaryList: "1526096352",
} as const;
