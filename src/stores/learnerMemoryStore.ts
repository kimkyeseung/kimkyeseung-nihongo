import { create } from "zustand";
import {
  clearAllMemory,
  deleteFact as deleteFactFromDb,
  loadEvents,
  loadFacts,
  pruneEvents,
  saveEvent,
  saveFact,
  type MemoryFact,
  type MemoryFactKind,
  type StudyEvent,
} from "../lib/learnerMemoryDb";
import { buildLearnerProfile, EMPTY_PROFILE, type LearnerProfile } from "../lib/learnerProfile";
import { buildMemoryBlock, type TeacherCurriculumContext } from "../lib/teacherPrompts";
import { buildCurriculumPlan } from "../lib/curriculumProgress";
import { findLevel, findUnit, levelLabel, loadCurriculum } from "../lib/curriculum";
import type { ExtractedFact } from "../lib/memoryExtraction";
import { useCurriculumStore } from "./curriculumStore";
import { useKanjiProgressStore } from "./kanjiProgressStore";

interface LearnerMemoryState {
  /** IndexedDB에서 한 번 읽어왔는가. 이게 false인 동안 기억을 단정하지 말 것. */
  loaded: boolean;
  events: StudyEvent[];
  facts: MemoryFact[];
  profile: LearnerProfile;
  /**
   * 선생님 시스템 프롬프트에 들어갈 기억 블록의 **스냅샷**.
   *
   * 왜 매번 새로 만들지 않는가: `useAiModel`은 시스템 프롬프트 문자열이 바뀌면 LLM 세션을
   * 버리고 새로 만든다. 기억 블록을 실시간으로 반영하면 **대화 도중에 한자 퀴즈 하나만 풀어도
   * 선생님 세션이 통째로 날아가** 앞의 대화 맥락을 잃는다. 그래서 명시적으로 갱신할 때만
   * (앱을 켤 때, 기억을 직접 고쳤을 때, 대화를 지웠을 때) 다시 만든다.
   */
  promptMemory: string;

  load: () => Promise<void>;
  /**
   * 스냅샷을 지금 상태로 다시 만든다. 대화 중에는 부르지 말 것(위 주석 참고).
   * 커리큘럼을 동적 import로 읽어야 해서 비동기다.
   */
  refreshPromptMemory: () => Promise<void>;
  addPendingFacts: (facts: ExtractedFact[]) => Promise<void>;
  confirmFact: (id: string) => Promise<void>;
  rejectFact: (id: string) => Promise<void>;
  addManualFact: (kind: MemoryFactKind, text: string) => Promise<void>;
  removeFact: (id: string) => Promise<void>;
  clearAll: () => Promise<void>;
}

/**
 * 지금 공부 중인 단원을 선생님 프롬프트에 넣을 형태로 뽑는다.
 *
 * 시작 단계를 아직 안 골랐으면 null — 그 상태에서 억지로 Pre-N5부터라고 알려주면, 이미
 * N3인 사람에게 선생님이 히라가나 이야기를 하기 시작한다.
 */
async function currentUnitContext(events: StudyEvent[]): Promise<TeacherCurriculumContext | null> {
  const { startLevel, manualUnits } = useCurriculumStore.getState();
  if (!startLevel) return null;
  try {
    const curriculum = await loadCurriculum();
    const plan = buildCurriculumPlan(curriculum, {
      events,
      learnedKanji: useKanjiProgressStore.getState().learned,
      manualUnits,
      startLevel,
    });
    const current = plan.current;
    if (!current) return null;
    const level = findLevel(curriculum, current.level);
    const unit = findUnit(curriculum, current.level, current.unitNumber);
    return {
      levelLabel: level ? levelLabel(level) : current.level,
      unitNumber: current.unitNumber,
      unitTitle: current.title,
      canDoGoals: current.canDoGoals,
      grammarPatterns: (unit?.grammarPoints ?? []).map((g) => g.pattern),
      remainingKanji: current.kanjiTodo,
    };
  } catch {
    // 커리큘럼을 못 읽어도 나머지 기억은 그대로 쓴다.
    return null;
  }
}

function recompute(
  events: StudyEvent[],
  facts: MemoryFact[],
  curriculum: TeacherCurriculumContext | null
) {
  const profile = buildLearnerProfile(events);
  return { profile, promptMemory: buildMemoryBlock(profile, facts, curriculum) };
}

export const useLearnerMemoryStore = create<LearnerMemoryState>((set, get) => ({
  loaded: false,
  events: [],
  facts: [],
  profile: EMPTY_PROFILE,
  promptMemory: "",

  load: async () => {
    // 오래된 이벤트 정리는 앱을 켤 때 한 번이면 충분하다(쓸 때마다 하면 전체 스캔이 붙는다).
    await pruneEvents();
    const [events, facts] = await Promise.all([loadEvents(), loadFacts()]);
    // 커리큘럼을 기다리느라 `loaded`가 늦어지지 않도록 프로필부터 먼저 올린다 — 대문의
    // "오늘의 학습" 카드는 자기가 직접 커리큘럼을 읽으므로 여기서 기다릴 이유가 없다.
    set({ loaded: true, events, facts, ...recompute(events, facts, null) });
    await get().refreshPromptMemory();
  },

  refreshPromptMemory: async () => {
    const { events } = get();
    const curriculum = await currentUnitContext(events);
    // 그 사이에 이벤트가 바뀌었을 수 있으므로 지금 상태를 다시 읽는다.
    const latest = get();
    set(recompute(latest.events, latest.facts, curriculum));
  },

  addPendingFacts: async (extracted) => {
    const existing = get().facts;
    const fresh: MemoryFact[] = [];
    for (const fact of extracted) {
      // 같은 말을 또 뽑아오는 일이 흔하다(매 턴 같은 대화를 다시 읽으므로).
      if (existing.some((f) => f.kind === fact.kind && f.text === fact.text)) continue;
      fresh.push({
        id: crypto.randomUUID(),
        kind: fact.kind,
        text: fact.text,
        status: "pending",
        source: "auto",
        createdAt: Date.now(),
      });
    }
    if (fresh.length === 0) return;
    await Promise.all(fresh.map(saveFact));
    set((s) => ({ facts: [...s.facts, ...fresh] }));
  },

  confirmFact: async (id) => {
    const fact = get().facts.find((f) => f.id === id);
    if (!fact || fact.status === "confirmed") return;
    const next: MemoryFact = { ...fact, status: "confirmed" };
    await saveFact(next);
    set((s) => ({ facts: s.facts.map((f) => (f.id === id ? next : f)) }));
    // 사용자가 방금 "기억해도 좋다"고 한 것이라 바로 반영한다. 대화 도중이면 세션이 새로
    // 만들어지지만, 그게 곧 "이제부터 이걸 알고 있다"는 사용자의 기대다.
    void get().refreshPromptMemory();
  },

  rejectFact: async (id) => {
    await deleteFactFromDb(id);
    set((s) => ({ facts: s.facts.filter((f) => f.id !== id) }));
  },

  addManualFact: async (kind, text) => {
    const fact: MemoryFact = {
      id: crypto.randomUUID(),
      kind,
      text,
      // 사용자가 직접 적은 것은 확인 절차가 따로 필요 없다.
      status: "confirmed",
      source: "manual",
      createdAt: Date.now(),
    };
    await saveFact(fact);
    set((s) => ({ facts: [...s.facts, fact] }));
    void get().refreshPromptMemory();
  },

  removeFact: async (id) => {
    await deleteFactFromDb(id);
    set((s) => ({ facts: s.facts.filter((f) => f.id !== id) }));
    void get().refreshPromptMemory();
  },

  clearAll: async () => {
    await clearAllMemory();
    set({ events: [], facts: [], profile: EMPTY_PROFILE, promptMemory: "" });
  },
}));

/**
 * 학습 행동 하나를 기록한다. **React 훅이 아니라 모듈 함수다** — 퀴즈 시트·단어장 카드·작문
 * 페이지처럼 여기저기서 한 줄로 부르는 자리라, 훅으로 만들면 부르는 쪽마다 배선이 붙는다
 * (gemmaDownloadController와 같은 판단).
 *
 * 실패해도 조용히 넘어간다 — 기억을 못 남기는 것 때문에 퀴즈가 멈추면 안 된다.
 *
 * 프롬프트 스냅샷은 **일부러 갱신하지 않는다**. 대화 도중에 갱신하면 선생님 세션이 날아간다
 * (`promptMemory` 주석 참고).
 */
export function recordStudyEvent(event: Omit<StudyEvent, "at">): void {
  const full: StudyEvent = { ...event, at: Date.now() };
  useLearnerMemoryStore.setState((s) => {
    const events = [full, ...s.events];
    // 프로필은 바로 다시 계산한다 — /memory 화면이 방금 푼 퀴즈를 반영해야 하고, 1000개
    // 남짓을 한 번 훑는 비용은 버튼 한 번 누를 때 치르기에 무시할 만하다.
    // promptMemory는 **건드리지 않는다**(위 주석).
    return { events, profile: buildLearnerProfile(events) };
  });
  void saveEvent(full);
}
