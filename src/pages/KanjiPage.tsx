import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { getKanjiByLevel } from "../lib/kanji";
import { useKanjiProgressStore } from "../stores/kanjiProgressStore";
import { useKanjiView } from "../stores/pageStateStore";
import KanjiDetailSheet from "../components/KanjiDetailSheet";
import KanjiQuizSheet from "../components/KanjiQuizSheet";
import { JLPT_LEVELS } from "../types/jlpt";
import type { KanjiEntry } from "../types/kanji";

function KanjiPage() {
  // 보고 있던 급수는 페이지를 떠나도 유지된다(pageStateStore 주석 참고).
  const level = useKanjiView((s) => s.level);
  const setLevel = useKanjiView((s) => s.setLevel);
  const [selected, setSelected] = useState<KanjiEntry | null>(null);
  // 테스트를 열 때마다 문제를 새로 섞고 싶어서, "테스트" 버튼을 누를 때마다
  // quizSessionId를 올려 KanjiQuizSheet 내부 컴포넌트를 리마운트시키는 트리거로 쓴다.
  const [quizSessionId, setQuizSessionId] = useState(0);
  const [quizPool, setQuizPool] = useState<KanjiEntry[] | null>(null);
  const learned = useKanjiProgressStore((s) => s.learned);
  const learnedSet = useMemo(() => new Set(learned), [learned]);

  const levelKanji = useMemo(() => getKanjiByLevel(level), [level]);
  const unlearnedKanji = useMemo(
    () => levelKanji.filter((k) => !learnedSet.has(k.kanji)),
    [levelKanji, learnedSet]
  );
  const learnedCount = levelKanji.length - unlearnedKanji.length;

  function handleStartQuiz() {
    setQuizSessionId((id) => id + 1);
    setQuizPool(unlearnedKanji);
  }

  return (
    <div className="p-4 sm:p-6">
      <h2 className="text-xl text-primary">漢 한자 공부</h2>

      <div className="mt-4 flex gap-1 overflow-x-auto rounded-full bg-gray-100 p-1">
        {JLPT_LEVELS.map((lv) => (
          <button
            key={lv}
            onClick={() => setLevel(lv)}
            className={`min-w-14 shrink-0 rounded-full px-4 py-1.5 text-sm transition-colors ${
              level === lv ? "bg-primary text-white" : "text-gray-500"
            }`}
          >
            {lv}
          </button>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <p className="text-sm text-gray-400">
          {learnedCount} / {levelKanji.length}자 학습 완료
        </p>
        <button
          onClick={handleStartQuiz}
          disabled={unlearnedKanji.length === 0}
          className="btn-press rounded-2xl bg-info px-4 py-1.5 text-sm font-bold text-white disabled:bg-gray-200 disabled:text-gray-400 disabled:shadow-none"
          style={{ "--btn-shadow": "#1290c7" } as React.CSSProperties}
        >
          ✏️ 미완료 한자 테스트
        </button>
      </div>

      <div className="mt-4 grid grid-cols-4 gap-3 sm:grid-cols-6">
        {levelKanji.map((k) => (
          <motion.button
            key={k.kanji}
            whileTap={{ scale: 0.9 }}
            onClick={() => setSelected(k)}
            className={`relative flex aspect-square flex-col items-center justify-center rounded-2xl border-2 bg-white shadow-sm ${
              learnedSet.has(k.kanji) ? "border-primary/40" : "border-gray-100"
            }`}
          >
            {learnedSet.has(k.kanji) && (
              <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs text-white">
                ✓
              </span>
            )}
            <span className="font-ja text-3xl">{k.kanji}</span>
          </motion.button>
        ))}
      </div>

      <KanjiDetailSheet entry={selected} onClose={() => setSelected(null)} />
      <KanjiQuizSheet key={quizSessionId} pool={quizPool} onClose={() => setQuizPool(null)} />
    </div>
  );
}

export default KanjiPage;
