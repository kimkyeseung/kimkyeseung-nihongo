import { animate, motion, useMotionValue, useTransform } from "framer-motion";
import type { WordEntry } from "../types/dictionary";
import { displayMeaning } from "../lib/dictionary";

const SWIPE_THRESHOLD = 100;

/** 카드가 어느 쪽으로 빠지는지. 버튼으로 넘길 때는 x가 0이라 따로 알려줘야 한다. */
export type CardExit = "left" | "right" | "remove";

const exitVariants = {
  exit: (dir: CardExit) =>
    dir === "remove"
      ? { y: 300, opacity: 0, transition: { duration: 0.2 } }
      : { x: dir === "right" ? 400 : -400, opacity: 0, transition: { duration: 0.2 } },
};

/**
 * 복습 카드. **앞면은 단어만 보여준다** — 예전엔 읽기·뜻이 처음부터 다 보여서, 떠올려 보는
 * 과정 없이 "보고 넘기기"가 됐고 "안다"는 답을 믿을 수 없었다. 탭해서 뒤집은 뒤에만 넘길
 * 수 있다(`revealed`가 아니면 drag를 끈다).
 */
function WordbookCard({
  entry,
  onSwipe,
  onReveal,
  isTop,
  revealed,
}: {
  entry: WordEntry;
  onSwipe: (direction: "left" | "right") => void;
  onReveal: () => void;
  isTop: boolean;
  revealed: boolean;
}) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-12, 12]);
  const knowOpacity = useTransform(x, [20, 120], [0, 1]);
  const unknownOpacity = useTransform(x, [-120, -20], [1, 0]);
  const showBack = isTop && revealed;

  return (
    <motion.div
      className="absolute inset-0 flex flex-col justify-between rounded-3xl border-2 border-gray-100 bg-white p-6 shadow-lg"
      style={{ x, rotate }}
      drag={showBack ? "x" : false}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.7}
      onTap={() => {
        if (isTop && !revealed) onReveal();
      }}
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
      variants={exitVariants}
      exit="exit"
    >
      <motion.span
        style={{ opacity: knowOpacity }}
        className="absolute top-6 right-6 rounded-xl border-4 border-primary px-3 py-1 text-lg font-bold text-primary"
      >
        알아요
      </motion.span>
      <motion.span
        style={{ opacity: unknownOpacity }}
        className="absolute top-6 left-6 rounded-xl border-4 border-info px-3 py-1 text-lg font-bold text-info"
      >
        모르겠어요
      </motion.span>

      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <span className="rounded-full bg-primary/10 px-3 py-1 text-sm text-primary">
          {entry.jlptLevel}
        </span>
        <h3 className="mt-4 font-ja text-5xl">{entry.word}</h3>
        {showBack ? (
          <>
            {entry.reading !== entry.word && (
              <p className="mt-2 font-ja text-xl text-gray-500">{entry.reading}</p>
            )}
            <p className="mt-3 text-gray-600">{displayMeaning(entry)}</p>
          </>
        ) : (
          <p className="mt-4 text-sm text-gray-300">읽기와 뜻을 떠올려 본 뒤 탭하세요</p>
        )}
      </div>

      <p className="text-center text-xs text-gray-300">
        {showBack ? "← 모르겠어요 · 알아요 →" : "탭해서 뒤집기"}
      </p>
    </motion.div>
  );
}

export default WordbookCard;
