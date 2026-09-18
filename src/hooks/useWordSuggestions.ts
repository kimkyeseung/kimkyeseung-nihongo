import { useCallback, useMemo, useState } from "react";
import type { KeyboardEvent } from "react";
import { searchDictionary } from "../lib/dictionary";
import { useDebouncedValue } from "./useDebouncedValue";
import type { WordEntry } from "../types/dictionary";

/**
 * 커서 위치가 아니라 항상 문자열 끝에서부터, 마지막 공백/줄바꿈 다음의 "현재 입력 중인
 * 단어"만 자동완성 대상으로 삼는다. 회화/작문/선생님 모두 이어서 타이핑하는 흐름이라 이걸로
 * 충분하고, 문장 중간 편집까지는 지원하지 않는다.
 */
function currentToken(value: string): string {
  const boundary = Math.max(value.lastIndexOf(" "), value.lastIndexOf("\n"));
  return value.slice(boundary + 1);
}

/**
 * 지금 치고 있는 일본어 단어의 사전 자동완성.
 *
 * `useJapaneseInput`(회화·작문)과 `TeacherPage`(useScriptInput)가 같이 쓴다 — 입력창에 값을
 * 넣는 방식은 서로 다르지만(항상 wanakana vs 모드에 따라) "지금 치는 단어로 사전을 찾아
 * 골라 넣는다"는 부분은 같아서 여기로 모았다. 한쪽만 고쳐 동작이 갈리지 않게 할 것.
 *
 * @param value       입력창의 현재 값
 * @param applyValue  고른 단어를 반영하는 방법. DOM에 넣고 포커스를 되돌리는 건 호출부 몫이다
 *                    (입력창 구현이 훅마다 다르기 때문).
 * @param enabled     false면 검색하지 않는다 — 한글 모드에서 사전을 뒤질 이유가 없다.
 */
export function useWordSuggestions(
  value: string,
  applyValue: (next: string) => void,
  { enabled = true, maxSuggestions = 8 }: { enabled?: boolean; maxSuggestions?: number } = {}
) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const debouncedToken = useDebouncedValue(currentToken(value), 200);
  const suggestions = useMemo(
    () => (enabled ? searchDictionary(debouncedToken, maxSuggestions) : []),
    [enabled, debouncedToken, maxSuggestions]
  );

  const selectSuggestion = useCallback(
    (entry: WordEntry) => {
      const boundary = Math.max(value.lastIndexOf(" "), value.lastIndexOf("\n"));
      applyValue(`${value.slice(0, boundary + 1)}${entry.word} `);
      setShowSuggestions(false);
      setActiveIndex(-1);
    },
    [value, applyValue]
  );

  /**
   * 화살표/Enter/Escape를 제안 목록 탐색에 먼저 소비한다. 처리했으면 true를 반환하므로,
   * 호출부는 false일 때만 자기 자신의 Enter 동작(메시지 전송 등)을 이어서 실행하면 된다.
   */
  const handleSuggestionKeyDown = useCallback(
    <T extends HTMLElement>(e: KeyboardEvent<T>): boolean => {
      if (!showSuggestions || suggestions.length === 0) return false;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % suggestions.length);
        return true;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
        return true;
      }
      if (e.key === "Escape") {
        setShowSuggestions(false);
        return true;
      }
      if (e.key === "Enter" && activeIndex >= 0 && suggestions[activeIndex]) {
        e.preventDefault();
        selectSuggestion(suggestions[activeIndex]);
        return true;
      }
      return false;
    },
    [showSuggestions, suggestions, activeIndex, selectSuggestion]
  );

  return {
    suggestions,
    showSuggestions,
    setShowSuggestions,
    activeIndex,
    setActiveIndex,
    selectSuggestion,
    handleSuggestionKeyDown,
  };
}
