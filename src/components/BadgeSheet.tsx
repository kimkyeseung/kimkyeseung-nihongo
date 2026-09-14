import { AnimatePresence, motion } from "framer-motion";
import { BADGES, type BadgeContext } from "../lib/badges";
import { useGamificationStore } from "../stores/gamificationStore";
import { useWordbookStore } from "../stores/wordbookStore";
import { useKanjiProgressStore } from "../stores/kanjiProgressStore";

function BadgeSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const xp = useGamificationStore((s) => s.xp);
  const streak = useGamificationStore((s) => s.streak);
  const wordbookCount = useWordbookStore((s) => Object.keys(s.entries).length);
  const kanjiLearnedCount = useKanjiProgressStore((s) => s.learned.length);

  const ctx: BadgeContext = { xp, streak, wordbookCount, kanjiLearnedCount };

  return (
    <AnimatePresence>
      {open && (
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
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-primary">나의 뱃지</h3>
              <button onClick={onClose} className="text-2xl leading-none text-gray-400" aria-label="닫기">
                ×
              </button>
            </div>

            <div className="mt-3 flex gap-4 text-sm text-gray-500">
              <span>🔥 연속 {streak}일</span>
              <span>⭐ XP {xp}</span>
            </div>

            <ul className="mt-4 grid grid-cols-2 gap-3">
              {BADGES.map((badge) => {
                const unlocked = badge.isUnlocked(ctx);
                return (
                  <li
                    key={badge.id}
                    className={`flex flex-col items-center gap-1 rounded-2xl border-2 p-3 text-center ${
                      unlocked ? "border-primary/30 bg-primary/5" : "border-gray-100 bg-gray-50"
                    }`}
                  >
                    <span className={`text-3xl ${unlocked ? "" : "opacity-25 grayscale"}`}>{badge.emoji}</span>
                    <span className={`text-sm font-bold ${unlocked ? "text-primary" : "text-gray-400"}`}>
                      {badge.label}
                    </span>
                    <span className="text-xs text-gray-400">{badge.description}</span>
                  </li>
                );
              })}
            </ul>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default BadgeSheet;
