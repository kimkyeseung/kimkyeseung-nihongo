import { useState } from "react";
import { motion } from "framer-motion";
import KanaDetailDialog from "../components/KanaDetailDialog";
import SegmentedTabs from "../components/SegmentedTabs";
import { GOJUON_SECTIONS, type KanaCell, type ScriptMode } from "../data/gojuon";
import { useJapaneseSpeech } from "../hooks/useJapaneseSpeech";
import { useGamificationStore } from "../stores/gamificationStore";
import { useLearnerMemoryStore, recordStudyEvent } from "../stores/learnerMemoryStore";
import { useGojuonView } from "../stores/pageStateStore";
import { XP_REWARDS } from "../lib/xpRewards";

function GojuonPage() {
  // 히라가나/가타카나 선택은 페이지를 떠나도 유지된다(pageStateStore 주석 참고).
  const mode = useGojuonView((s) => s.mode);
  const setMode = useGojuonView((s) => s.setMode);
  const [selected, setSelected] = useState<KanaCell | null>(null);
  const { speak, isSupported } = useJapaneseSpeech();
  const recordProgress = useGamificationStore((s) => s.recordProgress);

  // 탭하면 상세 다이얼로그를 열면서 발음도 바로 들려준다 — 다이얼로그를 여느라 소리가
  // 한 박자 늦어지면 예전의 "누르면 바로 소리" 감각이 사라진다.
  function handleSelect(cell: KanaCell) {
    const kana = mode === "hiragana" ? cell.hiragana : cell.katakana;
    setSelected(cell);
    speak(kana);

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

  return (
    <div className="p-4 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl text-primary">あ 오십음도</h2>

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

      <div className="mt-6 flex flex-col gap-8">
        {GOJUON_SECTIONS.map((section) => (
          <section key={section.id}>
            <h3 className="mb-3 text-lg text-gray-700">{section.label}</h3>
            <div className="overflow-x-auto">
              <div
                className="grid w-fit gap-2"
                style={{
                  gridTemplateColumns: `2rem repeat(${section.columnHeaders.length}, minmax(3.5rem, 1fr))`,
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
                  />
                ))}
              </div>
            </div>
          </section>
        ))}
      </div>

      <KanaDetailDialog cell={selected} mode={mode} onClose={() => setSelected(null)} />
    </div>
  );
}

function RowCells({
  rowLabel,
  cells,
  mode,
  onSelect,
}: {
  rowLabel: string;
  cells: (KanaCell | null)[];
  mode: ScriptMode;
  onSelect: (cell: KanaCell) => void;
}) {
  return (
    <>
      <div className="flex items-center justify-center text-xs text-gray-400">{rowLabel}</div>
      {cells.map((c, i) =>
        c ? (
          <motion.button
            key={i}
            whileTap={{ scale: 0.88 }}
            onClick={() => onSelect(c)}
            aria-label={`${mode === "hiragana" ? c.hiragana : c.katakana} ${c.romaji} 자세히 보기`}
            className="flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-2xl border-2 border-primary/10 bg-white py-2 shadow-sm active:border-primary/30"
          >
            <span className="font-ja text-2xl leading-none">
              {mode === "hiragana" ? c.hiragana : c.katakana}
            </span>
            <span className="text-[11px] text-gray-400">{c.romaji}</span>
          </motion.button>
        ) : (
          <div key={i} />
        )
      )}
    </>
  );
}

export default GojuonPage;
