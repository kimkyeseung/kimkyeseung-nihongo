import { useEffect, useState } from "react";
import type { KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import InputModeToggle from "./InputModeToggle";
import { useScriptInput, type InputScript } from "../hooks/useScriptInput";
import { buildConjugationDrill, isConjugationCorrect, type DrillQuestion } from "../lib/conjugationDrill";
import { VERB_FORM_LABEL, dictionaryForm } from "../lib/verbConjugation";
import { XP_REWARDS } from "../lib/xpRewards";
import { useConfettiStore } from "../stores/confettiStore";
import { useGamificationStore } from "../stores/gamificationStore";
import type { WordEntry } from "../types/dictionary";

const PRIMARY_SHADOW = { ["--btn-shadow" as string]: "#3d9401" };

/**
 * 단어장 동사로 푸는 활용 연습(바텀시트). 정답은 규칙으로 계산하니 채점도 코드가 한다
 * (conjugationDrill.ts). 문제 세트는 연 순간의 스냅샷이라, 다시 섞으려면 부르는 쪽이 `key`를
 * 바꿔 리마운트한다(한자 퀴즈와 같은 방식).
 *
 * body로 포털한다 — AnimatedOutlet이 페이지에 transform을 걸어서 `fixed`가 뷰포트 기준이 아니게
 * 된다(ActionMenu·연습해보기 시트와 같은 이유).
 */
function ConjugationDrillSheet({ pool, onClose }: { pool: WordEntry[] | null; onClose: () => void }) {
  return createPortal(
    <AnimatePresence>{pool && <DrillContent pool={pool} onClose={onClose} />}</AnimatePresence>,
    document.body
  );
}

type Result = { question: DrillQuestion; typed: string; correct: boolean };

function DrillContent({ pool, onClose }: { pool: WordEntry[]; onClose: () => void }) {
  const [round, setRound] = useState(0);
  const [questions, setQuestions] = useState(() => buildConjugationDrill(pool));
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<Result[]>([]);
  const [script, setScript] = useState<InputScript>("ja");
  const [xpClaimed, setXpClaimed] = useState(false);
  const celebrate = useConfettiStore((s) => s.celebrate);
  const recordProgress = useGamificationStore((s) => s.recordProgress);

  const done = index >= questions.length;
  const current = questions[index];
  const submitted = results[index] ?? null;
  const score = results.filter((r) => r.correct).length;

  function submit(typed: string) {
    if (submitted || !current) return;
    const correct = isConjugationCorrect(typed, current.answer);
    setResults((prev) => [...prev, { question: current, typed, correct }]);
    if (correct) celebrate();
  }

  function next() {
    if (!submitted) return;
    if (index + 1 >= questions.length && !xpClaimed) {
      // 완주에 한 번(한자 퀴즈·발음 게임과 같은 규칙). "다시 풀기"로는 더 쌓이지 않는다 —
      // 버튼만 눌러 문제를 넘겨도 완주는 되니, 반복으로 긁어가지 못하게.
      recordProgress(XP_REWARDS.conjugationDrillCompleted);
      setXpClaimed(true);
    }
    setIndex((i) => i + 1);
  }

  function restart() {
    setQuestions(buildConjugationDrill(pool));
    setResults([]);
    setIndex(0);
    setRound((r) => r + 1);
  }

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
        aria-label="동사 활용 연습"
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-6 sm:rounded-3xl"
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 40, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <h3 className="text-lg font-bold text-primary">✍️ 동사 활용 연습</h3>
          <button onClick={onClose} className="text-2xl leading-none text-gray-400" aria-label="닫기">
            ×
          </button>
        </div>

        {done ? (
          <div className="mt-6">
            <div className="flex flex-col items-center gap-1 text-center">
              <span className="text-4xl">{score === questions.length ? "🎉" : "💪"}</span>
              <p className="text-xl font-bold text-primary">
                {score} / {questions.length} 정답!
              </p>
            </div>
            {results.some((r) => !r.correct) && (
              <ul className="mt-4 flex flex-col gap-2">
                {results
                  .filter((r) => !r.correct)
                  .map((r) => (
                    <li key={`${r.question.entry.id}:${r.question.form}`} className="rounded-2xl border-2 border-gray-100 px-4 py-2 text-sm">
                      <p className="text-gray-500">
                        <span className="font-ja">{dictionaryForm(r.question.entry).kanji}</span> →{" "}
                        {VERB_FORM_LABEL[r.question.form].name}
                      </p>
                      <p className="font-ja text-primary">
                        ⭕ {r.question.answer.kanji}
                        {r.question.answer.reading && (
                          <span className="ml-1 text-xs text-gray-400">{r.question.answer.reading}</span>
                        )}
                      </p>
                      <p className="font-mixed text-danger">❌ {r.typed.trim() || "(모르겠어요)"}</p>
                    </li>
                  ))}
              </ul>
            )}
            <div className="mt-5 flex gap-2">
              <button onClick={restart} className="btn-press flex-1 rounded-2xl bg-gray-100 py-3 text-gray-600">
                다시 풀기
              </button>
              <button
                onClick={onClose}
                className="btn-press flex-1 rounded-2xl bg-primary py-3 font-bold text-white"
                style={PRIMARY_SHADOW}
              >
                완료
              </button>
            </div>
          </div>
        ) : (
          <DrillQuestionView
            // 문제마다 리마운트해 입력창을 비운다(연습해보기와 같은 방식).
            key={`${round}:${index}`}
            question={current}
            position={`${index + 1} / ${questions.length}`}
            submitted={submitted}
            script={script}
            onScriptChange={setScript}
            onSubmit={submit}
            onNext={next}
            isLast={index + 1 >= questions.length}
          />
        )}
      </motion.div>
    </motion.div>
  );
}

function DrillQuestionView({
  question,
  position,
  submitted,
  script,
  onScriptChange,
  onSubmit,
  onNext,
  isLast,
}: {
  question: DrillQuestion;
  position: string;
  submitted: Result | null;
  script: InputScript;
  onScriptChange: (script: InputScript) => void;
  onSubmit: (typed: string) => void;
  onNext: () => void;
  isLast: boolean;
}) {
  const [typed, setTyped] = useState("");
  const input = useScriptInput<HTMLInputElement>(script, typed, setTyped, () =>
    onScriptChange(script === "ja" ? "default" : "ja")
  );
  const revealed = submitted !== null;
  const label = VERB_FORM_LABEL[question.form];
  const { entry, answer } = question;
  const base = dictionaryForm(entry);

  // 문제가 뜨면 바로 칠 수 있게 커서를 넣는다(엘리먼트가 붙는 건 렌더 한 박자 뒤).
  useEffect(() => {
    input.el?.focus();
  }, [input.el]);

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    // <form onSubmit> 대신 onKeyDown(프로젝트 표준). 조합(IME) 중의 Enter는 글자 확정이다.
    if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
    e.preventDefault();
    // 채점한 뒤의 Enter는 "다음 문제" — 키보드에서 손을 떼지 않고 이어 풀 수 있다.
    if (revealed) onNext();
    else if (typed.trim()) onSubmit(typed);
  }

  const border = !revealed
    ? "border-gray-100 focus:border-primary/40"
    : submitted.correct
      ? "border-primary bg-primary/10 text-primary"
      : "animate-shake border-danger bg-danger/10 text-danger";

  return (
    <div className="mt-4">
      <p className="text-sm text-gray-400">{position}</p>
      <div className="mt-3 text-center">
        <p className="font-ja text-4xl">{base.kanji}</p>
        {base.reading !== base.kanji && <p className="mt-1 font-ja text-gray-400">{base.reading}</p>}
        <p className="mt-3 text-lg">
          → <span className="font-bold text-primary">{label.name}</span>
          <span className="ml-1 text-sm text-gray-400">({label.hint})</span>
        </p>
      </div>

      <div className="mt-4 flex justify-end pb-2">
        <InputModeToggle value={script} onChange={onScriptChange} />
      </div>
      {/* value/onChange를 주지 않는다 — useScriptInput이 네이티브 리스너로 읽는다(CLAUDE.md의
          WanaKana 절). 채점한 뒤에는 disabled가 아니라 readOnly — 포커스가 남아야 Enter로 넘어간다. */}
      <input
        ref={input.ref}
        readOnly={revealed}
        onKeyDown={handleKeyDown}
        placeholder="활용형을 써 보세요 (로마자도 돼요)"
        aria-label={`${base.kanji}의 ${label.name}`}
        className={`w-full rounded-2xl border-2 px-4 py-3 font-mixed text-lg focus:outline-none ${border}`}
      />

      {revealed ? (
        <>
          <p className={`mt-3 text-center ${submitted.correct ? "text-primary" : "text-gray-600"}`}>
            {submitted.correct ? "⭕ 맞았어요! " : "정답: "}
            <span className="font-ja text-lg">{answer.kanji}</span>
            {answer.reading && <span className="ml-1 font-ja text-sm text-gray-400">{answer.reading}</span>}
          </p>
          <button
            onClick={onNext}
            className="btn-press mt-4 w-full rounded-2xl bg-primary py-3 font-bold text-white"
            style={PRIMARY_SHADOW}
          >
            {isLast ? "결과 보기" : "다음 문제"}
          </button>
        </>
      ) : (
        <div className="mt-4 flex gap-2">
          <button onClick={() => onSubmit("")} className="rounded-2xl px-4 py-3 text-sm text-gray-400">
            모르겠어요
          </button>
          <button
            onClick={() => onSubmit(typed)}
            disabled={!typed.trim()}
            className="btn-press flex-1 rounded-2xl bg-primary py-3 font-bold text-white disabled:bg-gray-200"
            style={PRIMARY_SHADOW}
          >
            확인
          </button>
        </div>
      )}
    </div>
  );
}

export default ConjugationDrillSheet;
