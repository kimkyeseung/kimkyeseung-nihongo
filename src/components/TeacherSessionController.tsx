import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAiModel } from "../hooks/useAiModel";
import { usePromptApiTroubleshoot } from "../hooks/usePromptApiTroubleshoot";
import {
  MEMORY_EXTRACTION_SYSTEM_PROMPT,
  buildMemoryExtractionPrompt,
  parseExtractedFacts,
} from "../lib/memoryExtraction";
import { looksLikePromptLeak, looksOffRole } from "../lib/promptSafety";
import { localDateKey } from "../lib/localDate";
import {
  TEACHER_ERROR_ANSWER,
  TEACHER_LEAK_REFERENCE,
  TEACHER_REFUSAL_ANSWER,
  TEACHER_REDIRECT_INTRO,
  buildTeacherRedirectPrompt,
  buildTeacherSystemPrompt,
  buildTeacherUserPrompt,
  followUpContext,
  teacherHistoryTurns,
} from "../lib/teacherPrompts";
import { XP_REWARDS } from "../lib/xpRewards";
import { useGamificationStore } from "../stores/gamificationStore";
import { recordStudyEvent, useLearnerMemoryStore } from "../stores/learnerMemoryStore";
import { useTeacherChatStore } from "../stores/teacherChatStore";
import { useTeacherSessionStore } from "../stores/teacherSessionStore";
import PromptApiTroubleshootDialog from "./PromptApiTroubleshootDialog";

/**
 * 이보다 짧은 답변에서는 기억할 만한 개인적인 사실이 나올 일이 없다. 추출은 추론이 한 번 더
 * 도는 일이라(Gemma/Safari에서는 체감된다) 값어치 없는 호출은 아예 걸지 않는다.
 */
const MIN_ANSWER_LENGTH_FOR_EXTRACTION = 40;

/**
 * 방금 주고받은 대화에서 기억할 만한 사실을 뽑아 "확인 대기"로 넣어둔다.
 *
 * 스트리밍이 아니라 단발성 `prompt()`다 — 화면에 흘려 보여줄 게 아니라 다 받은 뒤 한 번에
 * 파싱하면 되기 때문. 결과는 바로 저장되지 않고 사용자가 수락해야 선생님이 쓴다
 * (learnerMemoryDb.ts의 MemoryFact.status 주석 참고).
 */
async function extractFacts(
  extractor: { prompt: (input: string) => Promise<string> },
  question: string,
  answer: string,
  addPendingFacts: (facts: ReturnType<typeof parseExtractedFacts>) => Promise<void>
) {
  try {
    const raw = await extractor.prompt(buildMemoryExtractionPrompt(question, answer));
    const facts = parseExtractedFacts(raw);
    if (facts.length > 0) await addPendingFacts(facts);
  } catch {
    // 부가 기능이라 조용히 넘어간다. 여기서 실패를 화면에 띄우면 수업과 상관없는 오류로
    // 사용자를 놀라게 할 뿐이다.
  }
}

/**
 * 선생님 수업 세션. **Layout에 항상 마운트된다** — 예전엔 TeacherPage 안에서 돌아서, 긴 설명을
 * 기다리다 다른 탭에 가면 페이지가 언마운트되며 세션이 destroy되고 답변이 끊겼다. 회화의
 * ConversationSessionController와 같은 방식으로 옮겼고, 페이지는 `teacherSessionStore`로
 * 상태를 읽고 질문을 넣기만 한다.
 *
 * 덤으로 **모델 쪽 대화 맥락도 탭 이동에 살아남는다**(예전엔 페이지를 떠날 때마다 새 세션이었다).
 */
function TeacherSessionController() {
  const promptMemory = useLearnerMemoryStore((s) => s.promptMemory);
  const addPendingFacts = useLearnerMemoryStore((s) => s.addPendingFacts);
  const isAnswering = useTeacherChatStore((s) => s.isAnswering);
  const recordProgress = useGamificationStore((s) => s.recordProgress);
  const { troubleshootError, reportError, dismissTroubleshoot } = usePromptApiTroubleshoot();

  /**
   * **답변 중에는 기억 스냅샷을 바꾸지 않는다.** 시스템 프롬프트가 바뀌면 useAiModel이 세션을
   * destroy하는데, 이제 답변은 페이지 밖에서도 계속 받으므로 그 사이 /memory에서 기억을
   * 수락하거나 TeacherPage에 다시 들어와 스냅샷이 갱신되면 **받던 답변이 한가운데서 끊긴다.**
   * 답변 중에 바뀐 스냅샷은 끝난 뒤 반영한다(렌더 중 파생 state — effect로 동기화하지 않는다).
   */
  const [committedMemory, setCommittedMemory] = useState(promptMemory);
  if (!isAnswering && committedMemory !== promptMemory) setCommittedMemory(promptMemory);
  const systemPrompt = useMemo(() => buildTeacherSystemPrompt(committedMemory), [committedMemory]);

  /**
   * 세션을 새로 만들 때 다시 채울 오늘 대화. **화면의 대화와 모델이 아는 대화를 맞추려는 것이다**
   * — 예전엔 세션이 새로 만들어지면(새로고침, 기억 스냅샷 갱신, 모바일 GPU 유실, 유출 가드) 화면에는
   * 앞 대화가 그대로 보이는데 모델은 처음부터라, 「부정형 문장으로 바꾸면?」 같은 이어지는 질문에
   * 엉뚱하게 답했다(실제로 겪었다). 지금 답할 질문(빈 답변과 짝)은 teacherHistoryTurns가 뺀다.
   */
  const getHistory = useCallback(() => {
    const chat = useTeacherChatStore.getState();
    const date = chat.answeringDate ?? localDateKey();
    return teacherHistoryTurns(chat.messagesByDate[date] ?? []);
  }, []);
  const model = useAiModel(systemPrompt, { history: getHistory });
  const { resetSession } = model;

  // 오늘 대화를 지우면 모델 쪽 맥락도 버린다 — 화면은 비었는데 선생님이 지운 대화를 기억하면 안 된다.
  const todayEmpty = useTeacherChatStore((s) => (s.messagesByDate[localDateKey()] ?? []).length === 0);
  useEffect(() => {
    if (todayEmpty) resetSession();
  }, [todayEmpty, resetSession]);

  /** 세션이 어느 날의 대화를 들고 있는지. 자정을 넘기면 어제 대화를 버리고 새로 시작한다. */
  const sessionDateRef = useRef<string | null>(null);
  // 기억 추출은 수업 맥락을 오염시키면 안 되므로 세션을 따로 둔다 — 회화의 문법 교정·번역과
  // 같은 이유다.
  const extractor = useAiModel(MEMORY_EXTRACTION_SYSTEM_PROMPT);

  useEffect(() => {
    useTeacherSessionStore.setState({
      status: model.status,
      engine: model.engine,
      downloadProgress: model.downloadProgress,
      busyLabel: model.busyLabel,
    });
  }, [model.status, model.engine, model.downloadProgress, model.busyLabel]);

  const answer = useCallback(
    async (question: string) => {
      const chat = useTeacherChatStore.getState();
      const today = localDateKey();
      if (sessionDateRef.current !== today) {
        sessionDateRef.current = today;
        model.resetSession();
      }
      // 「부정형으로 바꾸면?」처럼 앞을 가리키는 짧은 질문이면 직전 질문·예문을 같이 싣는다.
      // ask() 전에 읽어야 지금 질문이 "직전 질문"으로 잡히지 않는다.
      const context = followUpContext(question, chat.messagesByDate[today] ?? []);
      const { assistantId } = chat.ask(question);
      recordProgress(XP_REWARDS.teacherQuestion);
      recordStudyEvent({ type: "teacher-question", subject: question });
      // 실패 안내문은 화면에만 남기고 기록에는 넣지 않는다(finishAnswer 주석 참고).
      let failed = false;
      try {
        let acc = "";
        let derailed = false;
        for await (const chunk of model.promptStreaming(buildTeacherUserPrompt(question, context))) {
          acc += chunk;
          // 지시문을 읊기 시작하거나(유출 가드) 역할을 벗어나면(중국어 레시피·영어 답 — looksOffRole)
          // 거기서 끊는다. 프롬프트로 "하지 말라"고 시키는 것만으로는 막히지 않는다(promptSafety.ts 주석).
          //
          // **고정 지시문에서 답변 모양 지시를 뺀 TEACHER_LEAK_REFERENCE만 넘긴다.** 모델이
          // 모양 지시(①②③)를 소제목으로 따라 쓰는 건 정상이다. 또 실제로 모델에게 준 시스템
          // 프롬프트에는 기억 블록이 붙어 있지만, 그것까지 넘기면 선생님이 학습자의 기억을
          // 정상적으로 되받기만 해도 유출로 오인한다(teacherPrompts.ts 주석 참고).
          if (looksLikePromptLeak(acc, TEACHER_LEAK_REFERENCE) || looksOffRole(acc, "teacher")) {
            derailed = true;
            break;
          }
          chat.appendAnswer(assistantId, acc);
        }

        if (derailed) {
          // 거절 문구 하나로 끝내지 않고, 그 부탁하는 말을 일본어로 가르치는 답으로 되돌린다(사용자 요청).
          // 먼저 세션을 버린다 — 오염된 턴이 히스토리에 남으면 다음 질문에서 이어받을 수 있다.
          model.resetSession();
          chat.appendAnswer(assistantId, TEACHER_REDIRECT_INTRO);
          let redirect = "";
          let ok = true;
          try {
            for await (const chunk of model.promptStreaming(buildTeacherRedirectPrompt(question))) {
              redirect += chunk;
              // 학습자가 쓴 「시스템 프롬프트」 같은 말이 번역 줄에 나오는 건 정상이라 그 표시는 봐준다.
              if (
                looksLikePromptLeak(redirect, TEACHER_LEAK_REFERENCE, { allowMarkersFrom: question }) ||
                looksOffRole(redirect, "teacher")
              ) {
                ok = false;
                break;
              }
              chat.appendAnswer(assistantId, TEACHER_REDIRECT_INTRO + redirect);
            }
          } catch {
            ok = false;
          }
          // 되돌리기 질문에도 학습자의 그 글이 들어 있다 — 다음 질문은 깨끗한 세션에서 시작한다
          // (다시 채울 때 TEACHER_REDIRECT_INTRO로 시작하는 답은 빠진다).
          model.resetSession();
          if (!ok || !redirect.trim()) chat.appendAnswer(assistantId, TEACHER_REFUSAL_ANSWER);
          return;
        }

        // 답변이 끝난 뒤에 기억할 만한 사실이 있었는지 따로 물어본다. 답변을 기다리게 하지
        // 않으려고 await하지 않는다 — 실패해도 수업에는 아무 영향이 없는 부가 기능이다.
        if (acc.length >= MIN_ANSWER_LENGTH_FOR_EXTRACTION) {
          void extractFacts(extractor, question, acc, addPendingFacts);
        }
      } catch (err) {
        failed = true;
        chat.appendAnswer(assistantId, TEACHER_ERROR_ANSWER);
        reportError(err);
      } finally {
        // 여기서 답변이 IndexedDB에 한 번 저장된다(스트리밍 중에는 저장하지 않는다).
        // 실패했으면 화면에만 남기고 저장은 건너뛴다.
        chat.finishAnswer(assistantId, { persist: !failed });
      }
    },
    [model, extractor, addPendingFacts, recordProgress, reportError]
  );

  // 페이지가 넣은 질문을 꺼내 묻는다. 답변 중에 들어온 질문은 끝날 때까지 큐에 남는다
  // (`isAnswering`이 풀리면 이 effect가 다시 돈다).
  const queued = useTeacherSessionStore((s) => s.queued);
  useEffect(() => {
    if (!queued || isAnswering) return;
    const question = useTeacherSessionStore.getState().take();
    if (question) void answer(question);
  }, [queued, isAnswering, answer]);

  return <PromptApiTroubleshootDialog error={troubleshootError} onClose={dismissTroubleshoot} />;
}

export default TeacherSessionController;
