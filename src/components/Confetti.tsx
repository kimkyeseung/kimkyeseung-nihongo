import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useConfettiStore } from "../stores/confettiStore";

interface Piece {
  id: number;
  x: number;
  y: number;
  rotate: number;
  color: string;
}

const COLORS = ["#58CC02", "#1CB0F6", "#FFC800", "#FF9600", "#FF4B4B"];
const PIECE_COUNT = 20;

/** 화면 전체에 뿌려지는 confetti. Layout에 한 번만 마운트하고 useConfettiStore.celebrate()로 터뜨린다. */
function Confetti() {
  const burst = useConfettiStore((s) => s.burst);
  const [pieces, setPieces] = useState<Piece[]>([]);

  useEffect(() => {
    if (burst === 0) return;
    const next = Array.from({ length: PIECE_COUNT }, (_, i) => ({
      id: burst * 1000 + i,
      x: (Math.random() - 0.5) * 320,
      y: 260 + Math.random() * 220,
      rotate: Math.random() * 360,
      color: COLORS[i % COLORS.length],
    }));
    setPieces(next);
    const t = setTimeout(() => setPieces([]), 1000);
    return () => clearTimeout(t);
  }, [burst]);

  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      <AnimatePresence>
        {pieces.map((p) => (
          <motion.span
            key={p.id}
            className="absolute top-1/3 left-1/2 h-2.5 w-2.5 rounded-sm"
            style={{ backgroundColor: p.color }}
            initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
            animate={{ x: p.x, y: p.y, opacity: 0, rotate: p.rotate }}
            transition={{ duration: 0.9, ease: "easeOut" }}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}

export default Confetti;
