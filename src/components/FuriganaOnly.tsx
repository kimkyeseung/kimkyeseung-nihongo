import { lazy, Suspense } from "react";

// ClickableSentence는 사전(7.7MB)을 정적으로 끌어온다 — 레벨 진단 페이지는 사전을 동적 import로 받으므로
// (인사 화면이 사전을 기다리지 않게) 여기서도 늦게 불러온다. 같은 사전 청크라 두 번 받지 않는다.
const ClickableSentence = lazy(() => import("./ClickableSentence"));

const HAS_KANJI = /[㐀-鿿々]/;

/**
 * **누를 수 없는** 후리가나 문장. 레벨 진단·단원 점검의 문제·보기에 쓴다 — 단어를 눌러 뜻을 보면 진단이
 * 안 되지만, 한자를 못 읽어서 문법·어휘 문제를 틀리면 그 영역 급수가 한자 실력만큼 깎인다(한자는 한자
 * 영역이 따로 잰다). 분절·읽기는 `ClickableSentence`(= `sentenceWords`) 그대로다 — 후리가나 전용 경로를
 * 따로 만들지 않는다(CLAUDE.md "회화 페이지" 절). 사전을 받는 동안·한자가 없으면 원문 그대로다.
 */
function FuriganaOnly({ text }: { text: string }) {
  if (!HAS_KANJI.test(text)) return <>{text}</>;
  return (
    <Suspense fallback={text}>
      <ClickableSentence text={text} />
    </Suspense>
  );
}

export default FuriganaOnly;
