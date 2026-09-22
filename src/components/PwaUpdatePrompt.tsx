import { AnimatePresence, motion } from "framer-motion";
import { useRegisterSW } from "virtual:pwa-register/react";

/**
 * 새 배포가 감지되면 "새로고침할까요?" 토스트를 띄운다. Confetti/BadgeWatcher와 같은
 * "Layout에 상주하는 싱글턴" 패턴 — 평소엔 아무것도 그리지 않는다.
 *
 * 강제로 갈아치우지 않고 물어보는 이유: 회화·선생님 스트리밍 중이거나 2GB Gemma 모델을
 * 받는 중에 배포가 화면을 통째로 새로고침하면 안 된다(vite.config.ts의
 * `registerType: "prompt"`와 짝이다 — "2GB는 절대 자동으로 받지 않는다"와 같은 태도).
 */
function PwaUpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError(error) {
      console.error("[PWA] 서비스워커 등록 실패", error);
    },
  });

  return (
    <AnimatePresence>
      {needRefresh && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          className="fixed inset-x-4 bottom-20 z-50 flex items-center justify-between gap-3 rounded-2xl border-2 border-gray-100 bg-white px-4 py-3 shadow-lg sm:inset-x-auto sm:right-6 sm:w-80"
        >
          <p className="text-sm text-gray-700">새 버전이 있어요. 새로고침할까요?</p>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => setNeedRefresh(false)}
              className="rounded-full px-3 py-1.5 text-sm text-gray-400"
            >
              나중에
            </button>
            <button
              type="button"
              onClick={() => updateServiceWorker(true)}
              className="btn-press rounded-full bg-primary px-3 py-1.5 text-sm font-bold text-white"
              style={{ "--btn-shadow": "#3d9401" } as React.CSSProperties}
            >
              새로고침
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default PwaUpdatePrompt;
