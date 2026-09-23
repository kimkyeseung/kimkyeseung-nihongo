import { AnimatePresence, motion } from "framer-motion";
import { Link } from "react-router-dom";
import SpeakButton from "./SpeakButton";
import { getKanaWords } from "../lib/kanaWords";
import { useWordLink } from "../hooks/useWordLink";
import type { KanaCell, ScriptMode } from "../data/gojuon";

/**
 * 오십음도에서 글자를 탭했을 때 뜨는 상세 다이얼로그. 사전의 WordMeaningDialog와 같은
 * 바텀시트 패턴이다(모바일에선 아래에서 올라오고, sm 이상에선 가운데 카드).
 * 보여주는 것은 전부 정적 데이터다 — 대표 단어도 LLM이 아니라 dictionary.json에서 미리
 * 뽑아둔 kana-words.json에서 읽는다.
 */
function KanaDetailDialog({
  cell,
  mode,
  onClose,
}: {
  cell: KanaCell | null;
  mode: ScriptMode;
  onClose: () => void;
}) {
  const wordLink = useWordLink();
  // 애니메이션으로 사라지는 동안에도 내용이 남아있어야 해서 cell이 null이면 렌더만 건너뛴다.
  const char = cell ? (mode === "hiragana" ? cell.hiragana : cell.katakana) : "";
  const counterpart = cell ? (mode === "hiragana" ? cell.katakana : cell.hiragana) : "";
  const counterpartLabel = mode === "hiragana" ? "가타카나" : "히라가나";
  const words = cell ? getKanaWords(cell.hiragana, mode) : [];

  return (
    <AnimatePresence>
      {cell && (
        <motion.div
          className="fixed inset-0 z-30 flex items-end justify-center bg-black/30 sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            // 대표 단어가 5개까지 붙어 작은 화면에서는 시트가 넘칠 수 있다 — 안에서 스크롤시킨다.
            className="max-h-[85svh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-6 sm:rounded-3xl"
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-4">
                <span className="font-ja text-6xl leading-none">{char}</span>
                <div>
                  <p className="text-lg text-gray-400">{cell.romaji}</p>
                  <SpeakButton text={cell.speech ?? char} label={`${char} 발음 듣기`} size="md" className="mt-1" />
                </div>
              </div>
              <button onClick={onClose} className="text-2xl leading-none text-gray-400" aria-label="닫기">
                ×
              </button>
            </div>

            {/* 가타카나 전용 칸(ファ·ヶ…)은 짝이 되는 히라가나가 실제로 쓰이지 않으니 보여주지 않는다. */}
            {cell.katakanaOnly ? (
              <p className="mt-5 rounded-2xl bg-gray-50 p-4 text-sm text-gray-600">
                {cell.note ?? "외래어를 적을 때만 쓰는 가타카나 표기예요. 히라가나로는 거의 쓰지 않아요."}
              </p>
            ) : (
              <div className="mt-5 rounded-2xl bg-gray-50 p-4">
                <p className="text-xs text-gray-400">{counterpartLabel}</p>
                <p className="mt-1 font-ja text-3xl">{counterpart}</p>
              </div>
            )}

            {words.length > 0 && (
              <div className="mt-3 rounded-2xl bg-primary/5 p-4">
                <p className="text-xs text-gray-400">대표 단어</p>
                <ul className="mt-2 flex flex-col gap-1">
                  {words.map((word) => (
                    // 발음 버튼이 링크 안에 들어가면 안 되므로(중첩 인터랙티브 요소) 둘을 나란히 둔다.
                    <li key={word.id} className="flex items-center gap-2">
                      <Link
                        {...wordLink(word.id)}
                        onClick={onClose}
                        className="min-w-0 flex-1 rounded-xl px-2 py-1.5 hover:bg-primary/10 active:bg-primary/20"
                      >
                        <span className="font-ja text-xl">{word.word}</span>
                        {word.word !== word.reading && (
                          <span className="ml-2 font-ja text-sm text-gray-500">{word.reading}</span>
                        )}
                        <span className="block truncate text-sm text-gray-600">{word.koreanMeaning?.join(", ") ?? word.meaning}</span>
                      </Link>
                      <SpeakButton text={word.reading} label={`${word.word} 발음 듣기`} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default KanaDetailDialog;
