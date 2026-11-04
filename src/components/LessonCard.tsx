import { motion } from "framer-motion";
import { Link, useNavigate } from "react-router-dom";
import ProgressBar from "./ProgressBar";
import type { CurriculumPlanResult } from "../hooks/useCurriculumPlan";
import { levelLabel } from "../lib/curriculum";
import { buildLessonSteps, nextLessonStep, type LessonStep } from "../lib/lessonPlan";
import { useCurriculumStore } from "../stores/curriculumStore";
import { useGamificationStore } from "../stores/gamificationStore";

const PRIMARY_SHADOW = { ["--btn-shadow" as string]: "#3d9401" };

/**
 * 선생님이 먼저 내놓는 "오늘의 수업". 예전엔 학습자가 먼저 물어야 수업이 시작돼서, 진도를 계산해 두고도 빈 화면에
 * 예시 질문만 보여줬다(보고받았다). 인사도 모델이 아니라 앱이 한다 — "인사는 앱이 한다" 규칙 그대로다.
 *
 * - `full`: 대화가 없을 때 — 단원·목표·단계 목록. 수업 내용 미리보기를 겸한다.
 * - `next`: 답변이 끝난 뒤 대화 끝에 붙는 한 줄 — 다음 단계로 바로 잇는다. 기록에는 남지 않는다.
 */
function LessonCard({
  plan,
  variant,
  onAsk,
  onCheck,
}: {
  plan: CurriculumPlanResult;
  variant: "full" | "next";
  onAsk: (question: string) => void;
  onCheck: () => void;
}) {
  const navigate = useNavigate();
  const taught = useCurriculumStore((s) => s.taughtGrammar);
  const streak = useGamificationStore((s) => s.streak);

  const current = plan.plan.current;
  const unit = plan.currentUnit;
  if (!current || !unit) return null;

  const steps = buildLessonSteps(current, unit, taught);
  const next = nextLessonStep(steps);
  const level = plan.curriculum.levels.find((l) => l.level === current.level);
  const doneCount = steps.filter((s) => s.done).length;

  function start(step: LessonStep) {
    switch (step.action.kind) {
      case "ask":
        // 배웠다는 표시는 답변이 끝난 뒤에 TeacherPage가 한다(taughtStepFromExchange).
        onAsk(step.action.question);
        return;
      case "go":
        navigate(step.action.to);
        return;
      case "check":
        onCheck();
        return;
    }
  }

  if (variant === "next") {
    if (!next) return null;
    return (
      <div className="mt-3 w-full max-w-3xl rounded-2xl bg-primary/5 p-3">
        <p className="text-xs text-gray-500">
          📍 {current.unitNumber}단원 수업 · {doneCount}/{steps.length}
        </p>
        <button
          onClick={() => start(next)}
          className="btn-press mt-2 flex w-full items-center gap-2 rounded-2xl bg-primary px-4 py-2.5 text-left font-mixed font-bold text-white"
          style={PRIMARY_SHADOW}
        >
          <span aria-hidden>▶</span>
          <span className="min-w-0 flex-1">다음: {next.title}</span>
        </button>
      </div>
    );
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto w-full max-w-3xl rounded-3xl border-2 border-primary/20 bg-white p-4"
    >
      <p className="text-sm text-gray-500">
        🧑‍🏫 {streak >= 2 ? `🔥 ${streak}일 연속이네요! ` : ""}오늘 수업을 준비했어요.
      </p>
      <h3 className="mt-1 text-lg text-primary">
        {level ? levelLabel(level) : current.level} · {current.unitNumber}단원 {current.title}
      </h3>
      {current.canDoGoals[0] && (
        <p className="mt-1 font-mixed text-sm text-gray-600">이번 단원 목표: {current.canDoGoals[0]}</p>
      )}
      <div className="mt-3">
        <ProgressBar percent={(doneCount / steps.length) * 100} label="이번 단원 수업 진행" active={false} />
      </div>

      {next && (
        <button
          onClick={() => start(next)}
          className="btn-press mt-3 w-full rounded-2xl bg-primary px-4 py-3 font-mixed font-bold text-white"
          style={PRIMARY_SHADOW}
        >
          ▶ {doneCount === 0 ? "수업 시작" : "이어서"}: {next.title}
        </button>
      )}

      <ol className="mt-3 flex flex-col gap-1.5">
        {steps.map((step) => (
          <li key={step.key}>
            <button
              onClick={() => start(step)}
              className={`flex w-full items-start gap-2.5 rounded-xl px-3 py-2 text-left ${
                step === next ? "bg-primary/10" : "bg-gray-50"
              }`}
            >
              <span aria-hidden className="w-6 shrink-0 text-center font-ja">
                {step.done ? "✅" : step.emoji}
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block font-mixed text-sm ${step.done ? "text-gray-400" : "text-gray-800"}`}>
                  {step.title}
                </span>
                <span className="block font-mixed text-xs text-gray-400">{step.detail}</span>
              </span>
            </button>
          </li>
        ))}
      </ol>

      <Link to="/curriculum" className="mt-3 block text-center text-xs text-info hover:underline">
        전체 로드맵 보기
      </Link>
    </motion.section>
  );
}

export default LessonCard;
