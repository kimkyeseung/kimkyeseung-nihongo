import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BADGES, type BadgeContext } from "../lib/badges";
import { useGamificationStore } from "../stores/gamificationStore";
import { useWordbookStore } from "../stores/wordbookStore";
import { useKanjiProgressStore } from "../stores/kanjiProgressStore";
import { useConfettiStore } from "../stores/confettiStore";

/**
 * 뱃지가 새로 잠금 해제되는 순간을 감지해 confetti + 토스트를 띄운다.
 * BadgeSheet가 닫혀 있어도(=사용자가 뱃지 화면을 안 보고 있어도) 동작해야 하므로
 * Layout에 항상 마운트해둔다.
 */
function BadgeWatcher() {
  const xp = useGamificationStore((s) => s.xp);
  const streak = useGamificationStore((s) => s.streak);
  const wordbookCount = useWordbookStore((s) => Object.keys(s.entries).length);
  const kanjiLearnedCount = useKanjiProgressStore((s) => s.learned.length);
  const celebrate = useConfettiStore((s) => s.celebrate);

  const [toast, setToast] = useState<string | null>(null);
  const prevUnlockedRef = useRef<Set<string> | null>(null);

  const unlockedIds = useMemo(() => {
    const ctx: BadgeContext = { xp, streak, wordbookCount, kanjiLearnedCount };
    return new Set(BADGES.filter((b) => b.isUnlocked(ctx)).map((b) => b.id));
  }, [xp, streak, wordbookCount, kanjiLearnedCount]);

  useEffect(() => {
    const prev = prevUnlockedRef.current;
    prevUnlockedRef.current = unlockedIds;
    if (!prev) return; // 첫 렌더: 이미 갖고 있던 뱃지까지 축하하지 않는다.

    const newly = [...unlockedIds].filter((id) => !prev.has(id));
    if (newly.length === 0) return;

    celebrate();
    const labels = newly.map((id) => BADGES.find((b) => b.id === id)?.label).filter(Boolean);
    setToast(`🎉 "${labels.join(", ")}" 뱃지 획득!`);
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [unlockedIds, celebrate]);

  return (
    <AnimatePresence>
      {toast && (
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -16 }}
          className="fixed top-4 left-1/2 z-50 -translate-x-1/2 rounded-full bg-primary px-4 py-2 text-sm font-bold text-white shadow-lg"
        >
          {toast}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default BadgeWatcher;
