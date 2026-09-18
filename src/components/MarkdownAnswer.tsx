import { useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import ClickableSentence from "./ClickableSentence";
import CopyButton from "./CopyButton";
import KanjiDetailSheet from "./KanjiDetailSheet";
import SpeakButton from "./SpeakButton";
import WordMeaningDialog from "./WordMeaningDialog";
import type { WordEntry } from "../types/dictionary";
import type { KanjiEntry } from "../types/kanji";

const HAS_JAPANESE = /[぀-ヿ㐀-䶿一-鿿]/;

/**
 * 선생님 답변(마크다운)을 렌더링한다. 앱 폰트/색을 그대로 쓰려고 Tailwind 클래스를
 * 요소별로 직접 주고 있다 — typography 플러그인을 새로 들이지 않기 위함.
 *
 * 핵심은 **인라인 코드(`...`) 처리**다: 선생님 프롬프트가 일본어를 전부 백틱으로 감싸게
 * 시키므로, 그 자리를 ClickableSentence로 렌더링해 사전 후리가나·단어 탭·발음/복사 버튼을
 * 그대로 붙일 수 있다(회화 페이지와 같은 장치의 재사용). 백틱 안이 일본어가 아니면
 * (코드나 기호) 평범한 코드 칩으로 둔다.
 */
function MarkdownAnswer({ text }: { text: string }) {
  const [selectedWord, setSelectedWord] = useState<WordEntry | null>(null);
  const [selectedKanji, setSelectedKanji] = useState<KanjiEntry | null>(null);

  return (
    <>
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h3 className="mt-4 text-lg font-bold text-primary">{children}</h3>,
          h2: ({ children }) => <h3 className="mt-4 text-lg font-bold text-primary">{children}</h3>,
          h3: ({ children }) => <h4 className="mt-3 font-bold text-gray-700">{children}</h4>,
          p: ({ children }) => <p className="mt-2 leading-relaxed">{children}</p>,
          ul: ({ children }) => <ul className="mt-2 flex list-disc flex-col gap-2 pl-5">{children}</ul>,
          ol: ({ children }) => <ol className="mt-2 flex list-decimal flex-col gap-2 pl-5">{children}</ol>,
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          strong: ({ children }) => <strong className="font-bold text-gray-900">{children}</strong>,
          em: ({ children }) => <em className="text-sm text-gray-500">{children}</em>,
          hr: () => <hr className="my-4 border-gray-100" />,
          blockquote: ({ children }) => (
            <blockquote className="mt-2 border-l-4 border-primary/30 pl-3 text-gray-600">
              {children}
            </blockquote>
          ),
          table: ({ children }) => (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full border-collapse text-sm">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border border-gray-100 bg-gray-50 px-2 py-1 text-left font-bold">{children}</th>
          ),
          td: ({ children }) => <td className="border border-gray-100 px-2 py-1">{children}</td>,
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
            return (
              <span className="my-0.5 inline-flex flex-wrap items-center gap-1 rounded-xl bg-gray-50 px-2 py-1 align-middle">
                <span className="font-ja text-lg">
                  <ClickableSentence
                    text={content}
                    onWordClick={setSelectedWord}
                    onKanjiClick={setSelectedKanji}
                  />
                </span>
                <SpeakButton text={content} label="예문 발음 듣기" />
                <CopyButton text={content} label="예문 복사" />
              </span>
            );
          },
        }}
      >
        {text}
      </Markdown>

      <WordMeaningDialog word={selectedWord} onClose={() => setSelectedWord(null)} />
      <KanjiDetailSheet entry={selectedKanji} onClose={() => setSelectedKanji(null)} />
    </>
  );
}

export default MarkdownAnswer;
