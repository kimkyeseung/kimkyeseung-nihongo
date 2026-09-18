import { Suspense } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Link, NavLink, useLocation, useOutlet } from "react-router-dom";
import GamificationBar from "./GamificationBar";
import Confetti from "./Confetti";
import BadgeWatcher from "./BadgeWatcher";
import ConversationSessionController from "./ConversationSessionController";
import LoadingMascot from "./LoadingMascot";
import PromptApiOnboardingDialog from "./PromptApiOnboardingDialog";

const NAV_ITEMS = [
  { to: "/gojuon", label: "오십음도", icon: "あ" },
  { to: "/dictionary", label: "사전", icon: "📖" },
  { to: "/kanji", label: "한자", icon: "漢" },
  { to: "/wordbook", label: "단어장", icon: "🗂️" },
  { to: "/conversation", label: "회화", icon: "💬" },
  { to: "/writing", label: "작문", icon: "✏️" },
  { to: "/teacher", label: "선생님", icon: "🧑‍🏫" },
] as const;

// react-router의 Outlet은 위치가 바뀌면 즉시 다음 페이지로 교체돼서, AnimatePresence가
// 이전 페이지를 붙잡고 exit 애니메이션을 재생할 기회가 없다. useOutlet()으로 현재
// 렌더된 엘리먼트를 직접 받아 location.pathname으로 키를 주면 이전 엘리먼트를 잠깐
// 더 들고 있다가 자연스럽게 사라지게 할 수 있다 (react-router + framer-motion 정석 패턴).
function AnimatedOutlet() {
  const location = useLocation();
  const element = useOutlet();

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location.pathname}
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

function Layout() {
  return (
    <div className="flex h-svh flex-col">
      <header className="flex items-center justify-between gap-2 border-b-4 border-primary/20 bg-white px-4 py-3 sm:px-6 sm:py-4">
        {/* 대문(`/`)은 하단 네비게이션에 넣지 않고 헤더 로고를 눌러 돌아가게 한다
            (스펙에 없는 페이지는 헤더 아이콘/링크로만 노출하는 프로젝트 규칙). */}
        <Link to="/" className="flex items-center gap-2" aria-label="대문으로">
          <span className="text-2xl">🗻</span>
          <h1 className="text-2xl text-primary">김계승 일본어</h1>
        </Link>
        <div className="flex items-center gap-2">
          <GamificationBar />
          <Link
            to="/about"
            aria-label="정보 및 출처"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-50 text-gray-400"
          >
            ⓘ
          </Link>
        </div>
      </header>

      {/* min-h-0가 없으면 flex-1 아이템이 내용물 높이만큼 계속 늘어나 버려서
          overflow-y-auto가 무용지물이 되고(자체 스크롤이 안 생김), 결과적으로
          페이지 전체가 스크롤되면서 하단 네비게이션이 화면 밖으로 밀려난다
          (flexbox의 잘 알려진 min-height:auto 기본값 문제). */}
      <main className="min-h-0 flex-1 overflow-y-auto">
        <AnimatedOutlet />
      </main>

      {/* 항목이 8개라 375px 화면에서는 한 칸이 40px대까지 좁아진다 — 고정 최소 너비(min-w-16)를
          주면 넘쳐서 마지막 항목이 잘리므로, flex-1 + min-w-0으로 화면을 8등분하고 라벨은
          줄바꿈 없이(whitespace-nowrap) 작은 글씨로 넣는다. 항목을 더 늘릴 거라면 이 계산을
          다시 할 것(라벨을 줄이거나 아이콘만 남기는 식). */}
      <nav className="flex gap-0.5 border-t-4 border-primary/20 bg-white px-1 py-2 sm:gap-1 sm:px-2">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex min-w-0 flex-1 flex-col items-center gap-1 rounded-2xl px-1 py-2 text-[11px] whitespace-nowrap sm:text-sm ${
                isActive ? "bg-primary/10 text-primary" : "text-gray-500"
              }`
            }
          >
            <span className="text-xl leading-none font-ja">{item.icon}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <Confetti />
      <BadgeWatcher />
      <PromptApiOnboardingDialog />
      <ConversationSessionController />
    </div>
  );
}

export default Layout;
