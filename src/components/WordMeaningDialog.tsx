import { AnimatePresence, motion } from "framer-motion";
import { Link } from "react-router-dom";
import type { WordEntry } from "../types/dictionary";

/** 클릭 가능한 문장(ClickableSentence)에서 단어를 탭했을 때 뜻을 보여주는 공용 다이얼로그. */
function WordMeaningDialog({ word, onClose }: { word: WordEntry | null; onClose: () => void }) {
  return (
    <AnimatePresence>
      {word && (
        <motion.div
          className="fixed inset-0 z-30 flex items-end justify-center bg-black/30 sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="w-full max-w-md rounded-t-3xl bg-white p-6 sm:rounded-3xl"
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="font-ja text-3xl">{word.word}</p>
                <p className="mt-1 font-ja text-lg text-gray-500">{word.reading}</p>
              </div>
              <button onClick={onClose} className="text-2xl leading-none text-gray-400" aria-label="닫기">
                ×
              </button>
            </div>

            <div className="mt-3 flex flex-wrap gap-1">
              {word.pos.map((p) => (
                <span key={p} className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                  {p}
                </span>
              ))}
            </div>

            <ol className="mt-2 flex flex-col gap-1">
              {word.senses.slice(0, 3).map((sense, i) => (
                <li key={i} className="text-gray-700">
                  {i + 1}. {sense.glosses.join("; ")}
                </li>
              ))}
            </ol>

            <Link
              to={`/dictionary/${word.id}`}
              onClick={onClose}
              className="btn-press mt-5 block w-full rounded-2xl bg-primary py-3 text-center font-bold text-white"
              style={{ "--btn-shadow": "#3d9401" } as React.CSSProperties}
            >
              📖 공부하기
            </Link>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default WordMeaningDialog;
