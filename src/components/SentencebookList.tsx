import { useMemo } from "react";
import ClickableSentence from "./ClickableSentence";
import SentenceActions from "./SentenceActions";
import SentenceGrammar from "./SentenceGrammar";
import { dangerChipClass } from "./iconButtonClass";
import { useSentenceDialogs } from "../hooks/useSentenceDialogs";
import { useSentencebookStore } from "../stores/sentencebookStore";

/**
 * 단어장의 **문장 칸** 목록.
 *
 * 회화 말풍선·선생님 답변과 **같은 장치**를 그대로 쓴다 — `ClickableSentence`(사전 후리가나·
 * 단어 탭) + `useSentenceDialogs`(단어 뜻·한자 상세) + `SentenceActions`(⋮ 메뉴) +
 * `SentenceGrammar`(문형 칩). 문장을 보여주는 화면을 새로 만들 때도 이 조합을 재사용할 것.
 */
function SentencebookList() {
  const entriesMap = useSentencebookStore((s) => s.entries);
  const removeSentence = useSentencebookStore((s) => s.removeSentence);
  const { handlers, dialogs } = useSentenceDialogs();

  // 최근에 담은 것이 위로.
  const entries = useMemo(
    () => Object.values(entriesMap).sort((a, b) => b.addedAt - a.addedAt),
    [entriesMap]
  );

  if (entries.length === 0) {
    return (
      <p className="mt-10 text-center leading-relaxed text-gray-400">
        아직 담아둔 문장이 없습니다.
        <br />
        회화·선생님 답변의 ⋮ 메뉴에서 문장을 담아보세요.
      </p>
    );
  }

  return (
    <>
      <ul className="mt-4 flex flex-col gap-2">
        {entries.map((entry) => (
          <li key={entry.id} className="rounded-2xl border-2 border-gray-100 bg-white p-3">
            <div className="flex items-start gap-2">
              <span className="flex-1 font-ja text-lg leading-loose">
                <ClickableSentence text={entry.text} {...handlers} />
                <SentenceActions text={entry.text} subject="담아둔 문장" />
              </span>
              <button
                onClick={() => removeSentence(entry.id)}
                className={dangerChipClass}
                aria-label="단어장에서 문장 삭제"
              >
                삭제
              </button>
            </div>
            <SentenceGrammar text={entry.text} />
            {entry.source && <p className="mt-1 text-xs text-gray-300">{entry.source}</p>}
          </li>
        ))}
      </ul>

      {dialogs}
    </>
  );
}

export default SentencebookList;
