import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { Link } from "react-router-dom";
import { useWordbookStore, type WordbookEntry } from "../stores/wordbookStore";
import { useSentencebookStore } from "../stores/sentencebookStore";
import { useGamificationStore } from "../stores/gamificationStore";
import { recordStudyEvent } from "../stores/learnerMemoryStore";
import { useConfettiStore } from "../stores/confettiStore";
import { findWordById } from "../lib/dictionary";
import { useWordLink } from "../hooks/useWordLink";
import { XP_REWARDS } from "../lib/xpRewards";
import { buildReviewQueue, formatDueIn, isDue, nextDueAt, planReviewOutcome } from "../lib/srs";
import SegmentedTabs from "../components/SegmentedTabs";
import SentencebookList from "../components/SentencebookList";
import WordbookCard, { type CardExit } from "../components/WordbookCard";
import { dangerChipClass } from "../components/iconButtonClass";
import { ALL_GROUP, useWordbookReview, useWordbookView } from "../stores/pageStateStore";

// 큐가 아직 없을 때 매번 새 배열을 만들면 아래 useMemo가 렌더마다 다시 계산된다.
const EMPTY_QUEUE: string[] = [];

function GroupChips({
  activeGroup,
  onSelect,
}: {
  activeGroup: string;
  onSelect: (id: string) => void;
}) {
  const groups = useWordbookStore((s) => s.groups);
  const createGroup = useWordbookStore((s) => s.createGroup);
  const deleteGroup = useWordbookStore((s) => s.deleteGroup);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        onClick={() => onSelect(ALL_GROUP)}
        className={`rounded-full px-3 py-1 text-sm ${
          activeGroup === ALL_GROUP ? "bg-primary text-white" : "bg-gray-100 text-gray-500"
        }`}
      >
        전체
      </button>
      {groups.map((g) => (
        <span
          key={g.id}
          className={`flex items-center gap-1 rounded-full px-3 py-1 text-sm ${
            activeGroup === g.id ? "bg-primary text-white" : "bg-gray-100 text-gray-500"
          }`}
        >
          <button onClick={() => onSelect(g.id)}>{g.name}</button>
          <button
            onClick={() => {
              deleteGroup(g.id);
              if (activeGroup === g.id) onSelect(ALL_GROUP);
            }}
            aria-label={`${g.name} 그룹 삭제`}
            className="opacity-60"
          >
            ×
          </button>
        </span>
      ))}

      {adding ? (
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => setAdding(false)}
          onKeyDown={(e) => {
            // 폼의 암묵적 제출(Enter) 대신 명시적으로 처리한다 — 사전 검색 인풋과
            // 동일한 패턴(DictionaryPage.tsx)으로, 이 프로젝트에서 더 안정적으로 동작한다.
            if (e.key === "Enter") {
              createGroup(name);
              setName("");
              setAdding(false);
            } else if (e.key === "Escape") {
              setName("");
              setAdding(false);
            }
          }}
          placeholder="그룹 이름"
          className="w-24 rounded-full border border-gray-200 px-3 py-1 text-sm focus:outline-none"
        />
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-500"
        >
          + 그룹
        </button>
      )}
    </div>
  );
}

// 복습 큐는 "시작 시점의 스냅샷"이다 — entries가 review()/removeWord()로 바뀔 때마다
// 큐를 다시 만들면 스와이프할 때마다 진행 상황이 날아간다. 다른 탭에 갔다 와도 진행이
// 남도록 pageStateStore의 useWordbookReview에 보관한다. 그룹이 바뀌면(=부모가
// key={activeGroup}로 리마운트) 새로 만들고, 다 끝낸 뒤에는 버튼으로 새 세트를 연다.
//
// 세트에는 **복습할 때가 된 단어만** 들어간다(`buildReviewQueue`). 오른쪽은 "알아요",
// 왼쪽은 "모르겠어요"이고 둘 다 SRS에 반영된다. 삭제는 스와이프가 아니라 카드 아래 버튼이다 —
// 예전엔 왼쪽이 삭제라 "모른다"를 SRS에 알릴 길이 없었고, 간격은 늘어나기만 했다.
function ReviewDeck({ group, entries }: { group: string; entries: WordbookEntry[] }) {
  const review = useWordbookStore((s) => s.review);
  const removeWord = useWordbookStore((s) => s.removeWord);
  const restoreEntry = useWordbookStore((s) => s.restoreEntry);
  const recordProgress = useGamificationStore((s) => s.recordProgress);
  const celebrate = useConfettiStore((s) => s.celebrate);

  const session = useWordbookReview((s) => (s.session?.group === group ? s.session : null));
  const startSession = useWordbookReview((s) => s.start);
  const setQueueInStore = useWordbookReview((s) => s.setQueue);
  const [undo, setUndo] = useState<WordbookEntry | null>(null);
  const [revealedId, setRevealedId] = useState<string | null>(null);
  const [exitDir, setExitDir] = useState<CardExit>("left");
  // "지금 복습할 단어가 있나"를 판단하는 기준 시각. 렌더마다 Date.now()를 부르면 값이
  // 흔들리므로(순수하지 않다) 세트를 새로 열 때·끝낼 때만 갱신한다.
  const [now, setNow] = useState(() => Date.now());

  // Framer Motion의 drag 제스처가 (특히 터치패드/트랙패드 등에서) onDragEnd를 한
  // 스와이프에 두 번 이상 발생시키는 경우가 있어, 같은 카드에 대한 중복 처리를 막는다.
  // ref는 즉시 반영되고 배치/재렌더의 영향을 받지 않아 이런 가드에 적합하다.
  // 같은 카드가 큐에 다시 들어오는 경우(실행 취소·새 세트)에는 반드시 비울 것 — 안 그러면
  // 그 카드의 첫 스와이프가 조용히 무시된다.
  const lastHandledRef = useRef<string | null>(null);

  function begin(extra: boolean) {
    const at = Date.now();
    lastHandledRef.current = null;
    setRevealedId(null);
    setNow(at);
    startSession(group, buildReviewQueue(entries, at, { includeNotDue: extra }), extra);
  }

  // 그 그룹의 큐가 아직 없을 때만 새로 만든다. useEffect가 아니라 useLayoutEffect인 이유는
  // 페인트 전에 끝내야 "복습 다 끝났습니다" 화면이 한 프레임 깜빡이지 않기 때문.
  useLayoutEffect(() => {
    if (session) return;
    const at = Date.now();
    startSession(group, buildReviewQueue(entries, at));
  }, [session, group, entries, startSession]);

  const queue = session?.queue ?? EMPTY_QUEUE;
  const total = session?.total ?? 0;
  const setQueue = (next: (q: string[]) => string[]) => setQueueInStore(next(queue));

  useEffect(() => {
    if (!undo) return;
    const t = setTimeout(() => setUndo(null), 6000);
    return () => clearTimeout(t);
  }, [undo]);

  function handleSwipe(wordId: string, direction: "left" | "right") {
    if (lastHandledRef.current === wordId) return;
    lastHandledRef.current = wordId;

    const entry = entries.find((e) => e.wordId === wordId);
    const know = direction === "right";
    if (entry) {
      const at = Date.now();
      const outcome = planReviewOutcome(entry.srs, know, at);
      if (outcome.updateSrs) review(wordId, know);
      if (outcome.grantXp) recordProgress(XP_REWARDS.wordReviewed);
      const word = findWordById(wordId);
      if (word) {
        recordStudyEvent({
          type: know ? "word-review-known" : "word-review-unknown",
          subject: word.word,
          level: word.jlptLevel,
        });
      }
    }
    if (know) celebrate();
    setExitDir(direction);
    setQueue((q) => q.filter((id) => id !== wordId));
    if (queue.length <= 1) setNow(Date.now());
  }

  function handleRemove(wordId: string) {
    const entry = entries.find((e) => e.wordId === wordId) ?? null;
    removeWord(wordId);
    setUndo(entry);
    setExitDir("remove");
    setQueue((q) => q.filter((id) => id !== wordId));
  }

  function handleUndo() {
    if (!undo) return;
    restoreEntry(undo);
    lastHandledRef.current = null;
    setRevealedId(null);
    setUndo(null);
    setQueue((q) => [undo.wordId, ...q]);
  }

  const visibleWords = useMemo(
    () =>
      queue
        .slice(0, 3)
        .map((id) => ({ id, word: findWordById(id) }))
        .filter((v): v is { id: string; word: NonNullable<ReturnType<typeof findWordById>> } =>
          Boolean(v.word)
        ),
    [queue]
  );

  if (entries.length === 0) {
    return (
      <p className="mt-10 text-center text-gray-400">
        아직 단어장이 비어있습니다. 사전에서 단어를 추가해보세요.
      </p>
    );
  }

  const undoBar = undo && (
    <div className="mt-4 flex items-center gap-3 rounded-full bg-gray-100 px-4 py-2 text-sm text-gray-600">
      <span>단어를 삭제했습니다.</span>
      <button onClick={handleUndo} className="font-bold text-info">
        실행 취소
      </button>
    </div>
  );

  if (queue.length === 0) {
    const dueCount = entries.filter((e) => isDue(e.srs, now)).length;
    const next = nextDueAt(entries, now);
    return (
      <div className="mt-10 flex flex-col items-center gap-3 text-center text-gray-400">
        {total > 0 ? (
          <p>이번 복습 세트를 모두 끝냈습니다! 🎉</p>
        ) : (
          <p>지금 복습할 단어가 없어요.</p>
        )}
        {dueCount > 0 ? (
          <button
            onClick={() => begin(false)}
            className="btn-press rounded-2xl bg-primary px-5 py-3 text-white"
          >
            복습할 단어 {dueCount}개 시작
          </button>
        ) : (
          next !== null && <p className="text-sm">다음 복습: {formatDueIn(next, now)}</p>
        )}
        <button onClick={() => begin(true)} className="text-sm text-info">
          그래도 더 복습하기
        </button>
        {undoBar}
      </div>
    );
  }

  const topId = queue[0];
  const revealed = revealedId === topId;

  return (
    <div className="mt-4 flex flex-col items-center">
      <p className="mb-3 text-sm text-gray-400">
        {total - queue.length + 1} / {total}
        {session?.extra && " · 더 복습하기"}
      </p>
      <div className="relative h-72 w-full max-w-sm">
        <AnimatePresence custom={exitDir}>
          {visibleWords
            .slice()
            .reverse()
            .map(({ id, word }) => (
              <WordbookCard
                key={id}
                entry={word}
                isTop={id === topId}
                revealed={revealedId === id}
                onReveal={() => setRevealedId(id)}
                onSwipe={(dir) => handleSwipe(id, dir)}
              />
            ))}
        </AnimatePresence>
      </div>

      {/* 스와이프가 불편한 환경(마우스·키보드)을 위해 같은 동작을 버튼으로도 둔다. */}
      <div className="mt-4 flex w-full max-w-sm gap-2">
        {revealed ? (
          <>
            <button
              onClick={() => handleSwipe(topId, "left")}
              className="btn-press flex-1 rounded-2xl bg-info/10 py-3 text-info"
            >
              모르겠어요
            </button>
            <button
              onClick={() => handleSwipe(topId, "right")}
              className="btn-press flex-1 rounded-2xl bg-primary py-3 text-white"
            >
              알아요
            </button>
          </>
        ) : (
          <button
            onClick={() => setRevealedId(topId)}
            className="btn-press flex-1 rounded-2xl bg-gray-100 py-3 text-gray-600"
          >
            뜻 보기
          </button>
        )}
      </div>
      <button
        onClick={() => handleRemove(topId)}
        className="mt-3 text-xs text-gray-300"
        aria-label="이 단어를 단어장에서 삭제"
      >
        이 단어 삭제
      </button>

      {undoBar}
    </div>
  );
}

function WordList({ entries }: { entries: WordbookEntry[] }) {
  const wordLink = useWordLink();
  const groups = useWordbookStore((s) => s.groups);
  const removeWord = useWordbookStore((s) => s.removeWord);
  const setWordGroups = useWordbookStore((s) => s.setWordGroups);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (entries.length === 0) {
    return <p className="mt-10 text-center text-gray-400">단어장이 비어있습니다.</p>;
  }

  return (
    <ul className="mt-4 flex flex-col gap-2">
      {entries.map((entry) => {
        const word = findWordById(entry.wordId);
        if (!word) return null;
        const isExpanded = expandedId === entry.wordId;

        return (
          <li key={entry.wordId} className="rounded-2xl border-2 border-gray-100 bg-white p-3">
            <div className="flex items-center gap-2">
              {entry.mastered && <span className="text-primary">✓</span>}
              <Link {...wordLink(word.id)} className="flex-1">
                <span className="font-ja text-lg">{word.word}</span>
                <span className="ml-2 font-ja text-sm text-gray-400">{word.reading}</span>
              </Link>
              <button
                onClick={() => setExpandedId(isExpanded ? null : entry.wordId)}
                className="rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-500"
              >
                그룹
              </button>
              <button
                onClick={() => removeWord(entry.wordId)}
                className={dangerChipClass}
                aria-label="단어장에서 삭제"
              >
                삭제
              </button>
            </div>

            {entry.groupIds.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1 pl-6">
                {entry.groupIds
                  .map((id) => groups.find((g) => g.id === id))
                  .filter((g): g is NonNullable<typeof g> => Boolean(g))
                  .map((g) => (
                    <span key={g.id} className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                      {g.name}
                    </span>
                  ))}
              </div>
            )}

            {isExpanded && (
              <div className="mt-2 flex flex-wrap gap-1 border-t border-gray-100 pt-2">
                {groups.length === 0 ? (
                  <p className="text-xs text-gray-300">그룹이 없습니다. 위에서 그룹을 먼저 만들어보세요.</p>
                ) : (
                  groups.map((g) => {
                    const active = entry.groupIds.includes(g.id);
                    return (
                      <button
                        key={g.id}
                        onClick={() =>
                          setWordGroups(
                            entry.wordId,
                            active
                              ? entry.groupIds.filter((id) => id !== g.id)
                              : [...entry.groupIds, g.id]
                          )
                        }
                        className={`rounded-full px-2 py-0.5 text-xs ${
                          active ? "bg-primary text-white" : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {g.name}
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function WordbookPage() {
  const entriesMap = useWordbookStore((s) => s.entries);
  const sentenceCount = useSentencebookStore((s) => Object.keys(s.entries).length);
  // 단어/문장 탭, 복습/목록 탭, 그룹 필터는 페이지를 떠나도 유지된다(pageStateStore 주석 참고).
  const tab = useWordbookView((s) => s.tab);
  const setTab = useWordbookView((s) => s.setTab);
  const mode = useWordbookView((s) => s.mode);
  const setMode = useWordbookView((s) => s.setMode);
  const activeGroup = useWordbookView((s) => s.activeGroup);
  const setActiveGroup = useWordbookView((s) => s.setActiveGroup);

  const allEntries = useMemo(() => Object.values(entriesMap), [entriesMap]);
  const filteredEntries = useMemo(
    () =>
      activeGroup === ALL_GROUP
        ? allEntries
        : allEntries.filter((e) => e.groupIds.includes(activeGroup)),
    [allEntries, activeGroup]
  );

  return (
    <div className="p-4 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl text-primary">🗂️ 단어장</h2>
        {/* 복습/목록은 단어 칸에만 있는 구분이다 — 문장 칸에서는 자리를 비운다. */}
        {tab === "word" && (
          <SegmentedTabs
            options={[
              { key: "review", label: "복습" },
              { key: "list", label: "목록" },
            ]}
            value={mode}
            onChange={setMode}
          />
        )}
      </div>

      <SegmentedTabs
        className="mt-4"
        fill
        options={[
          { key: "word", label: "단어", hint: String(allEntries.length) },
          { key: "sentence", label: "문장", hint: String(sentenceCount) },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === "sentence" ? (
        <SentencebookList />
      ) : (
        <>
          <div className="mt-4">
            <GroupChips activeGroup={activeGroup} onSelect={setActiveGroup} />
          </div>

          {mode === "review" ? (
            <ReviewDeck key={activeGroup} group={activeGroup} entries={filteredEntries} />
          ) : (
            <WordList entries={filteredEntries} />
          )}
        </>
      )}
    </div>
  );
}

export default WordbookPage;
