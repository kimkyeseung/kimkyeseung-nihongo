import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import ChoiceQuestion from "./ChoiceQuestion";
import LoadingMascot from "./LoadingMascot";
import QuestionPrompt from "./QuestionPrompt";
import { choiceFont } from "../lib/levelTest/questions";
import { useScrollLock } from "../hooks/useScrollLock";
import { findLevel, findUnit, loadCurriculum } from "../lib/curriculum";
import { loadLevelTestData } from "../lib/levelTest/loadData";
import type { LevelTestData } from "../lib/levelTest/run";
import {
  UNIT_CHECK_MIN,
  buildUnitCheck,
  gradeUnitCheck,
  hasAlternateGrammar,
  reshuffleUnitCheck,
  type UnitCheckQuestion,
  type UnitCheckTarget,
} from "../lib/unitCheck";
import { XP_REWARDS } from "../lib/xpRewards";
import { useConfettiStore } from "../stores/confettiStore";
import { useCurriculumStore } from "../stores/curriculumStore";
import { useGamificationStore } from "../stores/gamificationStore";
import { recordStudyEvent } from "../stores/learnerMemoryStore";
import { useTeacherChatStore } from "../stores/teacherChatStore";
import type { CurriculumUnit } from "../types/curriculum";

const PRIMARY_SHADOW = { ["--btn-shadow" as string]: "#3d9401" };

/** 문제마다 바로 보여주는 한 줄 해설(점검은 공부의 일부라 진단과 달리 바로 알려준다). */
function Explanation({ q }: { q: UnitCheckQuestion }) {
  const answer = q.choices[q.answerIndex];
  switch (q.kind) {
    case "grammar":
      return (
        <>
          <p className="font-ja text-gray-800">{q.item.sentence.replace("＿＿", answer)}</p>
          <p className="text-gray-500">{q.item.translation}</p>
          {q.item.note && <p className="mt-1 font-mixed text-xs text-gray-400">💡 {q.item.note}</p>}
        </>
      );
    case "kanji":
      return (
        <p className="font-mixed text-gray-700">
          <span className="font-ja">{q.word.word}</span> <span className="font-ja text-gray-400">{q.word.reading}</span> —{" "}
          <span className="font-ja">{q.kanji}</span> → <span className="font-ja">{answer}</span>
        </p>
      );
    case "vocab":
      return (
        <p className="font-mixed text-gray-700">
          <span className="font-ja">{q.word.word}</span>
          {q.word.reading !== q.word.word && <span className="ml-1 font-ja text-gray-400">{q.word.reading}</span>} — {answer}
        </p>
      );
    case "kana":
      return (
        <p className="text-gray-700">
          <span className="font-ja">{q.char}</span> = {answer}
        </p>
      );
    case "item":
      return (
        <p className="font-mixed text-gray-700">
          <span className="font-ja">{q.text}</span> = {answer}
        </p>
      );
    default:
      return null;
  }
}

type Loaded = { data: LevelTestData; unit: CurriculumUnit; preN5Units: CurriculumUnit[] };

/**
 * 선생님 `/test` — 단원 점검(`unitCheck.ts`). 바텀시트(body로 포털 — AnimatedOutlet의 transform 때문에).
 * **LLM 없이** 은행·사전에서 낸다. 문제마다 ⭕/❌와 한 줄 해설을 바로 보여주고, 통과하면 단원 완료를
 * **묻는다**(자동으로 넣지 않는다 — 되돌아갈 길). 틀린 문형은 선생님에게 대신 물어봐 준다.
 *
 * 한자 읽기 결과는 기존 이벤트(`kanji-quiz-*`)로 남긴다 — 단원 범위 안의 한자라 "약한 한자"로 잡히는 게
 * 맞다(실력 위 급수를 일부러 묻는 레벨 진단과 다르다). 문법 결과는 이벤트 타입이 없어 남기지 않는다.
 */
function UnitCheckSheet({ target, onClose }: { target: UnitCheckTarget; onClose: () => void }) {
  useScrollLock(true);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState(false);
  const [questions, setQuestions] = useState<UnitCheckQuestion[] | null>(null);
  const [answers, setAnswers] = useState<(number | null)[]>([]);
  /** 지금 문제에 답했나(해설과 "다음" 버튼이 뜬다) */
  const [revealed, setRevealed] = useState(false);
  const [round, setRound] = useState(0);
  const xpClaimedRef = useRef(false);
  const manualUnits = useCurriculumStore((s) => s.manualUnits);
  const toggleManualUnit = useCurriculumStore((s) => s.toggleManualUnit);
  const recordProgress = useGamificationStore((s) => s.recordProgress);
  const celebrate = useConfettiStore((s) => s.celebrate);
  const requestQuestion = useTeacherChatStore((s) => s.requestQuestion);

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadLevelTestData(), loadCurriculum()])
      .then(([data, curriculum]) => {
        if (cancelled) return;
        const unit = findUnit(curriculum, target.level, target.unitNumber);
        if (!unit) {
          setFailed(true);
          return;
        }
        const preN5Units = findLevel(curriculum, "Pre-N5")?.units ?? [];
        setLoaded({ data, unit, preN5Units });
        setQuestions(buildUnitCheck({ level: target.level, unit, preN5Units }, data));
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [target.level, target.unitNumber]);

  const index = answers.length - (revealed ? 1 : 0);
  const done = !!questions && answers.length === questions.length && !revealed;
  const result = done && questions ? gradeUnitCheck(questions, answers) : null;

  // 첫 완주에 한 번만 XP — "같은 문제 다시"·"새 문제 받기"로는 더 쌓이지 않는다.
  useEffect(() => {
    if (!result || xpClaimedRef.current) return;
    xpClaimedRef.current = true;
    recordProgress(XP_REWARDS.unitCheckCompleted);
    if (result.passed) celebrate();
  }, [result, recordProgress, celebrate]);

  function handleAnswer(choice: number | null) {
    if (!questions) return;
    const q = questions[answers.length];
    setAnswers((a) => [...a, choice]);
    setRevealed(true);
    if (q.kind === "kanji") {
      recordStudyEvent({
        type: choice === q.answerIndex ? "kanji-quiz-correct" : "kanji-quiz-wrong",
        subject: q.kanji,
        detail: q.choices[q.answerIndex],
        level: q.level ?? undefined,
      });
    }
  }

  function restart(next: UnitCheckQuestion[]) {
    setQuestions(next);
    setAnswers([]);
    setRevealed(false);
    setRound((r) => r + 1);
  }

  function askTeacher(pattern: string) {
    // 질문 문장은 코드가 만든다 — 문형 이름은 커리큘럼 데이터다. 이미 선생님 페이지라 그 자리에서 꺼내 묻는다.
    requestQuestion(`「${pattern}」 문형을 예문과 함께 다시 설명해 주세요.`);
    onClose();
  }

  const current = questions && !done ? questions[index] : null;
  const alreadyComplete = manualUnits.includes(target.key);

  let body: React.ReactNode;
  if (failed) {
    body = <p className="mt-6 text-center text-sm text-danger">점검 문제를 불러오지 못했어요. 인터넷 연결을 확인해 주세요.</p>;
  } else if (!questions || !loaded) {
    body = (
      <div className="mt-6">
        <LoadingMascot label="점검 문제를 준비하는 중" />
      </div>
    );
  } else if (questions.length < UNIT_CHECK_MIN) {
    body = <p className="mt-6 text-center text-sm text-gray-500">이 단원은 아직 점검 문제가 준비되지 않았어요.</p>;
  } else if (result) {
    body = (
      <div className="mt-5 flex flex-col gap-4">
        <div className="flex flex-col items-center gap-1 text-center">
          <span className="text-4xl">{result.passed ? "🎉" : "💪"}</span>
          <p className="text-xl font-bold text-primary">
            {result.correct} / {result.total} 정답
          </p>
          <p className="text-sm text-gray-500">
            {result.passed
              ? "이 단원은 잘 익혔어요!"
              : result.wrongPatterns.length > 0
                ? "문법을 조금만 더 다지면 통과예요."
                : "80% 이상 맞히면 통과예요. 조금만 더!"}
          </p>
        </div>

        {result.passed &&
          (alreadyComplete ? (
            <p className="rounded-2xl bg-primary/10 px-4 py-3 text-center text-sm text-primary">✅ 이 단원은 완료로 표시돼 있어요</p>
          ) : (
            <button onClick={() => toggleManualUnit(target.key)} className="btn-press w-full rounded-2xl bg-primary py-3 font-bold text-white" style={PRIMARY_SHADOW}>
              이 단원을 완료로 표시할까요?
            </button>
          ))}

        {result.wrongPatterns.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-gray-500">틀린 문형 — 선생님에게 다시 물어볼까요?</p>
            {result.wrongPatterns.map((pattern) => (
              <button
                key={pattern}
                onClick={() => askTeacher(pattern)}
                className="rounded-2xl border-2 border-gray-100 bg-white px-4 py-2.5 text-left text-gray-700"
              >
                🧑‍🏫 <span className="font-mixed">「{pattern}」</span> 물어보기
              </button>
            ))}
          </div>
        )}

        {target.isLast && (
          <Link to="/level" onClick={onClose} className="text-center text-sm text-info underline underline-offset-2">
            🎓 커리큘럼을 다 끝냈어요 — 레벨 진단을 다시 받아볼까요?
          </Link>
        )}

        <div className="flex gap-2">
          <button onClick={() => restart(reshuffleUnitCheck(questions))} className="flex-1 rounded-2xl border-2 border-gray-100 bg-white py-2.5 text-gray-600">
            같은 문제 다시
          </button>
          {hasAlternateGrammar(loaded.unit, loaded.data.bank.grammar) && (
            <button
              onClick={() =>
                restart(
                  buildUnitCheck(
                    { level: target.level, unit: loaded.unit, preN5Units: loaded.preN5Units },
                    loaded.data,
                    Math.random,
                    new Set(questions.filter((q) => q.kind === "grammar").flatMap((q) => q.keys)),
                  ),
                )
              }
              className="flex-1 rounded-2xl border-2 border-gray-100 bg-white py-2.5 text-gray-600"
            >
              새 문제 받기
            </button>
          )}
        </div>
      </div>
    );
  } else if (current) {
    const correct = answers[index] !== null && answers[index] === current.answerIndex;
    body = (
      <div className="mt-4 flex flex-col gap-4">
        <p className="text-sm text-gray-400">
          {index + 1} / {questions.length}
        </p>
        <QuestionPrompt q={current} />
        <ChoiceQuestion
          key={`${round}-${index}`}
          choices={current.choices}
          choiceFont={choiceFont(current)}
          revealAnswer={current.answerIndex}
          onAnswer={handleAnswer}
        />
        {revealed && (
          <div className="flex flex-col gap-3">
            <div className={`rounded-2xl px-4 py-3 text-sm ${correct ? "bg-primary/10" : "bg-danger/10"}`}>
              <p className={`font-bold ${correct ? "text-primary" : "text-danger"}`}>{correct ? "⭕ 맞았어요" : "❌ 아쉬워요"}</p>
              <div className="mt-1">
                <Explanation q={current} />
              </div>
            </div>
            <button onClick={() => setRevealed(false)} className="btn-press w-full rounded-2xl bg-primary py-3 font-bold text-white" style={PRIMARY_SHADOW}>
              {index + 1 >= questions.length ? "결과 보기" : "다음 문제"}
            </button>
          </div>
        )}
      </div>
    );
  }

  return createPortal(
    <motion.div
      data-modal
      className="fixed inset-0 z-30 flex items-end justify-center bg-black/30 sm:items-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      onClick={onClose}
    >
      <motion.div
        role="dialog"
        aria-label="단원 점검"
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-6 sm:rounded-3xl"
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-primary">📝 단원 점검</h3>
            <p className="truncate text-sm text-gray-400">
              {target.level} · {target.unitNumber}단원 {target.title}
            </p>
          </div>
          <button onClick={onClose} className="text-2xl leading-none text-gray-400" aria-label="닫기">
            ×
          </button>
        </div>
        {body}
      </motion.div>
    </motion.div>,
    document.body,
  );
}

export default UnitCheckSheet;
