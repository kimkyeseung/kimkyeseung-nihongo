import { Suspense, lazy, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import ChoiceQuestion from "../components/ChoiceQuestion";
import LoadingMascot from "../components/LoadingMascot";
import ProgressBar from "../components/ProgressBar";
import { loadLevelTestData } from "../lib/levelTest/loadData";
import { pickStartLevel, SECTION_MAX_ITEMS } from "../lib/levelTest/adaptive";
import {
  EXAM_TIMINGS,
  STUDY_PURPOSES,
  profileFacts,
  type ExamTiming,
  type LevelTestProfile,
} from "../lib/levelTest/profile";
import { lowConfidenceSections, overallLevel, SECTION_ORDER } from "../lib/levelTest/result";
import {
  SECTION_LABEL,
  answerRun,
  beginSection,
  currentSection,
  runProgress,
  runSections,
  startRun,
  type LevelTestData,
  type LevelTestRun,
} from "../lib/levelTest/run";
import type { LevelTestQuestion } from "../lib/levelTest/questions";
import { localDateKey } from "../lib/localDate";
import { useCurriculumStore } from "../stores/curriculumStore";
import { useLearnerMemoryStore } from "../stores/learnerMemoryStore";
import { useLevelTestSession } from "../stores/pageStateStore";
import { CURRICULUM_LEVELS } from "../types/curriculum";
import { JLPT_LEVELS } from "../types/jlpt";
import type { EstimatedLevel, LevelTestSection, SectionResult } from "../types/levelTest";

// 틀린 문제 다시 보기는 문장 속 단어를 누를 수 있어서 사전을 정적으로 끌어온다 — lazy로 떼어 둬야
// 인사 화면이 사전을 기다리지 않는다(LevelTestReview 주석).
const LevelTestReview = lazy(() => import("../components/LevelTestReview"));

const PRIMARY_SHADOW = { ["--btn-shadow" as string]: "#3d9401" };
const PRIMARY_BUTTON = "btn-press w-full rounded-2xl bg-primary py-3 text-lg font-bold text-white disabled:opacity-40";

const SECTION_GUIDE: Record<LevelTestSection, { emoji: string; text: string }> = {
  kana: { emoji: "🔤", text: "글자를 보고 소리를 골라요. 가나부터 차근차근 볼게요." },
  vocab: { emoji: "📚", text: "단어를 보고 알맞은 뜻을 골라요." },
  kanji: { emoji: "🈷️", text: "밑줄 친 한자를 그 단어 안에서 어떻게 읽는지 골라요." },
  grammar: { emoji: "🧩", text: "빈칸에 들어갈 말을 골라요." },
  reading: { emoji: "📖", text: "짧은 글을 읽고 질문에 답해요." },
  listening: { emoji: "🎧", text: "대화를 듣고 질문에 답해요." },
};

/** 전환 화면의 "다음은 ○○예요" — 받침이 있으면 "이에요"(문법이에요). 이름이 여섯뿐이라 표로 적는다. */
const SECTION_IS: Record<LevelTestSection, string> = {
  kana: "문자예요",
  vocab: "어휘예요",
  kanji: "한자예요",
  grammar: "문법이에요",
  reading: "독해예요",
  listening: "청해예요",
};

/** 결과에 쓰는 급수 이름 — Pre-N5는 JLPT 급수가 아니라 "입문"이라고 부른다. */
function levelName(level: EstimatedLevel): string {
  return level === "Pre-N5" ? "입문 (N5 전)" : level;
}

/** 경과 시간 표시(제한 아님). */
function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const seconds = Math.max(0, Math.floor((now - since) / 1000));
  const mm = Math.floor(seconds / 60);
  const ss = String(seconds % 60).padStart(2, "0");
  return (
    <span className="tabular-nums" aria-label={`경과 시간 ${mm}분 ${ss}초`}>
      ⏱ {mm}:{ss}
    </span>
  );
}

// ───────────────────────────── 첫 화면 · 두 질문 ─────────────────────────────

/** 인사는 앱이 한다(모델이 아니다 — "인사는 앱이 한다" 규칙). */
function Greeting({ ready, failed, onRetry, onNext }: {
  ready: boolean;
  failed: boolean;
  onRetry: () => void;
  onNext: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <img src="/favicon.svg" alt="" className="h-14 w-14 rounded-2xl" />
        <div>
          <h2 className="text-2xl text-primary">처음 만나서 반가워요!</h2>
          <p className="text-sm text-gray-400">레벨 진단 · 10~15분</p>
        </div>
      </div>
      <p className="font-mixed leading-relaxed text-gray-700">
        지금 일본어를 어느 정도 하는지 같이 살펴볼게요. 결과를 보고 어디서부터 공부하면 좋을지 정해 드려요.
      </p>
      <ul className="flex flex-col gap-2 rounded-2xl bg-gray-50 p-4 text-sm text-gray-600">
        <li>📚 어휘 · 🈷️ 한자 · 🧩 문법 · 📖 독해 · 🎧 청해 — 다섯 영역을 차례로 풀어요.</li>
        <li>🔊 청해는 소리가 나와요. 이어폰이나 스피커를 준비해 주세요.</li>
        <li>🤔 모르는 문제는 "모르겠어요"를 눌러 주세요. 찍으면 결과가 실제보다 높게 나와서 너무 어려운 단계에서 시작하게 돼요.</li>
        <li>🙈 푸는 동안에는 정답을 알려주지 않아요. 끝나고 한꺼번에 볼 수 있어요.</li>
      </ul>
      {failed ? (
        <div className="flex flex-col items-center gap-2 text-center">
          <p className="text-sm text-danger">문제를 불러오지 못했어요. 인터넷 연결을 확인해 주세요.</p>
          <button onClick={onRetry} className="rounded-full border-2 border-gray-100 px-4 py-1.5 text-sm text-gray-600">
            다시 불러오기
          </button>
        </div>
      ) : (
        <button onClick={onNext} disabled={!ready} className={PRIMARY_BUTTON} style={PRIMARY_SHADOW}>
          {ready ? "시작하기" : "문제를 준비하는 중..."}
        </button>
      )}
    </div>
  );
}

function OptionChip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={selected}
      className={`rounded-full border-2 px-3 py-1.5 text-sm ${
        selected ? "border-primary bg-primary/10 text-primary" : "border-gray-100 bg-white text-gray-600"
      }`}
    >
      {children}
    </button>
  );
}

/**
 * (선택) 공부 목적·시험 일정. 버튼으로만 고른다 — 자유 입력이 없어 선생님 프롬프트에 학습자 글자가
 * 들어갈 일이 없다. 고른 것은 "확인된 기억"으로 바로 들어간다(profile.ts).
 */
function ProfileQuestions({ profile, onChange, onDone }: {
  profile: LevelTestProfile;
  onChange: (profile: LevelTestProfile) => void;
  onDone: (save: boolean) => void;
}) {
  const exam = profile.exam;
  const examLevel = exam && exam !== "none" ? exam.level : null;
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-xl text-primary">시작하기 전에 두 가지만 물어볼게요</h2>
        <p className="mt-1 text-sm text-gray-400">고르면 선생님이 기억해 둬요. 건너뛰어도 괜찮아요.</p>
      </div>

      <section>
        <p className="font-bold text-gray-700">일본어를 왜 공부하세요?</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {STUDY_PURPOSES.map((p) => (
            <OptionChip
              key={p.id}
              selected={profile.purpose === p.id}
              onClick={() => onChange({ ...profile, purpose: profile.purpose === p.id ? null : p.id })}
            >
              {p.emoji} {p.label}
            </OptionChip>
          ))}
        </div>
      </section>

      <section>
        <p className="font-bold text-gray-700">볼 예정인 JLPT 시험이 있나요?</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <OptionChip selected={exam === "none"} onClick={() => onChange({ ...profile, exam: exam === "none" ? null : "none" })}>
            없어요
          </OptionChip>
          {JLPT_LEVELS.map((level) => (
            <OptionChip
              key={level}
              selected={examLevel === level}
              onClick={() =>
                onChange({ ...profile, exam: examLevel === level ? null : { level, timing: exam && exam !== "none" ? exam.timing : "6m" } })
              }
            >
              {level}
            </OptionChip>
          ))}
        </div>
        {exam && exam !== "none" && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-xs text-gray-400">언제쯤?</span>
            {EXAM_TIMINGS.map((t) => (
              <OptionChip
                key={t.id}
                selected={exam.timing === t.id}
                onClick={() => onChange({ ...profile, exam: { level: exam.level, timing: t.id as ExamTiming } })}
              >
                {t.label}
              </OptionChip>
            ))}
          </div>
        )}
      </section>

      <div className="flex flex-col gap-2">
        <button onClick={() => onDone(true)} className={PRIMARY_BUTTON} style={PRIMARY_SHADOW}>
          진단 시작
        </button>
        <button onClick={() => onDone(false)} className="self-center text-sm text-gray-400 underline underline-offset-4">
          건너뛰기
        </button>
      </div>
    </div>
  );
}

// ───────────────────────────── 문제 ─────────────────────────────

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
      return <p className="font-bold text-gray-700">{q.item.question}</p>;
  }
}

/** 보기 글꼴 — 일본어 보기(문법·한자 읽기)는 font-ja, 한국어 뜻·로마자는 font-mixed */
function choiceFont(q: LevelTestQuestion): string {
  return q.kind === "grammar" || q.kind === "kanji" ? "font-ja" : "font-mixed";
}

// ───────────────────────────── 결과 ─────────────────────────────

/** 영역 하나의 계단 — 입문부터 N1까지 여섯 칸, 추정 급수까지 칠한다(무채색은 gray만 — 다크 모드 규칙). */
function LevelSteps({ result }: { result: SectionResult }) {
  const reached = result.estimate === null ? -1 : CURRICULUM_LEVELS.indexOf(result.estimate);
  return (
    <div className="flex h-6 items-end gap-0.5" aria-hidden>
      {CURRICULUM_LEVELS.map((level, i) => (
        <span
          key={level}
          className={`w-3 rounded-sm ${i <= reached ? "bg-primary" : "bg-gray-100"}`}
          style={{ height: `${30 + i * 14}%` }}
        />
      ))}
    </div>
  );
}

function ResultView({ run, onRestart }: { run: LevelTestRun; onRestart: () => void }) {
  const sections = runSections(run);
  const overall = overallLevel(sections);
  const unsure = lowConfidenceSections(sections);
  const missed = run.history.filter((h) => !h.correct);
  const minutes = run.finishedAt ? Math.max(1, Math.round((run.finishedAt - run.startedAt) / 60000)) : null;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col items-center gap-1 text-center">
        <span className="text-5xl">🎓</span>
        <p className="text-sm text-gray-400">레벨 진단 결과{minutes && ` · ${minutes}분`}</p>
        <p className="text-4xl text-primary">{overall ? levelName(overall) : "판정 불가"}</p>
        {overall && (
          <p className="text-sm text-gray-500">
            {overall === "Pre-N5" ? "가나부터 차근차근 시작해요." : `${overall} 단계부터 시작하면 알맞아요.`}
          </p>
        )}
      </div>

      <ul className="flex flex-col gap-2">
        {SECTION_ORDER.map((section) => {
          const r = sections[section];
          if (!r) return null;
          return (
            <li key={section} className="flex items-center gap-3 rounded-2xl border-2 border-gray-100 bg-white px-4 py-2.5">
              <span className="w-10 shrink-0 font-bold text-gray-700">{SECTION_LABEL[section]}</span>
              <LevelSteps result={r} />
              <span className="min-w-0 flex-1 text-right">
                {r.estimate === null ? (
                  <span className="text-sm text-gray-400">측정 안 함</span>
                ) : section === "kana" ? (
                  <span className="text-gray-700">{r.estimate === "Pre-N5" ? "연습 필요" : "통과"}</span>
                ) : (
                  <span className="text-gray-700">{levelName(r.estimate)}</span>
                )}
                {r.total > 0 && (
                  <span className="block text-xs text-gray-400">
                    {r.correct}/{r.total} 정답
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>

      {unsure.length > 0 && (
        <p className="rounded-2xl bg-warning/10 px-4 py-3 text-sm text-gray-600">
          🔍 {unsure.map((s) => SECTION_LABEL[s]).join("·")} 영역은 조금 더 풀어봐야 정확해요. 다음에 한 번 더 진단해 보세요.
        </p>
      )}
      {run.skipped.includes("listening") && (
        <p className="text-xs text-gray-400">🎧 이 브라우저에는 일본어 음성이 없어서 청해는 측정하지 않았어요. 종합에서도 뺐어요.</p>
      )}

      {missed.length > 0 && (
        <section>
          <h3 className="font-bold text-gray-700">틀린 문제 다시 보기 ({missed.length})</h3>
          <p className="mt-0.5 text-xs text-gray-400">문장 속 단어를 누르면 뜻을 볼 수 있어요.</p>
          <div className="mt-2">
            <Suspense fallback={<LoadingMascot />}>
              <LevelTestReview missed={missed} />
            </Suspense>
          </div>
        </section>
      )}

      <div className="flex flex-col gap-2">
        <button onClick={onRestart} className="rounded-2xl border-2 border-gray-100 bg-white py-3 text-gray-600">
          다시 진단하기
        </button>
        <Link to="/" className="self-center text-sm text-info">
          대문으로
        </Link>
      </div>
    </div>
  );
}

// ───────────────────────────── 페이지 ─────────────────────────────

/**
 * 레벨 진단(`/level`). 하단 네비·헤더 아이콘 밖이다 — 선생님의 `/level`, 대문 "오늘의 학습",
 * `/curriculum`에서 링크로 온다. **문제는 전부 코드가 낸다(LLM 없음)** — AI가 안 되는 브라우저에서도 돈다.
 *
 * 진행 상태는 `useLevelTestSession`(메모리)에 있어 탭을 옮겨도 이어서 풀린다. 나가는 것은 막지 않고,
 * 돌아오면 "이어서 풀기 / 처음부터"를 묻는다.
 */
function LevelTestPage() {
  const { run, profile, setRun, setProfile, reset } = useLevelTestSession();
  const startLevel = useCurriculumStore((s) => s.startLevel);
  const levelGuess = useLearnerMemoryStore((s) => s.profile.levelGuess);
  const addManualFact = useLearnerMemoryStore((s) => s.addManualFact);
  const [data, setData] = useState<LevelTestData | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [screen, setScreen] = useState<"greeting" | "profile">("greeting");
  // 진행 중인 진단이 있는 채로 들어왔으면 먼저 묻는다. 마운트 때 한 번만 정한다.
  const [askResume, setAskResume] = useState(() => !!run && run.phase !== "result");
  const topRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    loadLevelTestData()
      .then((d) => !cancelled && setData(d))
      .catch(() => !cancelled && setLoadFailed(true));
    return () => {
      cancelled = true;
    };
  }, [loadAttempt]);

  // 문제가 바뀌면 맨 위로 — 긴 지문을 끝까지 내려 읽은 채로 다음 문제가 뜨면 질문이 화면 밖에 있다.
  const questionKey = run?.question?.keys[0] ?? run?.phase;
  useLayoutEffect(() => {
    topRef.current?.scrollIntoView({ block: "start" });
  }, [questionKey]);

  function startTest(saveProfile: boolean) {
    if (saveProfile) {
      // 이미 같은 기억이 있으면 넣지 않는다 — "다시 진단하기"로 같은 답을 또 고르면 같은 줄이 쌓였다
      // (처음엔 세션에 "저장함" 표시를 뒀는데, 다시 진단하기가 세션을 비우면서 같이 지워졌다).
      const existing = useLearnerMemoryStore.getState().facts;
      for (const fact of profileFacts(profile, localDateKey())) {
        if (existing.some((f) => f.kind === fact.kind && f.text === fact.text)) continue;
        void addManualFact(fact.kind, fact.text);
      }
    }
    setRun(
      startRun({
        startLevel: pickStartLevel(startLevel, levelGuess),
        // 청해 플레이어는 다음 단계에서 붙인다 — 그때까지는 "측정 안 함"으로 둔다.
        listeningAvailable: false,
        now: Date.now(),
      }),
    );
  }

  function restart() {
    reset();
    setScreen("greeting");
    setAskResume(false);
  }

  let body: React.ReactNode;
  if (askResume && run) {
    body = (
      <div className="flex flex-col gap-3 text-center">
        <span className="text-4xl">⏸️</span>
        <p className="text-lg text-gray-700">풀던 진단이 있어요</p>
        <p className="text-sm text-gray-400">
          {run.history.length}문제까지 풀었어요. 이어서 풀까요?
        </p>
        <button onClick={() => setAskResume(false)} className={PRIMARY_BUTTON} style={PRIMARY_SHADOW}>
          이어서 풀기
        </button>
        <button onClick={restart} className="text-sm text-gray-400 underline underline-offset-4">
          처음부터 다시
        </button>
      </div>
    );
  } else if (!run) {
    body =
      screen === "greeting" ? (
        <Greeting
          ready={!!data}
          failed={loadFailed}
          onRetry={() => {
            setLoadFailed(false);
            setLoadAttempt((n) => n + 1);
          }}
          onNext={() => setScreen("profile")}
        />
      ) : (
        <ProfileQuestions profile={profile} onChange={setProfile} onDone={startTest} />
      );
  } else if (run.phase === "result") {
    body = <ResultView run={run} onRestart={restart} />;
  } else {
    const section = currentSection(run)!;
    const guide = SECTION_GUIDE[section];
    body = (
      <div className="flex flex-col gap-4">
        <div>
          <div className="flex items-center justify-between text-sm text-gray-500">
            <span className="font-bold text-primary">
              {guide.emoji} {SECTION_LABEL[section]}
            </span>
            <Elapsed since={run.startedAt} />
          </div>
          <ProgressBar percent={runProgress(run) * 100} label="진단 진행률" active={false} className="mt-2" />
        </div>

        {run.phase === "section-intro" ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <span className="text-5xl">{guide.emoji}</span>
            <p className="text-xl text-gray-700">
              {run.history.length === 0 ? "첫 영역은" : "다음은"} {SECTION_IS[section]}
            </p>
            <p className="font-mixed text-sm text-gray-500">{guide.text}</p>
            <p className="text-xs text-gray-400">최대 {SECTION_MAX_ITEMS[section]}문제</p>
            {data ? (
              <button
                onClick={() => setRun(beginSection(run, data, Math.random, Date.now()))}
                className={`${PRIMARY_BUTTON} mt-2`}
                style={PRIMARY_SHADOW}
              >
                시작
              </button>
            ) : (
              <LoadingMascot label="문제를 준비하는 중" />
            )}
          </div>
        ) : run.question && data ? (
          <div className="flex flex-col gap-5">
            <QuestionPrompt q={run.question} />
            <ChoiceQuestion
              key={run.question.keys[0]}
              choices={run.question.choices}
              choiceFont={choiceFont(run.question)}
              onAnswer={(choice) => setRun(answerRun(run, choice, data, Math.random, Date.now()))}
            />
          </div>
        ) : (
          <LoadingMascot label="문제를 준비하는 중" />
        )}
      </div>
    );
  }

  return (
    <div ref={topRef} className="mx-auto max-w-xl p-4 pb-10 sm:p-6">
      {body}
    </div>
  );
}

export default LevelTestPage;
