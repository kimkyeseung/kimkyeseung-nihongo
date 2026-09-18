import { useCallback, useEffect, useRef } from "react";
import type { KeyboardEvent } from "react";
import { motion } from "framer-motion";
import GemmaEngineNotice from "../components/GemmaEngineNotice";
import LoadingMascot from "../components/LoadingMascot";
import MarkdownAnswer from "../components/MarkdownAnswer";
import PromptApiTroubleshootDialog from "../components/PromptApiTroubleshootDialog";
import PromptApiUnsupportedNotice from "../components/PromptApiUnsupportedNotice";
import { useAiModel } from "../hooks/useAiModel";
import { usePromptApiTroubleshoot } from "../hooks/usePromptApiTroubleshoot";
import {
  TEACHER_REFUSAL_ANSWER,
  TEACHER_SAMPLE_QUESTIONS,
  TEACHER_SYSTEM_PROMPT,
  buildTeacherUserPrompt,
} from "../lib/teacherPrompts";
import { looksLikePromptLeak } from "../lib/promptSafety";
import { XP_REWARDS } from "../lib/xpRewards";
import { useGamificationStore } from "../stores/gamificationStore";
import { useTeacherChatStore } from "../stores/teacherChatStore";

/**
 * 자유 질문 페이지. 회화가 "일본어로 롤플레이"라면 여기는 "한국어로 물어보는 수업"이다.
 * 답변은 마크다운으로 받아 MarkdownAnswer가 렌더링하고, 답변 속 일본어(백틱으로 감싼
 * 부분)에는 사전 후리가나와 단어 탭이 자동으로 붙는다.
 *
 * 질문 입력창에는 wanakana를 붙이지 않는다 — 여기서 치는 건 한국어 질문이기 때문
 * (회화/작문 입력창과 다른 점).
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

      <div className="flex gap-2 border-t border-gray-100 p-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="예: 조사 だけ에 대해서 알려줘"
          className="flex-1 rounded-2xl border-2 border-gray-100 px-4 py-2 focus:border-primary/40 focus:outline-none"
        />
        <button
          onClick={() => handleAsk(input)}
          disabled={!input.trim() || isAnswering}
          className="rounded-2xl bg-primary px-5 py-2 font-bold text-white disabled:bg-gray-200"
        >
          질문
        </button>
      </div>

      <PromptApiTroubleshootDialog error={troubleshootError} onClose={dismissTroubleshoot} />
    </div>
  );
}

export default TeacherPage;
