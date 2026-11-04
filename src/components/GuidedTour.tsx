import { useEffect, useLayoutEffect, useState } from "react";
import type { CSSProperties } from "react";
import { motion } from "framer-motion";
import { useLocation, useNavigate } from "react-router-dom";
import { useScrollLock } from "../hooks/useScrollLock";
import {
  TOUR_FIRST_STOP_STEP,
  TOUR_LAST_STEP,
  TOUR_STOPS,
  TOUR_WELCOME_STEP,
  needsPlacement,
  shouldOfferTour,
  tourStopForStep,
} from "../lib/onboarding";
import { useCurriculumStore } from "../stores/curriculumStore";
import { useGamificationStore } from "../stores/gamificationStore";
import { useLevelTestStore } from "../stores/levelTestStore";
import { useGuidedTour } from "../stores/pageStateStore";

const PRIMARY_BUTTON =
  "btn-press rounded-2xl bg-primary px-5 py-3 font-bold text-white";
const PRIMARY_SHADOW = { "--btn-shadow": "#3d9401" } as CSSProperties;

/**
 * 탭 하이라이트 자리. 하단 네비의 `data-tour`를 재서 그 위에 빈 칸을 올리고, 칸의 그림자로 나머지 화면을
 * 어둡게 한다(탭만 뚫려 보인다).
 */
function useTabRect(path: string | null) {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useLayoutEffect(() => {
    if (!path) {
      setRect(null);
      return;
    }
    function measure() {
      const el = document.querySelector(`[data-tour="${path}"]`);
      const next = el?.getBoundingClientRect() ?? null;
      // 화면 키보드가 떠서 네비가 숨으면 크기가 0이다 — 그때는 칸 없이 전체를 어둡게 한다.
      setRect(next && next.width > 0 ? next : null);
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [path]);

  return rect;
}

/**
 * 처음 온 사람에게 하단 네비의 일곱 페이지를 차례로 보여주는 안내. 실제 페이지로 옮겨 가며 설명하고,
 * 끝 카드에서 실력 진단을 권한다. 건너뛰면 그 자리에 남고, /about에서 다시 볼 수 있다.
 *
 * 떠 있는 동안 뒤쪽은 누를 수 없다 — 안내 중에 다른 탭으로 가 버리면 카드 내용과 화면이 어긋난다.
 * `PromptApiOnboardingDialog`(z-40)보다 아래에 둔다: AI를 못 쓰는 브라우저라는 안내를 먼저 읽어야 한다.
 */
function GuidedTour() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const step = useGuidedTour((s) => s.step);
  const done = useGuidedTour((s) => s.done);
  const goTo = useGuidedTour((s) => s.goTo);
  const finish = useGuidedTour((s) => s.finish);
  const xp = useGamificationStore((s) => s.xp);
  const levelTestCount = useLevelTestStore((s) => s.records.length);
  const startLevel = useCurriculumStore((s) => s.startLevel);

  const active = step !== null;
  const stop = active ? tourStopForStep(step) : null;
  const stopPath = stop?.path ?? null;
  const rect = useTabRect(stopPath);
  useScrollLock(active);

  useEffect(() => {
    if (shouldOfferTour({ done, active, xp, pathname })) goTo(TOUR_WELCOME_STEP);
  }, [done, active, xp, pathname, goTo]);

  // replace로 옮긴다 — 안 그러면 둘러본 뒤 뒤로가기가 일곱 페이지를 거꾸로 거슬러 올라간다.
  useEffect(() => {
    if (stopPath && pathname !== stopPath) navigate(stopPath, { replace: true });
  }, [stopPath, pathname, navigate]);

  useEffect(() => {
    if (!active) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        finish();
        return;
      }
      const current = useGuidedTour.getState().step;
      if (current === null) return;
      if (e.key === "ArrowRight" && current < TOUR_LAST_STEP) goTo(current + 1);
      if (e.key === "ArrowLeft" && current > TOUR_FIRST_STOP_STEP) goTo(current - 1);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active, finish, goTo]);

  const isLast = step === TOUR_LAST_STEP;
  const offerPlacement = isLast && needsPlacement({ levelTestCount, startLevel });

  // 닫을 때는 바로 없앤다. 예전엔 `AnimatePresence`로 사라지게 했는데, "진단 시작"처럼 닫으면서 페이지를
  // 옮기면 투명해진 막이 DOM에 남아 **화면 전체의 클릭을 막았다**(실제로 재현했다).
  if (!active) return null;

  return (
    <motion.div
      data-modal
      role="dialog"
      aria-modal="true"
      aria-labelledby="guided-tour-title"
      // 좁은 화면은 하단 네비 바로 위, 넓은 화면은 왼쪽 네비를 뺀 자리의 가운데.
      // 첫 인사는 가리킬 탭이 없으니 어느 화면에서나 한가운데.
      className={`fixed inset-0 z-35 flex justify-center overflow-hidden p-4 ${
        rect ? "items-end pb-(--tour-pb) lg:items-center lg:pb-4 lg:pl-56" : "items-center bg-black/50"
      }`}
      style={
        {
          "--tour-pb": rect ? `${Math.max(window.innerHeight - rect.top + 12, 16)}px` : "1rem",
        } as CSSProperties
      }
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      {rect && (
        <div
          aria-hidden
          className="pointer-events-none fixed rounded-2xl ring-4 ring-white"
          style={{
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
            boxShadow: "0 0 0 9999px rgb(0 0 0 / 0.5)",
          }}
        />
      )}

      <motion.div
        key={step}
        className="relative w-full max-w-sm rounded-3xl bg-white p-5 shadow-lg"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18 }}
      >
        {!stop ? (
          <div className="text-center">
            <span className="text-5xl">👋</span>
            <h3 id="guided-tour-title" className="mt-3 text-xl text-primary">
              처음 오셨군요, 반가워요!
            </h3>
            <p className="mt-2 text-sm text-gray-600">
              어디서 무엇을 할 수 있는지 1분만 같이 둘러볼까요?
            </p>
            <button
              autoFocus
              onClick={() => goTo(TOUR_FIRST_STOP_STEP)}
              className={`${PRIMARY_BUTTON} mt-5 w-full`}
              style={PRIMARY_SHADOW}
            >
              둘러보기
            </button>
            <button onClick={finish} className="mt-3 w-full py-1 text-sm text-gray-400">
              괜찮아요, 바로 시작할게요
            </button>
            <p className="mt-1 text-xs text-gray-400">나중에 ⓘ 메뉴에서 다시 볼 수 있어요.</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-gray-400">
                {step} / {TOUR_STOPS.length}
              </span>
              {!isLast && (
                <button onClick={finish} className="text-sm text-gray-400">
                  건너뛰기
                </button>
              )}
            </div>
            <h3 id="guided-tour-title" className="mt-1 flex items-center gap-2 text-xl text-primary">
              <span className="font-ja" aria-hidden>
                {stop.icon}
              </span>
              {stop.title}
            </h3>
            <ul className="mt-2 flex flex-col gap-1.5 font-mixed text-sm text-gray-600">
              {stop.lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>

            {offerPlacement && (
              <p className="mt-3 rounded-2xl bg-primary/5 px-3 py-2 text-sm text-gray-700">
                이제 다 봤어요! 먼저 실력을 진단하면 맞는 단계부터 시작할 수 있어요.
              </p>
            )}

            {offerPlacement ? (
              <>
                <button
                  autoFocus
                  onClick={() => {
                    finish();
                    navigate("/level");
                  }}
                  className={`${PRIMARY_BUTTON} mt-4 w-full`}
                  style={PRIMARY_SHADOW}
                >
                  🎯 10분 실력 진단 시작
                </button>
                <div className="mt-3 flex justify-between text-sm text-gray-400">
                  <button onClick={() => goTo(step - 1)} className="py-1">
                    ← 이전
                  </button>
                  <button onClick={finish} className="py-1">
                    나중에 할게요
                  </button>
                </div>
              </>
            ) : (
              <div className="mt-4 flex items-center justify-between gap-3">
                {step > TOUR_FIRST_STOP_STEP ? (
                  <button onClick={() => goTo(step - 1)} className="py-1 text-sm text-gray-400">
                    ← 이전
                  </button>
                ) : (
                  <span />
                )}
                <button
                  autoFocus
                  onClick={() => (isLast ? finish() : goTo(step + 1))}
                  className={PRIMARY_BUTTON}
                  style={PRIMARY_SHADOW}
                >
                  {isLast ? "완료" : "다음"}
                </button>
              </div>
            )}
          </>
        )}
      </motion.div>
    </motion.div>
  );
}

export default GuidedTour;
