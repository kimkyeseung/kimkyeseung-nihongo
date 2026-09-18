import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Link } from "react-router-dom";
import ChromeLink from "./ChromeLink";
import { GEMMA_MODEL, formatBytes } from "../lib/gemmaModel";
import { MOBILE_DOWNLOAD_WARNING, builtinUnavailableReason } from "../lib/aiCapability";
import { useAiCapability } from "../hooks/useAiCapability";

const STORAGE_KEY = "promptApiNoticeDismissed";

function readDismissed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false; // localStorage 접근 불가(프라이빗 모드 등)해도 기능엔 지장 없음
  }
}

/**
 * 앱 첫 접속 시, 이 브라우저에서 회화·작문·선생님을 **쓸 수 없을 때만** 한 번 안내한다.
 *
 * 내장 AI가 되는 사용자에게는 뜨지 않는다 — 이미 잘 돌아가는 사람을 첫 화면부터 막지 않기
 * 위해서고, 그 경우의 Gemma 권유는 대문의 `GemmaModelCard`가 배지로 맡는다.
 *
 * 안내 내용은 `useAiCapability()`의 확정 판단을 따른다(aiCapability.ts 참고):
 * Gemma를 쓸 수 있으면 Gemma로 유도하고, 그것도 안 될 때만 Chrome Canary를 권한다.
 * **여기서 곧장 Chrome을 권하지 말 것** — Safari 26·Firefox 사용자에게 잘못된 안내가 된다.
 *
 * 실제 미지원 안내(회화·작문·선생님 페이지에서 항상 보이는 것)는 PromptApiUnsupportedNotice가
 * 따로 담당 — 이 다이얼로그는 "처음 켰을 때 한 번"이라 localStorage로 재노출을 막는다.
 */
function PromptApiOnboardingDialog() {
  const [dismissed, setDismissed] = useState(readDismissed);
  // 확정 전(null)에는 띄우지 않는다 — Whale처럼 API 객체만 있는 브라우저에서 엉뚱한 안내가
  // 한 번 번쩍이고 사라지는 것을 막기 위해서다.
  const capability = useAiCapability();
  const show = !dismissed && capability !== null && capability.path !== "builtin-ready";
  const canUseGemma = capability?.path === "gemma-required";

  function handleClose() {
    setDismissed(true);
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // 저장 실패해도 그냥 이번 세션에서만 다시 안 뜨면 충분
    }
  }

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={handleClose}
        >
          <motion.div
            className="w-full max-w-sm rounded-3xl bg-white p-6 text-center"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            {canUseGemma ? (
              <>
                <span className="text-4xl">🧠</span>
                <h3 className="mt-2 text-lg font-bold text-info">
                  이 브라우저에서도 쓸 수 있어요
                </h3>
                <p className="mt-3 text-left text-sm text-gray-600">
                  회화 연습·작문 첨삭·선생님에게 질문에는 AI가 필요한데, {capability && builtinUnavailableReason(capability)}{" "}
                  대신 {GEMMA_MODEL.label} 모델을 한 번 내려받으면 이 브라우저에서 그대로 쓸 수
                  있어요.
                </p>
                <ul className="mt-3 list-disc space-y-1 pl-5 text-left text-sm text-gray-600">
                  <li>
                    크기 <strong>{formatBytes(GEMMA_MODEL.bytes)}</strong> — 한 번만 받으면 저장돼서
                    다음부터는 오프라인으로 동작해요
                  </li>
                  <li>그래픽 카드(WebGPU)로 실행되며, GPU 메모리가 약 1.8GB 필요해요</li>
                  <li>데이터 요금제에서는 주의하세요</li>
                </ul>
                {capability?.isMobile && (
                  <p className="mt-2 rounded-2xl bg-warning/10 p-2 text-left text-xs text-gray-600">
                    ⚠️ {MOBILE_DOWNLOAD_WARNING}
                  </p>
                )}
                <p className="mt-3 text-left text-sm text-gray-400">
                  오십음도·사전·한자·단어장은 지금 그대로 사용할 수 있어요.
                </p>
                <Link
                  to="/"
                  onClick={handleClose}
                  className="btn-press mt-4 block rounded-2xl bg-info py-3 font-bold text-white"
                  style={{ "--btn-shadow": "rgb(0 0 0 / 0.2)" } as React.CSSProperties}
                >
                  대문에서 모델 받기
                </Link>
              </>
            ) : (
              <>
                <span className="text-4xl">🌐</span>
                <h3 className="mt-2 text-lg font-bold text-primary">
                  회화·작문·선생님에는 다른 브라우저가 필요해요
                </h3>
                <p className="mt-3 text-left text-sm text-gray-600">
                  {capability && builtinUnavailableReason(capability)} 모델을 직접 받아 실행하는
                  방법도 쓸 수 없어요 (WebGPU 미지원). 오십음도·사전·한자·단어장은 이
                  브라우저에서도 그대로 사용할 수 있어요.
                </p>
                <ol className="mt-3 list-decimal space-y-1 pl-5 text-left text-sm text-gray-600">
                  <li>아래 버튼으로 Chrome Canary 설치</li>
                  <li>
                    <ChromeLink path="flags" />에서 관련 플래그를 켠 뒤 재시작
                  </li>
                </ol>
                <a
                  href="https://www.google.com/chrome/canary/"
                  target="_blank"
                  rel="noreferrer"
                  className="btn-press mt-4 block rounded-2xl bg-primary py-3 font-bold text-white"
                  style={{ "--btn-shadow": "#3d9401" } as React.CSSProperties}
                >
                  Chrome Canary 다운로드
                </a>
              </>
            )}
            <button
              onClick={handleClose}
              className="mt-2 w-full rounded-2xl bg-gray-100 py-2 text-sm text-gray-500"
            >
              나중에 하기
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default PromptApiOnboardingDialog;
