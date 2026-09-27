import { useLayoutEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import ClickableSentence from "./ClickableSentence";
import SentenceActions from "./SentenceActions";
import SentenceGrammar from "./SentenceGrammar";
import { useSentenceDialogs } from "../hooks/useSentenceDialogs";
import { buildReviewQueue, formatDueIn, isDue, nextDueAt, planReviewOutcome } from "../lib/srs";
import { sentenceSrs } from "../lib/sentenceReview";
import { XP_REWARDS } from "../lib/xpRewards";
import { useConfettiStore } from "../stores/confettiStore";
import { useGamificationStore } from "../stores/gamificationStore";
import { useSentenceReview } from "../stores/pageStateStore";
import { useSentencebookStore } from "../stores/sentencebookStore";

/**
 * 단어장 **문장 칸** 복습. 문장을 보고 뜻을 떠올린 뒤, 담을 때 같이 저장한 번역으로 확인한다.
 * 일정은 단어와 **같은 srs.ts 계산**이다 — 때가 된 문장만 세트에 넣고(`buildReviewQueue`),
 * 앞당겨 본 "알아요"는 반영하지 않으며 XP는 때가 된 문장에만 준다(`planReviewOutcome`).
 *
 * 단어 카드와 달리 **스와이프가 아니라 버튼**이다. 문장 속 단어를 탭하면 뜻 다이얼로그가 열려야
 * 하는데(ClickableSentence), 카드를 끌 수 있게 하면 그 탭과 드래그가 부딪힌다.
 *
 * 학습 기록(`recordStudyEvent`)은 남기지 않는다 — 학습자 프로필은 단어·한자 단위로 세는 값이라
 * 문장 이벤트를 들이면 그 계산이 흔들린다(담을 때와 같은 판단).
 */
function SentenceReviewDeck() {
  const entriesMap = useSentencebookStore((s) => s.entries);
  const review = useSentencebookStore((s) => s.review);
  const recordProgress = useGamificationStore((s) => s.recordProgress);
  const celebrate = useConfettiStore((s) => s.celebrate);
  const session = useSentenceReview((s) => s.session);
  const startSession = useSentenceReview((s) => s.start);
  const setQueue = useSentenceReview((s) => s.setQueue);
  const { handlers, dialogs } = useSentenceDialogs();
  const [revealedId, setRevealedId] = useState<string | null>(null);
  // 기준 시각은 세트를 열 때·끝낼 때만 잡는다(단어 복습과 같은 이유 — 렌더마다 흔들리지 않게).
  const [now, setNow] = useState(() => Date.now());

  const items = useMemo(
    () => Object.values(entriesMap).map((e) => ({ wordId: e.id, srs: sentenceSrs(e) })),
    [entriesMap]
  );

  function begin(extra: boolean) {
    const at = Date.now();
    setRevealedId(null);
    setNow(at);
    startSession(buildReviewQueue(items, at, { includeNotDue: extra }), extra);
  }

  // 세션이 아직 없을 때만 만든다 — 복습하며 store가 바뀔 때마다 만들면 진행이 날아간다.
  // useLayoutEffect인 이유: 페인트 전에 끝내야 "다 끝냈어요" 화면이 한 프레임 깜빡이지 않는다.
  useLayoutEffect(() => {
    if (session) return;
    startSession(buildReviewQueue(items, Date.now()));
  }, [session, items, startSession]);

  // ⋮ 메뉴의 "단어장에서 빼기"로 복습 도중에 빠진 문장은 건너뛴다.
  const queue = useMemo(
    () => (session?.queue ?? []).filter((id) => entriesMap[id]),
    [session, entriesMap]
  );
  const total = session?.total ?? 0;

  function answer(id: string, know: boolean) {
    const entry = entriesMap[id];
    if (entry) {
      const outcome = planReviewOutcome(sentenceSrs(entry), know, Date.now());
      if (outcome.updateSrs) review(id, know);
      if (outcome.grantXp) recordProgress(XP_REWARDS.sentenceReviewed);
    }
    if (know) celebrate();
    setRevealedId(null);
    setQueue(queue.filter((q) => q !== id));
    if (queue.length <= 1) setNow(Date.now());
  }

  if (items.length === 0) {
    return (
      <p className="mt-10 text-center leading-relaxed text-gray-400">
        아직 담아둔 문장이 없습니다.
        <br />
        회화·선생님 답변의 ⋮ 메뉴에서 문장을 담아보세요.
      </p>
    );
  }

  if (queue.length === 0) {
    const dueCount = items.filter((e) => isDue(e.srs, now)).length;
    const next = nextDueAt(items, now);
    return (
      <div className="mt-10 flex flex-col items-center gap-3 text-center text-gray-400">
        <p>{total > 0 ? "이번 문장 복습을 모두 끝냈습니다! 🎉" : "지금 복습할 문장이 없어요."}</p>
        {dueCount > 0 ? (
          <button onClick={() => begin(false)} className="btn-press rounded-2xl bg-primary px-5 py-3 text-white">
            복습할 문장 {dueCount}개 시작
          </button>
        ) : (
          next !== null && <p className="text-sm">다음 복습: {formatDueIn(next, now)}</p>
        )}
        <button onClick={() => begin(true)} className="text-sm text-info">
          그래도 더 복습하기
        </button>
      </div>
    );
  }

  const current = entriesMap[queue[0]];
  const revealed = revealedId === current.id;

  return (
    <div className="mt-4 flex flex-col items-center">
      <p className="mb-3 text-sm text-gray-400">
        {total - queue.length + 1} / {total}
        {session?.extra && " · 더 복습하기"}
      </p>

      <AnimatePresence mode="wait">
        <motion.div
          key={current.id}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          className="w-full max-w-md rounded-3xl border-2 border-gray-100 bg-white p-5 shadow-sm"
        >
          <p className="font-ja text-xl leading-loose">
            <ClickableSentence text={current.text} {...handlers} />
            <SentenceActions text={current.text} subject="복습 문장" />
          </p>

          {revealed ? (
            <div className="mt-3 border-t border-gray-100 pt-3">
              {current.translation ? (
                <p className="text-lg text-gray-700">{current.translation}</p>
              ) : (
                <p className="text-sm text-gray-400">
                  담을 때 번역이 없던 문장이에요. ⋮ 메뉴의 "선생님에게 묻기"로 뜻을 확인해 보세요.
                </p>
              )}
              <SentenceGrammar text={current.text} />
              {current.source && <p className="mt-1 text-xs text-gray-300">{current.source}</p>}
            </div>
          ) : (
            <p className="mt-3 text-sm text-gray-300">무슨 뜻인지 떠올려 보세요.</p>
          )}
        </motion.div>
      </AnimatePresence>

      <div className="mt-4 flex w-full max-w-md gap-2">
        {revealed ? (
          <>
            <button
              onClick={() => answer(current.id, false)}
              className="btn-press flex-1 rounded-2xl bg-info/10 py-3 text-info"
            >
              모르겠어요
            </button>
            <button
              onClick={() => answer(current.id, true)}
              className="btn-press flex-1 rounded-2xl bg-primary py-3 text-white"
            >
              알아요
            </button>
          </>
        ) : (
          <button
            onClick={() => setRevealedId(current.id)}
            className="btn-press flex-1 rounded-2xl bg-gray-100 py-3 text-gray-600"
          >
            뜻 보기
          </button>
        )}
      </div>

      {dialogs}
    </div>
  );
}

export default SentenceReviewDeck;
