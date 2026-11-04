// 처음 온 사람을 위한 판단과 문구 — 앱 둘러보기(`GuidedTour`)와 선생님 첫 방문 화면이 쓴다.
//
// 판단이 틀려도 콘솔은 조용하다: 몇 달 쓴 사람이 업데이트 뒤에 갑자기 튜토리얼에 막히거나, 진단까지 끝낸
// 사람이 "처음 오셨군요"를 듣는다. 그래서 순수 함수로 떼어 onboarding.test.ts가 고정한다.

export interface TourStop {
  /** 이 안내가 보여줄 하단 네비 탭. Layout의 `NAV_ITEMS`의 `to`와 같아야 그 탭에 불이 들어온다. */
  path: string;
  icon: string;
  title: string;
  lines: string[];
}

/**
 * 둘러보기 순서는 하단 네비 순서다. **선생님이 마지막인 것은 일부러다** — 끝 카드가 실력 진단을 권하고,
 * 그 뒤로 보이는 화면이 같은 말을 하는 선생님 첫 방문 화면이다.
 */
export const TOUR_STOPS: readonly TourStop[] = [
  {
    path: "/gojuon",
    icon: "あ",
    title: "오십음도",
    lines: [
      "히라가나·가타카나 표예요. 일본어가 처음이면 여기서 시작하세요.",
      "글자를 누르면 소리와 대표 단어가 나와요.",
      "🎤 2초 발음 게임으로 읽기 연습도 할 수 있어요.",
    ],
  },
  {
    path: "/dictionary",
    icon: "📖",
    title: "사전",
    lines: [
      "한자·가나·로마자·한국어 뜻, 어느 것으로든 찾을 수 있어요.",
      "단어를 열면 뜻과 활용형을 보고, 단어장에 담고, 예문도 만들 수 있어요.",
    ],
  },
  {
    path: "/kanji",
    icon: "漢",
    title: "한자",
    lines: [
      "JLPT 급수별 한자 목록이에요.",
      "한자를 누르면 읽는 법과 획순이 나오고, 직접 따라 써볼 수 있어요.",
      "아직 안 익힌 한자만 모아 테스트도 할 수 있어요.",
    ],
  },
  {
    path: "/wordbook",
    icon: "🗂️",
    title: "단어장",
    lines: [
      "사전에서 담은 단어와, 회화·선생님 답변에서 담은 문장이 모여요.",
      "복습할 때가 된 것만 카드로 나와요. 오른쪽은 알아요, 왼쪽은 모르겠어요.",
    ],
  },
  {
    path: "/conversation",
    icon: "💬",
    title: "회화",
    lines: [
      "카페 주문 같은 상황을 골라 AI 상대와 일본어로 대화해요.",
      "상대 문장의 단어를 누르면 뜻이 나오고, 번역과 문법 교정도 켤 수 있어요.",
    ],
  },
  {
    path: "/writing",
    icon: "✏️",
    title: "작문",
    lines: [
      "일본어로 쓰면 AI가 고쳐주고, 어디가 왜 틀렸는지 설명해줘요.",
      "로마자로 쳐도 히라가나로 바뀌어요.",
    ],
  },
  {
    path: "/teacher",
    icon: "🧑‍🏫",
    title: "선생님",
    lines: [
      "문법이든 표현이든, 궁금한 걸 한국어로 편하게 물어보세요.",
      "지금까지 공부한 기록을 보고 수준에 맞춰 설명해줘요.",
    ],
  },
];

/** 둘러보기 단계: 1부터가 `TOUR_STOPS`의 각 탭이다. */
export const TOUR_FIRST_STOP_STEP = 1;
export const TOUR_LAST_STEP = TOUR_STOPS.length;

/** 이 단계가 보여줄 탭. 범위 밖이면 null — 이때는 페이지를 옮기지 않는다. */
export function tourStopForStep(step: number): TourStop | null {
  return TOUR_STOPS[step - 1] ?? null;
}

/**
 * 둘러보기를 권할까 — **첫 학습 뒤에** 권한다. 아무것도 배우기 전에 설명부터 끼어들면 왜 봐야 하는지 약하다.
 *
 * - `eligible`: XP 0으로 앱을 본 적이 있는 사람. 이것 없이 "XP가 있으면"으로만 보면 기존 사용자 전원이 업데이트 뒤에
 *   권유를 받는다. 백업에서 되돌린 새 기기도 처음부터 XP가 있어 걸러진다.
 * - `xp > 0`: 첫 학습을 했다. 레벨 진단을 먼저 끝낸 사람도 여기로 온다(예전엔 빠졌다).
 * - **하단 네비 탭에서만 권한다.** 공유받은 단어 링크나 레벨 진단을 푸는 도중에 끼어들지 않는다.
 */
export function shouldOfferTour(opts: {
  done: boolean;
  active: boolean;
  eligible: boolean;
  xp: number;
  pathname: string;
}): boolean {
  if (opts.done || opts.active || !opts.eligible || opts.xp <= 0) return false;
  return TOUR_STOPS.some((stop) => stop.path === opts.pathname);
}

/**
 * 실력 진단을 권할 사람인가 — 진단도 안 봤고 시작 단계도 안 골랐다. 하나라도 했으면 수준을 이미 안다.
 * 둘러보기 끝 카드와 선생님 첫 방문 화면이 같은 기준을 쓴다.
 */
export function needsPlacement(opts: { levelTestCount: number; startLevel: string | null }): boolean {
  return opts.levelTestCount === 0 && opts.startLevel === null;
}

/**
 * 선생님 페이지에 처음 온 사람인가 — 그렇다면 "오늘은 뭐가 궁금하세요?" 대신 실력 진단을 권한다.
 *
 * `dates`에는 오늘이 **아직 말을 안 했어도 항상 들어 있다**(teacherChatStore의 `load`). 그래서 오늘을
 * 뺀 날짜와 오늘 메시지를 따로 본다 — `dates.length === 0`으로 보면 아무도 처음 온 사람이 안 된다.
 */
export function isNewTeacherLearner(opts: {
  dates: readonly string[];
  todayKey: string;
  todayMessageCount: number;
  levelTestCount: number;
  startLevel: string | null;
}): boolean {
  if (opts.todayMessageCount > 0) return false;
  if (opts.dates.some((date) => date !== opts.todayKey)) return false;
  return needsPlacement(opts);
}
