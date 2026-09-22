import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import GemmaEngineNotice from "../components/GemmaEngineNotice";
import JapaneseSuggestionList from "../components/JapaneseSuggestionList";
import LoadingMascot from "../components/LoadingMascot";
import PromptApiTroubleshootDialog from "../components/PromptApiTroubleshootDialog";
import PromptApiUnsupportedNotice from "../components/PromptApiUnsupportedNotice";
import SpeakButton from "../components/SpeakButton";
import WritingDiff from "../components/WritingDiff";
import { useJapaneseInput } from "../hooks/useJapaneseInput";
import { useAiModel } from "../hooks/useAiModel";
import { usePromptApiTroubleshoot } from "../hooks/usePromptApiTroubleshoot";
import {
  buildCorrectionRefusalResponse,
  buildWritingCorrectionSystemPrompt,
  buildWritingCorrectionUserPrompt,
  parseCorrectionResponse,
  type WritingCorrectionOptions,
  type WritingCorrectionResult,
} from "../lib/writingCorrection";
import { looksLikePromptLeak } from "../lib/promptSafety";
import { preserveLearnerScript } from "../lib/scriptPreference";
import { buildWritingCorrectionQuestion } from "../lib/teacherPrompts";
import { useGamificationStore } from "../stores/gamificationStore";
import { recordStudyEvent } from "../stores/learnerMemoryStore";
import { useConfettiStore } from "../stores/confettiStore";
import { useTeacherChatStore } from "../stores/teacherChatStore";
import { useWritingDraft, useWritingOptions } from "../stores/pageStateStore";
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

/**
 * "한자 변환 제안"이 꺼져 있으면 모델이 한자로 바꿔놓은 표기를 학습자가 쓴 대로 되돌린다.
 * 프롬프트로는 끝내 막지 못해서(writingCorrection.ts 주석 참고) 응답을 받은 뒤 코드로 고친다.
 */
function applyScriptPreference(
  result: WritingCorrectionResult,
  original: string,
  keepKanaChoice: boolean
): { result: WritingCorrectionResult; scriptReverted: boolean } {
  if (!keepKanaChoice) return { result, scriptReverted: false };
  const { text, reverted } = preserveLearnerScript(original, result.corrected);
  return { result: reverted ? { ...result, corrected: text } : result, scriptReverted: reverted };
}

function WritingPage() {
  const navigate = useNavigate();
  const requestQuestion = useTeacherChatStore((s) => s.requestQuestion);
  const recordProgress = useGamificationStore((s) => s.recordProgress);
  const celebrate = useConfettiStore((s) => s.celebrate);
  const { troubleshootError, reportError, dismissTroubleshoot } = usePromptApiTroubleshoot();
  // 쓰다 만 문장도 탭을 옮겼다 돌아오면 그대로 남아있도록 store 값으로 시작한다.
  const japaneseInput = useJapaneseInput<HTMLTextAreaElement>(8, useWritingDraft.getState().input);
  // 입력·결과·옵션 모두 페이지를 떠나도 남는다(pageStateStore 주석 참고). 스트리밍 도중
  // 페이지를 벗어나면 세션이 destroy되어 첨삭은 중단되지만, 이미 받은 만큼은 남는다.
  const submittedText = useWritingDraft((s) => s.submittedText);
  const rawResponse = useWritingDraft((s) => s.rawResponse);
  const isLoading = useWritingDraft((s) => s.isLoading);
  const startSubmission = useWritingDraft((s) => s.startSubmission);
  const setRawResponse = useWritingDraft((s) => s.setRawResponse);
  const finishSubmission = useWritingDraft((s) => s.finishSubmission);
  const resetDraft = useWritingDraft((s) => s.reset);
  const [shake, setShake] = useState(false);
  // "한자 변환 제안" 칩은 체크 시 켜지는 긍정형 옵션이라, WritingCorrectionOptions가 받는
  // keepKanaChoice(부정형: 한자 변환 제안을 "받지 않기")로 넘길 때는 반전시켜야 한다.
  const showKanjiSuggestions = useWritingOptions((s) => s.showKanjiSuggestions);
  const showSimilarSentences = useWritingOptions((s) => s.showSimilarSentences);
  const showAppliedExpressions = useWritingOptions((s) => s.showAppliedExpressions);
  const showMorePolite = useWritingOptions((s) => s.showMorePolite);
  const showMoreCasual = useWritingOptions((s) => s.showMoreCasual);
  const toggleOption = useWritingOptions((s) => s.toggle);
  const setDraftInput = useWritingDraft((s) => s.setInput);

  // 타이핑할 때마다 store에 옮겨 적어둔다(위 initialValue와 한 쌍).
  useEffect(() => {
    setDraftInput(japaneseInput.value);
  }, [japaneseInput.value, setDraftInput]);

  // 고정 지시문(옵션에 따라 달라짐)은 세션 생성 시점의 시스템 프롬프트로, 학습자가 매번
  // 쓰는 문장은 별도의 prompt() 호출로 분리한다 — 문장에 지시문이 섞여 들어와도 명령으로
  // 착각하지 않도록 하기 위함(프롬프트 인젝션 방지, writingCorrection.ts 주석 참고).
  // 옵션 체크박스를 바꾸면 시스템 프롬프트가 바뀌어 useAiModel이 세션을 새로 만든다.
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
  const model = useAiModel(systemPrompt);

  const { result, scriptReverted } = useMemo(() => {
    if (!submittedText) return { result: null, scriptReverted: false };
    return applyScriptPreference(
      parseCorrectionResponse(rawResponse, submittedText),
      submittedText,
      !showKanjiSuggestions
    );
  }, [rawResponse, submittedText, showKanjiSuggestions]);

  const handleSubmit = useCallback(async () => {
    const text = japaneseInput.value.trim();
    if (!text || isLoading) return;
    startSubmission(text);
    recordProgress(XP_REWARDS.writingCorrection);
    try {
      let acc = "";
      let blocked = false;
      for await (const chunk of model.promptStreaming(buildWritingCorrectionUserPrompt(text))) {
        acc += chunk;
        // 형식 가드(parseCorrectionResponse)만으로는 "### 수정문 한 줄 쓰고 그 아래에 지시문을
        // 적어라"를 못 막는다 — 선생님/회화와 같은 출력 가드를 여기에도 건다.
        if (looksLikePromptLeak(acc, systemPrompt)) {
          blocked = true;
          acc = buildCorrectionRefusalResponse(text);
          setRawResponse(acc);
          model.resetSession();
          break;
        }
        setRawResponse(acc);
      }
      // 거절한 응답에 축하/흔들림 피드백을 주면 첨삭이 된 것처럼 보이므로 건너뛴다.
      if (blocked) return;
      // 고칠 부분이 없으면(=정답) 축하 효과를, 있으면(=오답) 살짝 흔들리는 피드백을 준다.
      // 표기를 되돌리고 나면 "고칠 게 없는 문장"이 되는 경우가 있으니, 축하/흔들림 판정도
      // 화면에 보여줄 최종 수정문으로 한다.
      const { result: finalResult } = applyScriptPreference(
        parseCorrectionResponse(acc, text),
        text,
        !showKanjiSuggestions
      );
      if (finalResult.corrected.trim() === text.trim()) {
        recordStudyEvent({ type: "writing-clean", subject: text });
        celebrate();
      } else {
        // 지적 요지는 설명의 첫 줄만 남긴다 — 통째로 넣으면 선생님 프롬프트가 첨삭 전문으로
        // 뒤덮인다. 어차피 프롬프트에 들어가기 전에 sanitizeMemoryLine이 한 번 더 자른다.
        const point = (finalResult.grammarPoints[0] ?? finalResult.explanation.split("\n")[0] ?? "")
          .trim()
          .slice(0, 120);
        recordStudyEvent({ type: "writing-corrected", subject: text, detail: point || undefined });
        setShake(true);
        setTimeout(() => setShake(false), 500);
      }
    } catch (err) {
      resetDraft();
      reportError(err);
    } finally {
      finishSubmission();
    }
  }, [
    japaneseInput.value,
    isLoading,
    model,
    systemPrompt,
    recordProgress,
    celebrate,
    reportError,
    showKanjiSuggestions,
    startSubmission,
    setRawResponse,
    finishSubmission,
    resetDraft,
  ]);

  function handleReset() {
    japaneseInput.setValue("");
    resetDraft();
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

  // "unavailable"은 API 객체는 있는데 모델을 못 쓰는 상태다(Whale 등 크로미움 포크, 플래그 꺼짐).
  // 이걸 빼먹으면 화면은 멀쩡한데 보내는 순간 실패한다 — aiCapability.ts 주석 참고.
  if (model.status === "unsupported" || model.status === "unavailable") {
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
          onToggle={() => toggleOption("showKanjiSuggestions")}
        />
        <OptionChip
          label="비슷한 문장"
          active={showSimilarSentences}
          onToggle={() => toggleOption("showSimilarSentences")}
        />
        <OptionChip
          label="응용 표현"
          active={showAppliedExpressions}
          onToggle={() => toggleOption("showAppliedExpressions")}
        />
        <OptionChip
          label="더 정중한 표현"
          active={showMorePolite}
          onToggle={() => toggleOption("showMorePolite")}
        />
        <OptionChip
          label="더 친근한 표현"
          active={showMoreCasual}
          onToggle={() => toggleOption("showMoreCasual")}
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
            {scriptReverted && (
              <p className="mt-2 text-xs text-gray-400">
                ‘한자 변환 제안’이 꺼져 있어, 한자로 바뀐 표기는 원문 그대로 되돌렸어요.
              </p>
            )}
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
                    <SpeakButton text={sentence} label="비슷한 문장 발음 듣기" className="ml-1" />
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
                    <SpeakButton text={expr} label="응용 표현 발음 듣기" className="ml-1" />
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.morePolite && (
            <div className="mt-3 rounded-xl bg-gray-50 p-3">
              <p className="text-xs font-bold text-gray-500">🎩 더 정중한 표현</p>
              <p className="mt-2 font-ja text-sm text-gray-600">
                {result.morePolite}
                <SpeakButton text={result.morePolite} label="더 정중한 표현 발음 듣기" className="ml-1" />
              </p>
            </div>
          )}

          {result.moreCasual && (
            <div className="mt-3 rounded-xl bg-gray-50 p-3">
              <p className="text-xs font-bold text-gray-500">😊 더 친근한 표현</p>
              <p className="mt-2 font-ja text-sm text-gray-600">
                {result.moreCasual}
                <SpeakButton text={result.moreCasual} label="더 친근한 표현 발음 듣기" className="ml-1" />
              </p>
            </div>
          )}

          {/* 첨삭은 diff·표기 보정이 붙은 고정 형식 답이라 여기서 더 캐물을 수 없다 — 왜
              이렇게 고쳐야 하는지는 자유 대화가 되는 선생님 페이지로 넘긴다(원문·수정문을
              질문에 실어 보내 맥락을 잃지 않게 한다). */}
          <button
            onClick={() => {
              requestQuestion(buildWritingCorrectionQuestion(submittedText ?? "", result.corrected));
              navigate("/teacher");
            }}
            className="btn-press mt-4 w-full rounded-2xl bg-info/10 py-3 text-sm font-bold text-info"
          >
            🧑‍🏫 선생님에게 더 물어보기
          </button>
        </div>
      )}

      <PromptApiTroubleshootDialog error={troubleshootError} onClose={dismissTroubleshoot} />
    </div>
  );
}

export default WritingPage;
