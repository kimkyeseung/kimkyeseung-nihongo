import { useState } from "react";
import { Link } from "react-router-dom";
import ProgressBar from "../components/ProgressBar";
import { useCurriculumPlan } from "../hooks/useCurriculumPlan";
import { levelLabel } from "../lib/curriculum";
import type { UnitProgress } from "../lib/curriculumProgress";
import { useCurriculumStore } from "../stores/curriculumStore";
import { CURRICULUM_LEVELS, type CurriculumLevel, type CurriculumLevelId } from "../types/curriculum";

/** 유닛 한 줄. 펼치면 학습 목표와 문법 포인트, "이미 아는 내용이에요" 버튼이 나온다. */
function UnitRow({
  progress,
  level,
  isCurrent,
}: {
  progress: UnitProgress;
  level: CurriculumLevel;
  isCurrent: boolean;
}) {
  const [open, setOpen] = useState(false);
  const toggleManual = useCurriculumStore((s) => s.toggleManualUnit);
  const unit = level.units.find((u) => u.unitNumber === progress.unitNumber);

  return (
    <li
      className={`rounded-2xl border-2 ${
        isCurrent ? "border-primary bg-primary/5" : "border-gray-100 bg-white"
      }`}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 p-3 text-left"
      >
        <span className="w-6 shrink-0 text-center text-lg">
          {progress.complete ? (progress.manual ? "⏭️" : "✅") : isCurrent ? "📍" : "⬜"}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-gray-800">
            {progress.unitNumber}. {progress.title}
          </span>
          <span className="mt-0.5 block text-xs text-gray-400">
            {progress.manual
              ? "이미 아는 내용으로 표시함"
              : `${Math.round(progress.ratio * 100)}% 완료`}
          </span>
        </span>
        <span aria-hidden className="shrink-0 text-gray-300">
          {open ? "▴" : "▾"}
        </span>
      </button>

      {open && (
        <div className="border-t border-gray-100 p-3 pt-2.5">
          {progress.canDoGoals.length > 0 && (
            <>
              <p className="text-xs text-gray-400">이 단원을 끝내면</p>
              <ul className="mt-1 flex flex-col gap-0.5">
                {progress.canDoGoals.map((goal) => (
                  <li key={goal} className="font-mixed text-sm text-gray-600">
                    · {goal}
                  </li>
                ))}
              </ul>
            </>
          )}

          <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {progress.kanaTodo.length + progress.kanaDone.length > 0 && (
              <div className="flex gap-1.5">
                <dt className="text-gray-400">가나</dt>
                <dd className="font-mixed text-gray-700">
                  {progress.kanaDone.length}/{progress.kanaDone.length + progress.kanaTodo.length}
                </dd>
              </div>
            )}
            {progress.kanjiTodo.length + progress.kanjiDone.length > 0 && (
              <div className="flex gap-1.5">
                <dt className="text-gray-400">한자</dt>
                <dd className="font-mixed text-gray-700">
                  {progress.kanjiDone.length}/{progress.kanjiDone.length + progress.kanjiTodo.length}
                  {progress.kanjiTodo.length > 0 && (
                    <span className="text-gray-400"> · 남은 {progress.kanjiTodo.join(" ")}</span>
                  )}
                </dd>
              </div>
            )}
            {progress.wordsTarget > 0 && (
              <div className="flex gap-1.5">
                <dt className="text-gray-400">단어</dt>
                <dd className="text-gray-700">
                  {progress.wordsDone}/{progress.wordsTarget}
                </dd>
              </div>
            )}
          </dl>

          {unit && unit.grammarPoints.length > 0 && (
            <ul className="mt-3 flex flex-col gap-1.5">
              {unit.grammarPoints.map((g) => (
                <li key={g.pattern} className="rounded-xl bg-gray-50 px-3 py-2">
                  <p className="font-mixed text-sm text-gray-800">
                    <span className="font-ja">{g.pattern}</span>
                    <span className="text-gray-400"> — {g.meaning}</span>
                  </p>
                  <p className="mt-0.5 font-ja text-sm text-gray-600">{g.example}</p>
                  <p className="text-xs text-gray-400">{g.exampleTranslation}</p>
                </li>
              ))}
            </ul>
          )}

          <button
            onClick={() => toggleManual(progress.key)}
            className="mt-3 rounded-2xl border-2 border-gray-100 px-3 py-1.5 text-sm text-gray-500"
          >
            {progress.manual ? "다시 학습 대상으로" : "이미 아는 내용이에요"}
          </button>
        </div>
      )}
    </li>
  );
}

/**
 * 전체 로드맵. 하단 네비게이션 밖이다 — 스펙에 없는 페이지는 헤더 아이콘으로만 노출하는
 * 프로젝트 규칙(/about·/memory와 같은 취급)이고, 네비는 375px에서 이미 7칸으로 빠듯하다.
 */
function CurriculumPage() {
  const result = useCurriculumPlan();
  const startLevel = useCurriculumStore((s) => s.startLevel);
  const setStartLevel = useCurriculumStore((s) => s.setStartLevel);

  if (!startLevel) {
    return (
      <div className="p-4 sm:p-6">
        <Link to="/" className="text-info">
          ← 대문으로
        </Link>
        <p className="mt-6 text-gray-500">
          대문에서 시작 단계를 먼저 골라주세요. 그래야 오늘 할 공부를 정해드릴 수 있어요.
        </p>
      </div>
    );
  }

  if (!result) return <p className="p-6 text-gray-400">커리큘럼을 불러오는 중...</p>;

  const { curriculum, plan } = result;
  const currentKey = plan.current?.key;
  const byLevel = new Map<CurriculumLevelId, UnitProgress[]>();
  for (const unit of plan.units) {
    const list = byLevel.get(unit.level) ?? [];
    list.push(unit);
    byLevel.set(unit.level, list);
  }

  return (
    <div className="p-4 pb-10 sm:p-6">
      <Link to="/" className="text-info">
        ← 대문으로
      </Link>

      <div className="mt-4 flex items-center gap-3">
        <span className="text-4xl">🗺️</span>
        <div className="min-w-0 flex-1">
          <h2 className="text-xl text-primary">학습 로드맵</h2>
          <p className="text-sm text-gray-400">
            전체 {plan.completedCount}/{plan.totalCount}단원 완료
          </p>
        </div>
        <Link to="/memory" aria-label="선생님의 기억" title="선생님의 기억" className="shrink-0 text-2xl">
          🧠
        </Link>
      </div>

      <div className="mt-3">
        <ProgressBar
          percent={plan.totalCount === 0 ? 0 : (plan.completedCount / plan.totalCount) * 100}
          label="전체 진도"
          active={false}
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="text-xs text-gray-400">시작 단계</span>
        {CURRICULUM_LEVELS.map((levelId) => (
          <button
            key={levelId}
            onClick={() => setStartLevel(levelId)}
            className={`rounded-full border-2 px-3 py-1 text-sm ${
              startLevel === levelId
                ? "border-primary bg-primary/10 text-primary"
                : "border-gray-100 text-gray-500"
            }`}
          >
            {levelId}
          </button>
        ))}
      </div>
      <p className="mt-1 text-xs text-gray-400">
        시작 단계보다 쉬운 단원은 로드맵에서 빠져요. 바꿔도 이미 표시한 진도는 그대로예요.
      </p>

      {CURRICULUM_LEVELS.filter((l) => byLevel.has(l)).map((levelId) => {
        const level = curriculum.levels.find((l) => l.level === levelId);
        const units = byLevel.get(levelId) ?? [];
        if (!level) return null;
        return (
          <section key={levelId} className="mt-6">
            <h3 className="text-lg text-gray-700">{levelLabel(level)}</h3>
            <p className="mt-0.5 text-sm text-gray-500">{level.summary}</p>
            <p className="mt-1 text-xs text-gray-400">
              목표 단어 {level.vocabTarget.toLocaleString()}개
              {level.kanjiTarget > 0 && ` · 한자 ${level.kanjiTarget.toLocaleString()}자`}
            </p>
            <ul className="mt-2 flex flex-col gap-2">
              {units.map((unit) => (
                <UnitRow
                  key={unit.key}
                  progress={unit}
                  level={level}
                  isCurrent={unit.key === currentKey}
                />
              ))}
            </ul>
          </section>
        );
      })}

      <p className="mt-8 text-xs text-gray-400">
        단어/한자 목표치는 JLPT가 공식 발표하는 수치가 아니라 여러 학습 사이트에서 통용되는
        추정치예요. 문법 포인트도 각 급수의 핵심만 추린 것이라 실제 시험 범위는 더 넓어요.
      </p>
    </div>
  );
}

export default CurriculumPage;
