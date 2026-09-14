import { use } from "react";

// KanjiVG 표준 캔버스 (scripts/data/README.md 참고)
export const KANJIVG_VIEW_BOX = "0 0 109 109";

type KanjivgData = Record<string, string[]>;

// kanjivg.json은 1.9MB로 커서, 한자 목록을 그리는 데는 필요 없고 획순 애니메이션을 실제로
// 열 때만 필요하다. 정적 import 대신 동적 import로 분리해 KanjiPage 청크와 별도로
// 캐시된 하나의 Promise만 만들고, React의 use()로 최초 호출 시에만 Suspense를 태운다.
let kanjivgPromise: Promise<KanjivgData> | null = null;

function loadKanjivg(): Promise<KanjivgData> {
  kanjivgPromise ??= import("../data/kanjivg.json").then((m) => m.default as KanjivgData);
  return kanjivgPromise;
}

/** 한자의 획순 SVG path(d) 배열을 필순 그대로 반환한다. 데이터 없으면 빈 배열.
 *  최초 호출 시 데이터를 내려받는 동안 Suspense된다 — 호출부를 <Suspense>로 감쌀 것. */
export function useStrokes(kanji: string): string[] {
  const data = use(loadKanjivg());
  return data[kanji] ?? [];
}
