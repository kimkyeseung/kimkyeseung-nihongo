import { Fragment, useMemo } from "react";
import { segmentSentenceIntoWords } from "../lib/sentenceWords";
import type { WordEntry } from "../types/dictionary";

/**
 * 일본어 문장을 사전 단어/조사 단위로 잘라, 사전에 있는 부분만 탭 가능하게 렌더링한다.
 * 후리가나도(있으면) 같이 보여준다. 새로운 화면에서 "문장 속 단어 탭하면 뜻 보기"가
 * 필요하면 WordMeaningDialog와 함께 이 컴포넌트를 재사용할 것 — 새로 만들지 말 것.
 */
function ClickableSentence({
  text,
  onWordClick,
}: {
  text: string;
  onWordClick: (word: WordEntry) => void;
}) {
  const segments = useMemo(() => segmentSentenceIntoWords(text), [text]);

  return (
    <>
      {segments.map((seg, i) =>
        seg.word ? (
          <button
            key={i}
            type="button"
            onClick={() => onWordClick(seg.word!)}
            className="rounded px-0.5 underline decoration-dotted decoration-gray-300 underline-offset-4 hover:bg-primary/10 active:bg-primary/20"
          >
            {seg.word.furigana
              ? seg.word.furigana.map((f, j) => (
                  <ruby key={j}>
                    {f.ruby}
                    <rt>{f.rt}</rt>
                  </ruby>
                ))
              : seg.text}
          </button>
        ) : (
          <Fragment key={i}>{seg.text}</Fragment>
        )
      )}
    </>
  );
}

export default ClickableSentence;
