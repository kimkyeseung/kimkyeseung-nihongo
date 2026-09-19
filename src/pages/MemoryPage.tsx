import { useState } from "react";
import type { KeyboardEvent } from "react";
import { Link } from "react-router-dom";
import { FACT_KIND_EMOJI, FACT_KIND_LABEL } from "../lib/memoryExtraction";
import { sanitizeMemoryLine } from "../lib/promptSafety";
import type { MemoryFactKind } from "../lib/learnerMemoryDb";
import { useLearnerMemoryStore } from "../stores/learnerMemoryStore";

const FACT_KINDS: MemoryFactKind[] = ["goal", "schedule", "job", "interest"];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h3 className="text-sm font-bold text-gray-500">{title}</h3>
      <div className="mt-2">{children}</div>
    </section>
  );
}

/** 프로필의 목록 한 줄. 비어 있으면 아무것도 그리지 않는다. */
function Facts({ label, items }: { label: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 py-1">
      <span className="text-xs text-gray-400">{label}</span>
      <span className="font-mixed text-sm text-gray-700">{items.join(", ")}</span>
    </div>
  );
}

/**
 * 선생님이 무엇을 기억하고 있는지 보여주고 고치는 화면.
 *
 * 하단 네비게이션에 넣지 않는다 — 스펙에 없는 페이지는 헤더 아이콘으로만 노출하는 프로젝트
 * 규칙(/about과 같은 취급)이고, 하단 네비는 이미 7칸이라 375px에서 더 넣을 자리가 없다.
 *
 * 이 화면이 꼭 있어야 하는 이유: 기억은 사용자 모르게 쌓이고 다음 대화에 계속 영향을 준다.
 * 무엇이 저장됐는지 보고 지울 수 없으면, 잘못된 기억 하나가 왜 선생님이 이상하게 구는지
 * 알 수 없는 채로 남는다.
 */
function MemoryPage() {
  const loaded = useLearnerMemoryStore((s) => s.loaded);
  const facts = useLearnerMemoryStore((s) => s.facts);
  const profile = useLearnerMemoryStore((s) => s.profile);
  const confirmFact = useLearnerMemoryStore((s) => s.confirmFact);
  const rejectFact = useLearnerMemoryStore((s) => s.rejectFact);
  const removeFact = useLearnerMemoryStore((s) => s.removeFact);
  const addManualFact = useLearnerMemoryStore((s) => s.addManualFact);
  const clearAll = useLearnerMemoryStore((s) => s.clearAll);

  const [newKind, setNewKind] = useState<MemoryFactKind>("goal");
  const [newText, setNewText] = useState("");
  const [confirmingClear, setConfirmingClear] = useState(false);

  const confirmed = facts.filter((f) => f.status === "confirmed");
  const pending = facts.filter((f) => f.status === "pending");

  function handleAdd() {
    // 저장 시점에 정화한다 — 시스템 프롬프트로 가는 값이라 직접 적은 것도 예외가 아니다.
    const text = sanitizeMemoryLine(newText);
    if (!text) return;
    void addManualFact(newKind, text);
    setNewText("");
  }

  // 폼의 암묵적 제출 대신 onKeyDown으로 직접 처리한다(프로젝트 표준, CLAUDE.md 참고).
  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleAdd();
    }
  }

  if (!loaded) {
    return <p className="p-6 text-gray-400">기억을 불러오는 중...</p>;
  }

  return (
    <div className="p-4 pb-10 sm:p-6">
      <Link to="/teacher" className="text-info">
        ← 선생님으로
      </Link>

      <div className="mt-4 flex items-center gap-3">
        <span className="text-4xl">🧠</span>
        <div>
          <h2 className="text-xl text-primary">선생님의 기억</h2>
          <p className="text-sm text-gray-400">
            선생님이 이 내용을 참고해서 설명을 맞춰줘요. 전부 이 기기 안에만 저장돼요.
          </p>
        </div>
      </div>

      {/* 로드맵은 헤더 아이콘을 쓰지 않는다(Layout 주석 — 375px에서 아이콘은 둘이 한계).
          "나에 대한 화면"끼리 서로 이어두면 어느 쪽으로 들어와도 두 번이면 닿는다. */}
      <Link
        to="/curriculum"
        className="mt-3 flex items-center gap-2 rounded-2xl border-2 border-gray-100 px-3 py-2 text-sm text-gray-600"
      >
        <span className="text-base">🗺️</span>
        <span className="flex-1">학습 로드맵에서 지금 진도 보기</span>
        <span aria-hidden className="text-gray-300">
          ›
        </span>
      </Link>

      {pending.length > 0 && (
        <Section title="확인해 주세요">
          <div className="flex flex-col gap-2">
            {pending.map((fact) => (
              <div
                key={fact.id}
                className="flex items-center gap-2 rounded-2xl border-2 border-primary/20 bg-primary/5 px-3 py-2"
              >
                <span className="shrink-0 text-base">{FACT_KIND_EMOJI[fact.kind]}</span>
                <span className="min-w-0 flex-1 font-mixed text-sm text-gray-700">{fact.text}</span>
                <button
                  onClick={() => confirmFact(fact.id)}
                  className="btn-press shrink-0 rounded-xl bg-primary px-3 py-1.5 text-xs font-bold text-white"
                  style={{ ["--btn-shadow" as string]: "#3d9401" }}
                >
                  기억하기
                </button>
                <button
                  onClick={() => rejectFact(fact.id)}
                  aria-label="기억하지 않기"
                  className="shrink-0 px-1 text-xl leading-none text-gray-300"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section title="나에 대해">
        {confirmed.length === 0 ? (
          <p className="text-sm text-gray-400">
            아직 기억하는 게 없어요. 선생님과 이야기하다 보면 알아서 쌓이고, 아래에서 직접 적어둘
            수도 있어요.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {confirmed.map((fact) => (
              <div
                key={fact.id}
                className="flex items-center gap-2 rounded-2xl border-2 border-gray-100 px-3 py-2"
              >
                <span className="shrink-0 text-base">{FACT_KIND_EMOJI[fact.kind]}</span>
                <span className="min-w-0 flex-1 font-mixed text-sm text-gray-700">
                  <span className="text-gray-400">{FACT_KIND_LABEL[fact.kind]} · </span>
                  {fact.text}
                </span>
                <button
                  onClick={() => removeFact(fact.id)}
                  aria-label="이 기억 지우기"
                  className="shrink-0 px-1 text-xl leading-none text-gray-300"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="mt-3 flex items-center gap-2">
          <select
            value={newKind}
            onChange={(e) => setNewKind(e.target.value as MemoryFactKind)}
            className="shrink-0 rounded-2xl border-2 border-gray-100 px-2 py-2 text-sm text-gray-600"
          >
            {FACT_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {FACT_KIND_EMOJI[kind]} {FACT_KIND_LABEL[kind]}
              </option>
            ))}
          </select>
          <input
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="예: 12월에 JLPT N3 시험을 본다"
            className="min-w-0 flex-1 rounded-2xl border-2 border-gray-100 px-3 py-2 font-mixed text-sm focus:border-primary/40 focus:outline-none"
          />
          <button
            onClick={handleAdd}
            disabled={!newText.trim()}
            className="btn-press shrink-0 rounded-2xl bg-primary px-3 py-2 text-sm font-bold text-white disabled:bg-gray-200"
            style={{ ["--btn-shadow" as string]: "#3d9401" }}
          >
            추가
          </button>
        </div>
      </Section>

      <Section title="학습 기록에서 본 것">
        <div className="rounded-2xl border-2 border-gray-100 px-3 py-2">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 py-1">
            <span className="text-xs text-gray-400">어휘 수준</span>
            <span className="text-sm text-gray-700">
              {profile.levelGuess ? `JLPT ${profile.levelGuess} 언저리` : "아직 모름"}
            </span>
            <span className="text-xs text-gray-400">— {profile.levelBasis}</span>
          </div>
          <Facts label="자주 틀린 한자" items={profile.weakKanji.map((k) => `${k.kanji}(${k.wrong}번)`)} />
          <Facts label="잘 아는 한자" items={profile.strongKanji} />
          <Facts label="뜻을 찾아본 단어" items={profile.weakWords} />
          <Facts label="작문에서 지적받은 것" items={profile.strugglePoints} />
          <Facts label="최근에 공부한 것" items={profile.recentStudy} />
          {profile.totalEvents === 0 && (
            <p className="py-1 text-sm text-gray-400">
              아직 학습 기록이 없어요. 한자 퀴즈나 단어장 복습을 해보면 여기에 쌓여요.
            </p>
          )}
        </div>
        <p className="mt-2 text-xs text-gray-400">
          이 항목들은 AI가 지어낸 게 아니라 실제 학습 기록에서 세어낸 값이에요.
        </p>
      </Section>

      <Section title="전부 지우기">
        {confirmingClear ? (
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">기억과 학습 기록을 모두 지울까요?</span>
            <button
              onClick={() => {
                void clearAll();
                setConfirmingClear(false);
              }}
              className="btn-press rounded-2xl bg-danger px-3 py-2 text-sm font-bold text-white"
            >
              지우기
            </button>
            <button onClick={() => setConfirmingClear(false)} className="text-sm text-gray-400">
              취소
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmingClear(true)}
            className="rounded-2xl border-2 border-gray-100 px-3 py-2 text-sm text-gray-500"
          >
            기억과 학습 기록 전부 지우기
          </button>
        )}
        <p className="mt-2 text-xs text-gray-400">
          되돌릴 수 없어요. 단어장·스트릭 같은 다른 학습 데이터는 지워지지 않아요.
        </p>
      </Section>
    </div>
  );
}

export default MemoryPage;
