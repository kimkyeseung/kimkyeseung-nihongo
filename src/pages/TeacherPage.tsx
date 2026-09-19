import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import GemmaEngineNotice from "../components/GemmaEngineNotice";
import InputModeToggle from "../components/InputModeToggle";
import JapaneseSuggestionList from "../components/JapaneseSuggestionList";
import LoadingMascot from "../components/LoadingMascot";
import MarkdownAnswer from "../components/MarkdownAnswer";
import MemoryFactPrompt from "../components/MemoryFactPrompt";
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
  buildTeacherSystemPrompt,
  buildTeacherUserPrompt,
} from "../lib/teacherPrompts";
import {
  MEMORY_EXTRACTION_SYSTEM_PROMPT,
  buildMemoryExtractionPrompt,
  parseExtractedFacts,
} from "../lib/memoryExtraction";
import { looksLikePromptLeak } from "../lib/promptSafety";
import { XP_REWARDS } from "../lib/xpRewards";
import { useInputScriptPrefs } from "../stores/pageStateStore";
import { useGamificationStore } from "../stores/gamificationStore";
import { useLearnerMemoryStore, recordStudyEvent } from "../stores/learnerMemoryStore";
import { useTeacherChatStore } from "../stores/teacherChatStore";

/**
 * 이보다 짧은 답변에서는 기억할 만한 개인적인 사실이 나올 일이 없다. 추출은 추론이 한 번 더
 * 도는 일이라(Gemma/Safari에서는 체감된다) 값어치 없는 호출은 아예 걸지 않는다.
 */
const MIN_ANSWER_LENGTH_FOR_EXTRACTION = 40;

/** 보내기 버튼의 종이비행기. 이 프로젝트에 아이콘 세트가 없어 인라인 SVG로 둔다(currentColor 상속). */
function PaperPlaneIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-5 w-5" fill="currentColor">
      <path d="M3.4 20.4l17.45-7.48a1 1 0 000-1.84L3.4 3.6a1 1 0 00-1.39 1.02l1.2 5.4L14 12l-10.79 1.98-1.2 5.4a1 1 0 001.39 1.02z" />
    </svg>
  );
}

/**
 * 방금 주고받은 대화에서 기억할 만한 사실을 뽑아 "확인 대기"로 넣어둔다.
 *
 * 스트리밍이 아니라 단발성 `prompt()`다 — 화면에 흘려 보여줄 게 아니라 다 받은 뒤 한 번에
 * 파싱하면 되기 때문. 결과는 바로 저장되지 않고 사용자가 수락해야 선생님이 쓴다
 * (learnerMemoryDb.ts의 MemoryFact.status 주석 참고).
 */
async function extractFacts(
  extractor: { prompt: (input: string) => Promise<string> },
  question: string,
  answer: string,
  addPendingFacts: (facts: ReturnType<typeof parseExtractedFacts>) => Promise<void>
) {
  try {
    const raw = await extractor.prompt(buildMemoryExtractionPrompt(question, answer));
    const facts = parseExtractedFacts(raw);
    if (facts.length > 0) await addPendingFacts(facts);
  } catch {
    // 부가 기능이라 조용히 넘어간다. 여기서 실패를 화면에 띄우면 수업과 상관없는 오류로
    // 사용자를 놀라게 할 뿐이다.
  }
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
  // 기억 블록은 store가 들고 있는 **스냅샷**이라 대화 중에는 바뀌지 않는다. 실시간으로
  // 반영하면 퀴즈 하나 풀 때마다 시스템 프롬프트가 바뀌어 선생님 세션이 통째로 날아간다
  // (learnerMemoryStore의 promptMemory 주석 참고).
  const promptMemory = useLearnerMemoryStore((s) => s.promptMemory);
  const refreshPromptMemory = useLearnerMemoryStore((s) => s.refreshPromptMemory);
  const addPendingFacts = useLearnerMemoryStore((s) => s.addPendingFacts);
  const systemPrompt = useMemo(() => buildTeacherSystemPrompt(promptMemory), [promptMemory]);

  const model = useAiModel(systemPrompt);
  // 기억 추출은 수업 맥락을 오염시키면 안 되므로 세션을 따로 둔다 — 회화의 문법 교정·번역과
  // 같은 이유다.
  const extractor = useAiModel(MEMORY_EXTRACTION_SYSTEM_PROMPT);
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

  /**
   * 화면에 들어올 때 기억 스냅샷을 새로 만든다 — 그 사이에 진도가 나갔거나 시작 단계를
   * 바꿨을 수 있다.
   *
   * 여기서 갱신해도 잃을 것이 없다: 이 페이지를 떠나면 어차피 `useAiModel`이 세션을
   * destroy하므로(CLAUDE.md의 선생님 페이지 노트), 돌아왔을 때는 늘 새 세션이다.
   * 대화 **도중에** 갱신하지 않는 것이 핵심이고, 그건 `recordStudyEvent`가 스냅샷을
   * 건드리지 않는 것으로 지켜진다.
   *
   * 끝났다는 표시(`memoryFresh`)를 따로 두는 이유는 아래 "대신 물어보기" 때문이다.
   */
  const [memoryFresh, setMemoryFresh] = useState(false);
  useEffect(() => {
    let alive = true;
    refreshPromptMemory().finally(() => {
      if (alive) setMemoryFresh(true);
    });
    return () => {
      alive = false;
    };
  }, [refreshPromptMemory]);

  /**
   * 답변이 끝나 입력창이 돌아오면 커서를 되돌려준다 — 이어서 묻는 흐름이라 매번 다시 클릭하게
   * 두면 성가시다.
   *
   * 두 단계로 나눈 이유: 답변 중에는 입력창이 아예 언마운트돼 있고, `isAnswering`이 false가 된
   * **그 렌더에는 엘리먼트가 아직 붙기 전**이다(콜백 ref가 상태를 갱신하는 건 한 박자 뒤).
   * 그래서 "포커스를 줘야 한다"는 표시만 먼저 해두고, 엘리먼트가 실제로 나타났을 때 처리한다.
   * 첫 진입에는 아무 일도 없다 — 들어오자마자 모바일 키보드가 올라오면 예시 질문을 가린다.
   */
  const pendingFocusRef = useRef(false);
  useEffect(() => {
    if (isAnswering) pendingFocusRef.current = true;
  }, [isAnswering]);

  useEffect(() => {
    if (isAnswering || !pendingFocusRef.current || !questionInput.el) return;
    pendingFocusRef.current = false;
    questionInput.el.focus();
  }, [isAnswering, questionInput.el]);

  const handleAsk = useCallback(
    async (question: string) => {
      const text = question.trim();
      if (!text || isAnswering) return;
      const { assistantId } = ask(text);
      recordProgress(XP_REWARDS.teacherQuestion);
      recordStudyEvent({ type: "teacher-question", subject: text });
      try {
        let acc = "";
        for await (const chunk of model.promptStreaming(buildTeacherUserPrompt(text))) {
          acc += chunk;
          // 지시문을 그대로 읊기 시작하면 거기서 끊는다 — 프롬프트로 "말하지 말라"고 시키는
          // 것만으로는 막히지 않아서, 받은 답을 코드에서 한 번 더 본다(promptSafety.ts 주석 참고).
          //
          // **고정 지시문(TEACHER_SYSTEM_PROMPT)만 넘긴다.** 실제로 모델에게 준 시스템
          // 프롬프트에는 기억 블록이 붙어 있지만, 그것까지 넘기면 선생님이 학습자의 기억을
          // 정상적으로 되받기만 해도 유출로 오인한다(teacherPrompts.ts 주석 참고).
          if (looksLikePromptLeak(acc, TEACHER_SYSTEM_PROMPT)) {
            appendAnswer(assistantId, TEACHER_REFUSAL_ANSWER);
            // 화면만 바꾸고 끝내면 오염된 턴이 히스토리에 남아 다음 질문에서 이어받을 수 있다.
            model.resetSession();
            return;
          }
          appendAnswer(assistantId, acc);
        }

        // 답변이 끝난 뒤에 기억할 만한 사실이 있었는지 따로 물어본다. 답변을 기다리게 하지
        // 않으려고 await하지 않는다 — 실패해도 수업에는 아무 영향이 없는 부가 기능이다.
        if (acc.length >= MIN_ANSWER_LENGTH_FOR_EXTRACTION) {
          void extractFacts(extractor, text, acc, addPendingFacts);
        }
      } catch (err) {
        appendAnswer(assistantId, "(답변을 만드는 중 오류가 발생했습니다)");
        reportError(err);
      } finally {
        finishAnswer();
      }
    },
    [
      isAnswering,
      ask,
      recordProgress,
      model,
      extractor,
      addPendingFacts,
      appendAnswer,
      finishAnswer,
      reportError,
    ]
  );

  /**
   * 회화 말풍선이나 대문의 "오늘의 학습"에서 대신 넣어둔 질문을 받아 바로 물어본다.
   *
   * **기억 스냅샷이 확정된 뒤에만 물어본다 (실제로 겪은 버그).** 스냅샷 갱신은 커리큘럼을
   * 동적 import로 읽느라 비동기인데, 이 effect는 마운트 즉시 돌기 때문에 그냥 두면 갱신이
   * 끝나기 전에 세션이 만들어진다 — 대문에서 "문법 배우기"로 넘어온 질문이 **정작 지금
   * 단원이 뭔지 모르는 선생님에게** 가 있었다. 나중에 스냅샷이 도착해도 소용없다: 이미
   * 만들어진 세션은 그때의 시스템 프롬프트를 들고 있다.
   *
   * `memoryFresh`가 바뀌면 이 컴포넌트가 다시 렌더되고, 그 렌더의 `handleAsk`는 갱신된
   * 프롬프트로 만들어진 `model`을 잡는다.
   */
  useEffect(() => {
    if (!memoryFresh) return;
    const question = consumePendingQuestion();
    if (question) handleAsk(question);
  }, [memoryFresh, pendingQuestion, consumePendingQuestion, handleAsk]);

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
        <div className="flex items-center gap-3">
          {messages.length > 0 && (
            <button
              onClick={() => {
                clear();
                // 대화를 지우는 김에 기억 스냅샷도 새로 만든다. 지금까지 쌓인 학습 기록이
                // 다음 대화부터 반영되는 자연스러운 지점이고, 대화가 비어 있으니 세션이
                // 새로 만들어져도 잃을 맥락이 없다.
                void refreshPromptMemory();
              }}
              className="text-xs text-gray-400"
            >
              대화 지우기
            </button>
          )}
          <Link to="/memory" className="text-xs text-gray-400" title="선생님이 기억하고 있는 것">
            🧠 기억
          </Link>
        </div>
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
          {/* 방금 대화에서 건진 "기억해둘까요?" 확인. 입력창 바로 위라 자연스럽게 눈에 들어오고,
              답변 중에는 입력 영역과 함께 사라진다. */}
          <MemoryFactPrompt />
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
