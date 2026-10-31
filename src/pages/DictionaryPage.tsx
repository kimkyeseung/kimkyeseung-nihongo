import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { bind, unbind } from "wanakana";
import { searchDictionary, displayMeaning, levelLabel, findWordById } from "../lib/dictionary";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { useRecentSearchesStore } from "../stores/recentSearchesStore";
import { useDictionaryView } from "../stores/pageStateStore";
import { useWordLink } from "../hooks/useWordLink";
import JapaneseSuggestionList from "../components/JapaneseSuggestionList";
import KanjiChips from "../components/KanjiChips";
import { kanjiInText } from "../lib/kanji";
import AdSlot from "../components/AdSlot";
import { AD_SLOTS } from "../lib/ads";
import { useMediaQuery, WIDE_SCREEN_QUERY } from "../hooks/useMediaQuery";
import { WordDetail } from "./WordDetailPage";
import type { WordEntry } from "../types/dictionary";

const AD_AFTER_RESULT = 5;

function ResultRow({ entry, onClick }: { entry: WordEntry; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-2xl border-2 border-gray-100 bg-white px-4 py-3 text-left shadow-sm"
    >
      <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
        {levelLabel(entry.jlptLevel)}
      </span>
      <span className="shrink-0 whitespace-nowrap font-ja text-lg">{entry.word}</span>
      <span className="min-w-0 truncate font-ja text-sm text-gray-400">{entry.reading}</span>
      <span className="ml-auto min-w-0 flex-1 truncate text-right text-sm text-gray-500">
        {displayMeaning(entry)}
      </span>
    </button>
  );
}

/**
 * 넓은 화면의 왼쪽 목록 한 줄. 목록 칸이 좁아(약 24rem) 한 줄에 단어·읽기·뜻을 다 늘어놓으면 뜻이
 * 잘리므로, 뜻을 단어 아래 줄로 내린다. 고른 단어는 테두리로 표시한다.
 */
function CompactResultRow({
  entry,
  active,
  onClick,
}: {
  entry: WordEntry;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`w-full rounded-2xl border-2 px-3 py-2 text-left shadow-sm ${
        active ? "border-primary bg-primary/5" : "border-gray-100 bg-white hover:border-primary/40"
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
          {levelLabel(entry.jlptLevel)}
        </span>
        <span className="shrink-0 whitespace-nowrap font-ja text-lg">{entry.word}</span>
        <span className="min-w-0 truncate font-ja text-sm text-gray-400">{entry.reading}</span>
      </div>
      <p className="mt-0.5 truncate text-sm text-gray-500">{displayMeaning(entry)}</p>
    </button>
  );
}

function DictionaryPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const wordLink = useWordLink();

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

  // **넓은 화면(lg 이상)은 "목록 + 상세 패널" 2단이다**(한자 페이지와 같은 틀). 예전엔 결과 줄이
  // 화면 끝까지 늘어나 단어(맨 왼쪽)와 뜻(맨 오른쪽)이 1,300px 떨어져 있었고, 단어를 누를 때마다
  // 상세 페이지로 넘어갔다 돌아와야 했다. 패널에서는 목록을 보면서 연달아 고르고 ↑/↓로 옮긴다.
  // 좁은 화면은 예전 그대로 단어 상세 주소로 간다.
  const isWide = useMediaQuery(WIDE_SCREEN_QUERY);
  const panelWordId = useDictionaryView((s) => s.panelWordId);
  const setPanelWordId = useDictionaryView((s) => s.setPanelWordId);

  const goToWord = useCallback(
    (entry: WordEntry) => {
      addRecent(entry.word);
      setShowSuggestions(false);
      setInputValue(entry.word);
      if (isWide) {
        // 자동완성에서 고른 단어는 그 표기로 검색한 목록과 함께 보여준다 — 패널만 바뀌고 왼쪽 목록이
        // 엉뚱한 옛 검색어로 남아 있으면 지금 보는 단어가 목록 어디에도 없다.
        setCommittedQuery(entry.word);
        setPanelWordId(entry.id);
        return;
      }
      const { to, state } = wordLink(entry.id);
      navigate(to, { state });
    },
    [addRecent, isWide, navigate, setCommittedQuery, setInputValue, setPanelWordId, wordLink]
  );

  const commitSearch = useCallback(
    (term: string) => {
      if (!term.trim()) return;
      addRecent(term.trim());
      setCommittedQuery(term.trim());
      // 새로 검색하면 패널은 새 결과의 첫 단어로 간다(넓은 화면).
      setPanelWordId(null);
      setShowSuggestions(false);
    },
    [addRecent, setCommittedQuery, setPanelWordId]
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

  // 패널은 비어 있지 않게 — 고른 단어가 없으면(새로 검색했다) 결과의 첫 단어를 보여준다.
  const panelEntry = useMemo(() => {
    const picked = panelWordId ? findWordById(panelWordId) : undefined;
    return picked ?? results[0] ?? null;
  }, [panelWordId, results]);
  const panelIndex = panelEntry ? results.findIndex((r) => r.id === panelEntry.id) : -1;

  // ↑/↓로 목록을 옮긴다(넓은 화면, 입력창 밖에서만 — 입력창의 ↑/↓는 자동완성 몫이다).
  useEffect(() => {
    if (!isWide || results.length === 0) return;
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      if (e.target instanceof Element && e.target.closest("input, textarea, [contenteditable]")) return;
      if (document.querySelector("[data-modal]")) return;
      e.preventDefault();
      const next = results[Math.min(Math.max(panelIndex + (e.key === "ArrowDown" ? 1 : -1), 0), results.length - 1)];
      if (next) setPanelWordId(next.id);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isWide, results, panelIndex, setPanelWordId]);

  // 고른 줄이 목록 칸 밖에 있으면 보이게 굴린다(키보드로 옮길 때).
  const listRef = useRef<HTMLUListElement>(null);
  useEffect(() => {
    if (!isWide) return;
    listRef.current?.querySelector('[aria-pressed="true"]')?.scrollIntoView({ block: "nearest" });
  }, [isWide, panelEntry]);

  const renderResult = (entry: WordEntry) => (
    <li key={entry.id}>
      {isWide ? (
        <CompactResultRow
          entry={entry}
          active={panelEntry?.id === entry.id}
          onClick={() => setPanelWordId(entry.id)}
        />
      ) : (
        <ResultRow
          entry={entry}
          onClick={() => {
            const { to, state } = wordLink(entry.id);
            navigate(to, { state });
          }}
        />
      )}
    </li>
  );

  return (
    <div className="mx-auto w-full max-w-3xl p-4 sm:p-6 lg:max-w-6xl lg:px-8">
      <h2 className="text-xl text-primary lg:text-2xl">📖 사전</h2>

      <div className="lg:mt-4 lg:grid lg:grid-cols-[24rem_minmax(0,1fr)] lg:items-start lg:gap-8">
        {/* 넓은 화면에서 왼쪽 칸(검색·목록)은 붙박이다 — 오른쪽 상세가 길어(뜻마다 예문) 페이지가
            내려가도 목록은 제자리에 있고, 목록만 안에서 스크롤한다. 높이는 한자·오십음도 패널과 같은 계산. */}
        <div className="lg:sticky lg:top-6 lg:flex lg:max-h-[calc(var(--app-height,100svh)-11.5rem)] lg:flex-col">
          <div className="relative mt-4 lg:mt-0 lg:shrink-0">
            <input
              ref={inputRef}
              defaultValue=""
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              onKeyDown={handleKeyDown}
              placeholder="한자 / 가나 / 로마자 / 한국어 뜻으로 검색 (예: 물)"
              className="w-full rounded-2xl border-2 border-gray-100 px-4 py-3 font-ja text-lg shadow-sm focus:border-primary/40 focus:outline-none"
            />

            {/* 회화·작문의 자동완성과 같은 목록이다 — 줄바꿈 처리 같은 모양을 한 곳에서 고치려고. */}
            <JapaneseSuggestionList
              suggestions={showSuggestions && query ? suggestions : []}
              activeIndex={activeIndex}
              onSelect={goToWord}
            />
          </div>

          {/* 검색 기록은 입력창 바로 아래에 늘 둔다. 예전엔 입력창이 비어 있을 때만 보였는데,
              검색어는 탭을 옮겨도 남아 있어서(pageStateStore) 사실상 거의 안 보였다. */}
          {recent.length > 0 && (
            <div className="mt-3 lg:shrink-0">
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
                    className="whitespace-nowrap rounded-full bg-gray-100 px-3 py-1 font-ja text-sm text-gray-600"
                  >
                    {term}
                  </button>
                ))}
              </div>
            </div>
          )}

          {committedQuery && (
            <div className="mt-6 lg:flex lg:min-h-0 lg:flex-col">
              <p className="mb-2 text-sm text-gray-400 lg:shrink-0">
                "{committedQuery}" 검색 결과 {results.length}건
              </p>
              {/* 검색어에 한자가 있으면 한자 페이지와 같은 상세 시트로 바로 갈 수 있게 한다
                  (水 하나만 쳐도 단어 목록만 나오고 그 한자 자체는 볼 길이 없었다). */}
              {kanjiInText(committedQuery).length > 0 && (
                <div className="mb-4 lg:shrink-0">
                  <p className="mb-1 text-xs text-gray-400">한자</p>
                  <KanjiChips text={committedQuery} />
                </div>
              )}
              {results.length === 0 ? (
                <p className="text-gray-300">검색 결과가 없습니다.</p>
              ) : (
                // 넓은 화면은 목록만 안에서 스크롤한다. p-1은 테두리·그림자가 스크롤 경계에 잘리지 않게.
                <ul ref={listRef} className="flex flex-col gap-2 lg:-m-1 lg:min-h-0 lg:overflow-y-auto lg:p-1">
                  {results.slice(0, AD_AFTER_RESULT).map(renderResult)}
                  {/* 광고는 다섯 번째 결과 뒤(결과가 그보다 적으면 맨 끝)에 하나만. 결과와 같은 층의
                      형제로 두어야 key가 유지되어 검색어를 바꿔도 광고를 다시 요청하지 않는다
                      (Fragment로 결과 안에 넣으면 위치가 바뀔 때마다 새로 마운트된다). 결과가 없을 땐
                      두지 않는다 — 내용 없는 화면의 광고는 애드센스 정책 위반이다. */}
                  <li key="ad">
                    <AdSlot slot={AD_SLOTS.dictionaryList} className="py-2" />
                  </li>
                  {results.slice(AD_AFTER_RESULT).map(renderResult)}
                </ul>
              )}
            </div>
          )}
        </div>

        {isWide && (
          <section className="min-w-0 rounded-3xl border-2 border-primary/10 bg-white p-6 shadow-sm">
            {panelEntry ? (
              <>
                {/* 같은 화면을 단어 상세 페이지로도 열 수 있게(주소 공유·새 탭). */}
                <div className="flex justify-end">
                  <Link {...wordLink(panelEntry.id)} className="text-xs text-gray-400 hover:text-info">
                    단어 페이지로 열기 ↗
                  </Link>
                </div>
                <WordDetail key={panelEntry.id} entry={panelEntry} />
              </>
            ) : (
              <div className="py-16 text-center text-gray-400">
                <p className="text-4xl">📖</p>
                <p className="mt-3">단어를 검색하면 여기에 뜻·활용·예문이 나와요.</p>
                <p className="mt-1 text-sm text-gray-300">목록에서 ↑ ↓ 키로 옮겨 볼 수 있어요.</p>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

export default DictionaryPage;
