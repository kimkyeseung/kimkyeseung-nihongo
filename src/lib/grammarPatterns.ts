// 문장에 커리큘럼의 문법 패턴이 들어 있는지 찾는다.
//
// 왜 필요한가: 사전은 **단어**만 안다. 「〜のため」의 ため를 눌러도 나오는 건 為(good,
// advantage...)이고, 정작 배우고 싶은 "~하기 위해서"는 문법 설명이라 사전에 없다. 그 설명은
// 커리큘럼(curriculum.json)이 이미 들고 있으니 문장에서 찾아 붙여준다.
//
// **LLM을 쓰지 않는다.** 어떤 문형인지는 커리큘럼에 적혀 있는 것을 문자열로 대조하면 나오고,
// 모델에게 맡기면 없는 문법을 지어낸다(이 프로젝트의 "정답이 정해진 정보" 규칙).
//
// 전부 순수 함수다 — 조용히 틀리는 종류라(엉뚱한 문법이 그럴듯하게 붙는다) 테스트로 고정한다.

import type { Curriculum, CurriculumLevelId, GrammarPoint } from "../types/curriculum";

export interface GrammarMatch {
  level: CurriculumLevelId;
  point: GrammarPoint;
  /** 문장에서 이 문법이 드러난 자리. 가장 길게 일치한 조각이다. */
  start: number;
  end: number;
}

/**
 * 조각이 이보다 짧으면 쓰지 않는다. 한 글자(〜も·〜の·〜し)는 거의 모든 문장에 있어서
 * 붙여봐야 알려주는 게 없다.
 */
const MIN_FRAGMENT_LENGTH = 2;

/**
 * 문장에 있어도 문법으로 알려주지 않을 조각.
 *
 * 커리큘럼 예문 123개에 돌려보고 정한 목록이다:
 * - `です`·`ます`·`ません`·`ですか` : 정중형이라 거의 모든 문장에 들어 있다. 「〜は〜です」가
 *   매번 1순위로 올라와 정작 그 문장에서 배울 문형(〜たら·〜ても)을 밀어냈다.
 * - `うが` : 「〜うが〜うが」(N1)가 **「ほうがいい」의 일부**에 걸렸다. 문자열 대조라 낱말
 *   경계를 모른다.
 *
 * 이 조각들만 가진 패턴은 문장에서 아예 안 잡힌다 — 그 문형들은 로드맵(/curriculum)에서
 * 배우는 게 맞고, 문장 옆에 매번 띄울 것은 아니다.
 */
const TOO_GENERIC = new Set(["です", "ます", "ません", "ですか", "うが"]);

/** 한 문장에 몇 개까지 보여줄지. 많아야 두세 개고, 넘치면 문장보다 칩이 길어진다. */
export const MAX_GRAMMAR_MATCHES = 3;

/** 한글·라틴 문자가 섞인 조각은 설명이지 일본어가 아니다(예: "동사 て형"의 "동사"). */
const NOT_JAPANESE = /[가-힣A-Za-z]/;

/**
 * 패턴 문자열에서 문장과 대조할 일본어 조각들을 뽑는다.
 *
 * 패턴은 모양이 제각각이다:
 * - `〜たことがあります` — 그대로 쓸 수 있다
 * - `〜ます/〜ません` — `/`로 갈라진 선택지
 * - `形容詞의 과거형 (〜かったです)` — 진짜 형태는 **괄호 안**에 있다
 * - `동사 て형` — 일본어 조각이 없다(설명뿐) → 버린다
 * - `〜は〜です` — `〜`로 갈라지는 여러 조각
 */
export function patternFragments(pattern: string): string[] {
  // 괄호 안이 실제 형태인 경우가 있어 바깥과 안을 모두 후보로 둔다.
  const sources = [pattern.replace(/[(（][^)）]*[)）]/g, " "), ...(pattern.match(/[(（]([^)）]*)[)）]/g) ?? [])];
  const fragments = new Set<string>();

  for (const source of sources) {
    for (const alternative of source.replace(/[(（)）]/g, " ").split("/")) {
      for (const run of alternative.split(/[〜～\s]+/)) {
        const fragment = run.trim();
        if (fragment.length < MIN_FRAGMENT_LENGTH) continue;
        if (NOT_JAPANESE.test(fragment)) continue;
        if (TOO_GENERIC.has(fragment)) continue;
        fragments.add(fragment);
      }
    }
  }

  return [...fragments];
}

/**
 * 문장에 들어 있는 문법 패턴을 **구체적인 것부터** 돌려준다.
 *
 * 긴 조각이 먼저인 이유: 「〜たことがあります」와 「〜ます」가 같이 걸리면 전자가 배울 거리다.
 * 같은 패턴이 여러 번 걸려도 한 번만 넣는다.
 */
export function findGrammarInSentence(
  curriculum: Curriculum,
  text: string,
  limit = MAX_GRAMMAR_MATCHES
): GrammarMatch[] {
  const found: GrammarMatch[] = [];
  const seen = new Set<string>();

  for (const level of curriculum.levels) {
    for (const unit of level.units) {
      for (const point of unit.grammarPoints) {
        if (seen.has(point.pattern)) continue;
        // 한 패턴 안에서도 가장 길게 걸린 조각을 그 패턴의 대표로 삼는다.
        let best: { start: number; end: number } | null = null;
        for (const fragment of patternFragments(point.pattern)) {
          const start = text.indexOf(fragment);
          if (start === -1) continue;
          const end = start + fragment.length;
          if (!best || end - start > best.end - best.start) best = { start, end };
        }
        if (!best) continue;
        seen.add(point.pattern);
        found.push({ level: level.level, point, ...best });
      }
    }
  }

  const ranked = found.sort(
    (a, b) =>
      // 구체적인 것(길게 걸린 것) 먼저, 같으면 문장 앞쪽 먼저,
      b.end - b.start - (a.end - a.start) ||
      a.start - b.start ||
      // 그래도 같으면 더 기본적인(짧은) 패턴을 앞에 — 「〜ても」가 「たとえ〜ても」보다 먼저다.
      a.point.pattern.length - b.point.pattern.length
  );

  // 같은 자리를 가리키는 패턴이 여럿이면 하나만 남긴다(〜ても / たとえ〜ても).
  const bySpan = new Set<string>();
  return ranked
    .filter((m) => {
      const key = `${m.start}-${m.end}`;
      if (bySpan.has(key)) return false;
      bySpan.add(key);
      return true;
    })
    .slice(0, limit);
}

/**
 * 여러 문장(한 답변의 예문들)에서 각 문법 패턴을 **처음 나온 문장에만** 배정한다.
 * 돌려주는 값은 "문장 → 그 문장에서 보여줄 패턴들"이다.
 *
 * 선생님이 `だけ`를 설명하면 예문 다섯 개에 전부 같은 「〜だけ/〜しか〜ない」 칩이 붙었다 —
 * 한 번 펼쳐 보면 충분한 설명이 반복돼서 정작 새 문형이 묻힌다. 두 번째 문장부터는 앞에서
 * 이미 나온 패턴을 빼고, 그 문장에만 있는 것만 남긴다.
 *
 * 문장은 앞뒤 공백을 떼고 비교한다. **글자가 똑같은 문장이 두 번 나오면 둘 다 같은 칩을
 * 받는다** — 화면은 문장 글자로만 이 표를 찾을 수 있어서 몇 번째 등장인지 구분할 수 없다.
 */
export function assignGrammarToFirstSentence(
  curriculum: Curriculum,
  sentences: readonly string[]
): Map<string, Set<string>> {
  const shown = new Set<string>();
  const result = new Map<string, Set<string>>();
  for (const raw of sentences) {
    const sentence = raw.trim();
    if (result.has(sentence)) continue;
    const fresh = new Set<string>();
    for (const m of findGrammarInSentence(curriculum, sentence)) {
      if (shown.has(m.point.pattern)) continue;
      shown.add(m.point.pattern);
      fresh.add(m.point.pattern);
    }
    result.set(sentence, fresh);
  }
  return result;
}
