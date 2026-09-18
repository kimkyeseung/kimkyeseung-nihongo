import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { bind, unbind } from "wanakana";
import { searchDictionary, displayMeaning } from "../lib/dictionary";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { useRecentSearchesStore } from "../stores/recentSearchesStore";
import { useDictionaryView } from "../stores/pageStateStore";
import type { WordEntry } from "../types/dictionary";

function ResultRow({ entry, onClick }: { entry: WordEntry; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-2xl border-2 border-gray-100 bg-white px-4 py-3 text-left shadow-sm"
    >
      <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
        {entry.jlptLevel}
      </span>
      <span className="font-ja text-lg">{entry.word}</span>
      <span className="font-ja text-sm text-gray-400">{entry.reading}</span>
      <span className="ml-auto truncate text-sm text-gray-500">{displayMeaning(entry)}</span>
    </button>
  );
}

function DictionaryPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  // 검색어와 검색 결과는 탭을 옮겼다 돌아와도 그대로다(pageStateStore 주석 참고).
  const query = useDictionaryView((s) => s.query);
  const setQuery = useDictionaryView((s) => s.setQuery);
  const committedQuery = useDictionaryView((s) => s.committedQuery);
  const setCommittedQuery = useDictionaryView((s) => s.setCommittedQuery);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const recent = useRecentSearchesStore((s) => s.recent);
  const addRecent = useRecentSearchesStore((s) => s.add);
  const clearRecent = useRecentSearchesStore((s) => s.clear);

  // 로마자 입력 시 실시간으로 히라가나로 변환 (예: nihongo -> にほんご).
  // WanaKana가 값을 직접 바꾼 뒤 발생시키는 input 이벤트는 React의 합성 onChange가
  // (IME 조합 관련 내부 처리 때문에) 놓치는 경우가 있어, input에 직접 리스너를 붙여
  // e.target.value를 읽는 방식으로 우회한다.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    // 돌아왔을 때 입력창을 store에 남아있는 검색어로 되돌려놓는다 — value가 아니라 네이티브
    // 엘리먼트를 직접 쓰는 구조라(아래 주석 참고) 마운트 시 한 번 직접 넣어줘야 한다.
    el.value = useDictionaryView.getState().query;
    bind(el, { IMEMode: "toHiragana" });
    const handleInput = () => {
      setQuery(el.value);
      setShowSuggestions(true);
      setActiveIndex(-1);
    };
    el.addEventListener("input", handleInput);
    return () => {
      unbind(el);
      el.removeEventListener("input", handleInput);
    };
  }, [setQuery]);

  const debouncedQuery = useDebouncedValue(query, 200);
  const suggestions = useMemo(() => searchDictionary(debouncedQuery, 8), [debouncedQuery]);
  const results = useMemo(
    () => (committedQuery ? searchDictionary(committedQuery, 50) : []),
    [committedQuery]
  );

  const setInputValue = useCallback(
    (value: string) => {
      setQuery(value);
      if (inputRef.current) inputRef.current.value = value;
    },
    [setQuery]
  );

  const goToWord = useCallback(
    (entry: WordEntry) => {
      addRecent(entry.word);
      setShowSuggestions(false);
      setInputValue(entry.word);
      navigate(`/dictionary/${entry.id}`);
    },
    [addRecent, navigate, setInputValue]
  );

  const commitSearch = useCallback(
    (term: string) => {
      if (!term.trim()) return;
      addRecent(term.trim());
      setCommittedQuery(term.trim());
      setShowSuggestions(false);
    },
    [addRecent, setCommittedQuery]
  );

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!showSuggestions || suggestions.length === 0) {
      if (e.key === "Enter") commitSearch(query);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activeIndex >= 0 && suggestions[activeIndex]) {
        goToWord(suggestions[activeIndex]);
      } else {
        commitSearch(query);
      }
    } else if (e.key === "Escape") {
      setShowSuggestions(false);
    }
  }

  return (
    <div className="p-4 sm:p-6">
      <h2 className="text-xl text-primary">📖 사전</h2>

      <div className="relative mt-4">
        <input
          ref={inputRef}
          defaultValue=""
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
          onKeyDown={handleKeyDown}
          placeholder="한자 / 가나 / 로마자 / 한국어 뜻으로 검색 (예: 물)"
          className="w-full rounded-2xl border-2 border-gray-100 px-4 py-3 font-ja text-lg shadow-sm focus:border-primary/40 focus:outline-none"
        />

        <AnimatePresence>
          {showSuggestions && query && suggestions.length > 0 && (
            <motion.ul
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15 }}
              className="absolute z-10 mt-2 w-full overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-lg"
            >
              {suggestions.map((s, i) => (
                <li key={s.id}>
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => goToWord(s)}
                    className={`flex w-full items-baseline gap-2 px-4 py-2 text-left ${
                      i === activeIndex ? "bg-primary/10" : ""
                    }`}
                  >
                    <span className="font-ja text-lg">{s.word}</span>
                    <span className="font-ja text-sm text-gray-400">{s.reading}</span>
                    <span className="ml-auto truncate text-sm text-gray-500">{displayMeaning(s)}</span>
                  </button>
                </li>
              ))}
            </motion.ul>
          )}
        </AnimatePresence>
      </div>

      {!query && recent.length > 0 && (
        <div className="mt-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-400">최근 검색어</p>
            <button onClick={clearRecent} className="text-xs text-gray-300">
              전체 삭제
            </button>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {recent.map((term) => (
              <button
                key={term}
                onClick={() => {
                  setInputValue(term);
                  commitSearch(term);
                }}
                className="rounded-full bg-gray-100 px-3 py-1 font-ja text-sm text-gray-600"
              >
                {term}
              </button>
            ))}
          </div>
        </div>
      )}

      {committedQuery && (
        <div className="mt-6">
          <p className="mb-2 text-sm text-gray-400">
            "{committedQuery}" 검색 결과 {results.length}건
          </p>
          {results.length === 0 ? (
            <p className="text-gray-300">검색 결과가 없습니다.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {results.map((entry) => (
                <li key={entry.id}>
                  <ResultRow entry={entry} onClick={() => navigate(`/dictionary/${entry.id}`)} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export default DictionaryPage;
