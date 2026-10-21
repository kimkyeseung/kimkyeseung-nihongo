import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { getKanjiByLevel, getKanjiEntry } from "../lib/kanji";
import { useKanjiProgressStore } from "../stores/kanjiProgressStore";
import { useKanjiView } from "../stores/pageStateStore";
import KanjiDetailSheet from "../components/KanjiDetailSheet";
import KanjiQuizSheet from "../components/KanjiQuizSheet";
import SegmentedTabs from "../components/SegmentedTabs";
import { JLPT_LEVELS } from "../types/jlpt";
import type { KanjiEntry } from "../types/kanji";

function KanjiPage() {
  // 보고 있던 급수는 페이지를 떠나도 유지된다(pageStateStore 주석 참고).
  const level = useKanjiView((s) => s.level);
  const setLevel = useKanjiView((s) => s.setLevel);
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

  function openKanji(k: KanjiEntry) {
    setSearchParams({ k: k.kanji }, { state: { kanjiSheet: true } });
  }

  function closeKanji() {
    if (openedHere) navigate(-1);
    else setSearchParams({}, { replace: true });
  }

  // 넘겨 보기는 그 글자의 급수 목록 안에서 한다(보통은 지금 보는 급수와 같다 — 다른 급수의 글자를
  // 주소로 직접 연 경우에도 그 급수 안에서 넘어가게).
  const siblings = useMemo(() => (selected ? getKanjiByLevel(selected.jlptLevel) : []), [selected]);
  const selectedIndex = selected ? siblings.findIndex((k) => k.kanji === selected.kanji) : -1;

  function moveKanji(delta: number) {
    const next = siblings[selectedIndex + delta];
    if (next) setSearchParams({ k: next.kanji }, { replace: true, state: location.state });
  }
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

  function handleStartQuiz() {
    setQuizSessionId((id) => id + 1);
    setQuizPool(unlearnedKanji);
  }

  return (
    <div className="p-4 sm:p-6">
      <h2 className="text-xl text-primary">漢 한자 공부</h2>

      {/* 급수 5칸은 375px에 겨우 들어간다(재보면 딱 맞다) — 글자가 길어지거나 화면이 더
          좁아지면 바로 넘치므로 scrollable을 유지한다. */}
      <SegmentedTabs
        className="mt-4"
        scrollable
        options={JLPT_LEVELS.map((lv) => ({ key: lv, label: lv }))}
        value={level}
        onChange={setLevel}
      />

      <div className="mt-3 flex items-center justify-between gap-2">
        <p className="text-sm text-gray-400">
          {learnedCount} / {levelKanji.length}자 학습 완료
        </p>
        <button
          onClick={handleStartQuiz}
          disabled={unlearnedKanji.length === 0}
          className="btn-press rounded-2xl bg-info px-4 py-1.5 text-sm font-bold text-white disabled:bg-gray-200 disabled:text-gray-400 disabled:shadow-none"
          style={{ "--btn-shadow": "#1290c7" } as React.CSSProperties}
        >
          ✏️ 미완료 한자 테스트
        </button>
      </div>

      <div className="mt-4 grid grid-cols-4 gap-3 sm:grid-cols-6">
        {levelKanji.map((k) => (
          <motion.button
            key={k.kanji}
            whileTap={{ scale: 0.9 }}
            onClick={() => openKanji(k)}
            className={`relative flex aspect-square flex-col items-center justify-center rounded-2xl border-2 bg-white shadow-sm ${
              learnedSet.has(k.kanji) ? "border-primary/40" : "border-gray-100"
            }`}
          >
            {learnedSet.has(k.kanji) && (
              <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs text-white">
                ✓
              </span>
            )}
            <span className="font-ja text-3xl">{k.kanji}</span>
          </motion.button>
        ))}
      </div>

      <KanjiDetailSheet
        entry={selected}
        onClose={closeKanji}
        // 활용 단어로 갈 때는 시트를 닫지 않는다 — 닫기(navigate(-1))와 단어 상세로 가는 push가
        // 겹치면 뒤로가기가 먼저 처리되어 엉뚱한 곳에 떨어진다. 이대로 두면 단어 상세에서 뒤로가기로
        // 보던 한자 상세에 돌아온다.
        onLeave={() => {}}
        nav={
          selectedIndex >= 0
            ? {
                position: `${selectedIndex + 1} / ${siblings.length}`,
                onPrev: selectedIndex > 0 ? () => moveKanji(-1) : undefined,
                onNext: selectedIndex < siblings.length - 1 ? () => moveKanji(1) : undefined,
              }
            : undefined
        }
      />
      <KanjiQuizSheet key={quizSessionId} pool={quizPool} onClose={() => setQuizPool(null)} />
    </div>
  );
}

export default KanjiPage;
