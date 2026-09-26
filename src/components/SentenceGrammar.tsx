import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import SpeakButton from "./SpeakButton";
import { useCurriculum } from "../hooks/useCurriculumPlan";
import { findGrammarInSentence } from "../lib/grammarPatterns";

/**
 * 문장에 들어 있는 커리큘럼 문법을 칩으로 보여주고, 누르면 그 자리에서 설명을 펼친다.
 *
 * 왜 있는가: 사전은 **단어**만 안다. 「〜のため」의 ため를 눌러도 나오는 건 為(good,
 * advantage...)뿐이고, 정작 배우고 싶은 "~하기 위해서"는 문법이라 사전에 없다. 그 설명은
 * 커리큘럼이 이미 들고 있다.
 *
 * **자기 안에서 다 끝낸다** — 다이얼로그를 띄우지 않고 인라인으로 펼치므로, 부르는 쪽은
 * `text` 하나만 주면 된다(ClickableSentence처럼 콜백·시트를 배선할 필요가 없다).
 * 걸리는 문법이 없으면 아무것도 그리지 않는다.
 */
function SentenceGrammar({
  text,
  className = "",
  showOnly,
}: {
  text: string;
  className?: string;
  /** 주면 이 안에 든 패턴만 보여준다 — 한 답변에서 같은 칩을 되풀이하지 않으려고(MarkdownAnswer). */
  showOnly?: ReadonlySet<string>;
}) {
  const curriculum = useCurriculum();
  const [openPattern, setOpenPattern] = useState<string | null>(null);

  // 커리큘럼은 동적 import라 한 박자 늦게 온다 — 그 전에는 빈 목록이다.
  const matches = useMemo(
    () =>
      curriculum
        ? findGrammarInSentence(curriculum, text).filter((m) => !showOnly || showOnly.has(m.point.pattern))
        : [],
    [curriculum, text, showOnly]
  );

  if (matches.length === 0) return null;
  const open = matches.find((m) => m.point.pattern === openPattern);

  return (
    <div className={`mt-1.5 ${className}`}>
      <div className="flex flex-wrap items-center gap-1">
        {matches.map((m) => {
          const isOpen = m.point.pattern === openPattern;
          return (
            <button
              key={m.point.pattern}
              type="button"
              // 문장 자체가 클릭 가능한 화면(ClickableSentence)에서 같이 눌리지 않게
              onClick={(e) => {
                e.stopPropagation();
                setOpenPattern(isOpen ? null : m.point.pattern);
              }}
              aria-expanded={isOpen}
              className={`rounded-full border px-2 py-0.5 text-xs whitespace-nowrap ${
                isOpen
                  ? "border-info bg-info/10 text-info"
                  : "border-gray-200 text-gray-500 hover:border-info/40 hover:text-info"
              }`}
            >
              <span aria-hidden>📘 </span>
              <span className="font-ja">{m.point.pattern}</span>
            </button>
          );
        })}
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key={open.point.pattern}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="mt-1.5 rounded-2xl bg-info/5 px-3 py-2">
              <p className="font-mixed text-sm text-gray-700">
                <span className="font-ja">{open.point.pattern}</span>
                <span className="text-gray-400"> · {open.level}</span>
              </p>
              <p className="mt-0.5 text-sm text-gray-600">{open.point.meaning}</p>
              <p className="mt-1.5 font-ja text-sm text-gray-800">
                {open.point.example}
                <SpeakButton text={open.point.example} label="문법 예문 발음 듣기" className="ml-1" />
              </p>
              <p className="text-xs text-gray-400">{open.point.exampleTranslation}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default SentenceGrammar;
