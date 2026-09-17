import { useCallback, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { motion } from "framer-motion";
import FuriganaText from "../components/FuriganaText";
import LoadingMascot from "../components/LoadingMascot";
import PromptApiTroubleshootDialog from "../components/PromptApiTroubleshootDialog";
import GemmaEngineNotice from "../components/GemmaEngineNotice";
import PromptApiUnsupportedNotice from "../components/PromptApiUnsupportedNotice";
import { useAiModel } from "../hooks/useAiModel";
import { usePromptApiTroubleshoot } from "../hooks/usePromptApiTroubleshoot";
import { useGamificationStore } from "../stores/gamificationStore";
import { XP_REWARDS } from "../lib/xpRewards";
import {
  LEVELS,
  SCENARIOS,
  buildCorrectionPrompt,
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

  return (
    <div className="p-4 sm:p-6">
      <h3 className="text-sm text-gray-400">시나리오 선택</h3>
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
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [showFurigana, setShowFurigana] = useState(true);
  const [showCorrection, setShowCorrection] = useState(false);

  const systemPrompt = useMemo(
    () => (scenario && level ? buildSystemPrompt(scenario, level) : ""),
    [scenario, level]
  );
  const chatModel = useAiModel(systemPrompt);
  const correctionModel = useAiModel("");
  const recordProgress = useGamificationStore((s) => s.recordProgress);
  const { troubleshootError, reportError, dismissTroubleshoot } = usePromptApiTroubleshoot();
  const listEndRef = useRef<HTMLDivElement>(null);

  const handleStart = useCallback((s: Scenario, l: Level) => {
    setScenario(s);
    setLevel(l);
    setMessages([]);
  }, []);

  const handleSend = useCallback(async () => {
    const userText = input.trim();
    if (!userText || isStreaming) return;
    setInput("");

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
        const correction = await correctionModel.prompt(buildCorrectionPrompt(userText));
        setMessages((m) =>
          m.map((msg) => (msg.id === userMsgId ? { ...msg, correction, correctionLoading: false } : msg))
        );
      } catch (err) {
        setMessages((m) => m.map((msg) => (msg.id === userMsgId ? { ...msg, correctionLoading: false } : msg)));
        reportError(err);
      }
    }
  }, [input, isStreaming, chatModel, correctionModel, showCorrection, recordProgress, reportError]);

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSend();
    }
  }

  if (chatModel.status === "checking") {
    return <p className="p-6 text-gray-400">AI 준비 상태 확인 중...</p>;
  }

  // Gemma 4를 고른 상태에서 못 쓰는 경우는 원인(모델 없음 / WebGPU 없음)도 해결법도 달라서
  // Prompt API 안내와 다른 화면을 보여준다.
  if (
    chatModel.engine === "gemma4" &&
    (chatModel.status === "model-missing" || chatModel.status === "unsupported")
  ) {
    return (
      <div>
        <h2 className="p-4 pb-0 text-xl text-primary sm:p-6 sm:pb-0">💬 회화 연습</h2>
        <GemmaEngineNotice reason={chatModel.status} feature="회화 연습" />
      </div>
    );
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

      {/* Gemma 엔진 준비는 퍼센트가 없어서(모델을 GPU에 올리는 작업) 문구만 보여준다. */}
      {chatModel.busyLabel && (
        <div className="p-3">
          <LoadingMascot label={chatModel.busyLabel} />
        </div>
      )}

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
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="日本語でメッセージを入力..."
          className="flex-1 rounded-2xl border-2 border-gray-100 px-4 py-2 font-ja focus:border-primary/40 focus:outline-none"
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || isStreaming}
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
