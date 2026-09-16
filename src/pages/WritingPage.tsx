import { useCallback, useMemo, useState } from "react";
import JapaneseSuggestionList from "../components/JapaneseSuggestionList";
import LoadingMascot from "../components/LoadingMascot";
import PromptApiTroubleshootDialog from "../components/PromptApiTroubleshootDialog";
import PromptApiUnsupportedNotice from "../components/PromptApiUnsupportedNotice";
import WritingDiff from "../components/WritingDiff";
import { useJapaneseInput } from "../hooks/useJapaneseInput";
import { useLanguageModel } from "../hooks/useLanguageModel";
import { usePromptApiTroubleshoot } from "../hooks/usePromptApiTroubleshoot";
import {
  buildWritingCorrectionSystemPrompt,
  buildWritingCorrectionUserPrompt,
  parseCorrectionResponse,
  type WritingCorrectionOptions,
} from "../lib/writingCorrection";
import { useGamificationStore } from "../stores/gamificationStore";
import { useConfettiStore } from "../stores/confettiStore";
import { XP_REWARDS } from "../lib/xpRewards";

function OptionChip({
  label,
  active,
  onToggle,
}: {
  label: string;
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      className={`rounded-full border-2 px-4 py-2 text-sm font-bold sm:text-base ${
        active ? "border-primary bg-primary/10 text-primary" : "border-gray-100 bg-white text-gray-400"
      }`}
    >
      {label}
    </button>
  );
}

function WritingPage() {
  const recordProgress = useGamificationStore((s) => s.recordProgress);
  const celebrate = useConfettiStore((s) => s.celebrate);
  const { troubleshootError, reportError, dismissTroubleshoot } = usePromptApiTroubleshoot();
  const japaneseInput = useJapaneseInput<HTMLTextAreaElement>();
  const [submittedText, setSubmittedText] = useState<string | null>(null);
  const [rawResponse, setRawResponse] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [shake, setShake] = useState(false);
  // "한자 변환 제안" 칩은 체크 시 켜지는 긍정형 옵션이라, WritingCorrectionOptions가 받는
  // keepKanaChoice(부정형: 한자 변환 제안을 "받지 않기")로 넘길 때는 반전시켜야 한다.
  const [showKanjiSuggestions, setShowKanjiSuggestions] = useState(true);
  const [showSimilarSentences, setShowSimilarSentences] = useState(true);
  const [showAppliedExpressions, setShowAppliedExpressions] = useState(true);
  const [showMorePolite, setShowMorePolite] = useState(true);
  const [showMoreCasual, setShowMoreCasual] = useState(true);

  // 고정 지시문(옵션에 따라 달라짐)은 세션 생성 시점의 시스템 프롬프트로, 학습자가 매번
  // 쓰는 문장은 별도의 prompt() 호출로 분리한다 — 문장에 지시문이 섞여 들어와도 명령으로
  // 착각하지 않도록 하기 위함(프롬프트 인젝션 방지, writingCorrection.ts 주석 참고).
  // 옵션 체크박스를 바꾸면 시스템 프롬프트가 바뀌어 useLanguageModel이 세션을 새로 만든다.
  const options: WritingCorrectionOptions = useMemo(
    () => ({
      keepKanaChoice: !showKanjiSuggestions,
      showSimilarSentences,
      showAppliedExpressions,
      showMorePolite,
      showMoreCasual,
    }),
    [showKanjiSuggestions, showSimilarSentences, showAppliedExpressions, showMorePolite, showMoreCasual]
  );
  const systemPrompt = useMemo(() => buildWritingCorrectionSystemPrompt(options), [options]);
  const model = useLanguageModel(systemPrompt);

  const result = useMemo(
    () => (submittedText ? parseCorrectionResponse(rawResponse, submittedText) : null),
    [rawResponse, submittedText]
  );

  const handleSubmit = useCallback(async () => {
    const text = japaneseInput.value.trim();
    if (!text || isLoading) return;
    setSubmittedText(text);
    setRawResponse("");
    setIsLoading(true);
    recordProgress(XP_REWARDS.writingCorrection);
    try {
      let acc = "";
      for await (const chunk of model.promptStreaming(buildWritingCorrectionUserPrompt(text))) {
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
  }, [japaneseInput.value, isLoading, model, recordProgress, celebrate, reportError]);

  function handleReset() {
    japaneseInput.setValue("");
    setSubmittedText(null);
    setRawResponse("");
  }

  if (model.status === "checking") {
    return <p className="p-6 text-gray-400">Prompt API 지원 여부 확인 중...</p>;
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
      <div className="flex flex-wrap gap-2">
        <OptionChip
          label="한자 변환 제안"
          active={showKanjiSuggestions}
          onToggle={() => setShowKanjiSuggestions((v) => !v)}
        />
        <OptionChip
          label="비슷한 문장"
          active={showSimilarSentences}
          onToggle={() => setShowSimilarSentences((v) => !v)}
        />
        <OptionChip
          label="응용 표현"
          active={showAppliedExpressions}
          onToggle={() => setShowAppliedExpressions((v) => !v)}
        />
        <OptionChip
          label="더 정중한 표현"
          active={showMorePolite}
          onToggle={() => setShowMorePolite((v) => !v)}
        />
        <OptionChip
          label="더 친근한 표현"
          active={showMoreCasual}
          onToggle={() => setShowMoreCasual((v) => !v)}
        />
      </div>

      <h2 className="mt-4 text-xl text-primary">✏️ 작문 첨삭</h2>
      <p className="mt-1 text-sm text-gray-400">일본어 문장을 쓰면 문법과 표현을 첨삭해드려요.</p>

      <div className="relative mt-4">
        <textarea
          ref={japaneseInput.ref}
          defaultValue=""
          onFocus={() => japaneseInput.setShowSuggestions(true)}
          onBlur={() => setTimeout(() => japaneseInput.setShowSuggestions(false), 150)}
          onKeyDown={(e) => japaneseInput.handleSuggestionKeyDown(e)}
          placeholder="ここに日本語で文章を書いてください..."
          rows={4}
          className="w-full resize-none rounded-2xl border-2 border-gray-100 p-3 font-ja text-lg focus:border-primary/40 focus:outline-none"
        />
        {japaneseInput.showSuggestions && (
          <JapaneseSuggestionList
            suggestions={japaneseInput.suggestions}
            activeIndex={japaneseInput.activeIndex}
            onSelect={japaneseInput.selectSuggestion}
          />
        )}
      </div>

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
          disabled={!japaneseInput.value.trim() || isLoading}
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

          {result.grammarPoints.length > 0 && (
            <div className="mt-3 rounded-xl bg-info/5 p-3">
              <p className="text-xs font-bold text-info">💡 문법 포인트</p>
              <ul className="mt-2 flex flex-col gap-1.5">
                {result.grammarPoints.map((point, i) => (
                  <li key={i} className="font-ja text-sm text-gray-600">
                    {point}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.similarSentences.length > 0 && (
            <div className="mt-3 rounded-xl bg-primary/5 p-3">
              <p className="text-xs font-bold text-primary">📚 비슷한 문장</p>
              <ul className="mt-2 flex flex-col gap-1.5">
                {result.similarSentences.map((sentence, i) => (
                  <li key={i} className="font-ja text-sm text-gray-600">
                    {sentence}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.appliedExpressions.length > 0 && (
            <div className="mt-3 rounded-xl bg-accent/5 p-3">
              <p className="text-xs font-bold text-accent">🔧 응용 표현</p>
              <ul className="mt-2 flex flex-col gap-1.5">
                {result.appliedExpressions.map((expr, i) => (
                  <li key={i} className="font-ja text-sm text-gray-600">
                    {expr}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.morePolite && (
            <div className="mt-3 rounded-xl bg-gray-50 p-3">
              <p className="text-xs font-bold text-gray-500">🎩 더 정중한 표현</p>
              <p className="mt-2 font-ja text-sm text-gray-600">{result.morePolite}</p>
            </div>
          )}

          {result.moreCasual && (
            <div className="mt-3 rounded-xl bg-gray-50 p-3">
              <p className="text-xs font-bold text-gray-500">😊 더 친근한 표현</p>
              <p className="mt-2 font-ja text-sm text-gray-600">{result.moreCasual}</p>
            </div>
          )}
        </div>
      )}

      <PromptApiTroubleshootDialog error={troubleshootError} onClose={dismissTroubleshoot} />
    </div>
  );
}

export default WritingPage;
