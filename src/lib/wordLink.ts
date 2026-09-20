/**
 * 단어 상세(`/word/:id`)로 가는 링크와, 그 화면의 "돌아가기"를 한곳에서 만든다.
 *
 * **단어 상세는 사전의 하위 화면이 아니다** — 단어장·회화·선생님·한자·오십음도에서도 들어온다.
 * 예전에는 주소가 `/dictionary/:id`였고 돌아가기 문구가 "← 사전으로"로 **박혀 있어서**,
 * 단어장에서 들어온 사람이 그걸 누르면 단어장이 아니라 사전 검색 화면으로 떨어졌다(콘솔은
 * 조용하다 — 눌러본 사람만 엉뚱한 데로 간다). 그래서 링크를 만들 때 **누른 자리를 같이 실어
 * 보내고**(`state.from`), 돌아가기는 그걸 읽는다.
 *
 * 링크 쪽은 `useWordLink()` 훅을 쓴다 — 부르는 화면이 자기 위치를 직접 적지 않아도 되도록.
 */

/** 단어 상세에서 돌아갈 곳. `to`는 실제 경로, `label`은 조사 없는 이름("단어장"). */
export type WordOrigin = { to: string; label: string };

/** 새로고침·북마크로 단어 상세에 바로 들어와 출처를 모를 때. */
const DEFAULT_ORIGIN: WordOrigin = { to: "/dictionary", label: "사전" };

/**
 * 경로 앞부분 → 화면 이름. **위에서부터 먼저 걸리는 것을 쓰므로 `/word/`가 맨 앞이어야 한다**
 * (단어 상세에서 문장 속 단어를 눌러 또 다른 단어로 갈 수 있다).
 */
const ORIGIN_LABELS: ReadonlyArray<readonly [string, string]> = [
  ["/word/", "이전 단어"],
  ["/dictionary", "사전"],
  ["/wordbook", "단어장"],
  ["/kanji", "한자"],
  ["/gojuon", "오십음도"],
  ["/conversation", "회화"],
  ["/writing", "작문"],
  ["/teacher", "선생님"],
  ["/curriculum", "학습 로드맵"],
  ["/memory", "선생님의 기억"],
];

export function wordPath(id: string): string {
  return `/word/${id}`;
}

/** 이 경로에서 단어를 눌렀다 — 어디로 돌아가야 하는가. 모르는 경로면 사전으로 보낸다. */
export function originForPath(pathname: string): WordOrigin {
  const found = ORIGIN_LABELS.find(([prefix]) => pathname.startsWith(prefix));
  return found ? { to: pathname, label: found[1] } : DEFAULT_ORIGIN;
}

/**
 * `history.state`에 실어 보낸 출처를 되읽는다. 새로고침하면 state가 없어지고, 주소만 복사해
 * 연 경우에도 없다 — 그때는 사전으로 보낸다(아무 데도 못 가는 것보다 낫다).
 */
export function originFromState(state: unknown): WordOrigin {
  if (!state || typeof state !== "object" || !("from" in state)) return DEFAULT_ORIGIN;
  const from = (state as { from: unknown }).from;
  if (!from || typeof from !== "object") return DEFAULT_ORIGIN;
  const { to, label } = from as Partial<WordOrigin>;
  if (typeof to !== "string" || typeof label !== "string") return DEFAULT_ORIGIN;
  return { to, label };
}

/**
 * 사전 탭이 기억할 자리를 정한다 — `null`을 돌려주면 **지금 값을 그대로 둔다**는 뜻이고,
 * `{ lastWordId }`면 그 값으로 바꾼다(`lastWordId: null`은 "목록이 내 자리").
 *
 * **사전에서 들어간 단어만 기억한다.** 단어장·회화·선생님에서 연 단어까지 기억하면, 거기서
 * 단어를 하나 열어본 것만으로 사전 탭의 자리가 바뀌어 버린다. 그 화면들은 자기 탭이 따로
 * 있으니 사전 탭이 대신 기억해줄 이유가 없다.
 *
 * 단어 → 단어로 이어 간 경우(문장 속 단어를 탭)는 **앞 단어가 사전 탭의 자리였을 때만**
 * 이어받는다. 그래야 "사전 → 単語A → 単語B"는 B를 기억하고, "단어장 → 単語A → 単語B"는
 * 사전 탭을 건드리지 않는다.
 *
 * 여기가 틀려도 콘솔은 조용하다 — 탭을 눌렀을 때 엉뚱한 단어가 나오거나, 보던 단어가 그냥
 * 사라질 뿐이다. `wordLink.test.ts`가 고정한다.
 */
export function planDictionaryTabMemory(
  pathname: string,
  /** 그 화면에 들어올 때 실려온 출처(`originFromState(...).to`) */
  originTo: string,
  /** 지금 기억하고 있는 값 */
  lastWordId: string | null
): { lastWordId: string | null } | null {
  // 검색 목록에 도착했으면 거기가 내 자리다.
  if (pathname === "/dictionary") return { lastWordId: null };
  if (!pathname.startsWith("/word/")) return null;

  const id = pathname.slice("/word/".length);
  // state가 없는 경우(새로고침·주소 직접 열기·옛 주소 리다이렉트)도 사전으로 친다 —
  // 돌아가기 폴백과 같은 판단이고, 그 단어가 속할 다른 탭이 없다.
  if (originTo === "/dictionary" || originTo.startsWith("/dictionary/")) return { lastWordId: id };
  if (originTo.startsWith("/word/") && lastWordId === originTo.slice("/word/".length)) {
    return { lastWordId: id };
  }
  return null;
}

/**
 * "← 단어장으로" / "← 한자로"처럼 조사까지 맞춰 만든다.
 *
 * 받침이 없거나 ㄹ 받침이면 "로", 나머지는 "으로"다. 이름을 늘릴 때 "한자으로" 같은 게
 * 조용히 화면에 나가지 않도록 코드가 정한다(프롬프트로 시키지 않는 것과 같은 이유).
 */
export function backLabel(origin: WordOrigin): string {
  return `← ${origin.label}${needsEuLo(origin.label) ? "으로" : "로"}`;
}

function needsEuLo(label: string): boolean {
  const offset = label.charCodeAt(label.length - 1) - 0xac00;
  // 한글 음절이 아니면(영문·숫자·기호) 받침을 따질 수 없으니 그냥 "로"로 둔다.
  if (offset < 0 || offset > 11171) return false;
  const finalConsonant = offset % 28;
  return finalConsonant !== 0 && finalConsonant !== 8; // 0 = 받침 없음, 8 = ㄹ
}
