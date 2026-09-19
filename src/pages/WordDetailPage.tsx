import { useCallback, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import ClickableSentence from "../components/ClickableSentence";
import GemmaEngineNotice from "../components/GemmaEngineNotice";
import KanjiDetailSheet from "../components/KanjiDetailSheet";
import LoadingMascot from "../components/LoadingMascot";
import PromptApiTroubleshootDialog from "../components/PromptApiTroubleshootDialog";
import PromptApiUnsupportedNotice from "../components/PromptApiUnsupportedNotice";
import SentenceActions from "../components/SentenceActions";
import SentenceGrammar from "../components/SentenceGrammar";
import SpeakButton from "../components/SpeakButton";
import WordMeaningDialog from "../components/WordMeaningDialog";
import { useAiModel } from "../hooks/useAiModel";
import { usePromptApiTroubleshoot } from "../hooks/usePromptApiTroubleshoot";
import { findWordById } from "../lib/dictionary";
import { getKoreanReadingForWord } from "../lib/kanji";
import { buildExamplePrompt, parseExampleResponse, type ExampleDifficulty, type WordExample } from "../lib/wordExamples";
import { detectAdjectiveType, getVerbTeForm } from "../lib/verbConjugation";
import { translatePos } from "../lib/posTags";
import { useWordbookStore } from "../stores/wordbookStore";
import { useGamificationStore } from "../stores/gamificationStore";
import { recordStudyEvent } from "../stores/learnerMemoryStore";
import { useWordExamples } from "../stores/pageStateStore";
import { XP_REWARDS } from "../lib/xpRewards";
import type { WordEntry } from "../types/dictionary";
import type { KanjiEntry } from "../types/kanji";

// zustand 셀렉터가 매번 새 배열을 만들면 스냅샷이 계속 달라지므로 빈 목록은 하나를 돌려쓴다.
const NO_EXAMPLES: WordExample[] = [];

/** LLM으로 단어 활용 예문을 생성한다. 예문은 생성형 작업이라 LLM을 쓰지만, 후리가나는
 * FuriganaText가 사전 데이터에서만 가져와 오버레이한다(LLM이 읽기를 지어내지 않도록). */
function WordExamples({ entry }: { entry: WordEntry }) {
  // **useLanguageModel을 직접 부르면 안 된다 (실제로 겪은 버그).** 그러면 Chrome 내장 AI만
  // 보게 되어, Gemma를 받아 쓰는 브라우저에서 대문에는 ✅가 떠 있는데 이 화면만
  // "내장 AI를 쓸 수 없어요"가 뜬다. 엔진을 갈아끼우는 창구는 useAiModel 하나뿐이다.
  const model = useAiModel("");
  const recordProgress = useGamificationStore((s) => s.recordProgress);
  const { troubleshootError, reportError, dismissTroubleshoot } = usePromptApiTroubleshoot();
  // 생성해둔 예문은 단어별로 store에 남겨, 다른 탭에 갔다 와도 다시 만들지 않아도 되게 한다.
  const examples = useWordExamples((s) => s.byWordId[entry.id] ?? NO_EXAMPLES);
  const setExamples = useWordExamples((s) => s.setExamples);
  // null = 생성 중이 아님. 문자열이면 지금 스트리밍 중인 배치의 원문(완료되면 examples에 합쳐짐).
  const [streamingRaw, setStreamingRaw] = useState<string | null>(null);
  const [selectedWord, setSelectedWord] = useState<WordEntry | null>(null);
  const [selectedKanji, setSelectedKanji] = useState<KanjiEntry | null>(null);

  const isLoading = streamingRaw !== null;
  const streamingExamples = useMemo(
    () => (streamingRaw !== null ? parseExampleResponse(streamingRaw) : []),
    [streamingRaw]
  );
  // 새로 생성된 예문은 기존 예문 아래로 쌓인다 — 스트리밍 중엔 그 미리보기도 맨 아래 덧붙여 보여준다.
  const displayExamples = isLoading ? [...examples, ...streamingExamples] : examples;

  const handleGenerate = useCallback(
    async (difficulty?: ExampleDifficulty) => {
      if (isLoading) return;
      setStreamingRaw("");
      recordProgress(XP_REWARDS.exampleGenerated);
      try {
        let acc = "";
        for await (const chunk of model.promptStreaming(buildExamplePrompt(entry, difficulty))) {
          acc += chunk;
          setStreamingRaw(acc);
        }
        // 스트리밍이 끝난 뒤 최신 목록에 덧붙인다 — 렌더 시점 값(examples)을 쓰면 연속
        // 생성 때 앞의 결과를 덮어쓴다.
        const current = useWordExamples.getState().byWordId[entry.id] ?? NO_EXAMPLES;
        setExamples(entry.id, [...current, ...parseExampleResponse(acc)]);
      } catch (err) {
        reportError(err);
      } finally {
        setStreamingRaw(null);
      }
    },
    [entry, isLoading, model, recordProgress, reportError, setExamples]
  );

  if (model.status === "checking") return null;

  // Gemma를 골랐는데 못 쓰는 경우는 원인(모델 없음/WebGPU 없음)도 해결법도 달라 화면이 다르다.
  if (model.engine === "gemma4" && (model.status === "model-missing" || model.status === "unsupported")) {
    return (
      <div className="mt-6">
        <GemmaEngineNotice reason={model.status} feature="예문 생성" />
      </div>
    );
  }

  // "unavailable"은 API 객체는 있는데 모델을 못 쓰는 상태다(Whale 등 크로미움 포크, 플래그 꺼짐).
  // 이것도 같이 봐야 한다 — 빼먹으면 화면은 멀쩡한데 누르는 순간 실패한다.
  if (model.status === "unsupported" || model.status === "unavailable") {
    return (
      <div className="mt-6">
        <PromptApiUnsupportedNotice feature="LLM 예문 생성" />
      </div>
    );
  }

  return (
    <div className="mt-6">
      <p className="text-sm text-gray-400">예문</p>

      {/* Gemma는 첫 사용 때 2GB를 GPU에 올린다 — 안내가 없으면 눌러도 한참 반응이 없어 보인다. */}
      {model.busyLabel && <LoadingMascot label={model.busyLabel} />}

      {examples.length === 0 && (
        <button
          onClick={() => handleGenerate()}
          disabled={isLoading}
          className="btn-press mt-2 w-full rounded-2xl bg-primary py-3 font-bold text-white disabled:bg-gray-200"
          style={{ "--btn-shadow": "#3d9401" } as React.CSSProperties}
        >
          {isLoading ? "생성 중..." : "✨ 예문 생성"}
        </button>
      )}

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

      {isLoading && displayExamples.length === examples.length && (
        <div className="mt-3">
          <LoadingMascot label="예문 만드는 중..." />
        </div>
      )}

      {displayExamples.length > 0 && (
        <ul className="mt-3 flex flex-col gap-3">
          {displayExamples.map((ex, i) => (
            <li key={i} className="rounded-2xl bg-gray-50 p-3">
              <p className="font-ja text-lg">
                <ClickableSentence
                  text={ex.japanese}
                  onWordClick={setSelectedWord}
                  onKanjiClick={setSelectedKanji}
                  excludeWord={entry.word}
                />
                <SentenceActions text={ex.japanese} subject="예문" />
              </p>
              {ex.korean && <p className="mt-1 text-sm text-gray-500">{ex.korean}</p>}
              {/* 사전에 없는 것(문형)은 커리큘럼이 들고 있다 — 걸리는 게 없으면 안 그린다. */}
              <SentenceGrammar text={ex.japanese} />
            </li>
          ))}
        </ul>
      )}

      {examples.length > 0 && (
        <div className="mt-3 flex gap-2">
          <button
            onClick={() => handleGenerate("easier")}
            disabled={isLoading}
            className="btn-press flex-1 rounded-2xl bg-warning py-3 text-sm font-bold text-white disabled:bg-gray-200"
            style={{ "--btn-shadow": "#c99a00" } as React.CSSProperties}
          >
            🟡 더 쉬운 예문
          </button>
          <button
            onClick={() => handleGenerate("harder")}
            disabled={isLoading}
            className="btn-press flex-1 rounded-2xl bg-info py-3 text-sm font-bold text-white disabled:bg-gray-200"
            style={{ "--btn-shadow": "#0e86c4" } as React.CSSProperties}
          >
            🔵 더 어려운 예문
          </button>
        </div>
      )}

      <PromptApiTroubleshootDialog error={troubleshootError} onClose={dismissTroubleshoot} />
      <WordMeaningDialog word={selectedWord} onClose={() => setSelectedWord(null)} />
      <KanjiDetailSheet entry={selectedKanji} onClose={() => setSelectedKanji(null)} />
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
  const adjectiveType = entry ? detectAdjectiveType(entry) : null;
  const verbTeForm = entry ? getVerbTeForm(entry) : null;

  function handleToggleWordbook() {
    if (!entry) return;
    if (!inWordbook) {
      recordProgress(XP_REWARDS.wordAdded); // 추가할 때만 XP 지급
      // 급수를 같이 남긴다 — 어휘 수준 추정의 주된 근거다(learnerProfile.ts).
      recordStudyEvent({ type: "word-added", subject: entry.word, level: entry.jlptLevel });
    }
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

      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <span className="rounded-full bg-primary/10 px-3 py-1 text-sm text-primary">
            {entry.jlptLevel}
          </span>
          {adjectiveType && (
            <span className="rounded-full bg-accent/10 px-3 py-1 text-sm text-accent">
              {adjectiveType === "i" ? "い형용사" : "な형용사"}
            </span>
          )}
          {entry.common && <span className="text-xs text-gray-400">자주 쓰는 단어</span>}
        </div>

        <button
          onClick={handleToggleWordbook}
          aria-label={inWordbook ? "단어장에서 제거" : "단어장에 추가"}
          className={`btn-press flex items-center gap-1 rounded-full px-3 py-2 text-sm font-bold ${
            inWordbook ? "bg-gray-100 text-gray-400" : "bg-primary text-white"
          }`}
          style={
            { "--btn-shadow": inWordbook ? "rgb(0 0 0 / 0.15)" : "#3d9401" } as React.CSSProperties
          }
        >
          {inWordbook ? "✓" : "🗂️"} 단어장
        </button>
      </div>

      <div className="mt-2 flex items-center gap-3">
        <h2 className="font-ja text-4xl">{entry.word}</h2>
        {/* 한자 표기를 그대로 읽히면 음성 엔진이 다른 음으로 읽을 수 있어 사전의 가나 읽기를 넘긴다. */}
        <SpeakButton text={entry.reading || entry.word} label="단어 발음 듣기" size="md" />
      </div>
      <p className="mt-1 font-ja text-xl text-gray-500">
        {entry.reading}
        {koreanReading && <span className="ml-2 text-base text-gray-400">({koreanReading})</span>}
      </p>

      {entry.furigana && entry.furigana.length > 0 && (
        <p className="mt-1 font-ja text-sm text-gray-400">
          {entry.furigana.map((f) => `${f.ruby}(${f.rt})`).join(" ")}
        </p>
      )}

      {/* 한국어 뜻이 있으면 먼저 보여준다. 없는 단어가 절반쯤 되므로(빌드 스크립트 주석 참고)
          영어 뜻 목록은 지우지 않고 그대로 아래에 남긴다 — 지우면 정보가 줄어든다. */}
      {entry.koreanMeaning && (
        <p className="mt-4 rounded-2xl bg-primary/10 px-4 py-3 text-lg text-gray-800">
          {entry.koreanMeaning.join(", ")}
        </p>
      )}

      <ol className="mt-5 flex flex-col gap-3">
        {entry.senses.map((sense, i) => (
          <li key={i}>
            <div className="flex flex-wrap gap-1">
              {sense.pos.map((p) => (
                <span key={p} className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                  {translatePos(p)}
                </span>
              ))}
            </div>
            <p className="mt-1 text-gray-700">
              {i + 1}. {sense.glosses.join("; ")}
            </p>
          </li>
        ))}
      </ol>

      {verbTeForm && (
        <div className="mt-4 rounded-2xl bg-gray-50 p-4">
          <p className="text-sm text-gray-400">て형</p>
          <p className="mt-1 font-ja text-2xl text-gray-700">{verbTeForm.kanji}</p>
          {verbTeForm.reading && (
            <p className="mt-0.5 font-ja text-base text-gray-400">{verbTeForm.reading}</p>
          )}
        </div>
      )}

      <WordExamples entry={entry} />
    </div>
  );
}

export default WordDetailPage;
