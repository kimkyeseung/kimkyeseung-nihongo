import ClickableSentence from "./ClickableSentence";
import { useSentenceDialogs } from "../hooks/useSentenceDialogs";
import { SECTION_LABEL, type AnsweredQuestion } from "../lib/levelTest/run";

/**
 * 진단 결과 화면의 "틀린 문제 다시 보기". 여기서는 문장의 단어를 눌러 뜻을 볼 수 있다 —
 * 진단 중에는 일부러 막아뒀다(단어 탭으로 뜻을 보면 진단이 안 된다).
 *
 * **LevelTestPage에서 lazy로 연다.** `ClickableSentence`가 사전(7.7MB)을 정적으로 끌어와서,
 * 페이지에 바로 넣으면 인사 화면이 사전을 다 받은 뒤에야 뜬다.
 */
function LevelTestReview({ missed }: { missed: AnsweredQuestion[] }) {
  const { handlers, dialogs } = useSentenceDialogs();

  return (
    <>
      <ul className="flex flex-col gap-2">
        {missed.map(({ question: q, chosen, section }) => {
          const answer = q.choices[q.answerIndex];
          const picked = chosen === null ? "모르겠어요" : q.choices[chosen];
          return (
            <li key={q.keys[0]} className="rounded-2xl border-2 border-gray-100 bg-white p-3 text-sm">
              <p className="text-xs text-gray-400">
                {SECTION_LABEL[section]}
                {q.level && ` · ${q.level}`}
              </p>

              {q.kind === "vocab" && (
                <p className="mt-1 font-mixed text-gray-700">
                  <span className="font-ja text-base">{q.word.word}</span>
                  {q.word.reading !== q.word.word && (
                    <span className="ml-1 font-ja text-xs text-gray-400">{q.word.reading}</span>
                  )}
                  <span className="text-primary"> → {answer}</span>
                </p>
              )}

              {q.kind === "kanji" && (
                <p className="mt-1 font-mixed text-gray-700">
                  <span className="font-ja text-base">{q.word.word}</span>
                  <span className="ml-1 font-ja text-xs text-gray-400">{q.word.reading}</span>
                  <span className="text-primary">
                    {" "}
                    → <span className="font-ja">{q.kanji}</span> = <span className="font-ja">{answer}</span>
                  </span>
                </p>
              )}

              {q.kind === "kana" && (
                <p className="mt-1 text-gray-700">
                  <span className="font-ja text-base">{q.char}</span>
                  <span className="text-primary"> → {answer}</span>
                </p>
              )}

              {q.kind === "grammar" && (
                <>
                  <div className="mt-1 font-ja text-base text-gray-800">
                    <ClickableSentence text={q.item.sentence.replace("＿＿", answer)} {...handlers} />
                  </div>
                  <p className="mt-0.5 text-gray-500">{q.item.translation}</p>
                  {q.item.note && <p className="mt-1 font-mixed text-xs text-gray-400">💡 {q.item.note}</p>}
                </>
              )}

              {q.kind === "reading" && (
                <>
                  <div className="mt-1 rounded-xl bg-gray-50 p-2 font-ja leading-relaxed text-gray-700">
                    <ClickableSentence text={q.item.passage} {...handlers} />
                  </div>
                  <p className="mt-1 text-gray-600">{q.item.question}</p>
                  <p className="text-primary">→ {answer}</p>
                </>
              )}

              {q.kind === "listening" && (
                <>
                  <div className="mt-1 flex flex-col gap-0.5 rounded-xl bg-gray-50 p-2 font-ja text-gray-700">
                    {q.item.script.map((line, i) => (
                      <p key={i}>
                        {line.speaker && <span className="mr-1 text-xs text-gray-400">{line.speaker}</span>}
                        <ClickableSentence text={line.text} {...handlers} />
                      </p>
                    ))}
                  </div>
                  <p className="mt-1 text-gray-600">{q.item.question}</p>
                  <p className="text-primary">→ {answer}</p>
                </>
              )}

              <p className={`mt-1 text-xs text-gray-400 ${q.kind === "grammar" || q.kind === "kanji" ? "font-mixed" : ""}`}>
                고른 답: {picked}
              </p>
            </li>
          );
        })}
      </ul>
      {dialogs}
    </>
  );
}

export default LevelTestReview;
