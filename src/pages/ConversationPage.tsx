import { useCallback, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { motion } from "framer-motion";
import FuriganaText from "../components/FuriganaText";
import JapaneseSuggestionList from "../components/JapaneseSuggestionList";
import LoadingMascot from "../components/LoadingMascot";
import PromptApiTroubleshootDialog from "../components/PromptApiTroubleshootDialog";
import PromptApiUnsupportedNotice from "../components/PromptApiUnsupportedNotice";
import { useJapaneseInput } from "../hooks/useJapaneseInput";
import { useLanguageModel } from "../hooks/useLanguageModel";
import { usePromptApiTroubleshoot } from "../hooks/usePromptApiTroubleshoot";
import { useGamificationStore } from "../stores/gamificationStore";
import { useUserProfileStore } from "../stores/userProfileStore";
import { XP_REWARDS } from "../lib/xpRewards";
import {
  GRAMMAR_CORRECTION_SYSTEM_PROMPT,
  LEVELS,
  SCENARIOS,
  buildGrammarCorrectionUserPrompt,
  buildSystemPrompt,
  type Level,
  type Scenario,
} from "../lib/conversationPrompts";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  correction?: string;
  correctionLoading?: boolean;
}

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
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [level, setLevel] = useState<Level | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const japaneseInput = useJapaneseInput<HTMLInputElement>();
  const [isStreaming, setIsStreaming] = useState(false);
  const [showFurigana, setShowFurigana] = useState(true);
  const [showCorrection, setShowCorrection] = useState(false);
  const userName = useUserProfileStore((s) => s.name);

  const systemPrompt = useMemo(
    () => (scenario && level ? buildSystemPrompt(scenario, level, userName || undefined) : ""),
    [scenario, level, userName]
  );
  const chatModel = useLanguageModel(systemPrompt);
  const correctionModel = useLanguageModel(GRAMMAR_CORRECTION_SYSTEM_PROMPT);
  const recordProgress = useGamificationStore((s) => s.recordProgress);
  const { troubleshootError, reportError, dismissTroubleshoot } = usePromptApiTroubleshoot();
  const listEndRef = useRef<HTMLDivElement>(null);

  const handleStart = useCallback((s: Scenario, l: Level) => {
    setScenario(s);
    setLevel(l);
    setMessages([]);
  }, []);

  const handleSend = useCallback(async () => {
    const userText = japaneseInput.value.trim();
    if (!userText || isStreaming) return;
    japaneseInput.setValue("");

    const userMsgId = crypto.randomUUID();
    const assistantMsgId = crypto.randomUUID();
    setMessages((m) => [
      ...m,
      { id: userMsgId, role: "user", text: userText },
      { id: assistantMsgId, role: "assistant", text: "" },
    ]);
    setIsStreaming(true);
    recordProgress(XP_REWARDS.conversationMessage);

    try {
      let acc = "";
      for await (const chunk of chatModel.promptStreaming(userText)) {
        acc += chunk;
        const snapshot = acc;
        setMessages((m) => m.map((msg) => (msg.id === assistantMsgId ? { ...msg, text: snapshot } : msg)));
      }
    } catch (err) {
      setMessages((m) =>
        m.map((msg) =>
          msg.id === assistantMsgId ? { ...msg, text: "(응답 생성 중 오류가 발생했습니다)" } : msg
        )
      );
      reportError(err);
    } finally {
      setIsStreaming(false);
      listEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }

    if (showCorrection) {
      setMessages((m) => m.map((msg) => (msg.id === userMsgId ? { ...msg, correctionLoading: true } : msg)));
      try {
        const correction = await correctionModel.prompt(buildGrammarCorrectionUserPrompt(userText));
        setMessages((m) =>
          m.map((msg) => (msg.id === userMsgId ? { ...msg, correction, correctionLoading: false } : msg))
        );
      } catch (err) {
        setMessages((m) => m.map((msg) => (msg.id === userMsgId ? { ...msg, correctionLoading: false } : msg)));
        reportError(err);
      }
    }
  }, [
    japaneseInput.value,
    japaneseInput.setValue,
    isStreaming,
    chatModel,
    correctionModel,
    showCorrection,
    recordProgress,
    reportError,
  ]);

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (japaneseInput.handleSuggestionKeyDown(e)) return;
    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSend();
    }
  }

  if (chatModel.status === "checking") {
    return <p className="p-6 text-gray-400">Prompt API 지원 여부 확인 중...</p>;
  }

  if (chatModel.status === "unsupported") {
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
        <ScenarioPicker onStart={handleStart} />
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
        <button
          onClick={() => {
            setScenario(null);
            setLevel(null);
          }}
          className="text-xs text-gray-400"
        >
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

      {chatModel.downloadProgress !== null && (
        <div className="p-3 text-xs text-gray-400">
          모델 다운로드 중... {Math.round(chatModel.downloadProgress * 100)}%
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${chatModel.downloadProgress * 100}%` }}
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
                ) : (
                  <FuriganaText text={m.text} show={m.role === "assistant" && showFurigana} />
                )}
              </motion.div>
              {m.role === "user" && (m.correction || m.correctionLoading) && (
                <p className="mt-1 max-w-[80%] rounded-xl bg-info/10 px-3 py-1 text-xs text-info">
                  {m.correctionLoading ? "문법 확인 중..." : m.correction}
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
          onClick={handleSend}
          disabled={!japaneseInput.value.trim() || isStreaming}
          className="rounded-2xl bg-primary px-5 py-2 font-bold text-white disabled:bg-gray-200"
        >
          전송
        </button>
      </div>

      <PromptApiTroubleshootDialog error={troubleshootError} onClose={dismissTroubleshoot} />
    </div>
  );
}

export default ConversationPage;
