import { useEffect, useRef, useState } from "react";
import type { PointerEvent } from "react";
import { motion } from "framer-motion";
import { KANJIVG_VIEW_BOX, useStrokes } from "../lib/kanjivg";
import {
  HINT_AFTER_MISSES,
  STROKE_FEEDBACK,
  judgeStroke,
  samplePath,
  type Point,
} from "../lib/kanjiWriting";
import { XP_REWARDS } from "../lib/xpRewards";
import { useConfettiStore } from "../stores/confettiStore";
import { useGamificationStore } from "../stores/gamificationStore";

const CANVAS = 109; // KanjiVG 캔버스 한 변

function toPolyline(points: Point[]): string {
  return points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
}

/**
 * 한자 따라 쓰기. 획을 하나씩 그으면 KanjiVG 필순과 대조해 채점한다(kanjiWriting.ts — 모양·방향·순서).
 * 맞은 획은 학습자가 그은 선 대신 **정답 획으로 바꿔 그린다** — 삐뚤빼뚤한 선이 쌓이면 다음 획을
 * 어디에 그을지 가늠하기 어렵다.
 *
 * - "보고 쓰기"는 글자 윤곽과 지금 획의 시작점을 보여준다. "안 보고 쓰기"는 빈 칸이다.
 * - 한 획에서 {@link HINT_AFTER_MISSES}번 틀리면 그 획을 주황색으로 한 번 그려 보여준다.
 *
 * 부르는 쪽을 `<Suspense>`로 감쌀 것 — 획순 데이터(kanjivg.json)를 처음 읽을 때 Suspense된다.
 * 캔버스에는 `touch-action: none`이 필요하다: 없으면 폰에서 획을 긋는 대신 시트가 스크롤된다.
 */
function KanjiWritingPad({ kanji, size = 240 }: { kanji: string; size?: number }) {
  const strokes = useStrokes(kanji);
  const [index, setIndex] = useState(0);
  const [drawing, setDrawing] = useState<Point[] | null>(null);
  const [wrong, setWrong] = useState<Point[] | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [misses, setMisses] = useState(0); // 지금 획에서 틀린 횟수
  const [totalMisses, setTotalMisses] = useState(0);
  const [guide, setGuide] = useState(true);
  const pointsRef = useRef<Point[]>([]);
  const xpClaimedRef = useRef(false);
  const celebrate = useConfettiStore((s) => s.celebrate);
  const recordProgress = useGamificationStore((s) => s.recordProgress);

  const done = strokes.length > 0 && index >= strokes.length;

  // 틀린 선은 잠깐 빨갛게 남겼다가 지운다.
  useEffect(() => {
    if (!wrong) return;
    const t = setTimeout(() => setWrong(null), 700);
    return () => clearTimeout(t);
  }, [wrong]);

  if (strokes.length === 0) {
    return <p className="py-8 text-center text-sm text-gray-400">이 글자는 획순 데이터가 없어서 쓰기 연습을 할 수 없어요.</p>;
  }

  function toCanvas(e: PointerEvent<SVGSVGElement>): Point {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * CANVAS,
      y: ((e.clientY - rect.top) / rect.height) * CANVAS,
    };
  }

  function handleDown(e: PointerEvent<SVGSVGElement>) {
    if (done) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointsRef.current = [toCanvas(e)];
    setDrawing(pointsRef.current);
    setFeedback(null);
  }

  function handleMove(e: PointerEvent<SVGSVGElement>) {
    if (!drawing) return;
    pointsRef.current = [...pointsRef.current, toCanvas(e)];
    setDrawing(pointsRef.current);
  }

  function handleUp() {
    if (!drawing) return;
    const points = pointsRef.current;
    setDrawing(null);
    const result = judgeStroke(points, strokes, index);
    if (result.ok) {
      const next = index + 1;
      setIndex(next);
      setMisses(0);
      if (next >= strokes.length) {
        celebrate();
        // 이 칸을 연 뒤 처음 완성했을 때 한 번만(한자 퀴즈와 같은 규칙). "다시 쓰기"로는 안 쌓인다.
        if (!xpClaimedRef.current) {
          xpClaimedRef.current = true;
          recordProgress(XP_REWARDS.kanjiWritingCompleted);
        }
      }
      return;
    }
    setWrong(points);
    setFeedback(STROKE_FEEDBACK[result.reason]);
    setMisses((m) => m + 1);
    setTotalMisses((m) => m + 1);
  }

  function restart() {
    setIndex(0);
    setMisses(0);
    setTotalMisses(0);
    setFeedback(null);
    setWrong(null);
  }

  const current = strokes[index];
  const start = guide && current ? samplePath(current, 1)[0] : null;
  const showHint = !done && misses >= HINT_AFTER_MISSES;

  return (
    <div className="flex flex-col items-center gap-2">
      <svg
        viewBox={KANJIVG_VIEW_BOX}
        width={size}
        height={size}
        className="touch-none select-none rounded-2xl border-2 border-gray-100 bg-gray-50"
        style={{ touchAction: "none" }}
        onPointerDown={handleDown}
        onPointerMove={handleMove}
        onPointerUp={handleUp}
        onPointerCancel={handleUp}
        role="img"
        aria-label={`${kanji} 쓰기 칸`}
      >
        {/* 칸 가운데 십자선 — 글자의 위치를 가늠하는 기준. */}
        <g className="stroke-gray-200" strokeWidth={0.6} strokeDasharray="2 2">
          <line x1={CANVAS / 2} y1={0} x2={CANVAS / 2} y2={CANVAS} />
          <line x1={0} y1={CANVAS / 2} x2={CANVAS} y2={CANVAS / 2} />
        </g>
        {guide && (
          <g className="stroke-gray-200" strokeWidth={4} fill="none" strokeLinecap="round" strokeLinejoin="round">
            {strokes.map((d, i) => (
              <path key={i} d={d} />
            ))}
          </g>
        )}
        <g className="stroke-gray-700" strokeWidth={4} fill="none" strokeLinecap="round" strokeLinejoin="round">
          {strokes.slice(0, index).map((d, i) => (
            <path key={i} d={d} />
          ))}
        </g>
        {showHint && (
          <motion.path
            // 틀릴 때마다 다시 그려 보여준다.
            key={`hint-${index}-${misses}`}
            d={current}
            stroke="#ff9600"
            strokeWidth={4}
            fill="none"
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.6, ease: "easeInOut" }}
          />
        )}
        {start && !done && <circle cx={start.x} cy={start.y} r={2.5} fill="#ff9600" opacity={0.8} />}
        {wrong && (
          <polyline
            points={toPolyline(wrong)}
            stroke="#ff4b4b"
            strokeWidth={4}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.7}
          />
        )}
        {drawing && (
          <polyline
            points={toPolyline(drawing)}
            stroke="#58cc02"
            strokeWidth={4}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
      </svg>

      <p className={`min-h-5 text-center text-sm ${feedback ? "text-danger" : "text-gray-400"}`} aria-live="polite">
        {done
          ? totalMisses === 0
            ? "완성! 한 번도 안 틀렸어요 🎉"
            : `완성! 틀린 획 ${totalMisses}번`
          : (feedback ?? `${index + 1}번째 획 / 전체 ${strokes.length}획`)}
      </p>

      <div className="flex gap-2">
        <button
          onClick={() => setGuide((g) => !g)}
          className="rounded-full bg-gray-100 px-4 py-1 text-sm text-gray-600"
          aria-pressed={guide}
        >
          {guide ? "🙈 안 보고 쓰기" : "👀 보고 쓰기"}
        </button>
        <button onClick={restart} className="rounded-full bg-gray-100 px-4 py-1 text-sm text-gray-600">
          ↻ 다시 쓰기
        </button>
      </div>
    </div>
  );
}

export default KanjiWritingPad;
