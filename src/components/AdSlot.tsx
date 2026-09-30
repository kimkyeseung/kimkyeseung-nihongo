import { useEffect, useRef, useState } from "react";
import { AD_CLIENT } from "../lib/ads";

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

// 광고가 안 채워졌다고 판단하기까지 기다리는 시간. 광고 차단기가 스크립트를 막으면
// data-ad-status가 영영 안 붙으므로, 기다리던 빈 칸을 이 뒤에 접는다.
const FILL_TIMEOUT_MS = 8000;

type AdState = "pending" | "filled" | "hidden";

/**
 * 수동 광고 단위 하나. **자동 광고는 쓰지 않는다**(CLAUDE.md "배포" 절) — 넣을 자리를 골라
 * 이 컴포넌트를 둔다. 학습 흐름(대화·퀴즈·게임·시트) 안에는 두지 말 것.
 *
 * - 채워지기 전에는 높이를 잡아 둔다. 목록 한가운데서 광고가 늦게 부풀면 아래 항목이 밀려,
 *   누르려던 자리에 광고가 들어온다(실수 클릭 — 애드센스 정책 위반 사유다).
 * - 안 채워지면(`unfilled`)·차단되면·오프라인이면 칸을 접는다. 빈 네모를 남기지 않는다.
 * - `data-full-width-responsive`는 끈다. 켜면 폰에서 광고가 컨테이너 여백을 넘어 화면 폭까지
 *   늘어나는데, 이 앱은 스크롤 영역(`main`) 안이라 가로로 넘칠 수 있다.
 */
function AdSlot({ slot, className = "" }: { slot: string; className?: string }) {
  const insRef = useRef<HTMLModElement>(null);
  // StrictMode에서 effect가 두 번 돌아도 한 번만 push한다 — 두 번 하면 애드센스가
  // "이미 광고가 든 ins" 오류를 낸다. ref는 두 번의 실행 사이에 유지된다.
  const pushedRef = useRef(false);
  const [state, setState] = useState<AdState>("pending");
  // 오프라인(PWA)이면 요청조차 하지 않는다. 마운트 때 한 번만 본다.
  const [offline] = useState(() => navigator.onLine === false);

  useEffect(() => {
    const ins = insRef.current;
    if (!ins || offline) return;

    if (!pushedRef.current) {
      pushedRef.current = true;
      try {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
      } catch {
        // 실패하면 status가 안 붙으므로 아래 타이머가 접는다.
      }
    }

    // 애드센스는 결과를 ins의 data-ad-status("filled" | "unfilled")로 알려준다.
    const read = () => {
      const status = ins.dataset.adStatus;
      if (status === "filled") setState("filled");
      else if (status === "unfilled") setState("hidden");
    };
    const observer = new MutationObserver(read);
    observer.observe(ins, { attributes: true, attributeFilter: ["data-ad-status"] });
    read();
    const timer = window.setTimeout(() => {
      if (ins.dataset.adStatus !== "filled") setState("hidden");
    }, FILL_TIMEOUT_MS);

    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
    };
  }, [offline]);

  if (offline) return null;

  return (
    // 접을 때도 언마운트하지 않고 숨긴다 — 늦게 채워지면 observer가 다시 보여준다.
    <aside className={`${state === "hidden" ? "hidden" : ""} ${className}`} aria-label="광고">
      <p className="mb-1 text-center text-[10px] text-gray-300">광고</p>
      <ins
        ref={insRef}
        className={`adsbygoogle block ${state === "pending" ? "min-h-[250px] sm:min-h-[100px]" : ""}`}
        data-ad-client={AD_CLIENT}
        data-ad-slot={slot}
        data-ad-format="auto"
        data-full-width-responsive="false"
        // 개발 서버에서는 테스트 광고로 요청한다 — 실제 노출·클릭으로 잡히면 정책 위반이다.
        {...(import.meta.env.DEV ? { "data-adtest": "on" } : {})}
      />
    </aside>
  );
}

export default AdSlot;
