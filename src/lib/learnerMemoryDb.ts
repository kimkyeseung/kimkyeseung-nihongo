// 학습 기록·기억·선생님 대화의 저장 계층. 이 프로젝트에서 **유일하게 IndexedDB를 쓰는 곳**이다.
//
// 왜 localStorage가 아닌가: 여기 쌓이는 것(퀴즈 오답, 복습 결과, 첨삭 지적, 날마다 이어지는
// 선생님 대화)은 전부 개수에 상한이 없다. Zustand `persist`는 스토어가 바뀔 때마다 **전체를
// JSON으로 다시 직렬화해서** localStorage에 쓰기 때문에, 레코드가 수천 개가 되면 퀴즈 한 문제
// 풀 때마다 수백 KB를 재직렬화하게 된다. 게다가 localStorage는 도메인당 5MB가 공유 한도라
// 단어장·스트릭 같은 기존 상태까지 같이 터진다. IndexedDB는 레코드 하나만 추가하면 된다.
//
// 반대로 **사용자 상태(단어장·스트릭/XP·설정)는 계속 localStorage에 둔다** — 작고, 통째로
// 읽고 쓰는 게 자연스럽고, 이미 그렇게 돌아가고 있다. IndexedDB를 여기 말고 다른 데로
// 넓히지 말 것.

import type { JlptLevel } from "../types/jlpt";

const DB_NAME = "learner-memory";
// v1 → v2: 선생님 대화를 날짜별로 남기는 `messages` 스토어를 더했다. `onupgradeneeded`는
// 스토어가 없을 때만 만들므로 새로 깔린 브라우저와 v1을 쓰던 브라우저가 같은 코드로 올라온다.
//
// **이 값은 "코드가 요구하는 최소 버전"이지 실제 버전이 아니다.** 스토어가 빠진 DB를 만나면
// `openDb`가 스스로 한 칸 더 올려 고치므로(아래 주석), 브라우저의 실제 버전은 이보다 높을 수
// 있다. 그래서 여는 쪽은 **버전을 붙이지 않고** 먼저 열어야 한다 — 낮은 버전을 붙이면
// VersionError로 전부 no-op이 된다.
const DB_VERSION = 2;
const EVENT_STORE = "events";
const FACT_STORE = "facts";
const MESSAGE_STORE = "messages";

/** 이벤트를 몇 개까지 들고 있을지. 넘치면 오래된 것부터 버린다. */
const MAX_EVENTS = 1000;

/**
 * 대화를 며칠치까지 남길지. 일기처럼 쌓이는 게 목적이라 넉넉히 두되, 무한히 늘어나게 두지는
 * 않는다. **하루 단위로 통째로 지운다** — 메시지 개수로 자르면 반쪽짜리 날짜가 남아서,
 * 지난 기록을 열었을 때 대화가 중간부터 시작한다.
 */
const MAX_CHAT_DAYS = 180;

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
  | "conversation-practice"
  /** 오십음도에서 글자를 눌러 소리를 들어본 것. Pre-N5 유닛의 진도가 여기에 달려 있다. */
  | "kana-studied";

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

/** 있어야 하는 스토어 전부. 하나라도 없으면 그 스토어를 쓰는 기능이 통째로 조용히 죽는다. */
const REQUIRED_STORES = [EVENT_STORE, FACT_STORE, MESSAGE_STORE];

function hasAllStores(db: IDBDatabase): boolean {
  return REQUIRED_STORES.every((name) => db.objectStoreNames.contains(name));
}

/**
 * **버전이 올라갔는데 스토어가 없는 DB를 스스로 고친다 (실제로 겪은 버그, 중요).**
 *
 * `onupgradeneeded`는 버전이 오를 때만 돈다. 그래서 업그레이드가 중간에 끊기거나(다른 탭이
 * 막아서 `onblocked`), 개발 중 `DB_VERSION`만 오른 코드로 HMR이 한 번 돌면 **"버전은 2인데
 * `messages` 스토어는 없는"** 상태가 굳어버린다. 그 뒤로는 업그레이드가 다시 돌지 않으니
 * 영영 안 생기고, `withStore`가 NotFoundError를 삼키므로 **화면도 콘솔도 멀쩡한데 저장만
 * 안 된다** — 선생님 대화가 새로고침 한 번에 통째로 사라지는 증상으로 나타났다(재현 확인함).
 *
 * 그래서 연 다음 스토어가 다 있는지 직접 확인하고, 없으면 **지금 버전보다 하나 위로** 다시
 * 열어 `onupgradeneeded`를 한 번 더 태운다(기존 데이터는 그대로 남는다).
 *
 * 처음 여는 것이 `open(DB_NAME)`(버전 없이)인 것이 핵심이다 — 버전을 붙여 열면 저장된 버전이
 * 그보다 높을 때 `VersionError`로 떨어져 **모든 기능이 no-op이 된다.** 버전 없이 열면 현재
 * 버전 그대로 열리므로, 우리가 필요한 만큼만 위로 올릴 수 있다.
 */
function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;

  dbPromise = (async () => {
    const current = await rawOpen();
    if (!current) return null;

    const complete = hasAllStores(current);
    if (complete && current.version >= DB_VERSION) return current;

    // 스토어가 빠졌으면 무조건 한 칸 올려야 `onupgradeneeded`가 돈다(같은 버전으로는 안 돈다).
    const target = complete ? DB_VERSION : Math.max(DB_VERSION, current.version + 1);
    // 여는 동안 `dbPromise`를 비우지 않는다 — 비우면 다른 호출이 동시에 또 열고, 그 연결이
    // 바로 이 업그레이드를 막아버린다(위의 `onblocked`가 정확히 그 상황이다).
    current.close();
    return await rawOpen(target);
  })();

  return dbPromise;
}

function rawOpen(version?: number): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === "undefined") {
      resolve(null);
      return;
    }
    let request: IDBOpenDBRequest;
    try {
      request = version === undefined ? indexedDB.open(DB_NAME) : indexedDB.open(DB_NAME, version);
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
      if (!db.objectStoreNames.contains(MESSAGE_STORE)) {
        const store = db.createObjectStore(MESSAGE_STORE, { keyPath: "id" });
        // 날짜별로 꺼내 쓰는 게 전부라 `date` 하나만 인덱싱한다.
        store.createIndex("date", "date");
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      /**
       * **다른 탭에게 버전 업그레이드를 양보한다 (실제로 겪은 버그).**
       *
       * IndexedDB의 버전 업그레이드는 단독 접근을 요구한다. 앱을 두 탭에 열어두면 옛 탭의
       * 연결이 새 탭의 업그레이드를 막고, 막힌 쪽은 `onblocked`로 떨어져 **새 스토어가 영영
       * 안 생긴 채 조용히 no-op**이 된다(v2에서 대화 기록을 더할 때 실제로 그랬다 — 화면도
       * 콘솔도 멀쩡한데 저장만 안 됐다).
       *
       * 그래서 업그레이드 요청이 오면 이 연결을 바로 닫고 캐시를 비운다. 다음 호출이 새 버전으로
       * 다시 연다.
       */
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      // 브라우저가 연결을 끊는 경우(저장소 정리 등)에도 캐시를 비워 다음 호출이 다시 열게 한다.
      db.onclose = () => {
        dbPromise = null;
      };
      resolve(db);
    };
    request.onerror = () => resolve(null);
    // 상대 탭이 응답하지 않아 끝내 막히면, 기다리다 앱이 멈추느니 이번만 없는 셈 치고 넘어간다.
    // **캐시는 비워둔다** — 그대로 두면 그 탭은 다시 시도조차 못 하고 영영 no-op이 된다.
    request.onblocked = () => {
      dbPromise = null;
      resolve(null);
    };
  });
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

/**
 * /memory 페이지의 "기억 전부 지우기". 되돌릴 수 없으므로 화면에서 한 번 더 확인받는다.
 *
 * **선생님 대화는 지우지 않는다** — 그건 학습자가 쓴 일기에 가깝고, "선생님이 뭘 기억하는지"와
 * 는 다른 물건이다. 대화는 선생님 화면에서 날짜별로 지운다.
 */
export async function clearAllMemory(): Promise<void> {
  await withStore(EVENT_STORE, "readwrite", (store) => runRequest(store.clear()));
  await withStore(FACT_STORE, "readwrite", (store) => runRequest(store.clear()));
}

// ─── 선생님 대화 (날짜별) ────────────────────────────────────────────────────

export interface StoredMessage {
  id: string;
  /** 로컬 타임존 `YYYY-MM-DD`. 하루가 곧 대화 한 묶음이다(세션 개념을 따로 두지 않는다). */
  date: string;
  role: "user" | "assistant";
  text: string;
  at: number;
}

/**
 * 메시지 하나를 저장한다(같은 id면 덮어쓴다).
 *
 * **스트리밍 도중에 부르지 말 것.** 답변은 청크마다 바뀌는데 그때마다 쓰면 한 번의 답변에
 * 수백 번 저장하게 된다. 다 받은 뒤 한 번만 부른다(teacherChatStore 참고).
 */
export async function saveMessage(message: StoredMessage): Promise<void> {
  await withStore(MESSAGE_STORE, "readwrite", (store) => runRequest(store.put(message)));
}

/** 그 날짜의 대화를 시간순으로. */
export async function loadMessagesForDate(date: string): Promise<StoredMessage[]> {
  const rows = await withStore(MESSAGE_STORE, "readonly", (store) =>
    runRequest(store.index("date").getAll(IDBKeyRange.only(date)) as IDBRequest<StoredMessage[]>)
  );
  if (!rows) return [];
  return rows.sort((a, b) => a.at - b.at);
}

/** 대화가 있는 날짜들, **최근 날짜부터**. 사이드바 목록이 이걸 그대로 쓴다. */
export async function loadChatDates(): Promise<string[]> {
  const rows = await withStore(MESSAGE_STORE, "readonly", (store) =>
    runRequest(store.getAll() as IDBRequest<StoredMessage[]>)
  );
  if (!rows) return [];
  // `YYYY-MM-DD`는 문자열 정렬이 곧 날짜 정렬이다.
  return [...new Set(rows.map((r) => r.date))].sort().reverse();
}

export async function deleteMessagesForDate(date: string): Promise<void> {
  await withStore(MESSAGE_STORE, "readwrite", async (store) => {
    const keys = await runRequest(
      store.index("date").getAllKeys(IDBKeyRange.only(date)) as IDBRequest<string[]>
    );
    for (const key of keys ?? []) store.delete(key);
    return null;
  });
}

/** 오래된 날짜를 통째로 버린다. 앱을 켤 때 한 번이면 충분하다. */
export async function pruneChatDays(keepDays = MAX_CHAT_DAYS): Promise<void> {
  const dates = await loadChatDates();
  if (dates.length <= keepDays) return;
  for (const date of dates.slice(keepDays)) await deleteMessagesForDate(date);
}
