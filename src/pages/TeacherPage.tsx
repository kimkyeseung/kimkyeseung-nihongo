import { useCallback, useEffect, useRef } from "react";
import type { KeyboardEvent } from "react";
import { motion } from "framer-motion";
import GemmaEngineNotice from "../components/GemmaEngineNotice";
import InputModeToggle from "../components/InputModeToggle";
import JapaneseSuggestionList from "../components/JapaneseSuggestionList";
import LoadingMascot from "../components/LoadingMascot";
import MarkdownAnswer from "../components/MarkdownAnswer";
import PromptApiTroubleshootDialog from "../components/PromptApiTroubleshootDialog";
import PromptApiUnsupportedNotice from "../components/PromptApiUnsupportedNotice";
import { useAiModel } from "../hooks/useAiModel";
import { usePromptApiTroubleshoot } from "../hooks/usePromptApiTroubleshoot";
import { useScriptInput, type InputScript } from "../hooks/useScriptInput";
import { useWordSuggestions } from "../hooks/useWordSuggestions";
import {
  TEACHER_REFUSAL_ANSWER,
  TEACHER_SAMPLE_QUESTIONS,
  TEACHER_SYSTEM_PROMPT,
  buildTeacherUserPrompt,
} from "../lib/teacherPrompts";
import { looksLikePromptLeak } from "../lib/promptSafety";
import { XP_REWARDS } from "../lib/xpRewards";
import { useInputScriptPrefs } from "../stores/pageStateStore";
import { useGamificationStore } from "../stores/gamificationStore";
import { useTeacherChatStore } from "../stores/teacherChatStore";

/** 보내기 버튼의 종이비행기. 이 프로젝트에 아이콘 세트가 없어 인라인 SVG로 둔다(currentColor 상속). */
function PaperPlaneIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-5 w-5" fill="currentColor">
      <path d="M3.4 20.4l17.45-7.48a1 1 0 000-1.84L3.4 3.6a1 1 0 00-1.39 1.02l1.2 5.4L14 12l-10.79 1.98-1.2 5.4a1 1 0 001.39 1.02z" />
    </svg>
  );
}

/** 지금 고른 문자로 예시를 보여준다 — 한글 예시만 띄우면 일본어 모드에서 어색하다. */
const QUESTION_PLACEHOLDER: Record<InputScript, string> = {
  default: "예: 조사 だけ에 대해서 알려줘",
  ja: "예: だけ について おしえて",
};

/**
 * 자유 질문 페이지. 회화가 "일본어로 롤플레이"라면 여기는 "한국어로 물어보는 수업"이다.
 * 답변은 마크다운으로 받아 MarkdownAnswer가 렌더링하고, 답변 속 일본어(백틱으로 감싼
 * 부분)에는 사전 후리가나와 단어 탭이 자동으로 붙는다.
 *
 * 질문 입력창의 기본은 한글이다 — 여기서 치는 건 한국어 질문이기 때문(회화/작문과 다른 점).
 * 다만 일본어로 묻고 싶을 수도 있어서 `InputModeToggle`로 문자를 바꿀 수 있고, "일본어"를
 * 고른 동안에만 wanakana가 붙는다(useScriptInput.ts 참고).
 */
function TeacherPage() {
  const model = useAiModel(TEACHER_SYSTEM_PROMPT);
  const { troubleshootError, reportError, dismissTroubleshoot } = usePromptApiTroubleshoot();
  const recordProgress = useGamificationStore((s) => s.recordProgress);

  const messages = useTeacherChatStore((s) => s.messages);
  const input = useTeacherChatStore((s) => s.input);
  const isAnswering = useTeacherChatStore((s) => s.isAnswering);
  const setInput = useTeacherChatStore((s) => s.setInput);
  const ask = useTeacherChatStore((s) => s.ask);
  const appendAnswer = useTeacherChatStore((s) => s.appendAnswer);
  const finishAnswer = useTeacherChatStore((s) => s.finishAnswer);
  const clear = useTeacherChatStore((s) => s.clear);
  const pendingQuestion = useTeacherChatStore((s) => s.pendingQuestion);
  const consumePendingQuestion = useTeacherChatStore((s) => s.consumePendingQuestion);

  const script = useInputScriptPrefs((s) => s.teacher);
  const setScript = useInputScriptPrefs((s) => s.setTeacher);
  const toggleScript = useInputScriptPrefs((s) => s.toggleTeacher);
  const questionInput = useScriptInput<HTMLInputElement>(script, input, setInput, toggleScript);
  // 사전 자동완성은 일본어를 칠 때만 의미가 있다 — 한글 질문에 사전을 뒤질 이유가 없다.
  const suggestions = useWordSuggestions(
    input,
    (next) => {
      setInput(next);
      questionInput.focus();
    },
    { enabled: script === "ja" }
  );

  const listEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleAsk = useCallback(
    async (question: string) => {
      const text = question.trim();
      if (!text || isAnswering) return;
      const { assistantId } = ask(text);
      recordProgress(XP_REWARDS.teacherQuestion);
      try {
        let acc = "";
        for await (const chunk of model.promptStreaming(buildTeacherUserPrompt(text))) {
          acc += chunk;
          // 지시문을 그대로 읊기 시작하면 거기서 끊는다 — 프롬프트로 "말하지 말라"고 시키는
          // 것만으로는 막히지 않아서, 받은 답을 코드에서 한 번 더 본다(promptSafety.ts 주석 참고).
          if (looksLikePromptLeak(acc, TEACHER_SYSTEM_PROMPT)) {
            appendAnswer(assistantId, TEACHER_REFUSAL_ANSWER);
            // 화면만 바꾸고 끝내면 오염된 턴이 히스토리에 남아 다음 질문에서 이어받을 수 있다.
            model.resetSession();
            return;
          }
          appendAnswer(assistantId, acc);
        }
      } catch (err) {
        appendAnswer(assistantId, "(답변을 만드는 중 오류가 발생했습니다)");
        reportError(err);
      } finally {
        finishAnswer();
      }
    },
    [isAnswering, ask, recordProgress, model, appendAnswer, finishAnswer, reportError]
  );

  // 회화 말풍선 등에서 "선생님" 버튼으로 넘어온 질문을 받아 바로 물어본다.
  useEffect(() => {
    const question = consumePendingQuestion();
    if (question) handleAsk(question);
  }, [pendingQuestion, consumePendingQuestion, handleAsk]);

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    // 자동완성 목록이 떠 있으면 화살표·Enter를 그쪽이 먼저 쓴다(회화 페이지와 같은 순서).
    if (suggestions.handleSuggestionKeyDown(e)) return;
    // 폼의 암묵적 제출 대신 onKeyDown으로 직접 처리한다(프로젝트 표준, CLAUDE.md 참고).
    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleAsk(input);
    }
  }

  if (model.status === "checking") {
    return <p className="p-6 text-gray-400">AI 준비 상태 확인 중...</p>;
  }

  if (model.engine === "gemma4" && (model.status === "model-missing" || model.status === "unsupported")) {
    return (
      <div>
        <h2 className="p-4 pb-0 text-xl text-primary sm:p-6 sm:pb-0">🧑‍🏫 선생님</h2>
        <GemmaEngineNotice reason={model.status} feature="선생님에게 질문하기" />
      </div>
    );
  }

  // "unavailable"은 API 객체는 있는데 모델을 못 쓰는 상태다(Whale 등 크로미움 포크, 플래그 꺼짐).
  // 이걸 빼먹으면 화면은 멀쩡한데 보내는 순간 실패한다 — aiCapability.ts 주석 참고.
  if (model.status === "unsupported" || model.status === "unavailable") {
    return (
      <div>
        <h2 className="p-4 pb-0 text-xl text-primary sm:p-6 sm:pb-0">🧑‍🏫 선생님</h2>
        <PromptApiUnsupportedNotice feature="선생님에게 질문하기" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-gray-100 p-3">
        <h2 className="text-lg text-primary">🧑‍🏫 선생님</h2>
        {messages.length > 0 && (
          <button onClick={clear} className="text-xs text-gray-400">
            대화 지우기
          </button>
        )}
      </div>

      {model.downloadProgress !== null && (
        <div className="p-3 text-xs text-gray-400">
          모델 다운로드 중... {Math.round(model.downloadProgress * 100)}%
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${model.downloadProgress * 100}%` }}
            />
          </div>
        </div>
      )}
      {model.busyLabel && (
        <div className="p-3">
          <LoadingMascot label={model.busyLabel} />
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-3">
        {messages.length === 0 && (
          <div className="mt-6 flex flex-col items-center gap-3">
            <p className="text-center text-sm text-gray-400">
              일본어에 대해 궁금한 걸 한국어로 물어보세요! 🗻
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {TEACHER_SAMPLE_QUESTIONS.map((question) => (
                <button
                  key={question}
                  onClick={() => handleAsk(question)}
                  className="rounded-full border-2 border-gray-100 bg-white px-3 py-1.5 text-sm text-gray-500"
                >
                  {question}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-3">
          {messages.map((m) => (
            <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className={
                  m.role === "user"
                    ? "max-w-[80%] rounded-2xl bg-primary px-4 py-2 text-white"
                    : "w-full rounded-2xl bg-gray-50 px-4 py-3 text-gray-800"
                }
              >
                {m.role === "assistant" && m.text === "" ? (
                  <LoadingMascot label="선생님이 생각하는 중..." />
                ) : m.role === "assistant" ? (
                  <MarkdownAnswer text={m.text} />
                ) : (
                  m.text
                )}
              </motion.div>
            </div>
          ))}
        </div>
        <div ref={listEndRef} />
      </div>

      {/* 답변을 받는 동안에는 입력 영역을 통째로 감춘다 — 어차피 보낼 수 없는 상태이고,
          "생각하는 중" 마스코트에 시선이 가도록 비워두는 편이 낫다. */}
      {!isAnswering && (
        <div className="border-t border-gray-100 p-3">
          <div className="flex justify-end pb-2">
            <InputModeToggle value={script} onChange={setScript} />
          </div>
          <div className="flex items-center gap-2">
            {/* 자동완성 목록이 이 칸을 기준으로 뜨므로 relative가 필요하다. */}
            <div className="relative min-w-0 flex-1">
              {/* value/onChange를 주지 않는다 — 값은 useScriptInput이 네이티브 리스너로 읽어
                  store에 올린다(변환이 바꾼 값을 React 합성 onChange가 놓치기 때문). */}
              <input
                ref={questionInput.ref}
                onFocus={() => suggestions.setShowSuggestions(true)}
                // 목록의 버튼을 누르는 순간 blur가 먼저 와서 목록이 사라지면 클릭이 죽는다.
                // (목록 쪽에서도 onMouseDown을 막지만, 여기서 한 박자 늦추는 게 회화 페이지와
                //  같은 방식이다.)
                onBlur={() => setTimeout(() => suggestions.setShowSuggestions(false), 150)}
                onKeyDown={handleKeyDown}
                placeholder={QUESTION_PLACEHOLDER[script]}
                className="w-full rounded-2xl border-2 border-gray-100 px-4 py-2 font-mixed focus:border-primary/40 focus:outline-none"
              />
              {suggestions.showSuggestions && (
                // 이 입력창은 화면 맨 아래에 붙어 있어서 목록을 위로 띄운다.
                <JapaneseSuggestionList
                  placement="above"
                  suggestions={suggestions.suggestions}
                  activeIndex={suggestions.activeIndex}
                  onSelect={suggestions.selectSuggestion}
                />
              )}
            </div>
            <button
              onClick={() => handleAsk(input)}
              disabled={!input.trim()}
              aria-label="질문 보내기"
              title="질문 보내기"
              className="btn-press flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary text-white disabled:bg-gray-200"
              style={{ ["--btn-shadow" as string]: "#3d9401" }}
            >
              <PaperPlaneIcon />
            </button>
          </div>
        </div>
      )}

      <PromptApiTroubleshootDialog error={troubleshootError} onClose={dismissTroubleshoot} />
    </div>
  );
}

export default TeacherPage;
