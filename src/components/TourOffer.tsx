import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { TOUR_FIRST_STOP_STEP, shouldOfferTour } from "../lib/onboarding";
import { useGamificationStore } from "../stores/gamificationStore";
import { useGuidedTour } from "../stores/pageStateStore";

/**
 * 첫 학습을 마친 뒤 헤더 아래에 뜨는 한 줄 — "다른 기능도 둘러볼까요?".
 *
 * 예전엔 처음 들어오자마자 전체 화면 인사가 막았다. 아무것도 배우기 전이라 왜 봐야 하는지 약했고, 수업을 시작하려는 손을
 * 막았다. 그래서 **XP가 처음 생긴 뒤에**, 막지 않는 띠로 권한다. 레벨 진단을 먼저 끝낸 사람에게도 뜬다.
 * 화면 흐름 안의 띠라 입력창을 가리지 않는다(GemmaDownloadBar와 같은 자리).
 */
function TourOffer() {
  const { pathname } = useLocation();
  const done = useGuidedTour((s) => s.done);
  const eligible = useGuidedTour((s) => s.eligible);
  const active = useGuidedTour((s) => s.step !== null);
  const markEligible = useGuidedTour((s) => s.markEligible);
  const goTo = useGuidedTour((s) => s.goTo);
  const finish = useGuidedTour((s) => s.finish);
  const xp = useGamificationStore((s) => s.xp);

  // XP 0으로 앱을 본 사람만 권유 대상이다 — 기존 사용자는 XP가 이미 있어 여기에 걸리지 않는다.
  useEffect(() => {
    if (xp === 0 && !eligible && !done) markEligible();
  }, [xp, eligible, done, markEligible]);

  if (!shouldOfferTour({ done, active, eligible, xp, pathname })) return null;

  return (
    <div role="status" className="flex items-center gap-2 bg-primary/10 px-4 py-2 text-sm text-gray-700">
      <span className="min-w-0 flex-1">🧭 첫 걸음을 뗐어요! 다른 기능도 1분만 둘러볼까요?</span>
      <button
        onClick={() => goTo(TOUR_FIRST_STOP_STEP)}
        className="shrink-0 rounded-full bg-primary px-3 py-1 font-bold text-white"
      >
        둘러보기
      </button>
      <button onClick={finish} aria-label="둘러보기 권유 닫기" className="shrink-0 px-1 text-gray-400">
        ✕
      </button>
    </div>
  );
}

export default TourOffer;
