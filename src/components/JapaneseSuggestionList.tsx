import { AnimatePresence, motion } from "framer-motion";
import type { WordEntry } from "../types/dictionary";

function JapaneseSuggestionList({
  suggestions,
  activeIndex,
  onSelect,
}: {
  suggestions: WordEntry[];
  activeIndex: number;
  onSelect: (entry: WordEntry) => void;
}) {
  return (
    <AnimatePresence>
      {suggestions.length > 0 && (
        <motion.ul
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.15 }}
          className="absolute z-10 mt-2 w-full overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-lg"
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
