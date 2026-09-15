import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import ChromeLink from "./ChromeLink";
import { isPromptApiSupported } from "../lib/languageModel";

const STORAGE_KEY = "promptApiNoticeDismissed";

function readDismissed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false; // localStorage 접근 불가(프라이빗 모드 등)해도 기능엔 지장 없음
  }
}

/**
 * 앱 첫 접속 시, 이 브라우저에 Chrome 온디바이스 AI(Prompt API)가 없으면
 * 다운로드 안내 다이얼로그를 한 번 보여준다. 실제 미지원 안내(회화/작문 페이지에서
 * 항상 보이는 것)는 PromptApiUnsupportedNotice가 따로 담당 — 이 다이얼로그는
 * "처음 켰을 때 한 번" 알려주는 용도라 localStorage로 재노출을 막는다.
 */
function PromptApiOnboardingDialog() {
  const [dismissed, setDismissed] = useState(readDismissed);
  const show = !dismissed && !isPromptApiSupported();

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
            <span className="text-4xl">🌐</span>
            <h3 className="mt-2 text-lg font-bold text-primary">Chrome 온디바이스 AI가 필요해요</h3>
            <p className="mt-3 text-left text-sm text-gray-600">
              회화 연습과 작문 첨삭 기능은 Chrome의 온디바이스 AI(Prompt API)를 사용해요. 지금
              브라우저에서는 이 기능이 지원되지 않는 것 같아요. 오십음도·사전·한자·단어장은 이
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
