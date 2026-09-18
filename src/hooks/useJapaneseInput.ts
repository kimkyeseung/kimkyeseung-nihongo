import { useCallback, useEffect, useRef, useState } from "react";
import { bind, unbind } from "wanakana";
import { useWordSuggestions } from "./useWordSuggestions";

export function useJapaneseInput<T extends HTMLInputElement | HTMLTextAreaElement>(
  maxSuggestions = 8,
  /** 쓰다 만 문장을 store에 보관했다가 되돌려 넣을 때 쓴다(작문 페이지). */
  initialValue = ""
) {
  // 일반 useRef가 아니라 콜백 ref(+ state)를 쓴다: 이 훅을 쓰는 페이지들(회화/작문)은
  // "지원 여부 확인 중" 화면이나 시나리오 선택 화면처럼 input/textarea가 없는 상태로 먼저
  // 마운트되었다가, 같은 컴포넌트 인스턴스 안에서 조건부 렌더링으로 나중에야 엘리먼트가
  // 나타난다. 일반 useRef + `useEffect(..., [])`였다면 엘리먼트가 아직 없던 최초 마운트
  // 시점에 한 번만 실행되고 끝나 wanakana 바인딩이 영영 안 붙는 버그가 났다 — 엘리먼트가
  // 실제로 나타날 때마다 effect가 다시 돌도록 콜백 ref로 그 시점을 state에 반영한다.
  const [el, setEl] = useState<T | null>(null);
  const [value, setValueState] = useState(initialValue);
  // 엘리먼트가 (뒤늦게) 나타날 때 지금 값을 다시 넣어주기 위한 최신값 보관 — effect 의존성에
  // value를 넣으면 타이핑할 때마다 wanakana를 다시 바인딩하게 되므로 ref로 읽는다.
  const valueRef = useRef(initialValue);

  const setValue = useCallback(
    (next: string) => {
      valueRef.current = next;
      setValueState(next);
      if (el) el.value = next;
    },
    [el]
  );

  const applySuggestion = useCallback(
    (next: string) => {
      setValue(next);
      el?.focus();
    },
    [setValue, el]
  );

  // 자동완성은 선생님 페이지와 같은 훅을 쓴다 — 한쪽만 고쳐 동작이 갈리지 않도록.
  const {
    suggestions,
    showSuggestions,
    setShowSuggestions,
    activeIndex,
    setActiveIndex,
    selectSuggestion,
    handleSuggestionKeyDown,
  } = useWordSuggestions(value, applySuggestion, { maxSuggestions });

  // 로마자 입력 시 실시간으로 히라가나로 변환한다. WanaKana가 값을 직접 바꾼 뒤 발생시키는
  // input 이벤트를 React의 합성 onChange가 놓치는 경우가 있어(IME 조합 관련 내부 처리 때문),
  // 네이티브 리스너를 직접 붙여 e.target.value를 읽는 방식으로 우회한다
  // (DictionaryPage에서 확인된 패턴, CLAUDE.md 참고 — 이 프로젝트의 wanakana 입력 표준).
  //
  // 여기는 **항상 일본어만 치는 입력창**이라 wanakana의 bind()를 그대로 쓴다. 한글/영문과
  // 모드를 오가는 입력창(선생님·회화 이름칸)은 bind()를 쓰면 앞 문장이 통째로 변환되므로
  // useScriptInput + romajiInput.ts 쪽을 쓴다 — 그쪽 주석 참고.
  useEffect(() => {
    if (!el) return;
    // 페이지를 떠났다 돌아오면 엘리먼트는 비어 있고 값은 store에서 온 initialValue에 있다.
    if (valueRef.current && el.value !== valueRef.current) el.value = valueRef.current;
    bind(el, { IMEMode: "toHiragana" });
    const handleInput = () => {
      valueRef.current = el.value;
      setValueState(el.value);
      setShowSuggestions(true);
      setActiveIndex(-1);
    };
    el.addEventListener("input", handleInput);
    return () => {
      unbind(el);
      el.removeEventListener("input", handleInput);
    };
  }, [el, setShowSuggestions, setActiveIndex]);

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
