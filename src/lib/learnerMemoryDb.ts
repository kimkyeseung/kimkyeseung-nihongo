// 학습자 기억의 저장 계층. 이 프로젝트에서 **유일하게 IndexedDB를 쓰는 곳**이다.
//
// 왜 localStorage가 아닌가: 여기 쌓이는 학습 이벤트(퀴즈 오답, 복습 결과, 첨삭 지적)는
// 개수에 상한이 없다. Zustand `persist`는 스토어가 바뀔 때마다 **전체를 JSON으로 다시
// 직렬화해서** localStorage에 쓰기 때문에, 이벤트가 수천 개가 되면 퀴즈 한 문제 풀 때마다
// 수백 KB를 재직렬화하게 된다. 게다가 localStorage는 도메인당 5MB가 공유 한도라 단어장·
// 스트릭 같은 기존 상태까지 같이 터진다. IndexedDB는 레코드 하나만 추가하면 된다.
//
// 반대로 **사용자 상태(단어장·스트릭/XP·설정)는 계속 localStorage에 둔다** — 작고, 통째로
// 읽고 쓰는 게 자연스럽고, 이미 그렇게 돌아가고 있다. IndexedDB를 여기 말고 다른 데로
// 넓히지 말 것.

import type { JlptLevel } from "../types/jlpt";

const DB_NAME = "learner-memory";
const DB_VERSION = 1;
const EVENT_STORE = "events";
const FACT_STORE = "facts";

/** 이벤트를 몇 개까지 들고 있을지. 넘치면 오래된 것부터 버린다. */
const MAX_EVENTS = 1000;

export type StudyEventType =
  | "kanji-quiz-correct"
  | "kanji-quiz-wrong"
  | "kanji-learned"
  | "word-added"
  | "word-review-known"
  /**
   * 문장 속 단어를 탭해서 뜻을 찾아본 것. 단어장 스와이프에는 "모르겠다" 경로가 없어서
   * (왼쪽은 삭제, 오른쪽은 학습 완료) **지금 이 앱에서 "이 단어를 몰랐다"에 가장 가까운
   * 신호가 이것이다.** 단어장에 "모르겠다" 스와이프를 추가하게 되면 그쪽도 같이 넣을 것.
   */
  | "word-looked-up"
  | "writing-corrected"
  | "writing-clean"
  | "teacher-question"
  | "conversation-practice";

export interface StudyEvent {
  /** autoIncrement라 저장 전에는 없다. */
  id?: number;
  at: number;
  type: StudyEventType;
  /** 무엇에 대한 기록인지 — 한자 한 글자, 단어 표기, 시나리오 이름 등. */
  subject: string;
  /**
   * 부가 정보(정답 읽기, 첨삭에서 지적받은 요지 등).
   * **사전에서 다시 찾지 않아도 되도록 기록 시점에 같이 넣는다** — 이 모듈이 dictionary.json을
   * 참조하면 2.9MB짜리 청크가 진입 번들까지 딸려온다(번들 최적화 노트 참고).
   */
  detail?: string;
  /** 급수. 어휘 수준 추정의 유일한 근거라, 기록하는 쪽에서 아는 값을 꼭 같이 넣을 것. */
  level?: JlptLevel;
}

/** 대화에서 건져 올린 "앞으로 기억해둘 개인적인 사실"의 갈래. */
export type MemoryFactKind = "goal" | "schedule" | "job" | "interest";

export interface MemoryFact {
  id: string;
  kind: MemoryFactKind;
  /** 이미 sanitizeMemoryLine을 통과한 한 줄. 시스템 프롬프트에 그대로 들어간다. */
  text: string;
  /**
   * `pending`은 "모델이 뽑았지만 사용자가 아직 확인하지 않은" 상태다.
   * **선생님 프롬프트에는 `confirmed`만 넣는다** — 온디바이스 모델이 헛것을 뽑는 일이 드물지
   * 않은데, 확인 없이 넣으면 잘못된 기억이 조용히 쌓이고 그 위에서 대화가 이어진다.
   */
  status: "pending" | "confirmed";
  source: "auto" | "manual";
  createdAt: number;
}

/**
 * IndexedDB를 못 쓰는 환경(사생활 보호 모드, 저장소 차단)이 실제로 있다. 그럴 때 앱이
 * 죽으면 안 되므로 **여는 데 실패하면 null을 돌려주고 모든 동작이 조용히 no-op이 된다** —
 * 기억이 안 쌓일 뿐 학습 기능은 그대로 돌아간다(클립보드·화면 잠금과 같은 방침).
 */
let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === "undefined") {
      resolve(null);
      return;
    }
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      resolve(null);
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(EVENT_STORE)) {
        const store = db.createObjectStore(EVENT_STORE, { keyPath: "id", autoIncrement: true });
        store.createIndex("at", "at");
      }
      if (!db.objectStoreNames.contains(FACT_STORE)) {
        db.createObjectStore(FACT_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    // 다른 탭이 옛 버전을 붙들고 있으면 upgrade가 영원히 안 끝난다. 기다리다 앱이 멈추느니
    // 기억 없이 도는 쪽이 낫다.
    request.onblocked = () => resolve(null);
  });

  return dbPromise;
}

function runRequest<T>(request: IDBRequest<T>): Promise<T | null> {
  return new Promise((resolve) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

async function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => Promise<T>
): Promise<T | null> {
  const db = await openDb();
  if (!db) return null;
  try {
    const tx = db.transaction(storeName, mode);
    return await run(tx.objectStore(storeName));
  } catch {
    return null;
  }
}

export async function saveEvent(event: StudyEvent): Promise<void> {
  await withStore(EVENT_STORE, "readwrite", (store) => runRequest(store.add(event)));
}

/** 최근 것부터 `limit`개. 프로필 계산은 전부 이 배열 하나만 보고 한다. */
export async function loadEvents(limit = MAX_EVENTS): Promise<StudyEvent[]> {
  const events = await withStore(EVENT_STORE, "readonly", (store) =>
    runRequest(store.getAll() as IDBRequest<StudyEvent[]>)
  );
  if (!events) return [];
  return events.sort((a, b) => b.at - a.at).slice(0, limit);
}

/**
 * 오래된 이벤트를 버린다. 앱을 켤 때 한 번만 부르면 충분하다 — 쓸 때마다 검사하면
 * 퀴즈 한 문제마다 전체 스캔이 붙는다.
 */
export async function pruneEvents(keep = MAX_EVENTS): Promise<void> {
  await withStore(EVENT_STORE, "readwrite", async (store) => {
    const keys = await runRequest(store.getAllKeys() as IDBRequest<number[]>);
    if (!keys || keys.length <= keep) return null;
    // autoIncrement 키는 시간순으로 증가하므로, 앞쪽이 곧 오래된 것이다.
    for (const key of keys.slice(0, keys.length - keep)) store.delete(key);
    return null;
  });
}

export async function saveFact(fact: MemoryFact): Promise<void> {
  await withStore(FACT_STORE, "readwrite", (store) => runRequest(store.put(fact)));
}

export async function loadFacts(): Promise<MemoryFact[]> {
  const facts = await withStore(FACT_STORE, "readonly", (store) =>
    runRequest(store.getAll() as IDBRequest<MemoryFact[]>)
  );
  if (!facts) return [];
  return facts.sort((a, b) => a.createdAt - b.createdAt);
}

export async function deleteFact(id: string): Promise<void> {
  await withStore(FACT_STORE, "readwrite", (store) => runRequest(store.delete(id)));
}

/** /memory 페이지의 "기억 전부 지우기". 되돌릴 수 없으므로 화면에서 한 번 더 확인받는다. */
export async function clearAllMemory(): Promise<void> {
  await withStore(EVENT_STORE, "readwrite", (store) => runRequest(store.clear()));
  await withStore(FACT_STORE, "readwrite", (store) => runRequest(store.clear()));
}
