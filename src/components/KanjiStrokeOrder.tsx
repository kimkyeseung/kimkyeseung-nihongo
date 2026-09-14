import { useState } from "react";
import { motion } from "framer-motion";
import { useStrokes, KANJIVG_VIEW_BOX } from "../lib/kanjivg";

const STROKE_DURATION = 0.35; // 획 하나당 애니메이션 시간(초)

function KanjiStrokeOrder({ kanji, size = 160 }: { kanji: string; size?: number }) {
  const strokes = useStrokes(kanji); // 최초 호출 시 획순 데이터를 내려받는 동안 Suspense됨
  const [playKey, setPlayKey] = useState(0);

  if (strokes.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-2xl bg-gray-50 font-ja text-gray-300"
        style={{ width: size, height: size, fontSize: size * 0.6 }}
      >
        {kanji}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <svg key={playKey} viewBox={KANJIVG_VIEW_BOX} width={size} height={size} className="rounded-2xl bg-gray-50">
        {/* 완성된 글자 모양을 옅게 미리 보여준다 */}
        <g stroke="#e5e7eb" strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round">
          {strokes.map((d, i) => (
            <path key={i} d={d} />
          ))}
        </g>
        <g stroke="#58cc02" strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round">
          {strokes.map((d, i) => (
            <motion.path
              key={i}
              d={d}
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ delay: i * STROKE_DURATION, duration: STROKE_DURATION, ease: "easeInOut" }}
            />
          ))}
        </g>
      </svg>
      <button
        onClick={() => setPlayKey((k) => k + 1)}
        className="rounded-full bg-gray-100 px-4 py-1 text-sm text-gray-600"
      >
        ↻ 다시보기
      </button>
    </div>
  );
}

export default KanjiStrokeOrder;
