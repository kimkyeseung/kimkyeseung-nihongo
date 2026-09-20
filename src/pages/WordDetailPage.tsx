import { Fragment, useCallback, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import ClickableSentence from "../components/ClickableSentence";
import GemmaEngineNotice from "../components/GemmaEngineNotice";
import LoadingMascot from "../components/LoadingMascot";
import PromptApiTroubleshootDialog from "../components/PromptApiTroubleshootDialog";
import PromptApiUnsupportedNotice from "../components/PromptApiUnsupportedNotice";
import SentenceActions from "../components/SentenceActions";
import SentenceGrammar from "../components/SentenceGrammar";
import SpeakButton from "../components/SpeakButton";
import { useAiModel } from "../hooks/useAiModel";
import { usePromptApiTroubleshoot } from "../hooks/usePromptApiTroubleshoot";
import { useSentenceDialogs } from "../hooks/useSentenceDialogs";
import type { WordEntry } from "../types/dictionary";
import { findWordById } from "../lib/dictionary";
import { getKoreanReadingForWord } from "../lib/kanji";
import {
  buildExamplePrompt,
  buildRewritePrompt,
  parseExampleResponse,
  type ExampleDifficulty,
  type ParsedExample,
  type WordExample,
} from "../lib/wordExamples";
import { detectAdjectiveType, getVerbTeForm } from "../lib/verbConjugation";
import { translatePos } from "../lib/posTags";
import { useWordbookStore } from "../stores/wordbookStore";
import { useGamificationStore } from "../stores/gamificationStore";
import { recordStudyEvent } from "../stores/learnerMemoryStore";
import { useWordExamples } from "../stores/pageStateStore";
import { XP_REWARDS } from "../lib/xpRewards";

// zustand 셀렉터가 매번 새 배열을 만들면 스냅샷이 계속 달라지므로 빈 목록은 하나를 돌려쓴다.
const NO_EXAMPLES: WordExample[] = [];

/** 지금 무엇을 만들고 있는지 — 스트리밍 미리보기를 어느 자리에 끼워 넣을지도 이걸로 정한다. */
type PendingJob =
  | { kind: "sense"; senseIndex: number }
  | { kind: "variant"; senseIndex: number; sourceId: string };

/**
 * 뜻 목록과, **그 뜻으로 만든 예문**을 함께 그린다.
 *
 * 왜 뜻 목록과 한 컴포넌트인가: 예문 생성 버튼이 뜻마다 붙기 때문이다. 표제어 하나에 뜻이 여러
 * 개인 경우가 흔한데 예전에는 페이지 맨 아래에 버튼이 하나뿐이라, 모델이 그중 아무 뜻이나 집어
 * 방금 읽은 뜻과 상관없는 예문을 내놓곤 했다.
 *
 * 예문은 생성형 작업이라 LLM을 쓰지만, 후리가나는 `ClickableSentence`가 사전 데이터에서만
 * 가져와 오버레이한다(LLM이 읽기를 지어내지 않도록).
 */
function WordSenses({ entry }: { entry: WordEntry }) {
  // **useLanguageModel을 직접 부르면 안 된다 (실제로 겪은 버그).** 그러면 Chrome 내장 AI만
  // 보게 되어, Gemma를 받아 쓰는 브라우저에서 대문에는 ✅가 떠 있는데 이 화면만
  // "내장 AI를 쓸 수 없어요"가 뜬다. 엔진을 갈아끼우는 창구는 useAiModel 하나뿐이다.
  const model = useAiModel("");
  const recordProgress = useGamificationStore((s) => s.recordProgress);
  const { troubleshootError, reportError, dismissTroubleshoot } = usePromptApiTroubleshoot();
  // 생성해둔 예문은 단어별로 store에 남겨, 다른 탭에 갔다 와도 다시 만들지 않아도 되게 한다.
  const examples = useWordExamples((s) => s.byWordId[entry.id] ?? NO_EXAMPLES);
  const addExamples = useWordExamples((s) => s.addExamples);
  const insertVariant = useWordExamples((s) => s.insertVariant);
  const [job, setJob] = useState<PendingJob | null>(null);
  const [streamingRaw, setStreamingRaw] = useState("");
  const { handlers: sentenceHandlers, dialogs: sentenceDialogs } = useSentenceDialogs();

  const isLoading = job !== null;
  const preview = useMemo(
    () => (streamingRaw ? parseExampleResponse(streamingRaw) : []),
    [streamingRaw]
  );

  /** 프롬프트를 흘려받아 미리보기로 보여주고, 끝나면 `commit`에 넘긴다(두 버튼이 공유). */
  const run = useCallback(
    async (next: PendingJob, prompt: string, commit: (parsed: ParsedExample[]) => void) => {
      if (isLoading) return;
      setJob(next);
      setStreamingRaw("");
      try {
        let acc = "";
        for await (const chunk of model.promptStreaming(prompt)) {
          acc += chunk;
          setStreamingRaw(acc);
        }
        const parsed = parseExampleResponse(acc);
        if (parsed.length === 0) return;
        // **XP는 성공한 생성에만, 그리고 그 단어의 첫 예문에만 준다.** 예전에는 버튼을 누르는
        // 순간 무조건 지급해서 연타로 무한히 쌓였고, 생성이 실패해도 들어갔다 — 오십음도에서
        // 고쳤던 것과 같은 문제이고, "안 된 상태 → 된 상태로 바뀔 때만"이라는 게이미피케이션
        // 규칙 그대로다. 목록은 메모리에만 있으므로 새로고침하면 한 번 더 받을 수 있는데,
        // 그때마다 모델을 실제로 돌려야 해서 연타처럼 긁을 수 있는 구멍은 아니다.
        const first = (useWordExamples.getState().byWordId[entry.id]?.length ?? 0) === 0;
        commit(parsed);
        if (first) recordProgress(XP_REWARDS.exampleGenerated);
      } catch (err) {
        reportError(err);
      } finally {
        setJob(null);
        setStreamingRaw("");
      }
    },
    [entry.id, isLoading, model, recordProgress, reportError]
  );

  const generateForSense = useCallback(
    (senseIndex: number) => {
      if (!entry.senses[senseIndex]) return;
      void run({ kind: "sense", senseIndex }, buildExamplePrompt(entry, senseIndex), (parsed) =>
        addExamples(
          entry.id,
          parsed.map((p) => ({ ...p, id: crypto.randomUUID(), senseIndex }))
        )
      );
    },
    [addExamples, entry, run]
  );

  const rewrite = useCallback(
    (source: WordExample, direction: ExampleDifficulty) => {
      void run(
        { kind: "variant", senseIndex: source.senseIndex, sourceId: source.id },
        buildRewritePrompt(entry, source, direction),
        ([first]) => {
          if (!first) return;
          insertVariant(entry.id, source.id, {
            ...first,
            id: crypto.randomUUID(),
            senseIndex: source.senseIndex,
            variantOf: direction,
          });
        }
      );
    },
    [entry, insertVariant, run]
  );

  // 안내 화면은 **예문 버튼 자리만** 대신한다 — 예전처럼 컴포넌트 전체를 대신하면 AI를 못 쓰는
  // 브라우저에서 뜻풀이까지 통째로 사라진다. 뜻은 사전 데이터라 AI와 아무 상관이 없다.
  // ("unavailable"은 API 객체는 있는데 모델을 못 쓰는 상태다 — Whale 등 크로미움 포크, 플래그
  //  꺼짐. 빼먹으면 화면은 멀쩡한데 누르는 순간 실패한다.)
  const aiNotice =
    model.engine === "gemma4" &&
    (model.status === "model-missing" || model.status === "unsupported") ? (
      // Gemma를 골랐는데 못 쓰는 경우는 원인(모델 없음/WebGPU 없음)도 해결법도 달라 화면이 다르다.
      <GemmaEngineNotice reason={model.status} feature="예문 생성" />
    ) : model.status === "unsupported" || model.status === "unavailable" ? (
      <PromptApiUnsupportedNotice feature="LLM 예문 생성" />
    ) : null;
  const canGenerate = model.status !== "checking" && aiNotice === null;

  /** 아직 완성되지 않은 문장이라 단어 탭·후리가나 없이 글자만 보여준다(반 토막 단어는 눌러도 의미가 없다). */
  const previewCards =
    preview.length === 0 ? (
      <LoadingMascot label="예문 만드는 중..." />
    ) : (
      <ul className="flex flex-col gap-3">
        {preview.map((ex, i) => (
          <li key={i} className="rounded-2xl bg-gray-50 p-3 opacity-60">
            <p className="font-ja text-lg">{ex.japanese}</p>
            {ex.korean && <p className="mt-1 text-sm text-gray-500">{ex.korean}</p>}
          </li>
        ))}
      </ul>
    );

  return (
    <>
      <ol className="mt-5 flex flex-col gap-6">
        {entry.senses.map((sense, senseIndex) => {
          const senseExamples = examples.filter((ex) => ex.senseIndex === senseIndex);
          return (
            <li key={senseIndex}>
              <div className="flex flex-wrap gap-1">
                {sense.pos.map((p) => (
                  <span
                    key={p}
                    className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500"
                  >
                    {translatePos(p)}
                  </span>
                ))}
              </div>
              <p className="mt-1 text-gray-700">
                {senseIndex + 1}. {sense.glosses.join("; ")}
              </p>

              {senseExamples.length > 0 && (
                <ul className="mt-3 flex flex-col gap-3">
                  {senseExamples.map((ex) => (
                    <Fragment key={ex.id}>
                      <li
                        className={`rounded-2xl bg-gray-50 p-3 ${
                          // 바꿔 만든 문장은 원문 바로 아래 한 단 들여 붙는다 — 어느 문장을
                          // 바꾼 것인지 눈으로 이어져야 비교가 된다.
                          ex.variantOf ? "ml-3 border-l-4 border-primary/20" : ""
                        }`}
                      >
                        {ex.variantOf && (
                          <p className="mb-1 text-xs text-gray-400">
                            {ex.variantOf === "easier"
                              ? "🟡 더 쉽게 바꾼 문장"
                              : "🔵 더 어렵게 바꾼 문장"}
                          </p>
                        )}
                        {/* 난이도 버튼은 문장 **오른쪽에 세로로** 둔다 — 가로 한 줄로 깔면
                            예문 한 개가 카드 두 배 높이를 먹어서 목록이 금세 화면을 넘긴다.
                            `min-w-0`이 있어야 긴 일본어 문장이 버튼을 밀어내지 않고 접힌다. */}
                        <div className="flex items-start gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="font-ja text-lg">
                              <ClickableSentence
                                text={ex.japanese}
                                {...sentenceHandlers}
                                excludeWord={entry.word}
                              />
                              <SentenceActions text={ex.japanese} subject="예문" />
                            </p>
                            {ex.korean && (
                              <p className="mt-1 text-sm text-gray-500">{ex.korean}</p>
                            )}
                            {/* 사전에 없는 것(문형)은 커리큘럼이 들고 있다 — 걸리는 게 없으면 안 그린다. */}
                            <SentenceGrammar text={ex.japanese} />
                          </div>

                          {/* 이 버튼이 **예문마다** 붙는 이유: 목록 전체에 하나만 두면 아무 상관
                              없는 새 문장이 쌓일 뿐이라, 같은 내용이 어떻게 복잡해지는지를 볼 수 없다. */}
                          {canGenerate && (
                            <div className="flex shrink-0 flex-col gap-1">
                              <button
                                onClick={() => rewrite(ex, "easier")}
                                disabled={isLoading}
                                className="btn-press whitespace-nowrap rounded-full bg-warning px-2.5 py-1 text-xs font-bold text-white disabled:bg-gray-200"
                                style={{ "--btn-shadow": "#c99a00" } as React.CSSProperties}
                              >
                                🟡 더 쉽게
                              </button>
                              <button
                                onClick={() => rewrite(ex, "harder")}
                                disabled={isLoading}
                                className="btn-press whitespace-nowrap rounded-full bg-info px-2.5 py-1 text-xs font-bold text-white disabled:bg-gray-200"
                                style={{ "--btn-shadow": "#0e86c4" } as React.CSSProperties}
                              >
                                🔵 더 어렵게
                              </button>
                            </div>
                          )}
                        </div>
                      </li>

                      {job?.kind === "variant" && job.sourceId === ex.id && (
                        <li className="ml-3">{previewCards}</li>
                      )}
                    </Fragment>
                  ))}
                </ul>
              )}

              {job?.kind === "sense" && job.senseIndex === senseIndex && (
                <div className="mt-3">{previewCards}</div>
              )}

              {canGenerate && (
                <button
                  onClick={() => generateForSense(senseIndex)}
                  disabled={isLoading}
                  className="btn-press mt-3 rounded-full bg-primary px-4 py-2 text-sm font-bold text-white disabled:bg-gray-200"
                  style={{ "--btn-shadow": "#3d9401" } as React.CSSProperties}
                >
                  {senseExamples.length > 0
                    ? "✨ 예문 더 만들기"
                    : entry.senses.length > 1
                      ? "✨ 이 뜻으로 예문"
                      : "✨ 예문 생성"}
                </button>
              )}
            </li>
          );
        })}
      </ol>

      {aiNotice && <div className="mt-6">{aiNotice}</div>}

      {/* Gemma는 첫 사용 때 2GB를 GPU에 올린다 — 안내가 없으면 눌러도 한참 반응이 없어 보인다. */}
      {model.busyLabel && <LoadingMascot label={model.busyLabel} />}

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

      <PromptApiTroubleshootDialog error={troubleshootError} onClose={dismissTroubleshoot} />
      {sentenceDialogs}
    </>
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

      {/* 뜻 목록보다 위에 둔다 — 뜻마다 예문이 딸려 붙으면서 목록이 길어졌고, 그 아래에 두면
          て형이 화면 몇 개 밖으로 밀려난다. */}
      {verbTeForm && (
        <div className="mt-4 rounded-2xl bg-gray-50 p-4">
          <p className="text-sm text-gray-400">て형</p>
          <p className="mt-1 font-ja text-2xl text-gray-700">{verbTeForm.kanji}</p>
          {verbTeForm.reading && (
            <p className="mt-0.5 font-ja text-base text-gray-400">{verbTeForm.reading}</p>
          )}
        </div>
      )}

      <WordSenses entry={entry} />
    </div>
  );
}

export default WordDetailPage;
