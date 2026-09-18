import type { Conversation, Engine, Message } from "@litert-lm/core";
import { getCachedModelFile } from "./gemmaModel";

/**
 * LiteRT-LM(WebGPU) 위에서 도는 Gemma 4 엔진 어댑터.
 *
 * 회화·작문 페이지는 `useLanguageModel`이 돌려주는 `{ prompt, promptStreaming }` 모양에
 * 맞춰 쓰여 있으므로, 여기서도 같은 모양을 내보낸다 — 페이지 쪽 코드는 어느 엔진인지 몰라도
 * 되게 하려는 것이다. (`window.LanguageModel`을 직접 부르지 말라는 규칙과 같은 이유로,
 * `@litert-lm/core`도 이 파일 밖에서 직접 import하지 말 것.)
 */

/** 회화 세션 하나. Prompt API의 LanguageModelSession과 같은 역할이다. */
export interface GemmaSession {
  prompt(input: string): Promise<string>;
  promptStreaming(input: string): AsyncGenerator<string>;
  destroy(): Promise<void>;
}

/**
 * LiteRT-LM 런타임(WASM)을 어디서 받을지.
 *
 * null이면 패키지 기본값인 jsDelivr CDN(`cdn.jsdelivr.net/npm/@litert-lm/core@<ver>/wasm`)에서
 * 받는다 — 브라우저 기능에 맞는 변종 하나(약 21~34MB)만 받아 캐시하며, 2GB 모델에 비하면
 * 작고 저장소에 아무것도 안 넣어도 된다. 사용자가 입력한 문장이 CDN으로 가는 일은 없다
 * (정적 파일만 받아온다).
 *
 * 외부 CDN 없이 완전히 자체 호스팅하고 싶다면 `node_modules/@litert-lm/core/wasm/`(4개 변종
 * 합쳐 107MB)을 public/ 아래로 복사하고 여기에 그 경로("/litert-wasm/")를 넣으면 된다.
 */
const LITERT_WASM_PATH: string | null = null;

// 모델 2GB를 GPU에 올리는 건 엔진 1개당 한 번뿐이어야 한다. 엔진은 앱 전체에서 하나만 두고,
// 시나리오별 세션은 그 엔진에서 파생되는 Conversation으로 만든다(만들고 지우는 비용이 싸다).
let enginePromise: Promise<Engine> | null = null;

/**
 * 받아둔 모델 파일로 엔진을 띄운다(이미 떠 있으면 그대로 재사용).
 * 모델이 아직 없으면 에러 — 호출 전에 대문에서 내려받아야 한다.
 */
export function loadGemmaEngine(): Promise<Engine> {
  enginePromise ??= (async () => {
    const file = await getCachedModelFile();
    if (!file) throw new Error("Gemma 4 모델이 아직 내려받아지지 않았습니다.");

    // 패키지가 WASM을 함께 들고 와서 무겁다 — 동적 import로 진입 청크와 분리한다.
    const { Engine, loadLiteRtLm } = await import("@litert-lm/core");
    if (LITERT_WASM_PATH) await loadLiteRtLm(LITERT_WASM_PATH);
    return Engine.create({
      model: file,
      mainExecutorSettings: { maxNumTokens: 4096 },
    });
  })();

  // 실패한 Promise를 캐시해두면 다시 시도할 수 없으므로 실패 시 캐시를 비운다.
  enginePromise.catch(() => {
    enginePromise = null;
  });

  return enginePromise;
}

/** 엔진을 내리고 GPU 메모리를 돌려준다. 모델 파일(OPFS)은 그대로 남는다. */
export async function unloadGemmaEngine(): Promise<void> {
  const pending = enginePromise;
  enginePromise = null;
  if (!pending) return;
  const engine = await pending.catch(() => null);
  await engine?.delete();
}

export function isGemmaEngineLoaded(): boolean {
  return enginePromise !== null;
}

/** Message.content는 문자열일 수도, 파트 배열일 수도 있다. 텍스트만 뽑아낸다. */
function messageText(message: Message): string {
  const content = message.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("");
}

/** systemPrompt를 가진 대화 세션을 만든다. 다 쓰면 반드시 destroy할 것. */
export async function createGemmaSession(systemPrompt: string): Promise<GemmaSession> {
  const engine = await loadGemmaEngine();
  const conversation: Conversation = await engine.createConversation(
    systemPrompt
      ? { preface: { messages: [{ role: "system", content: systemPrompt }] } }
      : undefined
  );

  return {
    async prompt(input: string) {
      const response = await conversation.sendMessage(input);
      return messageText(response);
    },

    async *promptStreaming(input: string) {
      // sendMessageStreaming은 ReadableStream<Message>를 돌려준다. 청크마다 새로 생긴
      // 부분(delta)만 담겨 오므로 그대로 흘려보내면 된다 — Prompt API의 promptStreaming과 같다.
      const reader = conversation.sendMessageStreaming(input).getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          const text = messageText(value);
          if (text) yield text;
        }
      } finally {
        reader.releaseLock();
      }
    },

    async destroy() {
      conversation.cancel();
      await conversation.delete();
    },
  };
}
