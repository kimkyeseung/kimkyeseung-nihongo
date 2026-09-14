import { animate, motion, useMotionValue, useTransform } from "framer-motion";
import type { WordEntry } from "../types/dictionary";

const SWIPE_THRESHOLD = 100;

function WordbookCard({
  entry,
  onSwipe,
  isTop,
}: {
  entry: WordEntry;
  onSwipe: (direction: "left" | "right") => void;
  isTop: boolean;
}) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-12, 12]);
  const keepOpacity = useTransform(x, [20, 120], [0, 1]);
  const removeOpacity = useTransform(x, [-120, -20], [1, 0]);

  return (
    <motion.div
      className="absolute inset-0 flex flex-col justify-between rounded-3xl border-2 border-gray-100 bg-white p-6 shadow-lg"
      style={{ x, rotate }}
      drag={isTop ? "x" : false}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.7}
      onDragEnd={(_, info) => {
        if (info.offset.x > SWIPE_THRESHOLD) {
          onSwipe("right");
        } else if (info.offset.x < -SWIPE_THRESHOLD) {
          // "모르는 단어"는 부정적이지 않게 살짝 흔들어준 다음 카드를 치운다.
          const start = x.get();
          animate(x, [start, start - 10, start + 10, start - 6, start], {
            duration: 0.35,
            ease: "easeInOut",
            onComplete: () => onSwipe("left"),
          });
        }
      }}
      animate={isTop ? { scale: 1, y: 0 } : { scale: 0.96, y: 10 }}
      exit={{
        x: x.get() > 0 ? 400 : -400,
        opacity: 0,
        transition: { duration: 0.2 },
      }}
    >
      <motion.span
        style={{ opacity: keepOpacity }}
        className="absolute top-6 right-6 rounded-xl border-4 border-primary px-3 py-1 text-lg font-bold text-primary"
      >
        학습 완료
      </motion.span>
      <motion.span
        style={{ opacity: removeOpacity }}
        className="absolute top-6 left-6 rounded-xl border-4 border-danger px-3 py-1 text-lg font-bold text-danger"
      >
        삭제
      </motion.span>

      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <span className="rounded-full bg-primary/10 px-3 py-1 text-sm text-primary">
          {entry.jlptLevel}
        </span>
        <h3 className="mt-4 font-ja text-5xl">{entry.word}</h3>
        <p className="mt-2 font-ja text-xl text-gray-500">{entry.reading}</p>
        <p className="mt-3 text-gray-600">{entry.meaning}</p>
      </div>

      <p className="text-center text-xs text-gray-300">
        ← 왼쪽: 삭제 · 오른쪽: 학습 완료 →
      </p>
    </motion.div>
  );
}

export default WordbookCard;
