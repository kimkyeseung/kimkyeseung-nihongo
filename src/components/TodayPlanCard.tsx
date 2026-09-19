import { motion } from "framer-motion";
import { Link, useNavigate } from "react-router-dom";
import ProgressBar from "./ProgressBar";
import { useCurriculumPlan } from "../hooks/useCurriculumPlan";
import { buildDailyPlan, type PlanAction } from "../lib/dailyPlan";
import { useCurriculumStore } from "../stores/curriculumStore";
import { useLearnerMemoryStore } from "../stores/learnerMemoryStore";
import { useTeacherChatStore } from "../stores/teacherChatStore";
import type { CurriculumLevelId } from "../types/curriculum";

/** 시작 단계를 고르는 칩. 급수 이름만으로는 어느 쪽인지 감이 안 와서 한 줄씩 붙였다. */
const LEVEL_CHOICES: { level: CurriculumLevelId; label: string; hint: string }[] = [
  { level: "Pre-N5", label: "🌱 처음이에요", hint: "히라가나부터" },
  { level: "N5", label: "N5", hint: "가나는 읽어요" },
  { level: "N4", label: "N4", hint: "기초 문법은 알아요" },
  { level: "N3", label: "N3", hint: "일상 대화가 돼요" },
  { level: "N2", label: "N2", hint: "신문을 읽어요" },
  { level: "N1", label: "N1", hint: "거의 자유로워요" },
];

/**
 * 시작 단계를 아직 안 골랐을 때 대신 뜨는 카드.
 *
 * 왜 묻는가: 진도를 학습 기록만으로 추정하면 근거가 쌓이기 전까지는 아무도 Pre-N5에서
 * 시작하게 된다 — 이미 N3인 사람이 앱을 켜자마자 히라가나부터 하라는 화면을 보는 셈이다.
 * 한 번 물어보는 쪽이 정확하고, 나중에 /curriculum에서 언제든 바꿀 수 있다.
 */
function LevelPicker() {
  const setStartLevel = useCurriculumStore((s) => s.setStartLevel);

  return (
    <section className="rounded-2xl border-4 border-white bg-white p-4">
      <h2 className="text-lg text-gray-800">어디부터 시작할까요?</h2>
      <p className="mt-0.5 text-sm text-gray-500">
        고른 단계에 맞춰 오늘 할 공부를 정해드려요. 나중에 언제든 바꿀 수 있어요.
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {LEVEL_CHOICES.map((choice) => (
          <button
            key={choice.level}
            onClick={() => setStartLevel(choice.level)}
            className="btn-press rounded-2xl border-2 border-gray-100 px-3 py-2.5 text-left hover:border-primary/40"
            style={{ ["--btn-shadow" as string]: "rgb(0 0 0 / 0.08)" }}
          >
            <span className="block text-gray-800">{choice.label}</span>
            <span className="mt-0.5 block text-xs text-gray-400">{choice.hint}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function ActionRow({ action }: { action: PlanAction }) {
  const navigate = useNavigate();
  const requestQuestion = useTeacherChatStore((s) => s.requestQuestion);

  function handleClick() {
    // 문법 항목은 선생님에게 대신 물어봐 준다 — 회화 말풍선의 "선생님" 버튼과 같은 경로
    // (teacherChatStore에 넣어두면 TeacherPage가 마운트되면서 꺼내 바로 묻는다).
    if (action.teacherQuestion) requestQuestion(action.teacherQuestion);
    navigate(action.to);
  }

  return (
    <button
      onClick={handleClick}
      className="btn-press flex w-full items-start gap-3 rounded-2xl border-2 border-gray-100 p-3 text-left hover:border-primary/40"
      style={{ ["--btn-shadow" as string]: "rgb(0 0 0 / 0.08)" }}
    >
      <span className="text-xl leading-none font-ja">{action.emoji}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-gray-800">{action.title}</span>
        <span className="mt-0.5 block font-mixed text-sm text-gray-500">{action.detail}</span>
      </span>
      <span aria-hidden className="text-gray-300">
        ›
      </span>
    </button>
  );
}

/**
 * 대문의 "오늘의 학습" 카드. 시작 단계를 아직 안 골랐으면 그것부터 묻는다.
 *
 * 하단 네비게이션에 항목을 더하지 않고 대문에 둔 이유: 네비는 이미 7칸이라 375px에서 한 칸이
 * 40px대까지 좁아져 있다(CLAUDE.md의 레이아웃 주석 참고).
 */
function TodayPlanCard() {
  const startLevel = useCurriculumStore((s) => s.startLevel);
  const result = useCurriculumPlan();
  const profile = useLearnerMemoryStore((s) => s.profile);

  if (!startLevel) return <LevelPicker />;
  // 커리큘럼(동적 import)과 기억(IndexedDB)을 아직 못 읽은 동안. 여기서 "할 일 없음"을
  // 그렸다가 뒤집으면 잘못된 화면이 한 번 번쩍인다.
  if (!result) {
    return (
      <section className="rounded-2xl border-4 border-white bg-white p-4">
        <p className="text-sm text-gray-400">오늘의 학습을 준비하는 중...</p>
      </section>
    );
  }

  const { plan, currentUnit } = result;
  const current = plan.current;
  const actions = buildDailyPlan(current, currentUnit, profile);
  const levelData = result.curriculum.levels.find((l) => l.level === current?.level);

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border-4 border-white bg-white p-4"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-lg text-gray-800">오늘의 학습</h2>
          {current ? (
            <p className="mt-0.5 truncate text-sm text-gray-500">
              {levelData?.uiLabel ?? current.level} · {current.unitNumber}단원 {current.title}
            </p>
          ) : (
            <p className="mt-0.5 text-sm text-gray-500">커리큘럼을 전부 끝냈어요! 🎉</p>
          )}
        </div>
        <Link to="/curriculum" className="shrink-0 pt-1 text-xs text-info hover:underline">
          전체 보기
        </Link>
      </div>

      {current && (
        <div className="mt-3">
          {/* 진행 중 줄무늬는 끈다 — 다운로드처럼 지금 움직이고 있는 값이 아니라 쌓인 진도다. */}
          <ProgressBar percent={current.ratio * 100} label="이번 단원 진도" active={false} />
          <p className="mt-1 text-xs text-gray-400">
            이 단원 {Math.round(current.ratio * 100)}% · 전체 {plan.completedCount}/{plan.totalCount}단원
          </p>
        </div>
      )}

      <div className="mt-3 flex flex-col gap-2">
        {actions.map((action) => (
          <ActionRow key={action.id} action={action} />
        ))}
      </div>
    </motion.section>
  );
}

export default TodayPlanCard;
