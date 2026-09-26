import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import ClickableSentence from "./ClickableSentence";
import SentenceActions from "./SentenceActions";
import SentenceGrammar from "./SentenceGrammar";
import { useSentenceDialogs } from "../hooks/useSentenceDialogs";

const HAS_JAPANESE = /[぀-ヿ㐀-䶿一-鿿]/;

/**
 * 백틱 안이 "예문"인가, 본문 속 "낱말"인가. 선생님 프롬프트는 일본어를 전부 백틱으로 감싸게
 * 시키므로 `だけ`처럼 설명 중에 언급만 하는 낱말과 `水だけ飲みます。` 같은 예문이 같은 모양으로
 * 온다. 문장부호로 끝나거나 쉼표가 들었거나 충분히 길면 예문으로 본다.
 */
function isExampleSentence(content: string): boolean {
  const t = content.trim();
  return /[。！？!?]$/.test(t) || t.includes("、") || t.length >= 12;
}

/**
 * 선생님 답변(마크다운)을 렌더링한다. 앱 폰트/색을 그대로 쓰려고 Tailwind 클래스를
 * 요소별로 직접 주고 있다 — typography 플러그인을 새로 들이지 않기 위함.
 *
 * 핵심은 **인라인 코드(`...`) 처리**다: 선생님 프롬프트가 일본어를 전부 백틱으로 감싸게
 * 시키므로, 그 자리를 ClickableSentence로 렌더링해 사전 후리가나·단어 탭·발음/복사 버튼을
 * 그대로 붙일 수 있다(회화 페이지와 같은 장치의 재사용). 백틱 안이 일본어가 아니면
 * (코드나 기호) 평범한 코드 칩으로 둔다. 일본어라도 **예문만** 카드(⋮ 메뉴·문법 칩)로 그리고,
 * 설명 중에 언급만 하는 낱말은 글줄 안에 둔다(`isExampleSentence`).
 *
 * **`isStreaming`일 때는 예문 칩을 글자만 보여준다 (실제로 겪은 버그).** 스트리밍 중에
 * ClickableSentence(그리디 재분절)·SentenceGrammar(패턴 매칭)까지 매 청크마다 다시 돌리면,
 * 백틱이 아직 안 닫혔거나 문형이 반 토막인 상태에서 그리드/칩이 붙었다 떨어졌다 하면서
 * 메시지 목록이 위아래로 흔들렸다 — 단어 상세의 생성 예문과 같은 문제라 같은 방식으로
 * 고쳤다: 확정되지 않은 문장은 후리가나·단어 탭·문법 칩 없이 글자만 둔다.
 */
function MarkdownAnswer({ text, isStreaming = false }: { text: string; isStreaming?: boolean }) {
  const { handlers, dialogs } = useSentenceDialogs();

  return (
    // 한·일이 한 줄에 섞이는 자리라 font-mixed(CLAUDE.md "입력 문자 전환 토글" 절). 첫 블록의
    // 위 여백은 지운다 — 말풍선 안쪽 여백과 겹쳐 답변 첫 줄이 붕 떠 보인다.
    <div className="font-mixed leading-relaxed [&>*:first-child]:mt-0">
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h3 className="mt-5 text-lg font-bold text-primary">{children}</h3>,
          h2: ({ children }) => <h3 className="mt-5 text-lg font-bold text-primary">{children}</h3>,
          // 긴 설명에서 소제목이 본문과 구분이 안 되면 어디까지가 한 덩어리인지 안 보인다 —
          // 왼쪽 막대로 절의 시작을 표시한다.
          h3: ({ children }) => (
            <h4 className="mt-5 border-l-4 border-primary pl-2 font-bold text-gray-800">{children}</h4>
          ),
          h4: ({ children }) => <h5 className="mt-4 font-bold text-gray-700">{children}</h5>,
          p: ({ children }) => <p className="mt-2">{children}</p>,
          ul: ({ children }) => (
            <ul className="mt-2 flex list-disc flex-col gap-2 pl-5 marker:text-primary">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="mt-2 flex list-decimal flex-col gap-2 pl-5 marker:font-bold marker:text-primary">
              {children}
            </ol>
          ),
          li: ({ children }) => <li>{children}</li>,
          strong: ({ children }) => <strong className="font-bold text-gray-900">{children}</strong>,
          em: ({ children }) => <em className="text-sm text-gray-500">{children}</em>,
          hr: () => <hr className="my-4 border-gray-100" />,
          // 모델은 "팁"·"주의"를 인용문으로 쓰곤 한다 — 본문과 다른 상자로 띄워 준다.
          blockquote: ({ children }) => (
            <blockquote className="mt-3 rounded-r-xl border-l-4 border-warning bg-warning/10 px-3 py-2 text-gray-700 [&>*:first-child]:mt-0">
              {children}
            </blockquote>
          ),
          table: ({ children }) => (
            <div className="mt-3 overflow-x-auto rounded-xl border border-gray-100">
              <table className="w-full border-collapse text-sm">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border-b border-gray-100 bg-gray-50 px-2 py-1.5 text-left font-bold whitespace-nowrap">
              {children}
            </th>
          ),
          td: ({ children }) => <td className="border-t border-gray-100 px-2 py-1.5">{children}</td>,
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noreferrer" className="text-info underline">
              {children}
            </a>
          ),
          code: ({ children }) => {
            const content = String(children);
            if (!HAS_JAPANESE.test(content)) {
              return <code className="rounded bg-gray-100 px-1 py-0.5 text-sm">{content}</code>;
            }

            // 본문 속 낱말(`だけ`·`しか`)은 글줄 안에 그대로 둔다. 예전엔 이것까지 예문 칩(⋮ 메뉴 +
            // 문법 칩)으로 그려서, 칩 하나가 두 줄 높이를 먹으며 한국어 문장을 조각조각 끊어 놓았다.
            // 후리가나·단어 탭은 남긴다 — 뜻 다이얼로그에 발음 버튼이 있다.
            if (!isExampleSentence(content)) {
              return (
                <span className="mx-0.5 rounded-md bg-primary/10 px-1 font-ja">
                  {isStreaming ? content : <ClickableSentence text={content} {...handlers} />}
                </span>
              );
            }

            // 예문은 한 줄을 통째로 쓰는 카드다 — 뒤따르는 번역이 그 아래 줄로 떨어져 "일본어 / 뜻"이
            // 위아래로 짝지어 읽힌다. 스트리밍 중과 끝난 뒤의 **모양(블록)을 같게** 둬야 답변이
            // 끝나는 순간 줄이 튀지 않는다.
            if (isStreaming) {
              return (
                <span className="my-1.5 flex rounded-xl bg-gray-50 px-3 py-2 font-ja text-lg">{content}</span>
              );
            }
            return (
              <span className="my-1.5 flex flex-col rounded-xl bg-gray-50 px-3 py-2">
                <span className="flex flex-wrap items-center gap-1">
                  <span className="min-w-0 font-ja text-lg">
                    <ClickableSentence text={content} {...handlers} />
                  </span>
                  {/* 칩 안이라 여백을 따로 주지 않는다(기본값 ml-1은 문장 뒤에 붙는 자리용). */}
                  <SentenceActions text={content} subject="예문" className="" />
                </span>
                <SentenceGrammar text={content} />
              </span>
            );
          },
        }}
      >
        {text}
      </Markdown>

      {dialogs}
    </div>
  );
}

export default MarkdownAnswer;
