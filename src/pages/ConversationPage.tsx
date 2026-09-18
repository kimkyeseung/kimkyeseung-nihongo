import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { motion } from "framer-motion";
import AskTeacherButton from "../components/AskTeacherButton";
import ClickableSentence from "../components/ClickableSentence";
import CopyButton from "../components/CopyButton";
import GemmaEngineNotice from "../components/GemmaEngineNotice";
import JapaneseSuggestionList from "../components/JapaneseSuggestionList";
import KanjiDetailSheet from "../components/KanjiDetailSheet";
import LoadingMascot from "../components/LoadingMascot";
import PromptApiUnsupportedNotice from "../components/PromptApiUnsupportedNotice";
import SpeakButton from "../components/SpeakButton";
import WordMeaningDialog from "../components/WordMeaningDialog";
import { useJapaneseInput } from "../hooks/useJapaneseInput";
import { useUserProfileStore } from "../stores/userProfileStore";
import { useConversationSessionStore } from "../stores/conversationSessionStore";
import { LEVELS, SCENARIOS, type Level, type Scenario } from "../lib/conversationPrompts";
import { INLINE_VALUE_MAX_LENGTH } from "../lib/promptSafety";
import type { WordEntry } from "../types/dictionary";
import type { KanjiEntry } from "../types/kanji";

function ScenarioPicker({
  onStart,
}: {
  onStart: (scenario: Scenario, level: Level) => void;
}) {
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [level, setLevel] = useState<Level | null>(null);
  const name = useUserProfileStore((s) => s.name);
  const setName = useUserProfileStore((s) => s.setName);

  return (
    <div className="p-4 sm:p-6">
      <h3 className="text-sm text-gray-400">이름 (선택)</h3>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={INLINE_VALUE_MAX_LENGTH}
        placeholder="이름을 입력하면 AI가 자기소개 등에서 불러줘요"
        className="mt-2 w-full rounded-2xl border-2 border-gray-100 px-4 py-3 text-lg shadow-sm focus:border-primary/40 focus:outline-none"
      />

      <h3 className="mt-6 text-sm text-gray-400">시나리오 선택</h3>
      <div className="mt-2 grid grid-cols-2 gap-3">
        {SCENARIOS.map((s) => (
          <button
            key={s.id}
            onClick={() => setScenario(s)}
            className={`rounded-2xl border-2 p-4 text-left ${
              scenario?.id === s.id ? "border-primary bg-primary/10" : "border-gray-100 bg-white"
            }`}
          >
            <span className="text-2xl">{s.emoji}</span>
            <p className="mt-1 font-bold">{s.label}</p>
          </button>
        ))}
      </div>

      <h3 className="mt-6 text-sm text-gray-400">레벨 선택</h3>
      <div className="mt-2 flex gap-2">
        {LEVELS.map((l) => (
          <button
            key={l.id}
            onClick={() => setLevel(l)}
            className={`flex-1 rounded-2xl border-2 py-3 font-bold ${
              level?.id === l.id ? "border-primary bg-primary/10 text-primary" : "border-gray-100 bg-white text-gray-500"
            }`}
          >
            {l.label}
          </button>
        ))}
      </div>

      <button
        disabled={!scenario || !level}
        onClick={() => scenario && level && onStart(scenario, level)}
        className="btn-press mt-6 w-full rounded-2xl bg-primary py-3 font-bold text-white disabled:bg-gray-200"
        style={{ "--btn-shadow": "#3d9401" } as React.CSSProperties}
      >
        회화 시작하기
      </button>
    </div>
  );
}

function ConversationPage() {
  // 실제 LLM 세션/스트리밍은 Layout에 항상 마운트되는 ConversationSessionController가
  // 관리한다 — 이 페이지는 탭 전환으로 unmount돼도 대화가 끊기지 않도록 store를 구독하고
  // 액션을 호출만 하는 얇은 뷰다.
  const scenario = useConversationSessionStore((s) => s.scenario);
  const level = useConversationSessionStore((s) => s.level);
  const messages = useConversationSessionStore((s) => s.messages);
  const showFurigana = useConversationSessionStore((s) => s.showFurigana);
  const setShowFurigana = useConversationSessionStore((s) => s.setShowFurigana);
  const showCorrection = useConversationSessionStore((s) => s.showCorrection);
  const setShowCorrection = useConversationSessionStore((s) => s.setShowCorrection);
  const isStreaming = useConversationSessionStore((s) => s.isStreaming);
  const chatStatus = useConversationSessionStore((s) => s.chatStatus);
  const chatDownloadProgress = useConversationSessionStore((s) => s.chatDownloadProgress);
  const chatEngine = useConversationSessionStore((s) => s.chatEngine);
  const chatBusyLabel = useConversationSessionStore((s) => s.chatBusyLabel);
  const startConversation = useConversationSessionStore((s) => s.startConversation);
  const showTranslation = useConversationSessionStore((s) => s.showTranslation);
  const setShowTranslation = useConversationSessionStore((s) => s.setShowTranslation);
  const resetConversation = useConversationSessionStore((s) => s.resetConversation);
  const sendMessage = useConversationSessionStore((s) => s.sendMessage);

  const japaneseInput = useJapaneseInput<HTMLInputElement>();
  const listEndRef = useRef<HTMLDivElement>(null);
  const [selectedWord, setSelectedWord] = useState<WordEntry | null>(null);
  const [selectedKanji, setSelectedKanji] = useState<KanjiEntry | null>(null);

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = useCallback(() => {
    const userText = japaneseInput.value.trim();
    if (!userText || isStreaming) return;
    japaneseInput.setValue("");
    sendMessage(userText);
  }, [japaneseInput.value, japaneseInput.setValue, isStreaming, sendMessage]);

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (japaneseInput.handleSuggestionKeyDown(e)) return;
    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSend();
    }
  }

  if (chatStatus === "checking") {
    return <p className="p-6 text-gray-400">AI 준비 상태 확인 중...</p>;
  }

  // Gemma 4를 고른 상태에서 못 쓰는 경우는 원인(모델 없음 / WebGPU 없음)도 해결법도 달라서
  // Prompt API 안내와 다른 화면을 보여준다.
  if (chatEngine === "gemma4" && (chatStatus === "model-missing" || chatStatus === "unsupported")) {
    return (
      <div>
        <h2 className="p-4 pb-0 text-xl text-primary sm:p-6 sm:pb-0">💬 회화 연습</h2>
        <GemmaEngineNotice reason={chatStatus} feature="회화 연습" />
      </div>
    );
  }

  // "unavailable"은 API 객체는 있는데 모델을 못 쓰는 상태다(Whale 등 크로미움 포크, 플래그 꺼짐).
  // 이걸 빼먹으면 화면은 멀쩡한데 보내는 순간 실패한다 — aiCapability.ts 주석 참고.
  if (chatStatus === "unsupported" || chatStatus === "unavailable") {
    return (
      <div>
        <h2 className="p-4 pb-0 text-xl text-primary sm:p-6 sm:pb-0">💬 회화 연습</h2>
        <PromptApiUnsupportedNotice feature="회화 연습" />
      </div>
    );
  }

  if (!scenario || !level) {
    return (
      <div>
        <h2 className="p-4 pb-0 text-xl text-primary sm:p-6 sm:pb-0">💬 회화 연습</h2>
        <ScenarioPicker onStart={startConversation} />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-gray-100 p-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="rounded-full bg-primary/10 px-2 py-1 text-primary">
            {scenario.emoji} {scenario.label}
          </span>
          <span className="rounded-full bg-gray-100 px-2 py-1 text-gray-500">{level.label}</span>
        </div>
        <button onClick={resetConversation} className="text-xs text-gray-400">
          다시 선택
        </button>
      </div>

      <div className="flex items-center gap-4 border-b border-gray-100 px-3 py-2 text-xs text-gray-500">
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={showFurigana}
            onChange={(e) => setShowFurigana(e.target.checked)}
          />
          후리가나 표시
        </label>
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={showCorrection}
            onChange={(e) => setShowCorrection(e.target.checked)}
          />
          문법 교정 보기
        </label>
      </div>

      {/* Gemma 엔진 준비는 퍼센트가 없어서(모델을 GPU에 올리는 작업) 문구만 보여준다. */}
      {chatBusyLabel && (
        <div className="p-3">
          <LoadingMascot label={chatBusyLabel} />
        </div>
      )}

      {chatDownloadProgress !== null && (
        <div className="p-3 text-xs text-gray-400">
          모델 다운로드 중... {Math.round(chatDownloadProgress * 100)}%
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${chatDownloadProgress * 100}%` }}
            />
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-3">
        {messages.length === 0 && (
          <p className="mt-4 text-center text-sm text-gray-300">
            일본어로 말을 걸어보세요! 🗻
          </p>
        )}
        <div className="flex flex-col gap-3">
          {messages.map((m) => (
            <div key={m.id} className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}>
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className={`max-w-[80%] rounded-2xl px-4 py-2 font-ja ${
                  m.role === "user" ? "bg-primary text-white" : "bg-gray-100 text-gray-800"
                }`}
              >
                {m.role === "assistant" && m.text === "" && isStreaming ? (
                  <LoadingMascot />
                ) : m.role === "assistant" ? (
                  <>
                    <ClickableSentence
                      text={m.text}
                      showFurigana={showFurigana}
                      onWordClick={setSelectedWord}
                      onKanjiClick={setSelectedKanji}
                    />
                    <SpeakButton text={m.text} label="상대 문장 발음 듣기" className="ml-1" />
                    <CopyButton text={m.text} label="상대 문장 복사" className="ml-1" />
                    <AskTeacherButton
                      text={m.text}
                      label="이 문장 선생님에게 물어보기"
                      className="ml-1"
                    />
                  </>
                ) : (
                  <>
                    {m.text}
                    <SpeakButton
                      text={m.text}
                      label="내 문장 발음 듣기"
                      tone="onPrimary"
                      className="ml-1"
                    />
                  </>
                )}
              </motion.div>
              {m.role === "user" && (m.correction || m.correctionLoading) && (
                <p className="mt-1 max-w-[80%] rounded-xl bg-info/10 px-3 py-1 text-xs text-info">
                  {m.correctionLoading ? "문법 확인 중..." : m.correction}
                </p>
              )}
              {/* 번역은 AI 대사에만 붙인다 — 내가 쓴 문장은 뜻을 이미 알고 쓴 것이다. */}
              {m.role === "assistant" && showTranslation && (m.translation || m.translationLoading) && (
                <p className="mt-1 max-w-[80%] px-1 text-sm text-gray-500">
                  {m.translationLoading ? "번역 중..." : m.translation}
                </p>
              )}
            </div>
          ))}
        </div>
        <div ref={listEndRef} />
      </div>

      <div className="flex gap-2 border-t border-gray-100 p-3">
        <div className="relative flex-1">
          <input
            ref={japaneseInput.ref}
            defaultValue=""
            onFocus={() => japaneseInput.setShowSuggestions(true)}
            onBlur={() => setTimeout(() => japaneseInput.setShowSuggestions(false), 150)}
            onKeyDown={handleKeyDown}
            placeholder="日本語でメッセージを入力..."
            className="w-full rounded-2xl border-2 border-gray-100 px-4 py-2 font-ja focus:border-primary/40 focus:outline-none"
          />
          {japaneseInput.showSuggestions && (
            <JapaneseSuggestionList
              suggestions={japaneseInput.suggestions}
              activeIndex={japaneseInput.activeIndex}
              onSelect={japaneseInput.selectSuggestion}
            />
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowTranslation(!showTranslation)}
          aria-pressed={showTranslation}
          title="AI 대사의 한국어 번역 보기"
          className={`shrink-0 rounded-2xl border-2 px-3 py-2 text-sm font-bold ${
            showTranslation
              ? "border-info bg-info/10 text-info"
              : "border-gray-100 bg-white text-gray-400"
          }`}
        >
          번역
        </button>
        <button
          onClick={handleSend}
          disabled={!japaneseInput.value.trim() || isStreaming}
          className="rounded-2xl bg-primary px-5 py-2 font-bold text-white disabled:bg-gray-200"
        >
          전송
        </button>
      </div>

      <WordMeaningDialog word={selectedWord} onClose={() => setSelectedWord(null)} />
      <KanjiDetailSheet entry={selectedKanji} onClose={() => setSelectedKanji(null)} />
    </div>
  );
}

export default ConversationPage;
