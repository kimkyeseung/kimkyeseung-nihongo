import { useState } from "react";
import { motion } from "framer-motion";
import { GOJUON_SECTIONS, type KanaCell } from "../data/gojuon";
import { useJapaneseSpeech } from "../hooks/useJapaneseSpeech";
import { useGamificationStore } from "../stores/gamificationStore";
import { XP_REWARDS } from "../lib/xpRewards";

type ScriptMode = "hiragana" | "katakana";

function GojuonPage() {
  const [mode, setMode] = useState<ScriptMode>("hiragana");
  const { speak, isSupported } = useJapaneseSpeech();
  const recordProgress = useGamificationStore((s) => s.recordProgress);

  function handleSpeak(text: string) {
    speak(text);
    recordProgress(XP_REWARDS.gojuonPlayed);
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl text-primary">あ 오십음도</h2>

        <div className="flex rounded-full bg-gray-100 p-1">
          {(
            [
              { key: "hiragana", label: "히라가나" },
              { key: "katakana", label: "가타카나" },
            ] as const
          ).map((opt) => (
            <button
              key={opt.key}
              onClick={() => setMode(opt.key)}
              className={`rounded-full px-4 py-1.5 text-sm transition-colors ${
                mode === opt.key ? "bg-primary text-white" : "text-gray-500"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
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
                    onSpeak={handleSpeak}
                  />
                ))}
              </div>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function RowCells({
  rowLabel,
  cells,
  mode,
  onSpeak,
}: {
  rowLabel: string;
  cells: (KanaCell | null)[];
  mode: ScriptMode;
  onSpeak: (text: string) => void;
}) {
  return (
    <>
      <div className="flex items-center justify-center text-xs text-gray-400">{rowLabel}</div>
      {cells.map((c, i) =>
        c ? (
          <motion.button
            key={i}
            whileTap={{ scale: 0.88 }}
            onClick={() => onSpeak(mode === "hiragana" ? c.hiragana : c.katakana)}
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
