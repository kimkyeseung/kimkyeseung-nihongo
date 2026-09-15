import { AnimatePresence, motion } from "framer-motion";
import { Link } from "react-router-dom";

/**
 * 회화/작문/단어 예문 등 LLM 호출이 런타임에 실패했을 때(예: NotSupportedError) 띄우는 다이얼로그.
 * 입력 중이던 내용을 지우지 않도록 페이지 이동 대신 다이얼로그로 안내하고, 원하면
 * 자가진단 페이지(/diagnostics)로 이동할 수 있게 링크만 준다 — 새 안내 UI를 또 만들지 말고
 * 이 컴포넌트를 재사용할 것.
 */
function PromptApiTroubleshootDialog({
  error,
  onClose,
}: {
  error: string | null;
  onClose: () => void;
}) {
  return (
    <AnimatePresence>
      {error && (
        <motion.div
          className="fixed inset-0 z-30 flex items-end justify-center bg-black/30 sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="w-full max-w-md rounded-t-3xl bg-white p-6 sm:rounded-3xl"
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-lg font-bold text-danger">⚠️ 온디바이스 AI 실행에 실패했습니다</p>
            <p className="mt-2 max-h-32 overflow-y-auto rounded-xl bg-gray-50 p-3 text-xs text-gray-500">
              {error}
            </p>
            <p className="mt-3 text-sm text-gray-600">
              브라우저 종류·버전·설정 문제일 가능성이 높습니다. 자가진단 페이지에서 원인을
              확인해보세요.
            </p>

            <Link
              to="/diagnostics"
              onClick={onClose}
              className="btn-press mt-4 block w-full rounded-2xl bg-primary py-3 text-center font-bold text-white"
              style={{ "--btn-shadow": "#3d9401" } as React.CSSProperties}
            >
              🩺 자가진단 페이지로 이동
            </Link>
            <button
              onClick={onClose}
              className="mt-2 w-full rounded-2xl bg-gray-100 py-3 text-sm text-gray-500"
            >
              닫기 (입력 내용 유지)
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default PromptApiTroubleshootDialog;
