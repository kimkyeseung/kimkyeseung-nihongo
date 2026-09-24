import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import LoadingMascot from "./LoadingMascot";
import MarkdownAnswer from "./MarkdownAnswer";
import PracticeQuestion from "./PracticeQuestion";
import { useAiModel } from "../hooks/useAiModel";
import type { InputScript } from "../hooks/useScriptInput";
import { looksLikePromptLeak } from "../lib/promptSafety";
import {
  MAX_PRACTICE_PROBLEMS,
  MIN_PRACTICE_PROBLEMS,
  PRACTICE_FEEDBACK_SYSTEM_PROMPT,
  PRACTICE_JUDGE_LEAK_REFERENCE,
  PRACTICE_JUDGE_SYSTEM_PROMPT,
  PRACTICE_LEAK_REFERENCE,
  PRACTICE_SYSTEM_PROMPT,
  buildJudgePrompt,
  buildPracticeFeedbackPrompt,
  buildPracticePrompt,
  canAskJudge,
  countVerdicts,
  isCorrectAnswer,
  modelAnswer,
  parseJudgement,
  parsePracticeProblems,
  prepareProblem,
  type PracticeProblem,
  type PracticeVerdict,
} from "../lib/teacherPractice";
import { XP_REWARDS } from "../lib/xpRewards";
import { useConfettiStore } from "../stores/confettiStore";
import { useGamificationStore } from "../stores/gamificationStore";
import { useTeacherPractice } from "../stores/pageStateStore";

export interface PracticeTarget {
  /** 선생님 답변 메시지 id — 만든 문제를 이 id로 기억해 둔다. */
  messageId: string;
  question: string;
  answer: string;
}

/**
 * 선생님 답변 끝의 "연습해보기" 시트. 방금 설명한 내용으로 3~4문제(빈칸·객관식·배열·고치기)를
 * 내고, 다 풀면 선생님이 짧게 피드백한다(teacherPractice.ts 참고).
 *
 * 채점은 코드가 먼저 한다(isCorrectAnswer). 코드가 틀렸다고 본 일본어 답만 AI에게 한 번 더
 * 묻고(canAskJudge), 인정되면 ⭕가 아니라 △로 보여준다.
 *
 * 문제를 만드는 세션과 피드백 세션은 **선생님 수업 세션과 따로** 둔다 — 기억 추출·문법 교정과
 * 같은 이유로, 출제 지시문이 수업 히스토리에 섞이면 다음 질문의 답이 문제 형식으로 나온다.
 * 이 컴포넌트가 마운트된 동안만 살아 있고 닫으면 destroy된다.
 */
function TeacherPracticeSheet({ target, onClose }: { target: PracticeTarget | null; onClose: () => void }) {
  // body로 빼는 이유는 ActionMenu와 같다 — AnimatedOutlet이 페이지에 transform을 걸어서
  // 페이지 안의 `fixed`가 뷰포트가 아니라 그 조상 기준이 될 수 있다.
  return createPortal(
    <AnimatePresence>
      {target && <PracticeContent key={target.messageId} target={target} onClose={onClose} />}
    </AnimatePresence>,
    document.body
  );
}

type Phase =
  | { kind: "generating" }
  | { kind: "failed"; message: string }
  | {
      kind: "solving";
      problems: PracticeProblem[];
      index: number;
      answers: string[];
      verdicts: PracticeVerdict[];
    }
  | { kind: "done"; problems: PracticeProblem[]; answers: string[]; verdicts: PracticeVerdict[] };

const GENERATION_FAILED = "문제를 만들지 못했어요. 다시 시도해 주세요.";
const GENERATION_ERROR = "선생님이 문제를 만들다 멈췄어요. 잠시 뒤에 다시 시도해 주세요.";
/**
 * 형식이 깨졌을 때 조용히 한 번 더 받아본다. 온디바이스 모델은 같은 지시에도 매번 형식이
 * 조금씩 달라서, 한 번 실패했다고 바로 실패 화면을 띄우면 버튼을 누를 때마다 실패하는 것처럼
 * 보인다(실제로 그랬다). 오류(예외)는 재시도하지 않는다 — 같은 실패를 반복할 뿐이다.
 */
const MAX_GENERATION_ATTEMPTS = 2;

/**
 * AI 재확인이 이보다 오래 걸리면 포기하고 코드 채점(틀림)을 그대로 쓴다. 판정 하나 때문에
 * "다음 문제"가 끝없이 막혀 있으면 안 된다. Gemma/Safari에서도 두 줄짜리 답은 이 안에 온다.
 */
const JUDGE_TIMEOUT_MS = 20_000;

/** 모델이 피드백을 못 줬을 때 대신 보여주는 한 줄. 채점 결과만으로 만든다. */
function fallbackFeedback(verdicts: PracticeVerdict[]): string {
  const { wrong } = countVerdicts(verdicts);
  if (wrong === 0) return "전부 맞혔어요! 설명한 내용을 잘 이해했네요. 🎉";
  if (wrong === verdicts.length) return "이번엔 어려웠네요. 설명을 한 번 더 읽고 다시 풀어봐요.";
  return "잘했어요! 틀린 문제의 해설을 한 번 더 보고 다시 풀어봐요.";
}

/** 풀기 시작 상태. 보기·조각은 풀 때마다 새로 섞는다("다시 풀기"도). */
function startSolving(problems: PracticeProblem[]): Phase {
  return { kind: "solving", problems: problems.map((p) => prepareProblem(p)), index: 0, answers: [], verdicts: [] };
}

function PracticeContent({ target, onClose }: { target: PracticeTarget; onClose: () => void }) {
  const generator = useAiModel(PRACTICE_SYSTEM_PROMPT);
  const reviewer = useAiModel(PRACTICE_FEEDBACK_SYSTEM_PROMPT);
  // "이 답도 맞는 표현인가?" 재확인 전용 세션. 출제·피드백 세션과 섞으면 앞 문제의 판정이
  // 다음 판정에 끌려간다 — 판정마다 세션도 버린다.
  const judge = useAiModel(PRACTICE_JUDGE_SYSTEM_PROMPT);
  const cached = useTeacherPractice((s) => s.byMessageId[target.messageId]);
  const saveProblems = useTeacherPractice((s) => s.save);
  const claimXp = useTeacherPractice((s) => s.claimXp);
  const recordProgress = useGamificationStore((s) => s.recordProgress);
  const celebrate = useConfettiStore((s) => s.celebrate);

  const [phase, setPhase] = useState<Phase>(() =>
    cached ? startSolving(cached.problems) : { kind: "generating" }
  );
  /** 지금 문제에 낸 응답. null이면 아직 푸는 중이다. */
  const [submitted, setSubmitted] = useState<string | null>(null);
  /** 지금 문제의 판정. 응답을 냈어도 AI 재확인 중이면 null이다. */
  const [verdict, setVerdict] = useState<PracticeVerdict | null>(null);
  const [judging, setJudging] = useState(false);
  const [judgeReason, setJudgeReason] = useState("");
  /**
   * 늦게 도착한 판정을 버리기 위한 번호. 재확인 중에 시트를 닫거나 "다시 풀기"를 누르면
   * 앞 문제의 판정이 다음 문제에 붙을 수 있다.
   */
  const judgeTokenRef = useRef(0);
  // 문제마다 새로 고르게 하지 않는다 — 한 번 일본어 모드로 바꿨으면 다음 문제도 그대로 친다.
  // 기본은 일본어(로마자→히라가나)다: 빈칸의 답은 대부분 가나다.
  const [script, setScript] = useState<InputScript>("ja");
  const [feedback, setFeedback] = useState("");
  const [feedbackLoading, setFeedbackLoading] = useState(false);

  // useAiModel이 돌려주는 객체는 렌더마다 새로 만들어진다. effect 의존성에 넣으면 매번 다시
  // 돌므로 최신 값을 ref로 들고 있는다.
  const generatorRef = useRef(generator);
  const reviewerRef = useRef(reviewer);
  const judgeRef = useRef(judge);
  useEffect(() => {
    generatorRef.current = generator;
    reviewerRef.current = reviewer;
    judgeRef.current = judge;
  });

  // StrictMode에서 effect가 마운트→언마운트→마운트로 두 번 돈다. 요청을 두 번 보내지 않으려고
  // "시작했는가"는 ref로 막고, 결과를 반영할지는 "지금 붙어 있는가"로 따로 본다 — cleanup에서
  // 취소 플래그를 세우면 두 번째 마운트는 시작하지 않으니 결과가 영영 반영되지 않는다.
  const mountedRef = useRef(false);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const [generation, setGeneration] = useState(0);
  const startedGenerationRef = useRef<number | null>(null);
  useEffect(() => {
    if (phase.kind !== "generating" || startedGenerationRef.current === generation) return;
    startedGenerationRef.current = generation;

    void (async () => {
      const model = generatorRef.current;
      // 시도마다 건진 문제를 모은다. 작은 모델은 한 번에 한 문제만 쓰고 끝내기도 해서(실제로
      // 그랬다), 시도 하나만 보고 판단하면 두 번 다 실패로 끝난다.
      const collected: PracticeProblem[] = [];
      try {
        for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt++) {
          const raw = await model.prompt(buildPracticePrompt(target.question, target.answer));
          // 한 번 만든 세션을 계속 쓰면 재시도·"다른 문제 받기"에 앞서 낸 문제를 모델이 기억해
          // 같은 걸 또 낸다 — 받을 때마다 새 세션으로 시작한다. 유출이 있었다면 오염된 턴을
          // 버리는 의미도 있다.
          model.resetSession();
          if (!mountedRef.current) return;

          // 출력 가드는 LLM을 부르는 모든 경로에 건다(promptSafety.ts). 기준은 형식·예시를 뺀
          // 지시문이다 — 형식을 따라 쓴 정상 문제가 걸리면 안 된다(teacherPractice.ts 참고).
          const leaked = looksLikePromptLeak(raw, PRACTICE_LEAK_REFERENCE);
          const parsed = leaked ? [] : parsePracticeProblems(raw);
          for (const p of parsed) {
            if (collected.length < MAX_PRACTICE_PROBLEMS && !collected.some((c) => c.question === p.question)) {
              collected.push(p);
            }
          }
          const problems = collected;
          if (problems.length >= MIN_PRACTICE_PROBLEMS) {
            saveProblems(target.messageId, problems);
            setPhase(startSolving(problems));
            return;
          }
          // 파서가 무엇을 받았는지 모르면 고칠 수가 없다 — 실패한 원문은 콘솔에 남긴다
          // (학습자 질문이 아니라 모델이 쓴 문제라 남겨도 괜찮다).
          console.warn(
            `[연습해보기] 문제 형식을 읽지 못함 (시도 ${attempt}/${MAX_GENERATION_ATTEMPTS}, ` +
              `이번에 읽은 문제 ${parsed.length}개, 모은 문제 ${problems.length}개` +
              `${leaked ? ", 유출 검사에 걸림" : ""})\n${raw}`
          );
        }
        setPhase({ kind: "failed", message: GENERATION_FAILED });
      } catch (err) {
        console.error("[연습해보기] 문제 생성 중 오류", err);
        if (mountedRef.current) setPhase({ kind: "failed", message: GENERATION_ERROR });
      }
    })();
  }, [phase.kind, generation, target, saveProblems]);

  function resetQuestion() {
    judgeTokenRef.current += 1;
    setSubmitted(null);
    setVerdict(null);
    setJudging(false);
    setJudgeReason("");
  }

  function regenerate() {
    resetQuestion();
    setFeedback("");
    setPhase({ kind: "generating" });
    setGeneration((g) => g + 1);
  }

  function retrySame(problems: PracticeProblem[]) {
    resetQuestion();
    setFeedback("");
    setPhase(startSolving(problems));
  }

  async function requestFeedback(problems: PracticeProblem[], answers: string[], verdicts: PracticeVerdict[]) {
    const model = reviewerRef.current;
    setFeedbackLoading(true);
    setFeedback("");
    let acc = "";
    try {
      for await (const chunk of model.promptStreaming(buildPracticeFeedbackPrompt(problems, answers, verdicts))) {
        acc += chunk;
        if (looksLikePromptLeak(acc, PRACTICE_FEEDBACK_SYSTEM_PROMPT)) {
          model.resetSession();
          acc = "";
          break;
        }
        if (mountedRef.current) setFeedback(acc);
      }
    } catch {
      acc = "";
    } finally {
      // 피드백은 문제 묶음마다 한 번이라 세션에 앞 결과가 남아 있을 이유가 없다.
      model.resetSession();
      if (mountedRef.current) {
        if (!acc.trim()) setFeedback(fallbackFeedback(verdicts));
        setFeedbackLoading(false);
      }
    }
  }

  /**
   * AI 재확인. **실패·시간 초과·형식 깨짐·유출은 전부 "틀림"(코드 채점 그대로)으로 끝난다** —
   * 판정을 못 받았다고 인정해 주면 틀린 걸 맞다고 가르치는 쪽으로 기운다.
   */
  async function askJudge(problem: PracticeProblem, response: string, token: number) {
    const model = judgeRef.current;
    let result: { accepted: boolean; reason: string } | null = null;
    try {
      const raw = await Promise.race([
        model.prompt(buildJudgePrompt(problem, response)),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("judge timeout")), JUDGE_TIMEOUT_MS)),
      ]);
      result = looksLikePromptLeak(raw, PRACTICE_JUDGE_LEAK_REFERENCE) ? null : parseJudgement(raw);
      if (!result) console.warn(`[연습해보기] 판정 형식을 읽지 못함\n${raw}`);
    } catch (err) {
      console.warn("[연습해보기] 판정 실패 — 코드 채점을 그대로 씁니다", err);
    } finally {
      // 판정마다 새 세션 — 앞 문제의 판정이 다음 판정에 끌려가지 않게.
      model.resetSession();
    }
    if (!mountedRef.current || judgeTokenRef.current !== token) return;
    setJudging(false);
    if (result?.accepted) {
      setVerdict("accepted");
      setJudgeReason(result.reason);
    } else {
      setVerdict("wrong");
    }
  }

  function handleSubmit(response: string) {
    if (phase.kind !== "solving" || submitted !== null) return;
    const problem = phase.problems[phase.index];
    setSubmitted(response);
    if (isCorrectAnswer(problem, response)) {
      setVerdict("correct");
      celebrate();
      return;
    }
    if (!canAskJudge(problem, response)) {
      setVerdict("wrong");
      return;
    }
    const token = ++judgeTokenRef.current;
    setJudging(true);
    void askJudge(problem, response, token);
  }

  // PracticeQuestion의 Enter 리스너가 의존성으로 들고 있어서 참조가 안정적이어야 한다.
  const handleNext = useCallback(() => {
    if (phase.kind !== "solving" || submitted === null || verdict === null) return;
    const answers = [...phase.answers, submitted];
    const verdicts = [...phase.verdicts, verdict];
    resetQuestion();
    if (phase.index + 1 < phase.problems.length) {
      setPhase({ ...phase, index: phase.index + 1, answers, verdicts });
      return;
    }
    setPhase({ kind: "done", problems: phase.problems, answers, verdicts });
    // 완주라는 명확한 학습 행동에만, 이 문제 묶음에서 처음 한 번만 준다(게이미피케이션 규칙).
    // 다시 풀기로는 안 쌓이고, 새 문제를 받으면(모델을 실제로 다시 돌려야 한다) 다시 받는다.
    if (claimXp(target.messageId)) recordProgress(XP_REWARDS.teacherPracticeCompleted);
    void requestFeedback(phase.problems, answers, verdicts);
    // requestFeedback·resetQuestion은 렌더마다 새로 만들어지지만 ref와 setter만 쓴다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, submitted, verdict, claimXp, recordProgress, target.messageId]);

  return (
    <motion.div
      className="fixed inset-0 z-30 flex items-end justify-center bg-black/30 sm:items-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="연습해보기"
        // 결과 화면에서는 높이를 미리 잡아둔다. 바텀시트는 아래에 붙어 있어서 내용이 늘면 **위쪽
        // 모서리가 올라간다** — 피드백이 스트리밍되는 동안 청크마다 시트 전체가 들썩였다(실제로 겪었다).
        // 보통의 결과(점수·틀린 문제 한두 개·피드백·버튼)는 이 안에 들어간다.
        className={`max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-6 sm:rounded-3xl ${
          phase.kind === "done" ? "min-h-[70vh]" : ""
        }`}
        // 스크롤 앵커링은 끈다. 늘어나는 요소 아래를 기준점으로 잡으면 브라우저가 청크마다
        // scrollTop을 고쳐 잡으면서 화면이 위아래로 튄다.
        style={{ overflowAnchor: "none" }}
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 40, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <h3 className="text-lg font-bold text-primary">✏️ 연습해보기</h3>
          <button onClick={onClose} className="text-2xl leading-none text-gray-400" aria-label="닫기">
            ×
          </button>
        </div>

        {phase.kind === "generating" && (
          <div className="mt-8 mb-4 flex justify-center">
            <LoadingMascot label={generator.busyLabel ?? "선생님이 문제를 만드는 중..."} />
          </div>
        )}

        {phase.kind === "failed" && (
          <div className="mt-6 flex flex-col items-center gap-3 text-center">
            <span className="text-4xl">😅</span>
            <p className="text-sm text-gray-500">{phase.message}</p>
            <button
              onClick={regenerate}
              className="btn-press mt-2 w-full rounded-2xl bg-primary py-3 font-bold text-white"
              style={{ "--btn-shadow": "#3d9401" } as React.CSSProperties}
            >
              다시 만들기
            </button>
          </div>
        )}

        {phase.kind === "solving" && (
          // 문제가 바뀌면 통째로 새로 만든다 — 입력창(uncontrolled)과 배열 조각 상태를 비우려면
          // 리마운트가 가장 확실하다("다시 풀기"로 같은 1번에 돌아와도 비어 있어야 한다).
          <PracticeQuestion
            key={`${generation}-${phase.index}-${phase.answers.length}`}
            problem={phase.problems[phase.index]}
            index={phase.index}
            total={phase.problems.length}
            submitted={submitted}
            verdict={verdict}
            judging={judging}
            judgeReason={judgeReason}
            script={script}
            onScriptChange={setScript}
            onSubmit={handleSubmit}
            onNext={handleNext}
          />
        )}

        {phase.kind === "done" && (
          <ResultView
            problems={phase.problems}
            answers={phase.answers}
            verdicts={phase.verdicts}
            feedback={feedback}
            feedbackLoading={feedbackLoading}
            onRetry={() => retrySame(phase.problems)}
            onRegenerate={regenerate}
            onClose={onClose}
          />
        )}
      </motion.div>
    </motion.div>
  );
}

function ResultView({
  problems,
  answers,
  verdicts,
  feedback,
  feedbackLoading,
  onRetry,
  onRegenerate,
  onClose,
}: {
  problems: PracticeProblem[];
  answers: string[];
  verdicts: PracticeVerdict[];
  feedback: string;
  feedbackLoading: boolean;
  onRetry: () => void;
  onRegenerate: () => void;
  onClose: () => void;
}) {
  const counts = countVerdicts(verdicts);
  const perfect = counts.wrong === 0;

  return (
    <div className="mt-4 flex flex-col gap-3">
      <div className="flex flex-col items-center gap-1 text-center">
        <span className="text-4xl">{perfect ? "🎉" : "👏"}</span>
        <p className="text-xl font-bold text-primary">
          {counts.correct} / {problems.length} 문제 정답!
        </p>
        {/* △는 점수에 넣지 않고 따로 센다 — 판정한 게 작은 모델이라 틀릴 수 있다. */}
        {counts.accepted > 0 && (
          <p className="text-sm text-accent">△ {counts.accepted}문제는 다른 표현으로 인정됐어요</p>
        )}
      </div>

      {/* 맞힌 것 말고만 다시 보여준다 — 맞힌 것까지 늘어놓으면 정작 볼 것이 묻힌다. △도 보여준다:
          모범 답을 한 번 더 보게 하려는 것이다. */}
      {verdicts.some((v) => v !== "correct") && (
        <ul className="flex flex-col gap-2">
          {problems.map((p, i) =>
            verdicts[i] === "correct" ? null : (
              <li key={p.question} className="rounded-2xl border-2 border-gray-100 px-4 py-2 text-sm">
                <div className="font-mixed text-gray-700">
                  <MarkdownAnswer text={p.question} />
                </div>
                <p className={`mt-1 font-mixed ${verdicts[i] === "accepted" ? "text-accent" : "text-danger"}`}>
                  {verdicts[i] === "accepted" ? "△" : "❌"} {answers[i]?.trim() || "(모르겠어요)"}
                </p>
                <p className="font-mixed text-primary">⭕ {modelAnswer(p)}</p>
              </li>
            )
          )}
        </ul>
      )}

      {/* 선생님 피드백. 채점은 코드가 이미 했고, 모델은 "무엇을 헷갈렸는지"만 말한다.
          **틀린 문제 목록 아래, 버튼 바로 위에 둔다** — 스트리밍으로 늘어나는 요소 뒤에 다른 내용이
          있으면 청크마다 그게 밀려 내려간다(실제로 겪었다). 늘어나는 게 맨 끝이면 밀릴 게 버튼뿐이다.
          min-h는 로딩 마스코트 → 첫 문장으로 바뀔 때의 높이 차이를 흡수한다. */}
      <div className="flex min-h-24 items-start gap-2 rounded-2xl bg-primary/5 px-4 py-3">
        <span className="text-xl leading-none">🧑‍🏫</span>
        <div className="min-w-0 flex-1 font-mixed text-sm text-gray-700">
          {feedback ? (
            <MarkdownAnswer text={feedback} isStreaming={feedbackLoading} />
          ) : (
            <LoadingMascot label="선생님이 채점 결과를 보는 중..." />
          )}
        </div>
      </div>

      {/* 버튼은 처음부터 그려 둔다 — 피드백이 끝날 때 나타나게 하면 그 순간 한 번 더 튄다.
          다시 풀기·다른 문제 받기만 피드백을 받는 동안 막는다(세션이 겹친다). 완료는 언제든. */}
      <div className="mt-2 flex flex-col gap-2">
        <div className="flex gap-2">
          <button
            onClick={onRetry}
            disabled={feedbackLoading}
            className="flex-1 rounded-2xl border-2 border-gray-100 py-3 font-bold text-gray-500 disabled:text-gray-300"
          >
            다시 풀기
          </button>
          <button
            onClick={onRegenerate}
            disabled={feedbackLoading}
            className="flex-1 rounded-2xl border-2 border-gray-100 py-3 font-bold text-gray-500 disabled:text-gray-300"
          >
            다른 문제 받기
          </button>
        </div>
        <button
          onClick={onClose}
          className="btn-press w-full rounded-2xl bg-primary py-3 font-bold text-white"
          style={{ "--btn-shadow": "#3d9401" } as React.CSSProperties}
        >
          완료
        </button>
      </div>
    </div>
  );
}

export default TeacherPracticeSheet;
