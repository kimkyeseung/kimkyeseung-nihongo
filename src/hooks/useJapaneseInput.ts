import { useCallback, useEffect, useMemo, useState } from "react";
import type { KeyboardEvent } from "react";
import { bind, unbind } from "wanakana";
import { searchDictionary } from "../lib/dictionary";
import { useDebouncedValue } from "./useDebouncedValue";
import type { WordEntry } from "../types/dictionary";

// 커서 위치가 아니라 항상 문자열 끝에서부터, 마지막 공백/줄바꿈 다음의 "현재 입력 중인
// 단어"만 자동완성 대상으로 삼는다. 회화/작문은 이어서 타이핑하는 흐름이라 이걸로 충분하고,
// 문장 중간 편집까지는 지원하지 않는다.
function currentToken(value: string): string {
  const boundary = Math.max(value.lastIndexOf(" "), value.lastIndexOf("\n"));
  return value.slice(boundary + 1);
}

export function useJapaneseInput<T extends HTMLInputElement | HTMLTextAreaElement>(
  maxSuggestions = 8
) {
  // 일반 useRef가 아니라 콜백 ref(+ state)를 쓴다: 이 훅을 쓰는 페이지들(회화/작문)은
  // "지원 여부 확인 중" 화면이나 시나리오 선택 화면처럼 input/textarea가 없는 상태로 먼저
  // 마운트되었다가, 같은 컴포넌트 인스턴스 안에서 조건부 렌더링으로 나중에야 엘리먼트가
  // 나타난다. 일반 useRef + `useEffect(..., [])`였다면 엘리먼트가 아직 없던 최초 마운트
  // 시점에 한 번만 실행되고 끝나 wanakana 바인딩이 영영 안 붙는 버그가 났다 — 엘리먼트가
  // 실제로 나타날 때마다 effect가 다시 돌도록 콜백 ref로 그 시점을 state에 반영한다.
  const [el, setEl] = useState<T | null>(null);
  const [value, setValueState] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  // 로마자 입력 시 실시간으로 히라가나로 변환한다. WanaKana가 값을 직접 바꾼 뒤 발생시키는
  // input 이벤트를 React의 합성 onChange가 놓치는 경우가 있어(IME 조합 관련 내부 처리 때문),
  // 네이티브 리스너를 직접 붙여 e.target.value를 읽는 방식으로 우회한다
  // (DictionaryPage에서 확인된 패턴, CLAUDE.md 참고 — 이 프로젝트의 wanakana 입력 표준).
  useEffect(() => {
    if (!el) return;
    bind(el, { IMEMode: "toHiragana" });
    const handleInput = () => {
      setValueState(el.value);
      setShowSuggestions(true);
      setActiveIndex(-1);
    };
    el.addEventListener("input", handleInput);
    return () => {
      unbind(el);
      el.removeEventListener("input", handleInput);
    };
  }, [el]);

  const debouncedToken = useDebouncedValue(currentToken(value), 200);
  const suggestions = useMemo(
    () => searchDictionary(debouncedToken, maxSuggestions),
    [debouncedToken, maxSuggestions]
  );

  const setValue = useCallback(
    (next: string) => {
      setValueState(next);
      if (el) el.value = next;
    },
    [el]
  );

  const selectSuggestion = useCallback(
    (entry: WordEntry) => {
      const boundary = Math.max(value.lastIndexOf(" "), value.lastIndexOf("\n"));
      setValue(`${value.slice(0, boundary + 1)}${entry.word} `);
      setShowSuggestions(false);
      setActiveIndex(-1);
      el?.focus();
    },
    [value, setValue, el]
  );

  // 화살표/Enter/Escape를 제안 목록 탐색에 먼저 소비한다. 처리했으면 true를 반환하므로,
  // 호출부는 false일 때만 자기 자신의 Enter 동작(메시지 전송 등)을 이어서 실행하면 된다.
  const handleSuggestionKeyDown = useCallback(
    (e: KeyboardEvent<T>): boolean => {
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
    ref: setEl,
    value,
    setValue,
    suggestions,
    showSuggestions,
    setShowSuggestions,
    activeIndex,
    selectSuggestion,
    handleSuggestionKeyDown,
  };
}
