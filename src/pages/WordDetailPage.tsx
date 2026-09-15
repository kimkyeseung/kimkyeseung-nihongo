import { useCallback, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import FuriganaText from "../components/FuriganaText";
import LoadingMascot from "../components/LoadingMascot";
import PromptApiUnsupportedNotice from "../components/PromptApiUnsupportedNotice";
import { useLanguageModel } from "../hooks/useLanguageModel";
import { findWordById } from "../lib/dictionary";
import { getKoreanReadingForWord } from "../lib/kanji";
import { buildExamplePrompt, parseExampleResponse } from "../lib/wordExamples";
import { useWordbookStore } from "../stores/wordbookStore";
import { useGamificationStore } from "../stores/gamificationStore";
import { XP_REWARDS } from "../lib/xpRewards";
import type { WordEntry } from "../types/dictionary";

/** LLM으로 단어 활용 예문을 생성한다. 예문은 생성형 작업이라 LLM을 쓰지만, 후리가나는
 * FuriganaText가 사전 데이터에서만 가져와 오버레이한다(LLM이 읽기를 지어내지 않도록). */
function WordExamples({ entry }: { entry: WordEntry }) {
  const model = useLanguageModel("");
  const recordProgress = useGamificationStore((s) => s.recordProgress);
  const [rawResponse, setRawResponse] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [hasGenerated, setHasGenerated] = useState(false);

  const examples = useMemo(
    () => (hasGenerated ? parseExampleResponse(rawResponse) : []),
    [rawResponse, hasGenerated]
  );

  const handleGenerate = useCallback(async () => {
    if (isLoading) return;
    setIsLoading(true);
    setHasGenerated(true);
    setRawResponse("");
    recordProgress(XP_REWARDS.exampleGenerated);
    try {
      let acc = "";
      for await (const chunk of model.promptStreaming(buildExamplePrompt(entry))) {
        acc += chunk;
        setRawResponse(acc);
      }
    } catch {
      setRawResponse("### 예문\n예문 생성 중 오류가 발생했습니다. 다시 시도해주세요.\n### 번역\n");
    } finally {
      setIsLoading(false);
    }
  }, [entry, isLoading, model, recordProgress]);

  if (model.status === "checking") return null;

  if (model.status === "unsupported") {
    return (
      <div className="mt-4">
        <PromptApiUnsupportedNotice feature="LLM 예문 생성" />
      </div>
    );
  }

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-400">예문</p>
        <button
          onClick={handleGenerate}
          disabled={isLoading}
          className="text-xs font-bold text-info disabled:text-gray-300"
        >
          {hasGenerated ? "↻ 다시 생성" : "✨ 예문 생성"}
        </button>
      </div>

      {model.downloadProgress !== null && (
        <div className="mt-2 text-xs text-gray-400">
          모델 다운로드 중... {Math.round(model.downloadProgress * 100)}%
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${model.downloadProgress * 100}%` }}
            />
          </div>
        </div>
      )}

      {isLoading && examples.length === 0 && (
        <div className="mt-3">
          <LoadingMascot label="예문 만드는 중..." />
        </div>
      )}

      {examples.length > 0 && (
        <ul className="mt-3 flex flex-col gap-3">
          {examples.map((ex, i) => (
            <li key={i} className="rounded-2xl bg-gray-50 p-3">
              <p className="font-ja text-lg">
                <FuriganaText text={ex.japanese} show />
              </p>
              {ex.korean && <p className="mt-1 text-sm text-gray-500">{ex.korean}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function WordDetailPage() {
  const { id } = useParams<{ id: string }>();
  const entry = id ? findWordById(id) : undefined;
  const inWordbook = useWordbookStore((s) => (id ? Boolean(s.entries[id]) : false));
  const toggleWord = useWordbookStore((s) => s.toggleWord);
  const recordProgress = useGamificationStore((s) => s.recordProgress);
  const koreanReading = entry ? getKoreanReadingForWord(entry.word) : null;

  function handleToggleWordbook() {
    if (!entry) return;
    if (!inWordbook) recordProgress(XP_REWARDS.wordAdded); // 추가할 때만 XP 지급
    toggleWord(entry.id);
  }

  if (!entry) {
    return (
      <div className="p-6">
        <Link to="/dictionary" className="text-info">
          ← 사전으로
        </Link>
        <p className="mt-4 text-gray-400">단어를 찾을 수 없습니다 (id: {id}).</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <Link to="/dictionary" className="text-info">
        ← 사전으로
      </Link>

      <div className="mt-3 flex items-baseline gap-3">
        <span className="rounded-full bg-primary/10 px-3 py-1 text-sm text-primary">
          {entry.jlptLevel}
        </span>
        {entry.common && <span className="text-xs text-gray-400">자주 쓰는 단어</span>}
      </div>

      <h2 className="mt-2 font-ja text-4xl">{entry.word}</h2>
      <p className="mt-1 font-ja text-xl text-gray-500">
        {entry.reading}
        {koreanReading && <span className="ml-2 text-base text-gray-400">({koreanReading})</span>}
      </p>

      {entry.furigana && entry.furigana.length > 0 && (
        <p className="mt-1 font-ja text-sm text-gray-400">
          {entry.furigana.map((f) => `${f.ruby}(${f.rt})`).join(" ")}
        </p>
      )}

      <ol className="mt-5 flex flex-col gap-3">
        {entry.senses.map((sense, i) => (
          <li key={i}>
            <div className="flex flex-wrap gap-1">
              {sense.pos.map((p) => (
                <span key={p} className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                  {p}
                </span>
              ))}
            </div>
            <p className="mt-1 text-gray-700">
              {i + 1}. {sense.glosses.join("; ")}
            </p>
          </li>
        ))}
      </ol>

      <button
        onClick={handleToggleWordbook}
        className={`btn-press mt-6 w-full rounded-2xl py-3 font-bold text-white ${
          inWordbook ? "bg-gray-300" : "bg-primary"
        }`}
        style={
          { "--btn-shadow": inWordbook ? "rgb(0 0 0 / 0.15)" : "#3d9401" } as React.CSSProperties
        }
      >
        {inWordbook ? "✓ 단어장에 있음 (탭하여 제거)" : "🗂️ 단어장에 추가"}
      </button>

      <WordExamples entry={entry} />

      <div className="mt-4 flex flex-col gap-2 rounded-2xl bg-gray-50 p-4 text-sm text-gray-400">
        <p>다음 기능은 구현 예정입니다:</p>
        <p>· 동사 て형 표시</p>
      </div>
    </div>
  );
}

export default WordDetailPage;
