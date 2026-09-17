/**
 * 대문 페이지(`/`)에서 미리 받아두는 큰 정적 애셋 목록.
 *
 * router.tsx의 코드 스플리팅 덕분에 사전/한자/획순 데이터는 해당 페이지를 실제로 방문할 때까지
 * 내려받지 않는다(= 앱 진입은 빠르지만, 각 페이지 첫 방문 때 수 MB를 기다려야 한다).
 * 대문은 사용자가 소개 글을 읽는 동안 가만히 있는 시간이므로, 그 사이에 같은 청크들을 미리
 * 당겨와서 진행률을 눈에 보이게 보여준다 — 여기서 쓰는 건 전부 동적 import라서 진입 청크
 * 크기에는 영향이 없고, 미리 받기에 실패해도 각 페이지는 평소대로 직접 로드한다.
 */

export type AssetStatus = "pending" | "loading" | "done" | "error";

export interface AssetStep {
  id: string;
  label: string;
  /**
   * 진행률 가중치. `src/data/*.json`의 실제 파일 크기(바이트)를 쓴다.
   * 실제 전송량은 gzip/청크 오버헤드 때문에 다르지만, 항목 간 "얼마나 오래 걸리는지"의
   * 비율은 원본 크기에 거의 비례해서 바가 고르게 차오른다 (항목 수로 1/n씩 나누면
   * 2.9MB짜리 사전에서 바가 한참 멈춘 것처럼 보인다).
   */
  bytes: number;
  load: () => Promise<unknown>;
}

// 대문 그림(public/hero.png)은 여기 넣지 않는다 — 학습에 쓰이는 데이터가 아니라 장식이고,
// <img>가 이미 알아서 받는다. 진행률 바에는 실제 학습 데이터만 세어 보여준다.
export const ASSET_STEPS: AssetStep[] = [
  {
    id: "kanji",
    label: "한자 데이터 (음독·훈독·JLPT)",
    bytes: 444_313,
    load: () => import("./kanji"),
  },
  {
    id: "dictionary",
    label: "사전 데이터 (단어 8,400여 개)",
    bytes: 2_943_049,
    load: () => import("./dictionary"),
  },
  {
    id: "kanjivg",
    label: "한자 획순 데이터",
    bytes: 1_915_686,
    // kanjivg.ts가 캐싱하는 Promise를 그대로 데우기 위해 json을 직접 import하지 않고
    // 모듈의 preload 함수를 부른다 (나중에 useStrokes가 같은 Promise를 즉시 받는다).
    load: () => import("./kanjivg").then((m) => m.preloadKanjivg()),
  },
];

export const TOTAL_ASSET_BYTES = ASSET_STEPS.reduce((sum, s) => sum + s.bytes, 0);

// 한 번 받은 애셋은 다시 대문으로 돌아와도 즉시 완료로 표시한다. inflight 맵은
// StrictMode의 이펙트 두 번 실행이나 동시 호출에서 같은 요청이 두 번 나가는 걸 막는다.
const completed = new Set<string>();
const inflight = new Map<string, Promise<unknown>>();

export type AssetStatuses = Record<string, AssetStatus>;

function initialStatuses(): AssetStatuses {
  const statuses: AssetStatuses = {};
  for (const step of ASSET_STEPS) {
    statuses[step.id] = completed.has(step.id) ? "done" : "pending";
  }
  return statuses;
}

/**
 * 애셋을 하나씩 순서대로 받으면서 진행 상황을 알려준다.
 * 한 항목이 실패해도 나머지는 계속 받는다 — 대문에서 앱으로 못 넘어가는 상황을 만들지 않는다.
 */
export async function preloadAssets(
  onProgress: (statuses: AssetStatuses) => void
): Promise<AssetStatuses> {
  const statuses = initialStatuses();
  onProgress({ ...statuses });

  for (const step of ASSET_STEPS) {
    if (statuses[step.id] === "done") continue;

    statuses[step.id] = "loading";
    onProgress({ ...statuses });

    try {
      let pending = inflight.get(step.id);
      if (!pending) {
        pending = step.load();
        inflight.set(step.id, pending);
      }
      await pending;
      completed.add(step.id);
      statuses[step.id] = "done";
    } catch {
      inflight.delete(step.id);
      statuses[step.id] = "error";
    }
    onProgress({ ...statuses });
  }

  return statuses;
}

/**
 * 0~1 사이의 진행률. 실패한 항목도 "끝난 것"으로 세서 바가 중간에 영영 멈춰 있지 않게 한다
 * (실패 사실은 체크리스트에 따로 표시한다).
 */
export function progressRatio(statuses: AssetStatuses): number {
  const doneBytes = ASSET_STEPS.reduce(
    (sum, s) => (statuses[s.id] === "done" || statuses[s.id] === "error" ? sum + s.bytes : sum),
    0
  );
  return doneBytes / TOTAL_ASSET_BYTES;
}
