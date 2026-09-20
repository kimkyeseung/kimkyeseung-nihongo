import { useCallback } from "react";
import { useLocation } from "react-router-dom";
import { originForPath, wordPath } from "../lib/wordLink";

/**
 * 단어 상세로 가는 `<Link>`/`navigate` 인자를 만든다.
 *
 * **지금 보고 있는 화면을 같이 실어 보내서** 단어 상세의 돌아가기가 제자리로 돌아오게 한다
 * (자세한 이유는 `lib/wordLink.ts` 주석). 부르는 쪽이 자기 위치를 직접 적지 않아도 되므로,
 * 여러 화면에서 쓰이는 다이얼로그(WordMeaningDialog·KanjiDetailSheet 등)도 그대로 쓸 수 있다.
 *
 * ```tsx
 * const wordLink = useWordLink();
 * <Link {...wordLink(word.id)}>…</Link>
 * ```
 */
export function useWordLink() {
  const { pathname } = useLocation();
  return useCallback(
    (id: string) => ({ to: wordPath(id), state: { from: originForPath(pathname) } }),
    [pathname]
  );
}
