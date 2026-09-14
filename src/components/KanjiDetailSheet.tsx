import { Suspense } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Link } from "react-router-dom";
import KanjiStrokeOrder from "./KanjiStrokeOrder";
import LoadingMascot from "./LoadingMascot";
import { findWordsContainingKanji } from "../lib/dictionary";
import { useKanjiProgressStore } from "../stores/kanjiProgressStore";
import { useGamificationStore } from "../stores/gamificationStore";
import { useConfettiStore } from "../stores/confettiStore";
import { XP_REWARDS } from "../lib/xpRewards";
import type { KanjiEntry } from "../types/kanji";

function KanjiDetailSheet({ entry, onClose }: { entry: KanjiEntry | null; onClose: () => void }) {
  const isLearned = useKanjiProgressStore((s) => (entry ? s.learned.includes(entry.kanji) : false));
  const toggleLearned = useKanjiProgressStore((s) => s.toggleLearned);
  const recordProgress = useGamificationStore((s) => s.recordProgress);
  const celebrate = useConfettiStore((s) => s.celebrate);
  const examples = entry ? findWordsContainingKanji(entry.kanji) : [];

  function handleToggleLearned() {
    if (!entry) return;
    if (!isLearned) {
      // 학습 완료로 "표시할 때"만 XP 지급 + 축하 효과 (되돌릴 때는 아무 일도 없음)
      recordProgress(XP_REWARDS.kanjiLearned);
      celebrate();
    }
    toggleLearned(entry.kanji);
  }

  return (
    <AnimatePresence>
      {entry && (
        <motion.div
          className="fixed inset-0 z-20 flex items-end justify-center bg-black/30 sm:items-center"
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
              <span className="rounded-full bg-primary/10 px-3 py-1 text-sm text-primary">
                {entry.jlptLevel}
              </span>
              <button onClick={onClose} className="text-2xl leading-none text-gray-400" aria-label="닫기">
                ×
              </button>
            </div>

            <div className="mt-3 flex justify-center">
              <Suspense
                fallback={
                  <div
                    className="flex items-center justify-center rounded-2xl bg-gray-50"
                    style={{ width: 180, height: 180 }}
                  >
                    <LoadingMascot />
                  </div>
                }
              >
                <KanjiStrokeOrder kanji={entry.kanji} size={180} />
              </Suspense>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-gray-400">음독</p>
                <p className="font-ja text-lg">{entry.onyomi.join("、") || "-"}</p>
              </div>
              <div>
                <p className="text-gray-400">훈독</p>
                <p className="font-ja text-lg">{entry.kunyomi.join("、") || "-"}</p>
              </div>
            </div>

            <p className="mt-3 text-gray-600">{entry.meaning.join(", ")}</p>

            <div className="mt-4">
              <p className="mb-1 text-sm text-gray-400">활용 단어</p>
              {examples.length === 0 ? (
                <p className="text-sm text-gray-300">예시 단어 없음</p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {examples.map((w) => (
                    <li key={w.id}>
                      <Link to={`/dictionary/${w.id}`} onClick={onClose} className="text-info">
                        <span className="font-ja">{w.word}</span>
                        <span className="ml-1 text-xs text-gray-400">{w.reading}</span>
                        <span className="ml-2 text-xs text-gray-500">{w.meaning}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <button
              onClick={handleToggleLearned}
              className={`btn-press mt-5 w-full rounded-2xl py-3 font-bold text-white ${
                isLearned ? "bg-gray-300" : "bg-primary"
              }`}
              style={
                {
                  "--btn-shadow": isLearned ? "rgb(0 0 0 / 0.15)" : "#3d9401",
                } as React.CSSProperties
              }
            >
              {isLearned ? "✓ 학습 완료" : "학습 완료로 표시"}
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default KanjiDetailSheet;
