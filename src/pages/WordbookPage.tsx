import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { Link } from "react-router-dom";
import { useWordbookStore, type WordbookEntry } from "../stores/wordbookStore";
import { useGamificationStore } from "../stores/gamificationStore";
import { recordStudyEvent } from "../stores/learnerMemoryStore";
import { useConfettiStore } from "../stores/confettiStore";
import { findWordById } from "../lib/dictionary";
import { XP_REWARDS } from "../lib/xpRewards";
import WordbookCard from "../components/WordbookCard";
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

// 복습 큐는 "마운트 시점의 스냅샷"이다 — entries가 review()/removeWord()로 바뀔 때마다
// 큐를 다시 만들면 스와이프할 때마다 진행 상황이 날아간다. 예전엔 useState의 lazy
// initializer로 찍었는데, 그러면 다른 탭에 갔다 오는 순간(=언마운트) 진행이 사라져서
// 지금은 pageStateStore의 useWordbookReview에 보관한다. 그룹이 바뀌면(=부모가
// key={activeGroup}로 리마운트) 그때만 큐를 새로 만든다.
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

  // 그 그룹의 큐가 아직 없을 때만 새로 만든다. useEffect가 아니라 useLayoutEffect인 이유는
  // 페인트 전에 끝내야 "복습 다 끝났습니다" 화면이 한 프레임 깜빡이지 않기 때문.
  useLayoutEffect(() => {
    if (session) return;
    startSession(
      group,
      [...entries].sort((a, b) => a.srs.dueAt - b.srs.dueAt).map((e) => e.wordId)
    );
  }, [session, group, entries, startSession]);

  const queue = session?.queue ?? EMPTY_QUEUE;
  const total = session?.total ?? 0;
  const setQueue = (next: (q: string[]) => string[]) => setQueueInStore(next(queue));

  useEffect(() => {
    if (!undo) return;
    const t = setTimeout(() => setUndo(null), 6000);
    return () => clearTimeout(t);
  }, [undo]);

  // Framer Motion의 drag 제스처가 (특히 터치패드/트랙패드 등에서) onDragEnd를 한
  // 스와이프에 두 번 이상 발생시키는 경우가 있어, 같은 카드에 대한 중복 처리를 막는다.
  // ref는 즉시 반영되고 배치/재렌더의 영향을 받지 않아 이런 가드에 적합하다.
  const lastHandledRef = useRef<string | null>(null);

  function handleSwipe(wordId: string, direction: "left" | "right") {
    if (lastHandledRef.current === wordId) return;
    lastHandledRef.current = wordId;

    if (direction === "right") {
      review(wordId, true);
      recordProgress(XP_REWARDS.wordReviewed);
      // 왼쪽(삭제)은 기록하지 않는다 — "이 단어는 이제 필요 없다"이지 "모르겠다"가 아니다.
      const word = findWordById(wordId);
      if (word) {
        recordStudyEvent({ type: "word-review-known", subject: word.word, level: word.jlptLevel });
      }
      celebrate();
    } else {
      const entry = entries.find((e) => e.wordId === wordId) ?? null;
      removeWord(wordId);
      setUndo(entry);
    }
    setQueue((q) => q.filter((id) => id !== wordId));
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

  if (queue.length === 0) {
    return (
      <div className="mt-10 text-center text-gray-400">
        <p>이번 복습 세트를 모두 끝냈습니다! 🎉</p>
        {undo && (
          <button
            onClick={() => {
              restoreEntry(undo);
              setUndo(null);
              setQueue((q) => [undo.wordId, ...q]);
            }}
            className="mt-3 text-info"
          >
            방금 삭제한 단어 실행 취소
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="mt-4 flex flex-col items-center">
      <p className="mb-3 text-sm text-gray-400">
        {total - queue.length + 1} / {total}
      </p>
      <div className="relative h-72 w-full max-w-sm">
        <AnimatePresence>
          {visibleWords
            .slice()
            .reverse()
            .map(({ id, word }) => (
              <WordbookCard
                key={id}
                entry={word}
                isTop={id === queue[0]}
                onSwipe={(dir) => handleSwipe(id, dir)}
              />
            ))}
        </AnimatePresence>
      </div>

      {undo && (
        <div className="mt-4 flex items-center gap-3 rounded-full bg-gray-100 px-4 py-2 text-sm text-gray-600">
          <span>단어를 삭제했습니다.</span>
          <button
            onClick={() => {
              restoreEntry(undo);
              setUndo(null);
              setQueue((q) => [undo.wordId, ...q]);
            }}
            className="font-bold text-info"
          >
            실행 취소
          </button>
        </div>
      )}
    </div>
  );
}

function WordList({ entries }: { entries: WordbookEntry[] }) {
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
              <Link to={`/dictionary/${word.id}`} className="flex-1">
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
                className="rounded-full bg-danger/10 px-2 py-1 text-xs text-danger"
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
  // 복습/목록 탭과 그룹 필터는 페이지를 떠나도 유지된다(pageStateStore 주석 참고).
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
        <div className="flex rounded-full bg-gray-100 p-1">
          {(
            [
              { key: "review", label: "복습" },
              { key: "list", label: "목록" },
            ] as const
          ).map((opt) => (
            <button
              key={opt.key}
              onClick={() => setMode(opt.key)}
              className={`rounded-full px-4 py-1.5 text-sm ${
                mode === opt.key ? "bg-primary text-white" : "text-gray-500"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4">
        <GroupChips activeGroup={activeGroup} onSelect={setActiveGroup} />
      </div>

      {mode === "review" ? (
        <ReviewDeck key={activeGroup} group={activeGroup} entries={filteredEntries} />
      ) : (
        <WordList entries={filteredEntries} />
      )}
    </div>
  );
}

export default WordbookPage;
