import ListeningPlayer from "./ListeningPlayer";
import FuriganaOnly from "./FuriganaOnly";
import type { LevelTestQuestion } from "../lib/levelTest/questions";
import type { WordEntry } from "../types/dictionary";

const HAS_KANJI = /[㐀-鿿々]/;

/**
 * 어휘 문제의 단어. 화면 표기가 표제어 그대로면 **그 항목의** 후리가나를 쓴다 — 단어 하나를 그리디로
 * 다시 분절하면 엉뚱한 낱말로 쪼개질 수 있다. 다른 표기(가나로 낸 문제 등)면 분절에 맡긴다.
 */
function VocabWord({ word, display }: { word: WordEntry; display: string }) {
  if (display === word.word && word.furigana?.length) {
    return (
      <>
        {word.furigana.map((f, i) =>
          f.rt ? (
            <ruby key={i}>
              {f.ruby}
              <rt>{f.rt}</rt>
            </ruby>
          ) : (
            <span key={i}>{f.ruby}</span>
          ),
        )}
      </>
    );
  }
  return <FuriganaOnly text={display} />;
}

/**
 * 4지선다 문제의 "문제 부분"(단어·밑줄 친 한자·빈칸 문장·지문·청해 플레이어·가나). 보기는 `ChoiceQuestion`.
 * 레벨 진단(`/level`)과 단원 점검(`/test`)이 같이 쓴다.
 *
 * **한자 문제를 뺀 모든 문제에 후리가나를 단다**(사용자 요청). 예전엔 하나도 없어서, 문법은 아는데 한자를
 * 못 읽는 학습자가 문법·독해·어휘를 틀려 그 영역 급수가 한자 실력만큼 깎였다 — 한자는 한자 영역이 따로
 * 잰다. 단어를 눌러 뜻을 보는 것은 여전히 막는다(`FuriganaOnly`). 한자 문제는 읽기 자체를 묻고, 단어의
 * 다른 한자에 읽기를 달면 단어 읽기에서 빼서 답이 나오므로 그대로 둔다.
 */
function QuestionPrompt({ q }: { q: LevelTestQuestion }) {
  switch (q.kind) {
    case "vocab":
      return (
        <>
          <p className="text-center font-ja text-4xl text-gray-800">
            <VocabWord word={q.word} display={q.display} />
          </p>
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
          <p className="text-center font-ja text-4xl text-gray-800">
            {/* 커리큘럼이 읽기를 같이 들고 있다 — 사전 분절보다 정확하다. */}
            {HAS_KANJI.test(q.text) && q.reading && q.reading !== q.text ? (
              <ruby>
                {q.text}
                <rt>{q.reading}</rt>
              </ruby>
            ) : (
              q.text
            )}
          </p>
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
            <FuriganaOnly text={before} />
            <span className="mx-1 inline-block min-w-12 border-b-4 border-primary align-baseline">&nbsp;</span>
            <FuriganaOnly text={after ?? ""} />
          </p>
          <p className="mt-3 text-sm text-gray-400">빈칸에 들어갈 말은?</p>
        </>
      );
    }
    case "reading":
      return (
        <>
          {/* 단어를 눌러 뜻을 보면 진단이 안 되므로 누를 수 없는 후리가나만 단다. */}
          <div className="rounded-2xl bg-gray-50 p-4 font-ja text-lg leading-loose text-gray-800">
            <FuriganaOnly text={q.item.passage} />
          </div>
          <p className="mt-3 font-mixed font-bold text-gray-700">
            <FuriganaOnly text={q.item.question} />
          </p>
        </>
      );
    case "listening":
      return (
        <>
          {/* 문제마다 key로 리마운트 — 재생 횟수가 이어지지 않고, 앞 문제의 대화가 멈춘다. */}
          <ListeningPlayer key={q.keys[0]} item={q.item} level={q.level ?? q.item.level} />
          <p className="mt-3 font-mixed font-bold text-gray-700">
            <FuriganaOnly text={q.item.question} />
          </p>
        </>
      );
  }
}


export default QuestionPrompt;
