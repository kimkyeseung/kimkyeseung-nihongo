import { AnimatePresence, motion } from "framer-motion";
import type { WordEntry } from "../types/dictionary";

function JapaneseSuggestionList({
  suggestions,
  activeIndex,
  onSelect,
  /**
   * 입력창 기준 어느 쪽에 띄울지. 기본은 아래(회화·작문 — 입력창이 화면 위쪽에 있다).
   * 선생님 페이지처럼 입력창이 화면 맨 아래에 붙어 있으면 "above"로 위에 띄운다.
   */
  placement = "below",
}: {
  suggestions: WordEntry[];
  activeIndex: number;
  onSelect: (entry: WordEntry) => void;
  placement?: "below" | "above";
}) {
  const above = placement === "above";
  // 나타나는 방향도 뒤집는다 — 위에 뜨는 목록이 위에서 내려오면 입력창을 덮는 것처럼 보인다.
  const offset = above ? 8 : -8;

  return (
    <AnimatePresence>
      {suggestions.length > 0 && (
        <motion.ul
          initial={{ opacity: 0, y: offset }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: offset }}
          transition={{ duration: 0.15 }}
          className={`absolute z-10 w-full overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-lg ${
            above ? "bottom-full mb-2" : "mt-2"
          }`}
        >
          {suggestions.map((s, i) => (
            <li key={s.id}>
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onSelect(s)}
                className={`flex w-full items-baseline gap-2 px-4 py-2 text-left ${
                  i === activeIndex ? "bg-primary/10" : ""
                }`}
              >
                <span className="font-ja text-lg">{s.word}</span>
                <span className="font-ja text-sm text-gray-400">{s.reading}</span>
                <span className="ml-auto truncate text-sm text-gray-500">{s.meaning}</span>
              </button>
            </li>
          ))}
        </motion.ul>
      )}
    </AnimatePresence>
  );
}

export default JapaneseSuggestionList;
