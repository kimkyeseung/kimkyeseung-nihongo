import { useState } from "react";
import { kanjiInText } from "../lib/kanji";
import { useKanjiProgressStore } from "../stores/kanjiProgressStore";
import KanjiDetailSheet from "./KanjiDetailSheet";
import type { KanjiEntry } from "../types/kanji";

/**
 * 단어(또는 검색어)에 든 한자를 칩으로 늘어놓고, 누르면 **한자 페이지와 같은 상세 시트**를 연다.
 *
 * 사전에서 찾은 한자가 한자 페이지와 이어지지 않는다는 보고를 받고 만들었다 — 예전엔 단어 상세에서
 * 한자를 볼 길이 없어서, 획순을 보거나 학습 완료로 표시하려면 한자 탭으로 가서 급수를 골라 다시
 * 찾아야 했다. 시트가 같으니 학습 완료(✓)도 한자 페이지와 같은 저장소(`kanjiProgressStore`)에
 * 남고 XP 규칙도 그대로다.
 */
function KanjiChips({ text, className = "" }: { text: string; className?: string }) {
  const [open, setOpen] = useState<KanjiEntry | null>(null);
  const learned = useKanjiProgressStore((s) => s.learned);
  const entries = kanjiInText(text);
  if (entries.length === 0) return null;

  return (
    <>
      <div className={`flex flex-wrap gap-2 ${className}`}>
        {entries.map((k) => (
          <button
            key={k.kanji}
            onClick={() => setOpen(k)}
            aria-label={`한자 ${k.kanji} 자세히 보기`}
            className="btn-press flex items-center gap-1.5 rounded-2xl border-2 border-gray-100 bg-white px-3 py-1.5 shadow-sm"
          >
            <span className="font-ja text-xl">{k.kanji}</span>
            {k.koreanReading[0] && <span className="text-sm text-gray-500">{k.koreanReading[0]}</span>}
            {learned.includes(k.kanji) && <span className="text-xs text-primary">✓</span>}
          </button>
        ))}
      </div>
      <KanjiDetailSheet entry={open} onClose={() => setOpen(null)} />
    </>
  );
}

export default KanjiChips;
