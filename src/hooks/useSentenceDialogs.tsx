import { useMemo, useState } from "react";
import KanjiDetailSheet from "../components/KanjiDetailSheet";
import WordMeaningDialog from "../components/WordMeaningDialog";
import type { WordEntry } from "../types/dictionary";
import type { KanjiEntry } from "../types/kanji";

/**
 * `ClickableSentence`에 딸려오는 **두 다이얼로그(단어 뜻 · 한자 상세)의 배선**을 한 곳에 모은다.
 *
 * 왜 하나로 모았나: 문장을 보여주는 화면마다 state 두 개와 다이얼로그 두 개를 각자 복붙하고
 * 있었다(회화 말풍선·선생님 답변의 예문 칩·단어 상세의 생성 예문·단어장의 담아둔 문장 — 네
 * 곳). **`SentenceActions`를 뽑았던 것과 똑같은 이유다** — 한 자리에만 한자 다이얼로그를 안
 * 붙여도 콘솔은 조용하고, 사용자가 눌러봐야 "여긴 왜 안 열리지"가 된다.
 *
 * 쓰는 법:
 * ```tsx
 * const { handlers, dialogs } = useSentenceDialogs();
 * <ClickableSentence text={text} {...handlers} />
 * {dialogs}
 * ```
 * 문장이 여러 개인 화면에서도 훅은 **하나만** 쓴다 — 한 번에 하나만 열리므로 state도 하나면
 * 되고, `dialogs`는 그 화면의 맨 끝에 한 번만 그린다.
 */
export function useSentenceDialogs() {
  const [word, setWord] = useState<WordEntry | null>(null);
  const [kanji, setKanji] = useState<KanjiEntry | null>(null);

  // setState 함수는 참조가 고정이라 이 객체도 한 번만 만들면 된다(ClickableSentence에 그대로
  // 펼쳐 넣는 값이므로, 매번 새로 만들면 문장마다 쓸데없이 다시 렌더된다).
  const handlers = useMemo(() => ({ onWordClick: setWord, onKanjiClick: setKanji }), []);

  const dialogs = (
    <>
      <WordMeaningDialog word={word} onClose={() => setWord(null)} />
      <KanjiDetailSheet entry={kanji} onClose={() => setKanji(null)} />
    </>
  );

  return { handlers, dialogs };
}
