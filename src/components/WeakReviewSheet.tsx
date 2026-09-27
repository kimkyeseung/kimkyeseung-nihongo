import { useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { dictionary } from "../lib/dictionary";
import { getKanjiEntry } from "../lib/kanji";
import { buildKanjiQuiz } from "../lib/kanjiQuiz";
import { XP_REWARDS } from "../lib/xpRewards";
import type { ReviewTargets } from "../lib/weakReview";
import {
  buildWordMeaningQuestion,
  interleaveReviewQuestions,
  resolveReviewWord,
  type ReviewQuestion,
  type WordMeaningQuestion,
} from "../lib/weakReviewQuiz";
import { useConfettiStore } from "../stores/confettiStore";
import { useGamificationStore } from "../stores/gamificationStore";
import { recordStudyEvent } from "../stores/learnerMemoryStore";
import type { KanjiEntry } from "../types/kanji";

const PRIMARY_SHADOW = { ["--btn-shadow" as string]: "#3d9401" };

function buildQuestions(targets: ReviewTargets): ReviewQuestion[] {
  const kanji = buildKanjiQuiz(
    targets.kanji.map((c) => getKanjiEntry(c)).filter((k): k is KanjiEntry => k !== undefined)
  );
  const words = targets.words
    .map((t) => resolveReviewWord(t, dictionary))
    .map((w) => (w ? buildWordMeaningQuestion(w, dictionary) : null))
    .filter((q): q is WordMeaningQuestion => q !== null);
  return interleaveReviewQuestions(kanji, words);
}

/**
 * "약한 것 모아 풀기"(단어장 페이지에서 lazy로 연다 — 한자 데이터를 이때만 받는다).
 *
 * 문제는 **연 순간의 약한 목록 스냅샷**으로 만든다. 푸는 동안 기록이 쌓이며 프로필의 목록이
 * 바뀌는데(맞힌 건 빠진다), 그걸 따라가면 풀던 문제가 사라진다.
 *
 * 결과는 기존 이벤트로 남긴다 — 한자는 `kanji-quiz-correct/wrong`, 단어는
 * `word-review-known/unknown`. 새 이벤트 타입을 들이지 않았으니 학습자 프로필(취약/강한 한자,
 * 약한 어휘)과 이 목록 자체가 그대로 갱신된다: 맞힌 것은 다음부터 목록에서 빠진다.
 */
function WeakReviewSheet({ targets, onClose }: { targets: ReviewTargets; onClose: () => void }) {
  const [questions] = useState(() => buildQuestions(targets));
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [missed, setMissed] = useState<ReviewQuestion[]>([]);
  const celebrate = useConfettiStore((s) => s.celebrate);
  const recordProgress = useGamificationStore((s) => s.recordProgress);

  const done = index >= questions.length;
  const current = questions[index];
  const answerIndex = current ? current.question.answerIndex : -1;

  function handleSelect(choiceIndex: number) {
    if (selected !== null || !current) return;
    setSelected(choiceIndex);
    const correct = choiceIndex === answerIndex;
    if (current.kind === "kanji") {
      const { kanji, choices } = current.question;
      recordStudyEvent({
        type: correct ? "kanji-quiz-correct" : "kanji-quiz-wrong",
        subject: kanji.kanji,
        detail: choices[answerIndex],
        level: kanji.jlptLevel,
      });
    } else {
      const { word } = current.question;
      recordStudyEvent({
        type: correct ? "word-review-known" : "word-review-unknown",
        subject: word.word,
        level: word.jlptLevel,
      });
    }
    if (correct) celebrate();
    else setMissed((m) => [...m, current]);
  }

  function handleNext() {
    // 완주에 한 번(한자 퀴즈와 같은 규칙). 시트를 닫았다 다시 열면 목록이 줄어 있으니
    // 같은 문제로 반복해 긁어가기도 어렵다.
    if (index + 1 >= questions.length) recordProgress(XP_REWARDS.weakReviewCompleted);
    setSelected(null);
    setIndex((i) => i + 1);
  }

  const score = questions.length - missed.length;

  return createPortal(
    // body로 포털한다 — AnimatedOutlet의 transform 때문에 `fixed`가 뷰포트 기준이 아니게 된다
    // (ActionMenu·연습해보기 시트와 같은 이유).
    <motion.div
      className="fixed inset-0 z-30 flex items-end justify-center bg-black/30 sm:items-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      onClick={onClose}
    >
      <motion.div
        role="dialog"
        aria-label="약한 것 모아 풀기"
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-6 sm:rounded-3xl"
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <h3 className="text-lg font-bold text-primary">🔁 약한 것 모아 풀기</h3>
          <button onClick={onClose} className="text-2xl leading-none text-gray-400" aria-label="닫기">
            ×
          </button>
        </div>

        {questions.length === 0 ? (
          <p className="mt-6 text-center text-sm text-gray-500">
            지금은 다시 풀 한자·단어가 없어요. 퀴즈에서 틀리거나 복습에서 "모르겠어요"를 하면 여기에 모여요.
          </p>
        ) : done ? (
          <div className="mt-6">
            <div className="flex flex-col items-center gap-1 text-center">
              <span className="text-4xl">{missed.length === 0 ? "🎉" : "💪"}</span>
              <p className="text-xl font-bold text-primary">
                {score} / {questions.length} 정답!
              </p>
              <p className="text-sm text-gray-400">
                {missed.length === 0 ? "이번에 맞힌 건 약한 목록에서 빠져요." : "틀린 건 다음에 또 나와요."}
              </p>
            </div>
            {missed.length > 0 && (
              <ul className="mt-4 flex flex-col gap-2">
                {missed.map((q) => (
                  <MissedRow key={q.kind === "kanji" ? `k:${q.question.kanji.kanji}` : `w:${q.question.word.id}`} q={q} />
                ))}
              </ul>
            )}
            <button
              onClick={onClose}
              className="btn-press mt-5 w-full rounded-2xl bg-primary py-3 font-bold text-white"
              style={PRIMARY_SHADOW}
            >
              완료
            </button>
          </div>
        ) : (
          <div className="mt-6">
            <p className="text-sm text-gray-400">
              {index + 1} / {questions.length}
            </p>
            <div className="mt-2 flex flex-col items-center">
              <span className="font-ja text-5xl">
                {current.kind === "kanji" ? current.question.kanji.kanji : current.question.word.word}
              </span>
              {/* 단어는 뜻을 묻는 문제라, 답을 고른 뒤에만 읽기를 보여준다(카드 앞면과 같은 이유). */}
              {current.kind === "word" &&
                selected !== null &&
                current.question.word.reading !== current.question.word.word && (
                  <span className="mt-1 font-ja text-gray-400">{current.question.word.reading}</span>
                )}
            </div>
            <p className="mt-2 text-center text-sm text-gray-400">
              {current.kind === "kanji" ? "이 한자의 읽기는?" : "이 단어의 뜻은?"}
            </p>

            <div className="mt-4 flex flex-col gap-2">
              {current.question.choices.map((choice, choiceIndex) => {
                const revealed = selected !== null;
                const isAnswer = choiceIndex === answerIndex;
                const isWrongSelection = revealed && choiceIndex === selected && !isAnswer;
                let style = "border-gray-100 bg-white text-gray-700";
                if (revealed && isAnswer) style = "border-primary bg-primary/10 text-primary";
                else if (isWrongSelection) style = "border-danger bg-danger/10 text-danger";
                return (
                  <button
                    key={choice}
                    onClick={() => handleSelect(choiceIndex)}
                    disabled={revealed}
                    className={`rounded-2xl border-2 px-4 py-3 text-left transition-colors ${
                      current.kind === "kanji" ? "font-ja text-lg" : "font-mixed line-clamp-2"
                    } ${style} ${isWrongSelection ? "animate-shake" : ""}`}
                  >
                    {choice}
                  </button>
                );
              })}
            </div>

            {selected !== null && (
              <button
                onClick={handleNext}
                className="btn-press mt-5 w-full rounded-2xl bg-primary py-3 font-bold text-white"
                style={PRIMARY_SHADOW}
              >
                {index + 1 >= questions.length ? "결과 보기" : "다음 문제"}
              </button>
            )}
          </div>
        )}
      </motion.div>
    </motion.div>,
    document.body
  );
}

function MissedRow({ q }: { q: ReviewQuestion }) {
  const answer = q.question.choices[q.question.answerIndex];
  return (
    <li className="rounded-2xl border-2 border-gray-100 px-4 py-2 text-sm">
      {q.kind === "kanji" ? (
        <p className="font-ja text-gray-700">
          {q.question.kanji.kanji} <span className="text-primary">→ {answer}</span>
        </p>
      ) : (
        <p className="font-mixed text-gray-700">
          <span className="font-ja">{q.question.word.word}</span>
          {q.question.word.reading !== q.question.word.word && (
            <span className="ml-1 font-ja text-xs text-gray-400">{q.question.word.reading}</span>
          )}
          <span className="text-primary"> → {answer}</span>
        </p>
      )}
    </li>
  );
}

export default WeakReviewSheet;
