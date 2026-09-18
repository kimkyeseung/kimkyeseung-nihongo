import { isJapanese, toKana } from "wanakana";

/**
 * 로마자 → 히라가나 변환을 **직접 친 구간에만** 적용한다.
 *
 * **왜 wanakana의 `bind()`를 그대로 쓰지 않는가 (실제로 겪은 버그)**: `bind()`의 변환 범위는
 * "커서에서 뒤로 걸으며 만나는 일본어가 아닌 글자 전부"다(`workBackwards`). 멈추는 건 가나·한자
 * 뿐이라 **영문·숫자·공백은 경계가 되지 못한다.** 그래서 `hello world`가 들어있는 입력창을
 * 일본어 모드로 바꾸고 한 글자만 쳐도 앞 문장이 통째로 `へlぉ をrlだ`가 됐다.
 *
 * 입력 모드를 바꿀 수 있는 입력창에서는 "모드를 켜기 전에 있던 글자"가 변환 대상이 아니다.
 * 그래서 `floor`(그 시점의 길이)를 바닥으로 두고 그 뒤만 변환한다.
 *
 * 로마자 표는 손대지 않는다 — 변환 자체는 wanakana의 `toKana`가 하고(IME 모드라 아직 덜 친
 * `s` 같은 꼬리는 그대로 남는다), 여기서 정하는 건 **어디부터 어디까지 넘길지**뿐이다.
 */
export interface RomajiConversion {
  value: string;
  /** 변환 후 커서를 둘 위치 */
  cursor: number;
}

/**
 * @param value  입력창의 현재 값
 * @param cursor 현재 커서 위치(selectionEnd)
 * @param floor  이 위치보다 앞은 건드리지 않는다 (일본어 모드로 바꾼 시점의 길이)
 * @returns 바뀔 게 없으면 null — 호출부가 DOM을 건드리지 않도록.
 */
export function convertTypedRomaji(
  value: string,
  cursor: number,
  floor: number
): RomajiConversion | null {
  const safeFloor = Math.max(0, Math.min(floor, value.length));
  const safeCursor = Math.max(0, Math.min(cursor, value.length));
  // 커서가 보호 구간 안에 있으면(옛 글자를 고치는 중이면) 변환하지 않는다.
  if (safeCursor <= safeFloor) return null;

  // 커서 바로 앞부터 뒤로 걸으며 로마자 구간을 찾는다. 가나·한자를 만나거나 바닥에 닿으면 멈춘다.
  let start = safeCursor;
  while (start > safeFloor && !isJapanese(value[start - 1])) start -= 1;

  const segment = value.slice(start, safeCursor);
  if (!segment) return null;

  const converted = toKana(segment, { IMEMode: "toHiragana" });
  if (converted === segment) return null;

  return {
    value: value.slice(0, start) + converted + value.slice(safeCursor),
    cursor: start + converted.length,
  };
}
