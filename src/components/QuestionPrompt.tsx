import ListeningPlayer from "./ListeningPlayer";
import type { LevelTestQuestion } from "../lib/levelTest/questions";

/**
 * 4지선다 문제의 "문제 부분"(단어·밑줄 친 한자·빈칸 문장·지문·청해 플레이어·가나). 보기는 `ChoiceQuestion`.
 * 레벨 진단(`/level`)과 단원 점검(`/test`)이 같이 쓴다.
 */
function QuestionPrompt({ q }: { q: LevelTestQuestion }) {
  switch (q.kind) {
    case "vocab":
      return (
        <>
          <p className="text-center font-ja text-4xl text-gray-800">{q.display}</p>
          <p className="mt-3 text-center text-sm text-gray-400">이 단어의 뜻은?</p>
        </>
      );
    case "kanji":
      return (
        <>
          <p className="text-center font-ja text-4xl text-gray-800">
            {[...q.word.word].map((ch, i) =>
              ch === q.kanji ? (
                <span key={i} className="underline decoration-primary decoration-4 underline-offset-8">
                  {ch}
                </span>
              ) : (
                <span key={i}>{ch}</span>
              ),
            )}
          </p>
          <p className="mt-4 text-center text-sm text-gray-400">밑줄 친 한자는 이 단어에서 어떻게 읽을까요?</p>
        </>
      );
    case "item":
      return (
        <>
          <p className="text-center font-ja text-4xl text-gray-800">{q.text}</p>
          <p className="mt-3 text-center text-sm text-gray-400">이 말의 뜻은?</p>
        </>
      );
    case "kana":
      return (
        <>
          <p className="text-center font-ja text-6xl text-gray-800">{q.char}</p>
          <p className="mt-3 text-center text-sm text-gray-400">이 글자의 소리는?</p>
        </>
      );
    case "grammar": {
      const [before, after] = q.item.sentence.split("＿＿");
      return (
        <>
          <p className="font-ja text-xl leading-loose text-gray-800">
            {before}
            <span className="mx-1 inline-block min-w-12 border-b-4 border-primary align-baseline">&nbsp;</span>
            {after}
          </p>
          <p className="mt-3 text-sm text-gray-400">빈칸에 들어갈 말은?</p>
        </>
      );
    }
    case "reading":
      return (
        <>
          {/* 지문은 ClickableSentence로 그리지 않는다 — 단어를 눌러 뜻을 보면 진단이 안 된다. */}
          <div className="rounded-2xl bg-gray-50 p-4 font-ja text-lg leading-relaxed text-gray-800">{q.item.passage}</div>
          <p className="mt-3 font-bold text-gray-700">{q.item.question}</p>
        </>
      );
    case "listening":
      return (
        <>
          {/* 문제마다 key로 리마운트 — 재생 횟수가 이어지지 않고, 앞 문제의 대화가 멈춘다. */}
          <ListeningPlayer key={q.keys[0]} item={q.item} level={q.level ?? q.item.level} />
          <p className="mt-3 font-bold text-gray-700">{q.item.question}</p>
        </>
      );
  }
}


export default QuestionPrompt;
