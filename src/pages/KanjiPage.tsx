import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { getKanjiByLevel, getKanjiEntry } from "../lib/kanji";
import { useKanjiProgressStore } from "../stores/kanjiProgressStore";
import { useKanjiView, type KanjiFilter } from "../stores/pageStateStore";
import KanjiDetailSheet, { KanjiDetail } from "../components/KanjiDetailSheet";
import KanjiQuizSheet from "../components/KanjiQuizSheet";
import SegmentedTabs from "../components/SegmentedTabs";
import { useMediaQuery, WIDE_SCREEN_QUERY } from "../hooks/useMediaQuery";
import { JLPT_LEVELS, type JlptLevel } from "../types/jlpt";
import type { KanjiEntry } from "../types/kanji";

function KanjiPage() {
  // 보고 있던 급수는 페이지를 떠나도 유지된다(pageStateStore 주석 참고).
  const level = useKanjiView((s) => s.level);
  const setLevel = useKanjiView((s) => s.setLevel);
  const filter = useKanjiView((s) => s.filter);
  const setFilter = useKanjiView((s) => s.setFilter);
  // 열린 한자 상세는 주소(`?k=水`)에 싣는다. 예전엔 로컬 state라 **휴대폰의 뒤로가기가 시트가 아니라
  // 한자 페이지 자체를 닫았다.** 열 때 기록을 하나 쌓고(push) 닫을 때 그걸 되돌리므로, 뒤로가기는
  // 시트만 닫고 목록에 남는다. 스와이프로 옆 글자로 갈 때는 replace — 몇 글자를 넘겨 봤든 뒤로가기
  // 한 번이면 목록이다.
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const selectedChar = searchParams.get("k");
  const selected = useMemo(
    () => (selectedChar ? (getKanjiEntry(selectedChar) ?? null) : null),
    [selectedChar]
  );
  // 우리가 쌓은 기록인지 표시해 둔다 — 주소를 직접 열었거나 새로고침한 경우엔 되돌릴 기록이 없어서
  // navigate(-1)을 부르면 앱 밖으로 나간다.
  const openedHere = (location.state as { kanjiSheet?: boolean } | null)?.kanjiSheet === true;

  // **넓은 화면(lg 이상)은 "격자 + 상세 패널" 2단이다**(오십음도와 같은 틀). 모바일 화면을 그대로
  // 늘리면 6열 격자의 칸 하나가 150px 넘게 커져 N5 80자도 화면 서너 개를 스크롤해야 했고, 상세는
  // 모달이라 한 글자 보고 닫고 또 여는 일의 반복이었다. 패널은 모달이 아니라서 격자를 보면서 연달아
  // 눌러 볼 수 있고 ←/→로 넘긴다. 좁은 화면은 예전 그대로다.
  const isWide = useMediaQuery(WIDE_SCREEN_QUERY);

  function openKanji(k: KanjiEntry) {
    // 패널은 열고 닫는 게 아니라 고르는 것이다 — 기록을 쌓으면 뒤로가기가 고른 글자들을 한 칸씩 되감는다.
    if (isWide) setSearchParams({ k: k.kanji }, { replace: true });
    else setSearchParams({ k: k.kanji }, { state: { kanjiSheet: true } });
  }

  function closeKanji() {
    if (openedHere) navigate(-1);
    else setSearchParams({}, { replace: true });
  }

  function handleLevel(lv: JlptLevel) {
    setLevel(lv);
    // 넓은 화면에서 급수를 바꾸면 패널도 그 급수의 글자로 옮긴다(아래 panelEntry).
    if (isWide && selectedChar) setSearchParams({}, { replace: true });
  }

  // 다른 급수의 글자를 주소로 직접 연 경우(넓은 화면) — 격자를 그 급수로 맞춘다. 안 그러면 패널과
  // 격자가 서로 다른 급수를 보여준다. **글자가 바뀔 때만** 맞춘다 — level까지 지켜보면, 급수 탭을 누른
  // 순간(level은 바뀌었는데 주소의 글자는 아직 옛 급수인 한 렌더)에 옛 급수로 도로 되돌린다(실제로 그랬다).
  const syncedChar = useRef<string | null>(null);
  useEffect(() => {
    if (!isWide || !selected || syncedChar.current === selected.kanji) return;
    syncedChar.current = selected.kanji;
    if (selected.jlptLevel !== useKanjiView.getState().level) setLevel(selected.jlptLevel);
  }, [isWide, selected, setLevel]);

  // 테스트를 열 때마다 문제를 새로 섞고 싶어서, "테스트" 버튼을 누를 때마다
  // quizSessionId를 올려 KanjiQuizSheet 내부 컴포넌트를 리마운트시키는 트리거로 쓴다.
  const [quizSessionId, setQuizSessionId] = useState(0);
  const [quizPool, setQuizPool] = useState<KanjiEntry[] | null>(null);
  const learned = useKanjiProgressStore((s) => s.learned);
  const learnedSet = useMemo(() => new Set(learned), [learned]);

  const levelKanji = useMemo(() => getKanjiByLevel(level), [level]);
  const unlearnedKanji = useMemo(
    () => levelKanji.filter((k) => !learnedSet.has(k.kanji)),
    [levelKanji, learnedSet]
  );
  const learnedCount = levelKanji.length - unlearnedKanji.length;

  // 필터는 넓은 화면에서만 보인다 — 좁은 화면의 격자는 언제나 전체다.
  const activeFilter: KanjiFilter = isWide ? filter : "all";
  const visibleKanji =
    activeFilter === "unlearned"
      ? unlearnedKanji
      : activeFilter === "learned"
        ? levelKanji.filter((k) => learnedSet.has(k.kanji))
        : levelKanji;

  // 패널은 비어 있으면 안 된다. 고른 글자가 없으면 지금 격자의 첫 글자를 보여준다.
  // 고른 글자가 필터에서 빠져도(미완료만 보다가 학습 완료로 표시) 그대로 둔다 — 보던 글자가 사라지면 안 된다.
  const panelEntry =
    selected && selected.jlptLevel === level ? selected : (visibleKanji[0] ?? levelKanji[0] ?? null);
  const shownEntry = isWide ? panelEntry : selected;

  // 넘겨 보기는 그 글자의 급수 목록 안에서 한다(보통은 지금 보는 급수와 같다 — 다른 급수의 글자를
  // 주소로 직접 연 경우에도 그 급수 안에서 넘어가게). 필터와는 상관없이 급수 전체를 넘긴다.
  const siblings = useMemo(() => (shownEntry ? getKanjiByLevel(shownEntry.jlptLevel) : []), [shownEntry]);
  const selectedIndex = shownEntry ? siblings.findIndex((k) => k.kanji === shownEntry.kanji) : -1;

  function moveKanji(delta: number) {
    const next = siblings[selectedIndex + delta];
    if (next) setSearchParams({ k: next.kanji }, { replace: true, state: location.state });
  }

  const nav =
    selectedIndex >= 0
      ? {
          position: `${selectedIndex + 1} / ${siblings.length}`,
          onPrev: selectedIndex > 0 ? () => moveKanji(-1) : undefined,
          onNext: selectedIndex < siblings.length - 1 ? () => moveKanji(1) : undefined,
        }
      : undefined;

  function handleStartQuiz() {
    setQuizSessionId((id) => id + 1);
    setQuizPool(unlearnedKanji);
  }

  const quizButton = (className: string) => (
    <button
      onClick={handleStartQuiz}
      disabled={unlearnedKanji.length === 0}
      className={`btn-press rounded-2xl bg-info font-bold text-white disabled:bg-gray-200 disabled:text-gray-400 disabled:shadow-none ${className}`}
      style={{ "--btn-shadow": "#1290c7" } as React.CSSProperties}
    >
      ✏️ 미완료 한자 테스트
    </button>
  );

  const levelTabs = (
    // 급수 5칸은 375px에 겨우 들어간다(재보면 딱 맞다) — 글자가 길어지거나 화면이 더
    // 좁아지면 바로 넘치므로 scrollable을 유지한다.
    <SegmentedTabs
      className={isWide ? "" : "mt-4"}
      scrollable
      options={JLPT_LEVELS.map((lv) => ({ key: lv, label: lv }))}
      value={level}
      onChange={handleLevel}
    />
  );

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6 lg:px-8">
      {isWide ? (
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-2xl text-primary">漢 한자 공부</h2>
          {levelTabs}
        </div>
      ) : (
        <>
          <h2 className="text-xl text-primary">漢 한자 공부</h2>
          {levelTabs}
          <div className="mt-3 flex items-center justify-between gap-2">
            <p className="text-sm text-gray-400">
              {learnedCount} / {levelKanji.length}자 학습 완료
            </p>
            {quizButton("px-4 py-1.5 text-sm")}
          </div>
        </>
      )}

      <div className="lg:mt-6 lg:grid lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start lg:gap-10">
        <div className="min-w-0">
          {/* 진도·테스트는 격자 위 도구줄에 둔다. 패널 아래 카드로 두었더니 900px 창에서 상세 카드가
              절반 높이로 줄어 음독·훈독부터 스크롤해야 했다 — 패널은 상세 하나만 담는다. */}
          {isWide && (
            <>
              <div className="flex items-center gap-3">
                <SegmentedTabs
                  fill
                  className="flex-1"
                  options={[
                    { key: "all", label: "전체", hint: String(levelKanji.length) },
                    { key: "unlearned", label: "미완료", hint: String(unlearnedKanji.length) },
                    { key: "learned", label: "학습 완료", hint: String(learnedCount) },
                  ]}
                  value={filter}
                  onChange={setFilter}
                />
                {quizButton("shrink-0 px-5 py-2 text-sm")}
              </div>
              <div className="mt-3 flex items-center gap-3">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
                  <div
                    className="h-full rounded-full bg-primary transition-[width]"
                    style={{ width: `${levelKanji.length ? (learnedCount / levelKanji.length) * 100 : 0}%` }}
                  />
                </div>
                <p className="shrink-0 text-sm text-gray-500">
                  {level} <span className="text-primary">{learnedCount}</span> / {levelKanji.length}자 학습 완료
                </p>
              </div>
            </>
          )}

          {visibleKanji.length === 0 ? (
            <p className="mt-10 text-center text-gray-400">
              {activeFilter === "unlearned" ? "🎉 이 급수의 한자를 전부 익혔어요!" : "아직 학습 완료한 한자가 없어요."}
            </p>
          ) : (
            // 넓은 화면은 칸을 작게(약 80px) 많이 — 글자를 훑어보는 격자이고, 크게 보는 건 패널이 한다.
            <div className="mt-4 grid grid-cols-4 gap-3 sm:grid-cols-6 lg:grid-cols-[repeat(auto-fill,minmax(5rem,1fr))] lg:gap-2.5">
              {visibleKanji.map((k) => {
                const isLearned = learnedSet.has(k.kanji);
                const isActive = isWide && panelEntry?.kanji === k.kanji;
                return (
                  <motion.button
                    key={k.kanji}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => openKanji(k)}
                    aria-label={`${k.kanji} 자세히 보기`}
                    aria-pressed={isWide ? isActive : undefined}
                    className={`relative flex aspect-square flex-col items-center justify-center rounded-2xl border-2 shadow-sm ${
                      isActive
                        ? "border-primary bg-primary/5"
                        : `bg-white lg:hover:border-primary/40 ${isLearned ? "border-primary/40" : "border-gray-100"}`
                    }`}
                  >
                    {isLearned && (
                      <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs text-white">
                        ✓
                      </span>
                    )}
                    <span className="font-ja text-3xl leading-none">{k.kanji}</span>
                    {/* 넓은 화면은 한국 한자음을 같이 — 훑어보며 아는 글자를 가려낼 단서다. */}
                    {isWide && k.koreanReading[0] && (
                      <span className="mt-1 text-[11px] text-gray-400">{k.koreanReading[0]}</span>
                    )}
                  </motion.button>
                );
              })}
            </div>
          )}
        </div>

        {/* 격자가 길어도 패널은 따라 내려온다(스크롤 컨테이너는 Layout의 <main>). 높이는 오십음도
            패널과 같은 계산으로 묶고(맨 위일 때 패널 위의 제목 줄까지 빼서 바닥이 안 잘리게), 넘치면
            상세 카드 안에서 스크롤한다. */}
        {isWide && panelEntry && (
          <aside className="sticky top-6 flex max-h-[calc(var(--app-height,100svh)-11.5rem)] flex-col">
            <div className="min-h-0 overflow-y-auto rounded-3xl border-2 border-primary/10 bg-white p-6 shadow-sm">
              <KanjiDetail entry={panelEntry} nav={nav} strokeSize={200} />
            </div>
            <p className="mt-2 shrink-0 text-center text-xs text-gray-400">← → 키로 옆 글자를 넘겨 볼 수 있어요</p>
          </aside>
        )}
      </div>

      {/* 넓은 화면에서는 패널이 대신하므로 시트를 띄우지 않는다. */}
      <KanjiDetailSheet
        entry={isWide ? null : selected}
        onClose={closeKanji}
        // 활용 단어로 갈 때는 시트를 닫지 않는다 — 닫기(navigate(-1))와 단어 상세로 가는 push가
        // 겹치면 뒤로가기가 먼저 처리되어 엉뚱한 곳에 떨어진다. 이대로 두면 단어 상세에서 뒤로가기로
        // 보던 한자 상세에 돌아온다.
        onLeave={() => {}}
        nav={nav}
      />
      <KanjiQuizSheet key={quizSessionId} pool={quizPool} onClose={() => setQuizPool(null)} />
    </div>
  );
}

export default KanjiPage;
