import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import GemmaEngineNotice from "../components/GemmaEngineNotice";
import InputModeToggle from "../components/InputModeToggle";
import JapaneseSuggestionList from "../components/JapaneseSuggestionList";
import LoadingMascot from "../components/LoadingMascot";
import MarkdownAnswer from "../components/MarkdownAnswer";
import MemoryFactPrompt from "../components/MemoryFactPrompt";
import PromptApiUnsupportedNotice from "../components/PromptApiUnsupportedNotice";
import { useCurriculumPlan } from "../hooks/useCurriculumPlan";
import { useStickToBottom } from "../hooks/useStickToBottom";
import { useScriptInput, type InputScript } from "../hooks/useScriptInput";
import { useWordSuggestions } from "../hooks/useWordSuggestions";
import { TEACHER_SAMPLE_QUESTIONS } from "../lib/teacherPrompts";
import { buildTeacherGreeting } from "../lib/dailyPlan";
import { levelLabel } from "../lib/curriculum";
import { useInputScriptPrefs, useTeacherGreeting } from "../stores/pageStateStore";
import { useCurriculumStore } from "../stores/curriculumStore";
import { useGamificationStore } from "../stores/gamificationStore";
import { useLearnerMemoryStore } from "../stores/learnerMemoryStore";
import { useTeacherSessionStore } from "../stores/teacherSessionStore";
import {
  useActiveMessages,
  useIsViewingToday,
  useTeacherChatStore,
} from "../stores/teacherChatStore";
import { formatDayLabel, localDateKey } from "../lib/localDate";
import TeacherHistorySidebar from "../components/TeacherHistorySidebar";
import TeacherPracticeSheet, { type PracticeTarget } from "../components/TeacherPracticeSheet";
import { isPracticeWorthy } from "../lib/teacherPractice";

/** 이보다 긴 답변에는 "답변 처음으로" 버튼을 단다 — 375px에서 대략 한 화면을 넘는 길이. */
const LONG_ANSWER_LENGTH = 350;

/** 답변 말풍선의 DOM id — "답변 처음으로"가 스크롤해 갈 곳. */
function answerAnchorId(messageId: string) {
  return `teacher-answer-${messageId}`;
}

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
  // 기억 블록은 store가 들고 있는 **스냅샷**이라 대화 중에는 바뀌지 않는다. 실시간으로
  // 반영하면 퀴즈 하나 풀 때마다 시스템 프롬프트가 바뀌어 선생님 세션이 통째로 날아간다
  // (learnerMemoryStore의 promptMemory 주석 참고).
  const refreshPromptMemory = useLearnerMemoryStore((s) => s.refreshPromptMemory);
  // 세션·스트리밍은 Layout에 상주하는 TeacherSessionController가 들고 있다 — 이 페이지를 떠나도
  // 답변이 끊기지 않게. 여기서는 상태를 읽고 질문을 넣기만 한다.
  const modelStatus = useTeacherSessionStore((s) => s.status);
  const modelEngine = useTeacherSessionStore((s) => s.engine);
  const downloadProgress = useTeacherSessionStore((s) => s.downloadProgress);
  const busyLabel = useTeacherSessionStore((s) => s.busyLabel);
  const submitQuestion = useTeacherSessionStore((s) => s.submit);

  const messages = useActiveMessages();
  const viewingToday = useIsViewingToday();
  const activeDate = useTeacherChatStore((s) => s.activeDate);
  const historyLoaded = useTeacherChatStore((s) => s.loaded);
  const loadHistory = useTeacherChatStore((s) => s.load);
  const openDate = useTeacherChatStore((s) => s.openDate);
  const input = useTeacherChatStore((s) => s.input);
  const isAnswering = useTeacherChatStore((s) => s.isAnswering);
  const setInput = useTeacherChatStore((s) => s.setInput);
  const clearToday = useTeacherChatStore((s) => s.clearToday);
  const pendingQuestion = useTeacherChatStore((s) => s.pendingQuestion);
  const consumePendingQuestion = useTeacherChatStore((s) => s.consumePendingQuestion);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [practiceTarget, setPracticeTarget] = useState<PracticeTarget | null>(null);

  // 지난 대화를 IndexedDB에서 읽어온다. 한 번만 부르면 되고, 실패해도 조용히 넘어간다.
  useEffect(() => {
    if (historyLoaded) return;
    void loadHistory();
  }, [historyLoaded, loadHistory]);

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

  // 답변이 자라는 동안 목록을 바닥에 붙여 둔다(위로 올려 읽는 중이면 따라가지 않는다).
  const scrollRef = useStickToBottom<HTMLDivElement>(messages, isAnswering);

  /**
   * 오늘 첫 방문이면 인사를 한 줄 띄운다(모델이 아니라 앱이 — dailyPlan.ts 주석 참고).
   *
   * effect에서 하는 이유: `claimGreeting()`은 "오늘 몫을 가져간다"는 부수효과(저장까지 한다)라
   * 렌더 중에 부르면 안 되고, StrictMode에서 렌더가 두 번 도는 것과도 엮인다. ref로 한 번만 집는다.
   * oxlint가 `set-state-in-effect`로 경고하지만 **여기서는 그게 맞다** — 렌더 중에 값을
   * 만들라는 제안을 따르면 렌더가 저장소를 건드리게 된다.
   */
  const streak = useGamificationStore((s) => s.streak);
  const claimGreeting = useTeacherGreeting((s) => s.claimGreeting);
  const curriculum = useCurriculumPlan();
  const startLevel = useCurriculumStore((s) => s.startLevel);
  const [greeting, setGreeting] = useState<string | null>(null);
  const greetingClaimedRef = useRef(false);

  useEffect(() => {
    if (greetingClaimedRef.current) return;
    // 진도를 아직 못 읽었으면 기다린다 — 커리큘럼은 동적 import라 한 박자 늦게 온다.
    // 시작 단계를 아예 안 골랐으면 영영 안 오므로 기다리지 않는다.
    if (startLevel && !curriculum) return;
    greetingClaimedRef.current = true;
    if (!claimGreeting()) return;

    const current = curriculum?.plan.current;
    const level = current
      ? curriculum?.curriculum.levels.find((l) => l.level === current.level)
      : undefined;
    setGreeting(
      buildTeacherGreeting({
        streak,
        levelLabel: level ? levelLabel(level) : null,
        unitNumber: current?.unitNumber ?? null,
        unitTitle: current?.title ?? null,
      })
    );
  }, [claimGreeting, curriculum, startLevel, streak]);

  /**
   * 화면에 들어올 때 기억 스냅샷을 새로 만든다 — 그 사이에 진도가 나갔거나 시작 단계를
   * 바꿨을 수 있다.
   *
   * 내용이 바뀌었으면 시스템 프롬프트가 바뀌어 모델 쪽 대화 맥락은 새 세션에서 시작한다(학습
   * 기록이 쌓였으면 그걸 반영하는 편이 낫다고 봤다). 내용이 같으면 문자열이 같아 세션은 그대로다.
   * **답변 도중에는** 스냅샷이 바뀌어도 컨트롤러가 반영을 미룬다(TeacherSessionController
   * 주석) — 받던 답변이 끊기지 않는다.
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
    (question: string) => {
      const text = question.trim();
      if (!text || isAnswering) return;
      // 실제로 묻는 건 컨트롤러다(XP·학습 기록·유출 가드·기억 추출도 거기서 한다).
      submitQuestion(text);
    },
    [isAnswering, submitQuestion]
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
   *
   * **지난 대화를 다 읽어온 뒤에 물어본다(`historyLoaded`)** — 읽기도 비동기라, 먼저 물어보면
   * 뒤늦게 끝난 `load()`가 방금 던진 질문을 덮을 수 있었다. store 쪽에서도 합치도록 고쳤지만
   * (teacherChatStore의 `load` 주석), 애초에 순서를 지키는 편이 낫다. IndexedDB를 못 쓰는
   * 환경에서도 `load()`는 끝에 반드시 `loaded`를 세우므로 여기서 멈춰 서지 않는다.
   */
  useEffect(() => {
    // **답변 중이면 꺼내지 않는다.** 답변은 이제 페이지 밖에서도 계속 받으므로, 답변을 기다리다
    // 회화 말풍선의 "선생님에게 묻기"로 넘어오는 일이 생긴다. 그때 꺼내 버리면 handleAsk가 답변
    // 중이라 무시해서 질문이 사라진다 — 끝날 때까지 두면 `isAnswering`이 풀릴 때 다시 돈다.
    if (!memoryFresh || !historyLoaded || isAnswering) return;
    const question = consumePendingQuestion();
    if (question) handleAsk(question);
  }, [memoryFresh, historyLoaded, isAnswering, pendingQuestion, consumePendingQuestion, handleAsk]);

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    // 자동완성 목록이 떠 있으면 화살표·Enter를 그쪽이 먼저 쓴다(회화 페이지와 같은 순서).
    if (suggestions.handleSuggestionKeyDown(e)) return;
    // 폼의 암묵적 제출 대신 onKeyDown으로 직접 처리한다(프로젝트 표준, CLAUDE.md 참고).
    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleAsk(input);
    }
  }

  if (modelStatus === "checking") {
    return <p className="p-6 text-gray-400">AI 준비 상태 확인 중...</p>;
  }

  if (modelEngine === "gemma4" && (modelStatus === "model-missing" || modelStatus === "unsupported")) {
    return (
      <div>
        <h2 className="p-4 pb-0 text-xl text-primary sm:p-6 sm:pb-0">🧑‍🏫 선생님</h2>
        <GemmaEngineNotice reason={modelStatus} feature="선생님에게 질문하기" />
      </div>
    );
  }

  // "unavailable"은 API 객체는 있는데 모델을 못 쓰는 상태다(Whale 등 크로미움 포크, 플래그 꺼짐).
  // 이걸 빼먹으면 화면은 멀쩡한데 보내는 순간 실패한다 — aiCapability.ts 주석 참고.
  if (modelStatus === "unsupported" || modelStatus === "unavailable") {
    return (
      <div>
        <h2 className="p-4 pb-0 text-xl text-primary sm:p-6 sm:pb-0">🧑‍🏫 선생님</h2>
        <PromptApiUnsupportedNotice feature="선생님에게 질문하기" />
      </div>
    );
  }

  return (
    // min-h-0가 없으면 flex 아이템이 내용물 높이만큼 늘어나 사이드바·대화 영역의 자체 스크롤이
    // 죽는다(Layout의 <main>과 같은 flexbox 함정).
    <div className="flex h-full min-h-0">
      <TeacherHistorySidebar open={historyOpen} onClose={() => setHistoryOpen(false)} />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between gap-2 border-b border-gray-100 p-3">
          <div className="flex min-w-0 items-center gap-2">
            {/* 좁은 화면에서만 서랍을 여는 버튼 — 넓은 화면에는 사이드바가 이미 보인다. */}
            <button
              onClick={() => setHistoryOpen(true)}
              aria-label="대화 기록 열기"
              className="shrink-0 rounded-xl px-1.5 py-1 text-lg leading-none text-gray-400 sm:hidden"
            >
              ☰
            </button>
            <h2 className="truncate text-lg text-primary">
              🧑‍🏫 선생님
              {!viewingToday && (
                <span className="ml-2 text-sm text-gray-400">
                  {formatDayLabel(activeDate, localDateKey())}
                </span>
              )}
            </h2>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {/* 지난 날짜를 보는 중에는 "오늘로" 버튼이 대화 지우기 자리를 대신한다 —
                읽기 전용 화면에서 빠져나갈 길이 사이드바뿐이면 답답하다. */}
            {!viewingToday ? (
              <button
                onClick={() => void openDate(localDateKey())}
                className="text-xs text-info"
              >
                오늘로 →
              </button>
            ) : (
              messages.length > 0 && (
                <button
                  onClick={() => {
                    void clearToday();
                    // 대화를 지우는 김에 기억 스냅샷도 새로 만든다. 지금까지 쌓인 학습 기록이
                    // 다음 대화부터 반영되는 자연스러운 지점이고, 대화가 비어 있으니 세션이
                    // 새로 만들어져도 잃을 맥락이 없다.
                    void refreshPromptMemory();
                  }}
                  className="text-xs text-gray-400"
                >
                  대화 지우기
                </button>
              )
            )}
            <Link to="/memory" className="text-xs text-gray-400" title="선생님이 기억하고 있는 것">
              🧠 기억
            </Link>
          </div>
        </div>

        {downloadProgress !== null && (
          <div className="p-3 text-xs text-gray-400">
            모델 다운로드 중... {Math.round(downloadProgress * 100)}%
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${downloadProgress * 100}%` }}
              />
            </div>
          </div>
        )}
        {busyLabel && (
          <div className="p-3">
            <LoadingMascot label={busyLabel} />
          </div>
        )}

        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto p-3">
          {/* 지난 날짜는 읽기만 한다. 왜 이어서 못 쓰는지 한 줄로 말해주지 않으면 입력창이
              사라진 게 고장처럼 보인다. */}
          {!viewingToday && (
            <p className="mb-3 rounded-2xl bg-gray-50 px-4 py-2 text-center text-xs text-gray-400">
              지난 대화는 읽기만 할 수 있어요. 이어서 물어보려면 오늘로 돌아가세요.
            </p>
          )}

          {/* 오늘 첫 방문에만 뜨는 인사. 모델이 아니라 앱이 한다 — 프롬프트에 맡기면 매 답변마다
              인사로 시작하고, "하루에 한 번만"은 모델이 지킬 수 있는 규칙이 아니다(이전 답변을
              셀 수 없다). 날짜로 판단할 수 있는 건 코드가 한다. */}
          {viewingToday && greeting && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-3 flex items-start gap-2 rounded-2xl bg-primary/5 px-4 py-3"
            >
              <span className="text-xl leading-none">🧑‍🏫</span>
              <p className="font-mixed text-sm text-gray-700">{greeting}</p>
            </motion.div>
          )}

          {messages.length === 0 && viewingToday && (
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
            {messages.map((m, i) => {
              // 지금 청크가 도착하고 있는 그 말풍선인가 — 답변 중일 때의 마지막 메시지 하나뿐이다.
              // MarkdownAnswer에 이걸 넘겨야 후리가나·문법 칩 재계산으로 인한 흔들림을 막는다
              // (MarkdownAnswer의 isStreaming 주석 참고).
              const isStreaming = isAnswering && i === messages.length - 1 && m.role === "assistant";
              const isLong = m.role === "assistant" && m.text.length >= LONG_ANSWER_LENGTH;
              const canPractice =
                m.role === "assistant" && isPracticeWorthy(m.text) && messages[i - 1]?.role === "user";
              return (
                <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={
                      m.role === "user"
                        ? "max-w-[80%] rounded-2xl bg-primary px-4 py-2 text-white"
                        : // 흰 바탕이어야 답변 속 예문 카드(bg-gray-50)가 보인다 — 예전엔 말풍선도 회색이라
                          // 카드 경계가 없었다. 넓은 화면에서 한 줄이 너무 길면 읽기 힘들어 폭을 묶는다.
                          "w-full max-w-3xl scroll-mt-3 rounded-2xl border-2 border-gray-100 bg-white px-4 py-3 text-gray-800"
                    }
                    id={m.role === "assistant" ? answerAnchorId(m.id) : undefined}
                  >
                    {m.role === "assistant" && m.text === "" ? (
                      <LoadingMascot label="선생님이 생각하는 중..." />
                    ) : m.role === "assistant" ? (
                      <>
                        <MarkdownAnswer text={m.text} isStreaming={isStreaming} />
                        {/* 연습해보기는 모든 답변에 달지 않는다 — 예문이 여럿 든 설명에만(isPracticeWorthy).
                            답변 중에는 감춘다: 스트리밍 중인 답은 아직 다 안 왔고, 지난 답으로
                            문제를 만들면 수업과 추론이 겹친다. 지난 날짜에서도 연다 — 연습은
                            대화 기록에 아무것도 쓰지 않는다. */}
                        {!isAnswering && (isLong || canPractice) && (
                          <div className="mt-3 flex items-center justify-end gap-3">
                            {/* 긴 설명은 끝까지 따라 내려온 채로 끝난다 — 처음부터 다시 읽을 길을 둔다.
                                부드러운 스크롤은 누를 때 한 번뿐이라 useStickToBottom의 떨림과 무관하다. */}
                            {isLong && (
                              <button
                                onClick={() =>
                                  document
                                    .getElementById(answerAnchorId(m.id))
                                    ?.scrollIntoView({ behavior: "smooth", block: "start" })
                                }
                                className="mr-auto text-xs text-gray-400"
                              >
                                ↑ 답변 처음으로
                              </button>
                            )}
                            {canPractice && (
                              <button
                                onClick={() =>
                                  setPracticeTarget({
                                    messageId: m.id,
                                    question: messages[i - 1].text,
                                    answer: m.text,
                                  })
                                }
                                className="btn-press rounded-2xl border-2 border-primary/20 bg-white px-4 py-2 text-sm font-bold text-primary"
                                style={{ ["--btn-shadow" as string]: "var(--color-gray-200)" }}
                              >
                                ✏️ 연습해보기
                              </button>
                            )}
                          </div>
                        )}
                      </>
                    ) : (
                      m.text
                    )}
                  </motion.div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 답변을 받는 동안에는 입력 영역을 통째로 감춘다 — 어차피 보낼 수 없는 상태이고,
            "생각하는 중" 마스코트에 시선이 가도록 비워두는 편이 낫다.
            **지난 날짜에서도 감춘다** — 지난 대화는 읽기 전용이다(store의 `ask`가 오늘로
            돌려보내긴 하지만, 입력창을 남겨두면 그 날짜에 이어 쓰는 것처럼 보인다). */}
        {!isAnswering && viewingToday && (
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

        <TeacherPracticeSheet target={practiceTarget} onClose={() => setPracticeTarget(null)} />
      </div>
    </div>
  );
}

export default TeacherPage;
