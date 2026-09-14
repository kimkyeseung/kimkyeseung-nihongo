import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { getKanjiByLevel } from "../lib/kanji";
import { useKanjiProgressStore } from "../stores/kanjiProgressStore";
import KanjiDetailSheet from "../components/KanjiDetailSheet";
import { JLPT_LEVELS, type JlptLevel } from "../types/jlpt";
import type { KanjiEntry } from "../types/kanji";

function KanjiPage() {
  const [level, setLevel] = useState<JlptLevel>("N5");
  const [selected, setSelected] = useState<KanjiEntry | null>(null);
  const learned = useKanjiProgressStore((s) => s.learned);
  const learnedSet = useMemo(() => new Set(learned), [learned]);

  const levelKanji = useMemo(() => getKanjiByLevel(level), [level]);
  const learnedCount = levelKanji.filter((k) => learnedSet.has(k.kanji)).length;

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

      <p className="mt-3 text-sm text-gray-400">
        {learnedCount} / {levelKanji.length}자 학습 완료
      </p>

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
    </div>
  );
}

export default KanjiPage;
