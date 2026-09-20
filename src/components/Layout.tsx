import { Suspense, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Link, useLocation, useNavigate, useOutlet } from "react-router-dom";
import { useDictionaryView } from "../stores/pageStateStore";
import { originFromState, planDictionaryTabMemory, wordPath } from "../lib/wordLink";
import GamificationBar from "./GamificationBar";
import Confetti from "./Confetti";
import BadgeWatcher from "./BadgeWatcher";
import ConversationSessionController from "./ConversationSessionController";
import GemmaDownloadBar from "./GemmaDownloadBar";
import LoadingMascot from "./LoadingMascot";
import PromptApiOnboardingDialog from "./PromptApiOnboardingDialog";

const NAV_ITEMS = [
  { to: "/gojuon", label: "오십음도", icon: "あ" },
  // `also`: 이 탭에 속하지만 주소가 다른 화면. 단어 상세(`/word/:id`)는 사전의 하위 주소가
  // 아니게 됐지만(lib/wordLink.ts) 탭으로는 여전히 사전 자리다 — 이게 없으면 단어를 보는
  // 동안 **어느 탭에도 불이 안 들어와** 지금 어디인지 알 수 없다.
  { to: "/dictionary", label: "사전", icon: "📖", also: "/word" },
  { to: "/kanji", label: "한자", icon: "漢" },
  { to: "/wordbook", label: "단어장", icon: "🗂️" },
  { to: "/conversation", label: "회화", icon: "💬" },
  { to: "/writing", label: "작문", icon: "✏️" },
  { to: "/teacher", label: "선생님", icon: "🧑‍🏫" },
] as const;

type NavItem = (typeof NAV_ITEMS)[number];

/**
 * 이 탭이 켜져 있는가. `NavLink`의 기본 매칭(하위 경로 포함)을 직접 계산한다 — 사전 탭은
 * 목적지가 "마지막으로 보던 단어"로 바뀌기 때문에 `to`만 보고 판단할 수 없다.
 */
function isNavActive(pathname: string, item: NavItem): boolean {
  const prefixes = "also" in item ? [item.to, item.also] : [item.to];
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

// react-router의 Outlet은 위치가 바뀌면 즉시 다음 페이지로 교체돼서, AnimatePresence가
// 이전 페이지를 붙잡고 exit 애니메이션을 재생할 기회가 없다. useOutlet()으로 현재
// 렌더된 엘리먼트를 직접 받아 location.pathname으로 키를 주면 이전 엘리먼트를 잠깐
// 더 들고 있다가 자연스럽게 사라지게 할 수 있다 (react-router + framer-motion 정석 패턴).
function AnimatedOutlet() {
  const location = useLocation();
  const element = useOutlet();

  return (
    <AnimatePresence mode="wait">
      {/* **`h-full`이 반드시 있어야 한다 (실제로 겪은 버그).** 이 래퍼가 높이를 안 가지면
          `height: auto`라, 선생님·회화처럼 루트에 `h-full`을 주고 **안쪽에 자기 스크롤 영역**을
          두는 페이지에서 그 100%가 기댈 곳이 없어 auto로 풀린다. 그러면 메시지 목록이 자기
          높이만큼 늘어나 버려서 목록 대신 **페이지 전체가 `main` 안에서 스크롤**되고, 아래
          붙어 있어야 할 입력창도 같이 밀려 내려간다(스트리밍 중 화면이 출렁이던 원인).
          길이가 긴 보통 페이지(오십음도·한자 목록 등)는 이 래퍼보다 커지면 그대로 넘쳐서
          예전처럼 `main`이 스크롤한다 — overflow를 막지 않았으므로 잘리지 않는다. */}
      <motion.div
        key={location.pathname}
        className="h-full"
        initial={{ opacity: 0, x: 12 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -12 }}
        transition={{ duration: 0.18, ease: "easeOut" }}
      >
        {/* 페이지는 router.tsx에서 lazy()로 나뉘어 있어, 처음 방문하는 라우트는
            청크를 내려받는 동안 잠깐 fallback을 보여준다 (이후 방문은 캐시되어 즉시 표시). */}
        <Suspense
          fallback={
            <div className="flex h-full items-center justify-center p-10">
              <LoadingMascot label="불러오는 중..." />
            </div>
          }
        >
          {element}
        </Suspense>
      </motion.div>
    </AnimatePresence>
  );
}

/**
 * 하단 네비게이션.
 *
 * 사전 탭만 목적지가 고정이 아니다 — 마지막으로 보던 단어가 있으면 그 단어로 돌아간다
 * (`lastWordId`, pageStateStore 주석). 이미 그 자리에 있으면 한 번 더 눌러 검색 목록으로
 * 내려올 수 있다. 모바일 탭바의 흔한 동작이고, 이게 없으면 단어를 보다가 다른 탭에 갔다
 * 왔을 때 읽던 단어가 매번 사라진다.
 */
function BottomNav() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const lastWordId = useDictionaryView((s) => s.lastWordId);

  return (
    /* 항목이 7개라 375px 화면에서는 한 칸이 40px대까지 좁아진다 — 고정 최소 너비(min-w-16)를
       주면 넘쳐서 마지막 항목이 잘리므로, flex-1 + min-w-0으로 화면을 n등분하고 라벨은
       줄바꿈 없이(whitespace-nowrap) 작은 글씨로 넣는다. 항목을 더 늘릴 거라면 이 계산을
       다시 할 것(라벨을 줄이거나 아이콘만 남기는 식). */
    <nav className="flex gap-0.5 border-t-4 border-primary/20 bg-white px-1 py-2 sm:gap-1 sm:px-2">
      {NAV_ITEMS.map((item) => {
        const isActive = isNavActive(pathname, item);
        const isDictionary = item.to === "/dictionary";
        const to = isDictionary && lastWordId ? wordPath(lastWordId) : item.to;

        return (
          <Link
            key={item.to}
            to={to}
            aria-current={isActive ? "page" : undefined}
            onClick={(e) => {
              // 이미 그 자리를 보고 있는데 또 눌렀다 = "목록으로 내려가고 싶다"는 뜻이다.
              if (isDictionary && pathname === to && to !== item.to) {
                e.preventDefault();
                navigate(item.to);
              }
            }}
            className={`flex min-w-0 flex-1 flex-col items-center gap-1 rounded-2xl px-1 py-2 text-[11px] whitespace-nowrap sm:text-sm ${
              isActive ? "bg-primary/10 text-primary" : "text-gray-500"
            }`}
          >
            <span className="text-xl leading-none font-ja">{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * 사전 탭의 "마지막 자리"를 경로 하나로 갱신한다 — **사전에서 들어간 단어만** 기억하고,
 * 검색 목록으로 돌아오면 지운다. 무엇을 기억할지는 `planDictionaryTabMemory`가 정한다.
 *
 * 페이지마다 effect를 심지 않고 여기 모은 이유는, 단어 상세로 가는 입구가 다섯 곳이고
 * 한 곳만 빠뜨려도 **콘솔은 조용한 채 그 경로로 들어간 단어만 기억이 안 되기** 때문이다.
 */
function useDictionaryTabMemory(location: ReturnType<typeof useLocation>) {
  const setLastWordId = useDictionaryView((s) => s.setLastWordId);
  const { pathname } = location;
  // 문자열로 좁혀서 effect 의존성에 넣는다 — location.state를 그대로 넣으면 모양만 같고
  // 참조가 다른 객체에 매번 다시 돌 수 있다.
  const originTo = originFromState(location.state).to;

  useEffect(() => {
    // 지금 값은 getState로 읽는다. 구독하면 이 effect가 자기가 쓴 값 때문에 또 돈다.
    const next = planDictionaryTabMemory(pathname, originTo, useDictionaryView.getState().lastWordId);
    if (next) setLastWordId(next.lastWordId);
  }, [pathname, originTo, setLastWordId]);
}

function Layout() {
  useDictionaryTabMemory(useLocation());

  return (
    <div className="flex h-svh flex-col">
      <header className="flex items-center justify-between gap-2 border-b-4 border-primary/20 bg-white px-4 py-3 sm:px-6 sm:py-4">
        {/* 대문(`/`)은 하단 네비게이션에 넣지 않고 헤더 로고를 눌러 돌아가게 한다
            (스펙에 없는 페이지는 헤더 아이콘/링크로만 노출하는 프로젝트 규칙). */}
        {/* 제목이 **두 줄로 접히지 않게** 막아둔다. 오른쪽 GamificationBar는 XP 자릿수가
            늘수록 넓어져서(⭐ 213 → ⭐ 12,345) 375px에서는 언젠가 제목을 밀어내는데, 두 줄이
            되면 헤더가 높아지고 h-svh 레이아웃의 스크롤 영역이 그만큼 줄어든다. 넘칠 때는
            줄바꿈 대신 말줄임으로 조용히 넘어간다.
            **헤더 아이콘은 둘(🧠·ⓘ)이 한계다** — 셋으로 늘렸더니 375px에서 제목이 7px 모자라
            잘렸다. 새 페이지는 /curriculum처럼 다른 페이지에서 링크로 잇는 쪽을 먼저 볼 것. */}
        <Link to="/" className="flex min-w-0 items-center gap-2" aria-label="대문으로">
          <span className="text-2xl">🗻</span>
          <h1 className="truncate text-2xl whitespace-nowrap text-primary">김계승 일본어</h1>
        </Link>
        <div className="flex items-center gap-2">
          <GamificationBar />
          {/* /memory도 /about과 같은 취급 — 스펙에 없는 페이지는 하단 네비에 욱여넣지 않고
              헤더 아이콘으로만 노출한다(네비는 이미 7칸이라 375px에서 자리도 없다).
              /curriculum은 여기 넣지 않는다(위 주석) — 대문의 "오늘의 학습" 카드와 /memory에서
              링크로 간다. */}
          <Link
            to="/memory"
            aria-label="선생님의 기억"
            title="선생님의 기억"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-50"
          >
            🧠
          </Link>
          <Link
            to="/about"
            aria-label="정보 및 출처"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-50 text-gray-400"
          >
            ⓘ
          </Link>
        </div>
      </header>

      {/* 2GB 모델을 받는 동안 어느 페이지에서나 보이는 띠. 받는 중이 아니면 아무것도 그리지
          않으므로 헤더 아래 공간을 차지하지 않는다 (h-svh 레이아웃이라 이게 중요하다 —
          빈 자리를 남기면 그만큼 main의 스크롤 영역이 줄어든다). */}
      <GemmaDownloadBar />

      {/* min-h-0가 없으면 flex-1 아이템이 내용물 높이만큼 계속 늘어나 버려서
          overflow-y-auto가 무용지물이 되고(자체 스크롤이 안 생김), 결과적으로
          페이지 전체가 스크롤되면서 하단 네비게이션이 화면 밖으로 밀려난다
          (flexbox의 잘 알려진 min-height:auto 기본값 문제). */}
      <main className="min-h-0 flex-1 overflow-y-auto">
        <AnimatedOutlet />
      </main>

      {/* 항목이 7개라 375px 화면에서는 한 칸이 40px대까지 좁아진다 — 고정 최소 너비(min-w-16)를
          주면 넘쳐서 마지막 항목이 잘리므로, flex-1 + min-w-0으로 화면을 n등분하고 라벨은
          줄바꿈 없이(whitespace-nowrap) 작은 글씨로 넣는다. 항목을 더 늘릴 거라면 이 계산을
          다시 할 것(라벨을 줄이거나 아이콘만 남기는 식). */}
      <BottomNav />

      <Confetti />
      <BadgeWatcher />
      <PromptApiOnboardingDialog />
      <ConversationSessionController />
    </div>
  );
}

export default Layout;
