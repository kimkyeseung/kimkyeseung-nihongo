import { useState } from "react";

/**
 * 4지선다 + "모르겠어요" 한 문제. 레벨 진단(`/level`)과 단원 점검(`/test`)이 같이 쓴다.
 *
 * 진단은 고르는 즉시 다음 문제로 넘어가므로(정답을 보여주지 않는다), **부르는 쪽에서 문제마다
 * `key`를 바꿔 리마운트할 것** — 안 그러면 빠르게 두 번 누른 탭이 다음 문제의 답으로 들어간다.
 * 한 번 고르면 이 컴포넌트는 더 받지 않는다.
 */
function ChoiceQuestion({
  choices,
  onAnswer,
  choiceFont = "font-mixed",
}: {
  choices: string[];
  /** 고른 보기의 인덱스. "모르겠어요"는 null */
  onAnswer: (choice: number | null) => void;
  /** 보기 글꼴 — 일본어 보기는 `font-ja`, 한국어 뜻은 `font-mixed` */
  choiceFont?: string;
}) {
  const [answered, setAnswered] = useState(false);

  function answer(choice: number | null) {
    if (answered) return;
    setAnswered(true);
    onAnswer(choice);
  }

  return (
    <div className="flex flex-col gap-2">
      {choices.map((choice, i) => (
        <button
          key={`${i}-${choice}`}
          onClick={() => answer(i)}
          disabled={answered}
          className={`min-h-14 rounded-2xl border-2 border-gray-100 bg-white px-4 py-3 text-left text-lg text-gray-700 transition-colors hover:border-primary/40 active:bg-primary/10 ${choiceFont}`}
        >
          {choice}
        </button>
      ))}
      <button
        onClick={() => answer(null)}
        disabled={answered}
        className="mt-1 self-center rounded-full px-4 py-2 text-sm text-gray-400 underline underline-offset-4"
      >
        🤔 모르겠어요
      </button>
    </div>
  );
}

export default ChoiceQuestion;
