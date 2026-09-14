import { useState } from "react";
import { useGamificationStore } from "../stores/gamificationStore";
import BadgeSheet from "./BadgeSheet";

function GamificationBar() {
  const xp = useGamificationStore((s) => s.xp);
  const streak = useGamificationStore((s) => s.streak);
  const [showBadges, setShowBadges] = useState(false);

  return (
    <>
      <button
        onClick={() => setShowBadges(true)}
        className="flex items-center gap-2 rounded-full bg-gray-50 px-3 py-1.5 text-sm"
      >
        <span title="연속 학습일">🔥 {streak}</span>
        <span title="누적 XP">⭐ {xp}</span>
      </button>
      <BadgeSheet open={showBadges} onClose={() => setShowBadges(false)} />
    </>
  );
}

export default GamificationBar;
