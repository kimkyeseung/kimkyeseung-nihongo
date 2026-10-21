import { Suspense, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Link } from "react-router-dom";
import KanjiStrokeOrder from "./KanjiStrokeOrder";
import KanjiWritingPad from "./KanjiWritingPad";
import SegmentedTabs from "./SegmentedTabs";
import LoadingMascot from "./LoadingMascot";
import { findWordsContainingKanji, displayMeaning } from "../lib/dictionary";
import { getKoreanReadingForWord } from "../lib/kanji";
import { useWordLink } from "../hooks/useWordLink";
import { useKanjiProgressStore } from "../stores/kanjiProgressStore";
import { useGamificationStore } from "../stores/gamificationStore";
import { useConfettiStore } from "../stores/confettiStore";
import { recordStudyEvent } from "../stores/learnerMemoryStore";
import { XP_REWARDS } from "../lib/xpRewards";
import type { KanjiEntry } from "../types/kanji";
import { useScrollLock } from "../hooks/useScrollLock";

/** 이 거리(px) 이상 가로로, 세로보다 두 배 넘게 움직여야 넘긴다 — 세로 스크롤을 넘김으로 읽지 않게. */
const SWIPE_MIN_DX = 60;

/** 한자 목록에서 열었을 때만 준다 — 다른 화면(단어 칩·문장 속 한자)에서는 옆 글자라는 게 없다. */
export type KanjiSheetNav = {
  /** "3 / 80" */
  position: string;
  onPrev?: () => void;
  onNext?: () => void;
};

function KanjiDetailSheet({
  entry,
  onClose,
  onLeave = onClose,
  nav,
}: {
  entry: KanjiEntry | null;
  onClose: () => void;
  /** 활용 단어를 눌러 단어 상세로 떠날 때. 기본은 닫기. */
  onLeave?: () => void;
  nav?: KanjiSheetNav;
}) {
  // 떠 있는 동안 뒤쪽 본문의 스크롤을 멈춘다(useScrollLock).
  useScrollLock(entry !== null);
  // 획순 보기 ↔ 따라 쓰기. 열려 있던 시트 상태는 저장하지 않는다는 규칙대로 로컬 state다.
  // 옆 글자로 넘겨도 유지한다 — 따라 쓰기를 연달아 하는 흐름이다.
  const [view, setView] = useState<"order" | "write">("order");
  // 넘긴 방향(들어오는 글자가 어느 쪽에서 미끄러져 오는지). 1 = 다음, -1 = 이전.
  const [direction, setDirection] = useState(0);
  const swipeStart = useRef<{ x: number; y: number } | null>(null);

  const goPrev = nav?.onPrev
    ? () => {
        setDirection(-1);
        nav.onPrev?.();
      }
    : undefined;
  const goNext = nav?.onNext
    ? () => {
        setDirection(1);
        nav.onNext?.();
      }
    : undefined;

  const open = entry !== null;
  // 닫히면 방향을 잊는다 — 안 그러면 다음에 목록에서 연 글자가 옆에서 미끄러져 들어온다.
  // (뒤로가기로 닫힐 때는 이 컴포넌트를 거치지 않으므로 렌더 중에 맞춘다.)
  if (!open && direction !== 0) setDirection(0);

  // 넓은 화면에서는 ←/→ 키로도 넘긴다.
  const onPrev = nav?.onPrev;
  const onNext = nav?.onNext;
  useEffect(() => {
    if (!open || (!onPrev && !onNext)) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowLeft" && onPrev) {
        setDirection(-1);
        onPrev();
      } else if (e.key === "ArrowRight" && onNext) {
        setDirection(1);
        onNext();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onPrev, onNext]);

  function handlePointerDown(e: React.PointerEvent) {
    // 따라 쓰기 칸에서 긋는 획은 넘김이 아니다.
    const fromPad = (e.target as Element).closest("[data-no-swipe]");
    swipeStart.current = fromPad ? null : { x: e.clientX, y: e.clientY };
  }

  function handlePointerUp(e: React.PointerEvent) {
    const start = swipeStart.current;
    swipeStart.current = null;
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.abs(dx) < SWIPE_MIN_DX || Math.abs(dx) < Math.abs(dy) * 2) return;
    // 손가락을 왼쪽으로 밀면 다음 글자(책장을 넘기는 방향).
    if (dx < 0) goNext?.();
    else goPrev?.();
  }
  const wordLink = useWordLink();
  const isLearned = useKanjiProgressStore((s) => (entry ? s.learned.includes(entry.kanji) : false));
  const toggleLearned = useKanjiProgressStore((s) => s.toggleLearned);
  const recordProgress = useGamificationStore((s) => s.recordProgress);
  const celebrate = useConfettiStore((s) => s.celebrate);
  const examples = entry ? findWordsContainingKanji(entry.kanji) : [];

  function handleToggleLearned() {
    if (!entry) return;
    if (!isLearned) {
      // 학습 완료로 "표시할 때"만 XP 지급 + 축하 효과 (되돌릴 때는 아무 일도 없음)
      recordProgress(XP_REWARDS.kanjiLearned);
      recordStudyEvent({ type: "kanji-learned", subject: entry.kanji, level: entry.jlptLevel });
      celebrate();
    }
    toggleLearned(entry.kanji);
  }

  return (
    <AnimatePresence>
      {entry && (
        <motion.div
          data-modal
          className="fixed inset-0 z-20 flex items-end justify-center bg-black/30 sm:items-center"
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
            onPointerDown={nav ? handlePointerDown : undefined}
            onPointerUp={nav ? handlePointerUp : undefined}
            onPointerCancel={() => (swipeStart.current = null)}
            // 가로 제스처를 브라우저가 가져가면(pointercancel) 넘김을 알 수 없다 — 세로 스크롤만 맡긴다.
            style={nav ? { touchAction: "pan-y" } : undefined}
          >
            <div className="flex items-center justify-between">
              <span className="rounded-full bg-primary/10 px-3 py-1 text-sm text-primary">
                {entry.jlptLevel}
              </span>
              {nav && (
                <div className="flex items-center gap-1 text-sm text-gray-400">
                  <button
                    onClick={goPrev}
                    disabled={!goPrev}
                    className="h-8 w-8 rounded-full text-lg disabled:opacity-30"
                    aria-label="이전 한자"
                  >
                    ‹
                  </button>
                  <span className="min-w-14 text-center">{nav.position}</span>
                  <button
                    onClick={goNext}
                    disabled={!goNext}
                    className="h-8 w-8 rounded-full text-lg disabled:opacity-30"
                    aria-label="다음 한자"
                  >
                    ›
                  </button>
                </div>
              )}
              <button onClick={onClose} className="text-2xl leading-none text-gray-400" aria-label="닫기">
                ×
              </button>
            </div>

            {/* 글자가 바뀌면 넘긴 쪽에서 미끄러져 들어온다. exit는 두지 않는다 — 두 글자가 잠깐
                겹치면 시트 높이가 출렁인다. */}
            <motion.div
              key={entry.kanji}
              initial={direction === 0 ? false : { x: direction * 48, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ duration: 0.18 }}
            >
              <SegmentedTabs
                className="mt-3"
                fill
                options={[
                  { key: "order", label: "획순 보기" },
                  { key: "write", label: "✍️ 따라 쓰기" },
                ]}
                value={view}
                onChange={setView}
              />

              <div className="mt-3 flex justify-center" data-no-swipe={view === "write" ? "" : undefined}>
                <Suspense
                  fallback={
                    <div
                      className="flex items-center justify-center rounded-2xl bg-gray-50"
                      style={{ width: 180, height: 180 }}
                    >
                      <LoadingMascot />
                    </div>
                  }
                >
                  {view === "write" ? (
                    // 글자가 바뀌면 처음부터 — 앞 글자의 획 진행이 남으면 안 된다.
                    <KanjiWritingPad key={entry.kanji} kanji={entry.kanji} />
                  ) : (
                    <KanjiStrokeOrder kanji={entry.kanji} size={180} />
                  )}
                </Suspense>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-gray-400">음독</p>
                  <p className="font-ja text-lg">{entry.onyomi.join("、") || "-"}</p>
                </div>
                <div>
                  <p className="text-gray-400">훈독</p>
                  <p className="font-ja text-lg">{entry.kunyomi.join("、") || "-"}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-gray-400">한국 한자음</p>
                  <p className="text-lg">{entry.koreanReading.join("、") || "-"}</p>
                </div>
              </div>

              <p className="mt-3 text-gray-600">{entry.meaning.join(", ")}</p>

              <div className="mt-4">
                <p className="mb-1 text-sm text-gray-400">활용 단어</p>
                {examples.length === 0 ? (
                  <p className="text-sm text-gray-300">예시 단어 없음</p>
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {examples.map((w) => {
                      const koreanReading = getKoreanReadingForWord(w.word);
                      return (
                        <li key={w.id}>
                          <Link {...wordLink(w.id)} onClick={onLeave} className="text-info">
                            <span className="font-ja">{w.word}</span>
                            <span className="ml-1 text-xs text-gray-400">{w.reading}</span>
                            {koreanReading && (
                              <span className="ml-1 text-xs text-gray-400">({koreanReading})</span>
                            )}
                            <span className="ml-2 text-xs text-gray-500">{displayMeaning(w)}</span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <button
                onClick={handleToggleLearned}
                className={`btn-press mt-5 w-full rounded-2xl py-3 font-bold text-white ${
                  isLearned ? "bg-gray-300" : "bg-primary"
                }`}
                style={
                  {
                    "--btn-shadow": isLearned ? "rgb(0 0 0 / 0.15)" : "#3d9401",
                  } as React.CSSProperties
                }
              >
                {isLearned ? "✓ 학습 완료" : "학습 완료로 표시"}
              </button>
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default KanjiDetailSheet;
