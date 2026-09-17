import { useCallback, useEffect, useMemo, useRef } from "react";
import { useAiModel } from "../hooks/useAiModel";
import { usePromptApiTroubleshoot } from "../hooks/usePromptApiTroubleshoot";
import { useGamificationStore } from "../stores/gamificationStore";
import { useUserProfileStore } from "../stores/userProfileStore";
import { useConversationSessionStore } from "../stores/conversationSessionStore";
import { XP_REWARDS } from "../lib/xpRewards";
import {
  GRAMMAR_CORRECTION_SYSTEM_PROMPT,
  OPENING_TRIGGER,
  buildGrammarCorrectionUserPrompt,
  buildSystemPrompt,
  type Level,
  type Scenario,
} from "../lib/conversationPrompts";
import PromptApiTroubleshootDialog from "./PromptApiTroubleshootDialog";

/**
 * 회화 페이지(/conversation)는 라우트를 벗어나면 unmount되므로, 세션/스트리밍 로직을 그
 * 안에 두면 다른 탭에 갔다 돌아왔을 때 LLM 세션이 destroy되고 대화가 끊긴다. 그 로직을
 * Layout에 항상 마운트되는(BadgeWatcher/Confetti와 같은 패턴) 이 컴포넌트로 옮기고,
 * useConversationSessionStore로 상태를 노출한다 — ConversationPage는 이 store를 구독하고
 * 액션을 호출만 하는 얇은 뷰가 된다.
 */
function ConversationSessionController() {
  const scenario = useConversationSessionStore((s) => s.scenario);
  const level = useConversationSessionStore((s) => s.level);
  const userName = useUserProfileStore((s) => s.name);
  const recordProgress = useGamificationStore((s) => s.recordProgress);
  const { troubleshootError, reportError, dismissTroubleshoot } = usePromptApiTroubleshoot();
  // 시나리오/레벨이 바뀔 때마다 한 번만 AI가 먼저 말을 걸도록 막는 플래그.
  const hasSentOpeningRef = useRef(false);

  const systemPrompt = useMemo(
    () => (scenario && level ? buildSystemPrompt(scenario, level, userName || undefined) : ""),
    [scenario, level, userName]
  );
  const chatModel = useAiModel(systemPrompt);
  const correctionModel = useAiModel(GRAMMAR_CORRECTION_SYSTEM_PROMPT);

  useEffect(() => {
    useConversationSessionStore.setState({
      chatStatus: chatModel.status,
      chatDownloadProgress: chatModel.downloadProgress,
      chatEngine: chatModel.engine,
      chatBusyLabel: chatModel.busyLabel,
    });
  }, [chatModel.status, chatModel.downloadProgress, chatModel.engine, chatModel.busyLabel]);

  const streamAssistantReply = useCallback(
    async (assistantMsgId: string, input: string) => {
      useConversationSessionStore.setState({ isStreaming: true });
      try {
        let acc = "";
        for await (const chunk of chatModel.promptStreaming(input)) {
          acc += chunk;
          const snapshot = acc;
          useConversationSessionStore.setState((s) => ({
            messages: s.messages.map((msg) => (msg.id === assistantMsgId ? { ...msg, text: snapshot } : msg)),
          }));
        }
      } catch (err) {
        useConversationSessionStore.setState((s) => ({
          messages: s.messages.map((msg) =>
            msg.id === assistantMsgId ? { ...msg, text: "(응답 생성 중 오류가 발생했습니다)" } : msg
          ),
        }));
        reportError(err);
      } finally {
        useConversationSessionStore.setState({ isStreaming: false });
      }
    },
    [chatModel, reportError]
  );

  const sendMessage = useCallback(
    async (userText: string) => {
      const userMsgId = crypto.randomUUID();
      const assistantMsgId = crypto.randomUUID();
      useConversationSessionStore.setState((s) => ({
        messages: [
          ...s.messages,
          { id: userMsgId, role: "user" as const, text: userText },
          { id: assistantMsgId, role: "assistant" as const, text: "" },
        ],
      }));
      recordProgress(XP_REWARDS.conversationMessage);

      await streamAssistantReply(assistantMsgId, userText);

      if (!useConversationSessionStore.getState().showCorrection) return;
      useConversationSessionStore.setState((s) => ({
        messages: s.messages.map((msg) => (msg.id === userMsgId ? { ...msg, correctionLoading: true } : msg)),
      }));
      try {
        const correction = await correctionModel.prompt(buildGrammarCorrectionUserPrompt(userText));
        useConversationSessionStore.setState((s) => ({
          messages: s.messages.map((msg) =>
            msg.id === userMsgId ? { ...msg, correction, correctionLoading: false } : msg
          ),
        }));
      } catch (err) {
        useConversationSessionStore.setState((s) => ({
          messages: s.messages.map((msg) => (msg.id === userMsgId ? { ...msg, correctionLoading: false } : msg)),
        }));
        reportError(err);
      }
    },
    [streamAssistantReply, correctionModel, recordProgress, reportError]
  );

  const startConversation = useCallback((s: Scenario, l: Level) => {
    hasSentOpeningRef.current = false;
    useConversationSessionStore.setState({ scenario: s, level: l, messages: [] });
  }, []);

  const resetConversation = useCallback(() => {
    useConversationSessionStore.setState({ scenario: null, level: null, messages: [] });
  }, []);

  useEffect(() => {
    useConversationSessionStore.setState({ startConversation, resetConversation, sendMessage });
  }, [startConversation, resetConversation, sendMessage]);

  // 회화 시작 직후 AI가 먼저 말을 걸게 한다 — OPENING_TRIGGER는 실제 학습자 발화가 아니므로
  // 대화 로그(messages)에는 남기지 않고, 그걸 보내서 받은 응답만 assistant 메시지로 추가한다.
  useEffect(() => {
    if (!scenario || !level || hasSentOpeningRef.current) return;
    hasSentOpeningRef.current = true;

    const assistantMsgId = crypto.randomUUID();
    useConversationSessionStore.setState({ messages: [{ id: assistantMsgId, role: "assistant", text: "" }] });
    streamAssistantReply(assistantMsgId, OPENING_TRIGGER);
  }, [scenario, level, streamAssistantReply]);

  return <PromptApiTroubleshootDialog error={troubleshootError} onClose={dismissTroubleshoot} />;
}

export default ConversationSessionController;
