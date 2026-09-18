import { useCallback, useEffect, useRef, useState } from "react";
import { convertTypedRomaji } from "../lib/romajiInput";

/**
 * 입력창이 지금 어떤 문자를 받는 중인지.
 *
 * 한글과 영어를 나누지 않는 이유: **한/영 전환은 OS 입력기가 이미 하는 일**이라 앱이 버튼으로
 * 흉내 낼 게 없다(웹은 OS 입력기를 바꿀 수 없다). 앱이 실제로 바꿀 수 있는 건 "로마자를
 * 히라가나로 바꿔줄까 말까"뿐이라, 모드도 그 둘로만 나눈다.
 */
export type InputScript = "default" | "ja";

/**
 * 입력창의 문자 모드를 바꿔주는 훅 (선생님 질문창, 회화 이름칸).
 *
 * **"ja"일 때만 실제로 하는 일이 있다** — 친 로마자를 히라가나로 바꾼다(`convertTypedRomaji`).
 * "default"는 아무것도 하지 않고 OS 입력기에 맡긴다(한글이든 영문이든 한/영 키로 친다).
 *
 * wanakana의 `bind()`를 쓰지 않고 변환 범위를 직접 정하는 이유는 `romajiInput.ts`에 적어뒀다 —
 * 요약하면 bind()는 커서 앞의 **영문까지 변환 대상에 넣어서** 이미 쳐둔 문장을 망가뜨린다.
 *
 * **이 훅을 쓰는 input은 React가 값을 관리하지 않는다(uncontrolled).** 변환이 값을 바꾼 뒤
 * 발생시키는 input 이벤트를 React의 합성 onChange가 간헐적으로 놓치기 때문이다
 * (CLAUDE.md의 "WanaKana + React 통합 주의사항" — 콘솔 에러 없이 조용히 상태가 안 바뀐다).
 * 그래서 호출부는 `value`/`onChange` prop을 주지 말고 `ref`만 넘기고, 값은 이 훅이
 * 네이티브 리스너로 읽어 `onValueChange`로 올려준다.
 *
 * @param value 바깥(store)이 들고 있는 값. 전송 후 비우기처럼 **바깥에서 바뀐 경우**를
 *              DOM에 되돌려 넣는 데 쓴다.
 */
export function useScriptInput<T extends HTMLInputElement | HTMLTextAreaElement>(
  script: InputScript,
  value: string,
  onValueChange: (next: string) => void,
  /** 입력창에 포커스가 있을 때 Tab으로 모드를 바꾼다. 없으면 Tab은 평소대로 동작한다. */
  onToggleScript?: () => void
) {
  // 일반 useRef가 아니라 콜백 ref + state를 쓰는 이유는 useJapaneseInput과 같다: 이 훅을 쓰는
  // 페이지는 "확인 중" 화면처럼 input이 없는 상태로 먼저 마운트됐다가 나중에 조건부로
  // 엘리먼트가 나타난다. 일반 ref였다면 최초 마운트 때 한 번 돌고 끝나 바인딩이 안 붙는다.
  const [el, setEl] = useState<T | null>(null);
  const valueRef = useRef(value);
  /** 일본어 모드로 바꾼 시점의 길이. 이 앞은 변환하지 않는다(romajiInput.ts 참고). */
  const committedRef = useRef(0);
  const onValueChangeRef = useRef(onValueChange);
  const onToggleScriptRef = useRef(onToggleScript);

  // 렌더 중에 ref를 건드리지 않으려고 effect에서 최신 콜백으로 갈아끼운다.
  // (ref로 들고 있어야 콜백이 바뀔 때마다 wanakana를 다시 바인딩하지 않는다.)
  useEffect(() => {
    onValueChangeRef.current = onValueChange;
    onToggleScriptRef.current = onToggleScript;
  });

  // 바깥에서 값이 바뀐 경우를 DOM에 반영한다(질문 전송 후 비우기, 저장해둔 이름 복원 등).
  // React가 value를 관리하지 않으므로 이걸 안 하면 보낸 뒤에도 입력창에 글이 남는다.
  useEffect(() => {
    valueRef.current = value;
    if (el && el.value !== value) el.value = value;
  }, [el, value]);

  useEffect(() => {
    if (!el) return;
    // 엘리먼트가 뒤늦게 나타났거나 모드를 바꾼 직후라면 지금 값을 다시 넣어준다.
    if (el.value !== valueRef.current) el.value = valueRef.current;

    const japanese = script === "ja";

    // **모드를 켜기 전에 있던 글자는 변환 대상이 아니다.** 여기가 그 경계(바닥)다 —
    // 이게 없으면 `hello world`가 들어있는 칸에서 한 글자만 쳐도 앞 문장이 통째로
    // `へlぉ をrlだ`가 된다(romajiInput.ts 주석 참고).
    committedRef.current = japanese ? el.value.length : 0;

    // 기본 모드에서는 lang을 아예 지운다 — 한글일지 영문일지 앱이 모르는데 둘 중 하나로 찍으면
    // 모바일 키보드에 틀린 힌트를 주게 된다. 나머지 셋은 로마자를 치는 동안 모바일 키보드가
    // 첫 글자를 대문자로 바꾸거나 자동수정/맞춤법검사로 건드리지 않게 하는 것이다.
    if (japanese) {
      el.lang = "ja";
      el.setAttribute("autocapitalize", "none");
      el.setAttribute("autocorrect", "off");
      el.setAttribute("spellcheck", "false");
    } else {
      el.removeAttribute("lang");
      el.removeAttribute("autocapitalize");
      el.removeAttribute("autocorrect");
      el.removeAttribute("spellcheck");
    }

    const handleInput = (event: Event) => {
      // 조합(IME) 중에는 건드리지 않는다 — 한글을 조합하는 중간 상태를 로마자로 오인해 변환하면
      // 글자가 깨진다.
      if (japanese && !(event as InputEvent).isComposing) {
        // 지우다가 바닥보다 짧아졌으면 바닥도 같이 내려온다.
        committedRef.current = Math.min(committedRef.current, el.value.length);
        const converted = convertTypedRomaji(
          el.value,
          el.selectionEnd ?? el.value.length,
          committedRef.current
        );
        if (converted) {
          el.value = converted.value;
          el.setSelectionRange(converted.cursor, converted.cursor);
        }
      }
      valueRef.current = el.value;
      onValueChangeRef.current(el.value);
    };
    el.addEventListener("input", handleInput);

    /**
     * Tab으로 모드 전환.
     *
     * **Shift+Tab은 일부러 그대로 둔다** — Tab은 원래 포커스를 옮기는 키라, 둘 다 먹어버리면
     * 키보드만 쓰는 사용자가 이 입력창에 갇힌다. 뒤로 나갈 길 하나는 남겨야 한다.
     * 조합(IME) 중에는 Tab이 입력기 몫이므로 건드리지 않는다.
     */
    // 제네릭 엘리먼트라 addEventListener의 이벤트별 오버로드가 안 잡혀서 Event로 받고 좁힌다.
    const handleKeyDown = (event: Event) => {
      const e = event as KeyboardEvent;
      if (e.key !== "Tab" || e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.isComposing) return;
      if (!onToggleScriptRef.current) return;
      e.preventDefault();
      onToggleScriptRef.current();
    };
    el.addEventListener("keydown", handleKeyDown);

    return () => {
      el.removeEventListener("input", handleInput);
      el.removeEventListener("keydown", handleKeyDown);
    };
  }, [el, script]);

  /** 자동완성에서 단어를 고른 뒤처럼, 호출부가 포커스를 되돌려야 할 때 쓴다. */
  const focus = useCallback(() => el?.focus(), [el]);

  // `lang`은 위 effect가 직접 넣는다 — prop으로 주면 안 된다(주석 참고).
  return {
    /** input/textarea에 그대로 넘긴다. `value`·`onChange`는 주지 말 것(위 주석 참고). */
    ref: setEl,
    focus,
    /**
     * 실제 엘리먼트. 아직 안 붙었으면 null이다.
     * "엘리먼트가 나타나는 시점"에 무언가 해야 할 때 effect 의존성으로 쓴다 — 조건부로
     * 렌더되는 입력창은 붙는 시점이 렌더 한 박자 뒤라 `focus()`만으로는 놓친다.
     */
    el,
  };
}
