import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import KanaDetailDialog, { KanaDetail } from "../components/KanaDetailDialog";
import KanaSpeakingGame from "../components/KanaSpeakingGame";
import SegmentedTabs from "../components/SegmentedTabs";
import { GOJUON_SECTIONS, type KanaCell, type KanaTab, type ScriptMode } from "../data/gojuon";
import { useJapaneseSpeech } from "../hooks/useJapaneseSpeech";
import { useMediaQuery, WIDE_SCREEN_QUERY } from "../hooks/useMediaQuery";
import { useGamificationStore } from "../stores/gamificationStore";
import { useLearnerMemoryStore, recordStudyEvent } from "../stores/learnerMemoryStore";
import { useGojuonView } from "../stores/pageStateStore";
import { XP_REWARDS } from "../lib/xpRewards";
import { speakableCells } from "../lib/kanaPronunciation";

const TAB_OPTIONS: readonly { key: KanaTab; label: string }[] = [
  { key: "seion", label: "청음" },
  { key: "dakuon", label: "탁음" },
  { key: "youon", label: "요음" },
  { key: "special", label: "특수" },
];

function GojuonPage() {
  // 히라가나/가타카나 선택과 탭은 페이지를 떠나도 유지된다(pageStateStore 주석 참고).
  const mode = useGojuonView((s) => s.mode);
  const setMode = useGojuonView((s) => s.setMode);
  const storedTab = useGojuonView((s) => s.tab);
  const setTab = useGojuonView((s) => s.setTab);
  // "특수"는 가타카나 전용 표기(ファ·ヶ…)라 히라가나 모드에서는 탭 자체가 없다.
  const tabOptions =
    mode === "katakana" ? TAB_OPTIONS : TAB_OPTIONS.filter((t) => t.key !== "special");
  const tab: KanaTab = mode === "hiragana" && storedTab === "special" ? "seion" : storedTab;
  const sections = GOJUON_SECTIONS.filter((section) => section.tab === tab);
  // 발음 게임은 지금 보고 있는 표에서 낸다. 판마다 새로 섞도록 여는 횟수를 key로 쓴다
  // (KanjiPage의 quizSessionId와 같은 방식). null이면 닫힘.
  const [gameSession, setGameSession] = useState<number | null>(null);
  const gameCells = speakableCells(sections.flatMap((s) => s.rows.flatMap((r) => r.cells)));
  const tabLabel = TAB_OPTIONS.find((t) => t.key === tab)?.label ?? "";
  const [selected, setSelected] = useState<KanaCell | null>(null);
  const { speak, isSupported } = useJapaneseSpeech();
  const recordProgress = useGamificationStore((s) => s.recordProgress);

  // **넓은 화면(lg 이상)은 "표 + 상세 패널" 2단이다.** 모바일 화면을 그대로 늘리면 표(칸 최대폭
  // 4.5rem)가 왼쪽 400px대에 붙고 나머지가 텅 비었다. 그래서 상세를 바텀시트 대신 오른쪽 패널에
  // 붙인다 — 모달이 없으니 표를 보면서 옆 글자를 연달아 눌러볼 수 있다. 좁은 화면은 예전 그대로다.
  const isWide = useMediaQuery(WIDE_SCREEN_QUERY);
  const cellsInView = sections.flatMap((s) => s.rows.flatMap((r) => r.cells)).filter((c) => c !== null);
  // 패널은 비어 있으면 안 된다 — 고른 글자가 지금 표에 없으면(탭을 바꿨다) 표의 첫 글자를 보여준다.
  const panelCell = (selected && cellsInView.includes(selected) ? selected : cellsInView[0]) ?? null;

  // 넓은 화면의 진도 표시(칸의 점 + 패널의 "n/m"). 학습 기록은 글자 그대로(가타카나면 カ)를 남긴다.
  const events = useLearnerMemoryStore((s) => s.events);
  const studied = useMemo(
    () => new Set(events.filter((e) => e.type === "kana-studied").map((e) => e.subject)),
    [events]
  );
  const kanaOf = (c: KanaCell) => (mode === "hiragana" ? c.hiragana : c.katakana);
  const studiedCount = cellsInView.filter((c) => studied.has(kanaOf(c))).length;

  // 탭하면 상세 다이얼로그를 열면서 발음도 바로 들려준다 — 다이얼로그를 여느라 소리가
  // 한 박자 늦어지면 예전의 "누르면 바로 소리" 감각이 사라진다.
  function handleSelect(cell: KanaCell) {
    const kana = mode === "hiragana" ? cell.hiragana : cell.katakana;
    setSelected(cell);
    speak(cell.speech ?? kana);

    // **XP는 그 글자를 처음 눌렀을 때만 준다.** 예전에는 탭할 때마다 무조건 줘서 한 글자를
    // 연타하면 XP가 무한히 쌓였다 — 게이미피케이션 규칙("아직 안 된 상태 → 되는 상태로
    // 바뀔 때만 지급")에 어긋나던 알려진 문제다. 이제 가나별 학습 기록이 생겨서 판단할 수
    // 있다(Pre-N5 유닛의 진도도 이 기록으로 센다).
    const alreadyStudied = useLearnerMemoryStore
      .getState()
      .events.some((e) => e.type === "kana-studied" && e.subject === kana);
    if (alreadyStudied) return;

    recordStudyEvent({ type: "kana-studied", subject: kana });
    recordProgress(XP_REWARDS.gojuonPlayed);
  }

  const gameButton = (
    <button
      onClick={() => setGameSession((n) => (n ?? 0) + 1)}
      className="btn-press flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3 font-bold text-white"
      style={{ "--btn-shadow": "#3d9401" } as React.CSSProperties}
    >
      🎤 2초 발음 게임
    </button>
  );

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6 lg:px-8">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl text-primary lg:text-2xl">あ 오십음도</h2>

        <SegmentedTabs
          options={[
            { key: "hiragana", label: "히라가나" },
            { key: "katakana", label: "가타카나" },
          ]}
          value={mode}
          onChange={setMode}
        />
      </div>

      {!isSupported && (
        <p className="mt-3 rounded-xl bg-warning/10 p-3 text-sm text-warning">
          이 브라우저는 음성 재생(SpeechSynthesis)을 지원하지 않아 발음을 들을 수 없습니다.
        </p>
      )}

      <div className="lg:mt-6 lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-10">
        <div className="min-w-0">
          <SegmentedTabs
            options={tabOptions}
            value={tab}
            onChange={setTab}
            fill
            className="mt-4 lg:mt-0"
          />

          {/* 넓은 화면에서는 오른쪽 패널의 카드로 옮겨 간다 — 1000px 넘게 늘어난 초록 막대가 됐다. */}
          {!isWide && <div className="mt-3">{gameButton}</div>}

          {tab === "special" && (
            <p className="mt-3 text-sm text-gray-500">
              외래어를 적을 때 쓰는 가타카나 조합이에요. 작은 ァ·ィ·ゥ·ェ·ォ·ュ를 붙여 일본어에 없던 소리를
              나타내요.
            </p>
          )}

          <div className="mt-6 flex flex-col gap-8">
            {sections.map((section) => (
              <section key={section.id}>
                <h3 className="mb-3 text-lg text-gray-700">{section.label}</h3>
                {/* 칸은 최소폭 없이(minmax(0, …)) 화면 너비를 나눠 갖는다. 예전의 최소폭 3.5rem +
                    행 레이블 2rem + gap 8px로는 375px(내용 폭 343px)에서 352px가 되어 마지막 열이
                    9px 잘렸다. 최대폭 4.5rem은 칸이 적은 표(요음 3칸·ヵヶ 2칸)가 과하게 늘어나지 않게.
                    넓은 화면에서는 글자를 크게 보는 화면이라 6.5rem까지 키운다. */}
                <div
                  className="grid gap-1.5 sm:gap-2 lg:gap-3"
                  style={{
                    gridTemplateColumns: `1.5rem repeat(${section.columnHeaders.length}, minmax(0, ${isWide ? "6.5rem" : "4.5rem"}))`,
                  }}
                >
                  <div />
                  {section.columnHeaders.map((h) => (
                    <div key={h} className="text-center text-xs text-gray-400">
                      {h}
                    </div>
                  ))}

                  {section.rows.map((row, rowIdx) => (
                    <RowCells
                      key={rowIdx}
                      rowLabel={row.rowLabel}
                      cells={row.cells}
                      mode={mode}
                      onSelect={handleSelect}
                      active={isWide ? panelCell : null}
                      studied={isWide ? studied : null}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>

        {/* 표가 길어도(탁음·요음) 패널은 따라 내려온다. 스크롤 컨테이너는 Layout의 <main>이다.
            패널 높이는 <main>(앱 높이 − 헤더·하단 네비 약 148px)에서 맨 위일 때 패널 위에 놓인 제목 줄·여백
            (약 88px)과 아래 여백을 뺀 만큼으로 묶는다(붙기 전에도 바닥이 안 잘리게) —
            안 묶으면 대표 단어 다섯 개에 패널이 화면보다 길어져(800px 창에서 810px) 아래의 진도·게임
            카드가 잘린 채 붙어 있었다. 넘치면 상세 카드만 안에서 스크롤한다. */}
        {isWide && panelCell && (
          <aside className="sticky top-6 flex max-h-[calc(var(--app-height,100svh)-16.5rem)] flex-col gap-4">
            <div className="min-h-0 overflow-y-auto rounded-3xl border-2 border-primary/10 bg-white p-6 shadow-sm">
              <KanaDetail key={kanaOf(panelCell)} cell={panelCell} mode={mode} />
            </div>

            <div className="shrink-0 rounded-3xl border-2 border-primary/10 bg-white p-5 shadow-sm">
              <div className="flex items-baseline justify-between">
                <p className="text-sm text-gray-500">
                  {mode === "hiragana" ? "히라가나" : "가타카나"} · {tabLabel}에서 눌러 본 글자
                </p>
                <p className="text-sm text-gray-700">
                  <span className="text-lg text-primary">{studiedCount}</span> / {cellsInView.length}
                </p>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-100">
                <div
                  className="h-full rounded-full bg-primary transition-[width]"
                  style={{ width: `${cellsInView.length ? (studiedCount / cellsInView.length) * 100 : 0}%` }}
                />
              </div>
              <div className="mt-4">{gameButton}</div>
              <p className="mt-2 text-center text-xs text-gray-400">지금 보고 있는 표에서 10문제를 내요</p>
            </div>
          </aside>
        )}
      </div>

      {/* 넓은 화면에서는 패널이 대신하므로 시트를 띄우지 않는다(고른 글자는 패널이 보여준다). */}
      <KanaDetailDialog cell={isWide ? null : selected} mode={mode} onClose={() => setSelected(null)} />
      <KanaSpeakingGame
        session={gameSession ?? 0}
        cells={gameSession === null ? null : gameCells}
        mode={mode}
        label={`${mode === "hiragana" ? "히라가나" : "가타카나"} · ${tabLabel}`}
        onClose={() => setGameSession(null)}
        onRestart={() => setGameSession((n) => (n ?? 0) + 1)}
      />
    </div>
  );
}

function RowCells({
  rowLabel,
  cells,
  mode,
  onSelect,
  active,
  studied,
}: {
  rowLabel: string;
  cells: (KanaCell | null)[];
  mode: ScriptMode;
  onSelect: (cell: KanaCell) => void;
  /** 넓은 화면에서 패널에 떠 있는 글자(테두리로 표시). 좁은 화면은 null. */
  active: KanaCell | null;
  /** 넓은 화면에서 눌러 본 글자(점으로 표시). 좁은 화면은 null — 모바일 칸은 예전 모양 그대로. */
  studied: Set<string> | null;
}) {
  return (
    <>
      <div className="flex items-center justify-center text-xs text-gray-400">{rowLabel}</div>
      {cells.map((c, i) => {
        if (!c) return <div key={i} />;
        const kana = mode === "hiragana" ? c.hiragana : c.katakana;
        const isActive = active === c;
        return (
          <motion.button
            key={i}
            whileTap={{ scale: 0.88 }}
            onClick={() => onSelect(c)}
            aria-label={`${kana} ${c.romaji} 자세히 보기`}
            aria-pressed={active ? isActive : undefined}
            className={`relative flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-2xl border-2 py-2 shadow-sm active:border-primary/30 lg:min-h-20 lg:gap-1 ${
              isActive ? "border-primary bg-primary/5" : "border-primary/10 bg-white lg:hover:border-primary/40"
            }`}
          >
            {studied?.has(kana) && (
              <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-primary" aria-hidden />
            )}
            <span className="font-ja text-2xl leading-none lg:text-4xl">{kana}</span>
            <span className="text-[11px] text-gray-400 lg:text-xs">{c.romaji}</span>
          </motion.button>
        );
      })}
    </>
  );
}

export default GojuonPage;
