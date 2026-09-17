import { useCallback, useMemo, useState } from "react";
import LoadingMascot from "../components/LoadingMascot";
import PromptApiTroubleshootDialog from "../components/PromptApiTroubleshootDialog";
import GemmaEngineNotice from "../components/GemmaEngineNotice";
import PromptApiUnsupportedNotice from "../components/PromptApiUnsupportedNotice";
import WritingDiff from "../components/WritingDiff";
import { useAiModel } from "../hooks/useAiModel";
import { usePromptApiTroubleshoot } from "../hooks/usePromptApiTroubleshoot";
import { buildWritingCorrectionPrompt, parseCorrectionResponse } from "../lib/writingCorrection";
import { useGamificationStore } from "../stores/gamificationStore";
import { useConfettiStore } from "../stores/confettiStore";
import { XP_REWARDS } from "../lib/xpRewards";

function WritingPage() {
  const model = useAiModel("");
  const recordProgress = useGamificationStore((s) => s.recordProgress);
  const celebrate = useConfettiStore((s) => s.celebrate);
  const { troubleshootError, reportError, dismissTroubleshoot } = usePromptApiTroubleshoot();
  const [input, setInput] = useState("");
  const [submittedText, setSubmittedText] = useState<string | null>(null);
  const [rawResponse, setRawResponse] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [shake, setShake] = useState(false);

  const result = useMemo(
    () => (submittedText ? parseCorrectionResponse(rawResponse, submittedText) : null),
    [rawResponse, submittedText]
  );

  const handleSubmit = useCallback(async () => {
    const text = input.trim();
    if (!text || isLoading) return;
    setSubmittedText(text);
    setRawResponse("");
    setIsLoading(true);
    recordProgress(XP_REWARDS.writingCorrection);
    try {
      let acc = "";
      for await (const chunk of model.promptStreaming(buildWritingCorrectionPrompt(text))) {
        acc += chunk;
        const snapshot = acc;
        setRawResponse(snapshot);
      }
      // 고칠 부분이 없으면(=정답) 축하 효과를, 있으면(=오답) 살짝 흔들리는 피드백을 준다.
      const finalResult = parseCorrectionResponse(acc, text);
      if (finalResult.corrected.trim() === text.trim()) {
        celebrate();
      } else {
        setShake(true);
        setTimeout(() => setShake(false), 500);
      }
    } catch (err) {
      setSubmittedText(null);
      reportError(err);
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, model, recordProgress, celebrate, reportError]);

  function handleReset() {
    setInput("");
    setSubmittedText(null);
    setRawResponse("");
  }

  if (model.status === "checking") {
    return <p className="p-6 text-gray-400">AI 준비 상태 확인 중...</p>;
  }

  // Gemma 4를 고른 상태에서 못 쓰는 경우는 원인(모델 없음 / WebGPU 없음)도 해결법도 달라서
  // Prompt API 안내와 다른 화면을 보여준다.
  if (model.engine === "gemma4" && (model.status === "model-missing" || model.status === "unsupported")) {
    return (
      <div>
        <h2 className="p-4 pb-0 text-xl text-primary sm:p-6 sm:pb-0">✏️ 작문 첨삭</h2>
        <GemmaEngineNotice reason={model.status} feature="작문 첨삭" />
      </div>
    );
  }

  if (model.status === "unsupported") {
    return (
      <div>
        <h2 className="p-4 pb-0 text-xl text-primary sm:p-6 sm:pb-0">✏️ 작문 첨삭</h2>
        <PromptApiUnsupportedNotice feature="작문 첨삭" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6">
      <h2 className="text-xl text-primary">✏️ 작문 첨삭</h2>
      <p className="mt-1 text-sm text-gray-400">일본어 문장을 쓰면 문법과 표현을 첨삭해드려요.</p>

      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="ここに日本語で文章を書いてください..."
        rows={4}
        className="mt-4 w-full resize-none rounded-2xl border-2 border-gray-100 p-3 font-ja text-lg focus:border-primary/40 focus:outline-none"
      />

      {/* Gemma 엔진 준비는 퍼센트가 없어서(모델을 GPU에 올리는 작업) 문구만 보여준다. */}
      {model.busyLabel && (
        <div className="mt-2">
          <LoadingMascot label={model.busyLabel} />
        </div>
      )}

      {model.downloadProgress !== null && (
        <div className="mt-2 text-xs text-gray-400">
          모델 다운로드 중... {Math.round(model.downloadProgress * 100)}%
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${model.downloadProgress * 100}%` }}
            />
          </div>
        </div>
      )}

      <div className="mt-3 flex gap-2">
        <button
          onClick={handleSubmit}
          disabled={!input.trim() || isLoading}
          className="btn-press flex-1 rounded-2xl bg-primary py-3 font-bold text-white disabled:bg-gray-200"
          style={{ "--btn-shadow": "#3d9401" } as React.CSSProperties}
        >
          {isLoading ? "첨삭 중..." : "첨삭받기"}
        </button>
        {submittedText && (
          <button onClick={handleReset} className="rounded-2xl bg-gray-100 px-4 py-3 text-gray-500">
            새 문장
          </button>
        )}
      </div>

      {isLoading && (
        <div className="mt-4">
          <LoadingMascot label="첨삭 중..." />
        </div>
      )}

      {result && (
        <div
          className={`mt-6 rounded-2xl border-2 border-gray-100 bg-white p-4 ${shake ? "animate-shake" : ""}`}
        >
          {result.formality && (
            <span className="rounded-full bg-info/10 px-3 py-1 text-xs text-info">{result.formality}</span>
          )}

          <div className="mt-3">
            <WritingDiff original={submittedText ?? ""} corrected={result.corrected} />
          </div>

          {result.explanation && (
            <p className="mt-4 whitespace-pre-wrap rounded-xl bg-gray-50 p-3 text-sm text-gray-600">
              {result.explanation}
            </p>
          )}
        </div>
      )}

      <PromptApiTroubleshootDialog error={troubleshootError} onClose={dismissTroubleshoot} />
    </div>
  );
}

export default WritingPage;
