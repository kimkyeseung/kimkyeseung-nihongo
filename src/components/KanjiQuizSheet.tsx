import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { buildKanjiQuiz } from "../lib/kanjiQuiz";
import { useConfettiStore } from "../stores/confettiStore";
import { useGamificationStore } from "../stores/gamificationStore";
import { XP_REWARDS } from "../lib/xpRewards";
import type { KanjiEntry } from "../types/kanji";

// pool(학습 미완료 한자 목록)이 같아도 "테스트" 버튼을 누를 때마다 새로 섞인 문제를
// 원하므로, KanjiPage에서 열 때마다 바뀌는 key로 이 컴포넌트 자체를 리마운트시켜
// buildKanjiQuiz를 매번 새로 호출하게 한다(useEffect+setState 대신 마운트 시점 스냅샷).
function KanjiQuizSheet({ pool, onClose }: { pool: KanjiEntry[] | null; onClose: () => void }) {
  return <AnimatePresence>{pool && <QuizContent pool={pool} onClose={onClose} />}</AnimatePresence>;
}

function QuizContent({ pool, onClose }: { pool: KanjiEntry[]; onClose: () => void }) {
  const [questions] = useState(() => buildKanjiQuiz(pool));
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const celebrate = useConfettiStore((s) => s.celebrate);
  const recordProgress = useGamificationStore((s) => s.recordProgress);

  const done = index >= questions.length;
  const current = questions[index];

  function handleSelect(choiceIndex: number) {
    if (selected !== null) return;
    setSelected(choiceIndex);
    if (choiceIndex === current.answerIndex) {
      setScore((s) => s + 1);
      celebrate();
    }
  }

  function handleNext() {
    if (index + 1 >= questions.length) {
      // 시험 완료라는 명확한 학습 행동에만 한 번 지급 (문제 하나하나가 아니라 완료 시점)
      recordProgress(XP_REWARDS.kanjiQuizCompleted);
    }
    setSelected(null);
    setIndex((i) => i + 1);
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
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-6 sm:rounded-3xl"
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 40, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <h3 className="text-lg font-bold text-primary">✏️ 미완료 한자 테스트</h3>
          <button onClick={onClose} className="text-2xl leading-none text-gray-400" aria-label="닫기">
            ×
          </button>
        </div>

        {done ? (
          <div className="mt-6 flex flex-col items-center gap-2 text-center">
            <span className="text-4xl">🎉</span>
            <p className="text-xl font-bold text-primary">
              {score} / {questions.length} 문제 정답!
            </p>
            <p className="text-sm text-gray-400">틀린 한자는 다시 한번 확인해보세요.</p>
            <button
              onClick={onClose}
              className="btn-press mt-4 w-full rounded-2xl bg-primary py-3 font-bold text-white"
              style={{ "--btn-shadow": "#3d9401" } as React.CSSProperties}
            >
              완료
            </button>
          </div>
        ) : (
          <div className="mt-6">
            <p className="text-sm text-gray-400">
              {index + 1} / {questions.length}
            </p>
            <div className="mt-2 flex justify-center">
              <span className="font-ja text-6xl">{current.kanji.kanji}</span>
            </div>
            <p className="mt-1 text-center text-sm text-gray-400">이 한자의 읽기는?</p>

            <div className="mt-4 flex flex-col gap-2">
              {current.choices.map((choice, choiceIndex) => {
                const isAnswer = choiceIndex === current.answerIndex;
                const isSelected = choiceIndex === selected;
                const revealed = selected !== null;
                const isWrongSelection = revealed && isSelected && !isAnswer;

                let style = "border-gray-100 bg-white text-gray-700";
                if (revealed && isAnswer) style = "border-primary bg-primary/10 text-primary";
                else if (isWrongSelection) style = "border-danger bg-danger/10 text-danger";

                return (
                  <button
                    key={choice}
                    onClick={() => handleSelect(choiceIndex)}
                    disabled={revealed}
                    className={`rounded-2xl border-2 px-4 py-3 text-left font-ja text-lg transition-colors ${style} ${
                      isWrongSelection ? "animate-shake" : ""
                    }`}
                  >
                    {choice}
                  </button>
                );
              })}
            </div>

            {selected !== null && (
              <button
                onClick={handleNext}
                className="btn-press mt-5 w-full rounded-2xl bg-primary py-3 font-bold text-white"
                style={{ "--btn-shadow": "#3d9401" } as React.CSSProperties}
              >
                {index + 1 >= questions.length ? "결과 보기" : "다음 문제"}
              </button>
            )}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

export default KanjiQuizSheet;
