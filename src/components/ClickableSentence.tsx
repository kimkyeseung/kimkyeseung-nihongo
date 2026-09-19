import { Fragment, useMemo } from "react";
import { rubyFor, segmentSentenceIntoWords } from "../lib/sentenceWords";
import type { WordEntry } from "../types/dictionary";
import type { KanjiEntry } from "../types/kanji";

const CLICKABLE_CLASS =
  "rounded px-0.5 underline decoration-dotted decoration-gray-300 underline-offset-4 hover:bg-primary/10 active:bg-primary/20";

/**
 * 일본어 문장을 사전 단어/조사 단위로 잘라, 사전에 있는 부분만 탭 가능하게 렌더링한다.
 * 활용형이라 사전 단어로는 안 잡히지만 한자 자체는 아는 글자(예: 開いた의 開)는 onKanjiClick으로
 * 따로 넘긴다. 후리가나도(있으면) 같이 보여준다. 새로운 화면에서 "문장 속 단어 탭하면 뜻 보기"가
 * 필요하면 WordMeaningDialog와 함께 이 컴포넌트를 재사용할 것 — 새로 만들지 말 것.
 */
function ClickableSentence({
  text,
  onWordClick,
  onKanjiClick,
  excludeWord,
  showFurigana = true,
}: {
  text: string;
  onWordClick: (word: WordEntry) => void;
  onKanjiClick?: (kanji: KanjiEntry) => void;
  /** 지금 보고 있는 단어와 같은 표제어는 예문 안에서 또 눌러도 의미가 없으니 클릭 불가로 둔다. */
  excludeWord?: string;
  /** false면 후리가나 없이 원문만 보여준다(클릭 가능 여부는 그대로) — 회화 페이지의
      "후리가나 표시" 토글처럼 furigana on/off가 필요한 화면에서 쓴다. */
  showFurigana?: boolean;
}) {
  const segments = useMemo(() => segmentSentenceIntoWords(text), [text]);

  return (
    <>
      {segments.map((seg, i) => {
        if (seg.word) {
          // **`seg.word.furigana`를 직접 쓰지 말 것.** 그건 표제어의 표기를 설명하는 것이라,
          // 가나로 쓴 자리(ため ↔ 為)에 그대로 그리면 화면의 문장이 바뀐다(rubyFor 주석 참고).
          const ruby = showFurigana ? rubyFor(seg) : null;
          const content = ruby
            ? ruby.map((f, j) => (
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
            <button key={i} type="button" onClick={() => onWordClick(seg.word!)} className={CLICKABLE_CLASS}>
              {content}
            </button>
          );
        }

        if (seg.kanji && onKanjiClick) {
          return (
            <button key={i} type="button" onClick={() => onKanjiClick(seg.kanji!)} className={CLICKABLE_CLASS}>
              {seg.text}
            </button>
          );
        }

        return <Fragment key={i}>{seg.text}</Fragment>;
      })}
    </>
  );
}

export default ClickableSentence;
