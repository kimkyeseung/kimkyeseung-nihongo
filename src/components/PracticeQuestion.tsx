import { useEffect, useState } from "react";
import type { KeyboardEvent } from "react";
import InputModeToggle from "./InputModeToggle";
import LoadingMascot from "./LoadingMascot";
import MarkdownAnswer from "./MarkdownAnswer";
import { useScriptInput, type InputScript } from "../hooks/useScriptInput";
import {
  modelAnswer,
  type ChoiceProblem,
  type OrderProblem,
  type PracticeKind,
  type PracticeProblem,
  type PracticeVerdict,
} from "../lib/teacherPractice";

const KIND_BADGE: Record<PracticeKind, string> = {
  blank: "빈칸 채우기",
  choice: "객관식",
  order: "어순 배열",
  fix: "틀린 문장 고치기",
};

const KIND_HINT: Record<PracticeKind, string> = {
  blank: "빈칸에 들어갈 말을 입력하세요",
  choice: "알맞은 것을 고르세요",
  order: "조각을 눌러 문장을 완성하세요",
  fix: "틀린 곳을 고쳐 문장 전체를 입력하세요",
};

const PRIMARY_BUTTON = "btn-press w-full rounded-2xl bg-primary py-3 font-bold text-white disabled:bg-gray-200";
const PRIMARY_SHADOW = { "--btn-shadow": "#3d9401" } as React.CSSProperties;

export interface PracticeQuestionProps {
  problem: PracticeProblem;
  index: number;
  total: number;
  /** 이 문제에 낸 응답. null이면 아직 푸는 중이다. */
  submitted: string | null;
  /** 최종 판정. 응답을 냈어도 AI 재확인 중이면 null이다. */
  verdict: PracticeVerdict | null;
  judging: boolean;
  /** AI가 다른 표현으로 인정했을 때의 이유. */
  judgeReason: string;
  script: InputScript;
  onScriptChange: (script: InputScript) => void;
  onSubmit: (response: string) => void;
  onNext: () => void;
}

/**
 * 연습 문제 한 개. 유형마다 푸는 방법(입력·보기·조각)만 다르고, 채점 뒤 보여주는 결과 영역은
 * 같다. 채점 자체는 부모(TeacherPracticeSheet)가 한다 — 여기서는 응답을 모아 올리기만 한다.
 */
function PracticeQuestion(props: PracticeQuestionProps) {
  const { problem, index, total, submitted, verdict, judging, onNext } = props;
  const revealed = submitted !== null;
  const canGoNext = verdict !== null && !judging;

  // 입력형이 아닌 문제는 채점 뒤 Enter로 다음 문제로 간다. 입력형은 입력창이 직접 처리한다
  // (둘 다 받으면 한 번 누른 Enter에 두 문제를 건너뛴다).
  const textInput = problem.kind === "blank" || problem.kind === "fix";
  useEffect(() => {
    if (textInput || !canGoNext) return;
    const handler = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Enter" && !e.isComposing) {
        e.preventDefault();
        onNext();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [textInput, canGoNext, onNext]);

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between text-sm text-gray-400">
        <span>
          {index + 1} / {total}
        </span>
        <span className="rounded-full bg-gray-50 px-2 py-0.5 text-xs">{KIND_BADGE[problem.kind]}</span>
      </div>
      {/* 문제에는 일본어가 백틱으로 들어 있다 — 선생님 답변과 같은 렌더러로 그려 후리가나와
          단어 탭을 그대로 쓴다. 확정된 문장이라 isStreaming은 필요 없다. */}
      <div className="mt-1 font-mixed text-gray-800">
        <MarkdownAnswer text={problem.question} />
      </div>
      <p className="mt-1 text-xs text-gray-400">{KIND_HINT[problem.kind]}</p>

      {textInput && <TextAnswer {...props} />}
      {problem.kind === "choice" && <ChoiceAnswer {...props} problem={problem} />}
      {problem.kind === "order" && <OrderAnswer {...props} problem={problem} />}

      {revealed && <Reveal {...props} canGoNext={canGoNext} />}
    </div>
  );
}

/** 빈칸 채우기·고치기 — 입력창. */
function TextAnswer({ problem, submitted, verdict, script, onScriptChange, onSubmit, onNext }: PracticeQuestionProps) {
  const [typed, setTyped] = useState("");
  const input = useScriptInput<HTMLInputElement>(script, typed, setTyped, () =>
    onScriptChange(script === "ja" ? "default" : "ja")
  );
  const revealed = submitted !== null;

  // 문제가 뜨면 바로 칠 수 있게 커서를 넣는다. 엘리먼트가 붙는 건 렌더 한 박자 뒤라
  // `input.el`을 기다린다(useScriptInput의 el 주석 참고).
  useEffect(() => {
    input.el?.focus();
  }, [input.el]);

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    // 폼의 암묵적 제출 대신 onKeyDown으로 직접 처리한다(프로젝트 표준). 조합(IME) 중의
    // Enter는 글자 확정이라 제출로 치지 않는다.
    if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
    e.preventDefault();
    // 채점한 뒤의 Enter는 "다음 문제" — 손을 키보드에서 떼지 않고 이어서 풀 수 있다.
    // AI 재확인 중(verdict가 아직 null)에는 넘어가지 않는다.
    if (revealed) {
      if (verdict !== null) onNext();
    } else if (typed.trim()) onSubmit(typed);
  }

  const border = !revealed
    ? "border-gray-100 focus:border-primary/40"
    : verdict === "correct"
      ? "border-primary bg-primary/10 text-primary"
      : verdict === "accepted"
        ? "border-warning bg-warning/10 text-gray-700"
        : verdict === "wrong"
          ? "animate-shake border-danger bg-danger/10 text-danger"
          : "border-gray-100 text-gray-500";

  return (
    <>
      <div className="mt-3 flex justify-end pb-2">
        <InputModeToggle value={script} onChange={onScriptChange} />
      </div>
      {/* value/onChange를 주지 않는다 — 값은 useScriptInput이 네이티브 리스너로 읽는다
          (wanakana 변환이 바꾼 값을 React 합성 onChange가 놓치기 때문, CLAUDE.md 참고).
          채점한 뒤에는 readOnly로 둔다 — disabled면 포커스가 빠져 Enter로 넘어갈 수 없다. */}
      <input
        ref={input.ref}
        readOnly={revealed}
        onKeyDown={handleKeyDown}
        placeholder={problem.kind === "fix" ? "고친 문장" : "빈칸에 들어갈 말"}
        aria-label={problem.kind === "fix" ? "고친 문장" : "빈칸에 들어갈 말"}
        className={`w-full rounded-2xl border-2 px-4 py-3 font-mixed text-lg focus:outline-none ${border}`}
      />
      {!revealed && (
        <SubmitRow canSubmit={typed.trim().length > 0} onSubmit={() => onSubmit(typed)} onSkip={() => onSubmit("")} />
      )}
    </>
  );
}

/** 객관식 — 보기를 누르면 그 자리에서 제출된다. */
function ChoiceAnswer({ problem, submitted, onSubmit }: PracticeQuestionProps & { problem: ChoiceProblem }) {
  const revealed = submitted !== null;
  return (
    <div className="mt-3 flex flex-col gap-2">
      {problem.choices.map((choice, i) => {
        const isAnswer = i === problem.answerIndex;
        const isWrongPick = revealed && choice === submitted && !isAnswer;
        let style = "border-gray-100 bg-white text-gray-700";
        if (revealed && isAnswer) style = "border-primary bg-primary/10 text-primary";
        else if (isWrongPick) style = "border-danger bg-danger/10 text-danger";
        return (
          <button
            key={choice}
            onClick={() => onSubmit(choice)}
            disabled={revealed}
            className={`rounded-2xl border-2 px-4 py-3 text-left font-mixed text-lg transition-colors ${style} ${
              isWrongPick ? "animate-shake" : ""
            }`}
          >
            {choice}
          </button>
        );
      })}
    </div>
  );
}

/**
 * 어순 배열 — 아래 조각을 누르면 위 답 칸으로 올라가고, 답 칸의 조각을 누르면 되돌아간다.
 * 드래그가 아니라 탭인 이유: 작은 화면에서 드래그는 스크롤과 부딪히고, 누르는 편이 아이에게도 쉽다.
 */
function OrderAnswer({ problem, submitted, onSubmit }: PracticeQuestionProps & { problem: OrderProblem }) {
  /** 답 칸에 올린 조각 — `shuffled`의 인덱스. 같은 글자의 조각이 둘일 수 있어 글자가 아니라 자리로 든다. */
  const [picked, setPicked] = useState<number[]>([]);
  const revealed = submitted !== null;
  const complete = picked.length === problem.shuffled.length;
  // 채점은 이어 붙인 글자로 하고(isCorrectAnswer가 공백을 무시한다), 보여줄 땐 띄어 쓴 게 읽기 쉽다.
  const response = picked.map((i) => problem.shuffled[i]).join(" ");

  const chip = "rounded-xl border-2 px-3 py-1.5 font-ja text-lg";

  return (
    <>
      <div className="mt-3 flex min-h-14 flex-wrap items-center gap-2 rounded-2xl border-2 border-dashed border-gray-200 p-2">
        {picked.length === 0 && <span className="px-1 text-sm text-gray-300">여기에 문장이 만들어져요</span>}
        {picked.map((i) => (
          <button
            key={i}
            onClick={() => setPicked((p) => p.filter((x) => x !== i))}
            disabled={revealed}
            className={`${chip} border-primary/30 bg-primary/5 text-gray-800`}
          >
            {problem.shuffled[i]}
          </button>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {problem.shuffled.map((piece, i) =>
          picked.includes(i) ? (
            // 자리를 비워 두면 조각이 빠질 때마다 나머지가 옆으로 밀려 눌러야 할 곳이 움직인다.
            <span key={i} className={`${chip} invisible`} aria-hidden>
              {piece}
            </span>
          ) : (
            <button
              key={i}
              onClick={() => setPicked((p) => [...p, i])}
              disabled={revealed}
              className={`${chip} border-gray-100 bg-white text-gray-700`}
            >
              {piece}
            </button>
          )
        )}
      </div>
      {!revealed && <SubmitRow canSubmit={complete} onSubmit={() => onSubmit(response)} onSkip={() => onSubmit("")} />}
    </>
  );
}

function SubmitRow({ canSubmit, onSubmit, onSkip }: { canSubmit: boolean; onSubmit: () => void; onSkip: () => void }) {
  return (
    <div className="mt-4 flex gap-2">
      {/* 모르는 걸 억지로 찍게 하지 않는다 — 넘긴 문제도 틀린 것으로 세고 정답을 보여준다. */}
      <button onClick={onSkip} className="rounded-2xl border-2 border-gray-100 px-4 py-3 font-bold text-gray-400">
        모르겠어요
      </button>
      <button onClick={onSubmit} disabled={!canSubmit} className={`${PRIMARY_BUTTON} flex-1`} style={PRIMARY_SHADOW}>
        확인
      </button>
    </div>
  );
}

/** 채점 뒤의 결과 영역 — 판정·모범 답·해설·다음 버튼. 유형과 상관없이 같다. */
function Reveal({
  problem,
  index,
  total,
  verdict,
  judging,
  judgeReason,
  onNext,
  canGoNext,
}: PracticeQuestionProps & { canGoNext: boolean }) {
  return (
    <div className="mt-4">
      {judging ? (
        // 코드는 틀렸다고 봤지만 일본어로 쓴 답이라, 다른 맞는 표현인지 AI에게 한 번 더 묻는 중이다.
        <LoadingMascot label="다른 표현으로도 맞는지 보는 중..." />
      ) : verdict === "correct" ? (
        <p className="font-bold text-primary">⭕ 정답이에요!</p>
      ) : verdict === "accepted" ? (
        // ⭕와 다른 표시로 둔다 — 판정한 게 작은 온디바이스 모델이라 틀릴 수 있다. 모범 답도 꼭 같이 보여준다.
        <div>
          <p className="font-bold text-accent">△ 이렇게도 쓸 수 있어요</p>
          {judgeReason && <p className="mt-0.5 font-mixed text-sm text-gray-500">{judgeReason}</p>}
        </div>
      ) : (
        <p className="font-bold text-danger">❌ 아쉬워요!</p>
      )}

      {/* 객관식은 보기에 이미 정답이 표시돼 있다. 나머지는 모범 답을 적어준다(맞았어도 — 다른 정답이
          있었다는 걸 알 수 있게). */}
      {problem.kind !== "choice" && !judging && (
        <p className="mt-1 font-mixed text-gray-700">
          {verdict === "correct" ? "정답" : "모범 답"}: <span className="font-ja text-lg">{modelAnswer(problem)}</span>
        </p>
      )}
      {problem.explanation && !judging && (
        <div className="text-sm text-gray-600">
          <MarkdownAnswer text={problem.explanation} />
        </div>
      )}
      <button onClick={onNext} disabled={!canGoNext} className={`${PRIMARY_BUTTON} mt-4`} style={PRIMARY_SHADOW}>
        {index + 1 >= total ? "결과 보기" : "다음 문제"}
      </button>
    </div>
  );
}

export default PracticeQuestion;
