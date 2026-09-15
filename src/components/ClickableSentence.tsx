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
  excludeWord,
}: {
  text: string;
  onWordClick: (word: WordEntry) => void;
  /** 지금 보고 있는 단어와 같은 표제어는 예문 안에서 또 눌러도 의미가 없으니 클릭 불가로 둔다. */
  excludeWord?: string;
}) {
  const segments = useMemo(() => segmentSentenceIntoWords(text), [text]);

  return (
    <>
      {segments.map((seg, i) => {
        if (!seg.word) return <Fragment key={i}>{seg.text}</Fragment>;

        const content = seg.word.furigana
          ? seg.word.furigana.map((f, j) => (
              <ruby key={j}>
                {f.ruby}
                <rt>{f.rt}</rt>
              </ruby>
            ))
          : seg.text;

        if (seg.word.word === excludeWord) {
          return (
            <span key={i} className="px-0.5">
              {content}
            </span>
          );
        }

        return (
          <button
            key={i}
            type="button"
            onClick={() => onWordClick(seg.word!)}
            className="rounded px-0.5 underline decoration-dotted decoration-gray-300 underline-offset-4 hover:bg-primary/10 active:bg-primary/20"
          >
            {content}
          </button>
        );
      })}
    </>
  );
}

export default ClickableSentence;
