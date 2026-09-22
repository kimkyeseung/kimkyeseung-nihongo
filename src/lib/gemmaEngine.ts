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
  /** 이 세션이 올라간 엔진이 그 뒤로 버려졌는지(GPU 디바이스 유실 등). true면 새로 만들 것. */
  isStale(): boolean;
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
 * 엔진이 새로 뜰 때마다 1씩 오른다. 세션은 만들어질 때의 세대를 기억해 두고, 세대가 바뀌었으면
 * (= 그 사이 엔진이 버려졌으면) 죽은 엔진 위의 세션이라는 뜻이다 — `GemmaSession.isStale()`.
 */
let engineGeneration = 0;

/** discardGemmaEngine이 세운다 — 다음 엔진은 WASM 런타임(과 GPU 디바이스)부터 새로 띄운다. */
let freshRuntimeOnNextLoad = false;

/**
 * 받아둔 모델 파일로 엔진을 띄운다(이미 떠 있으면 그대로 재사용).
 * 모델이 아직 없으면 에러 — 호출 전에 대문에서 내려받아야 한다.
 */
export function loadGemmaEngine(): Promise<Engine> {
  if (enginePromise) return enginePromise;
  const generation = ++engineGeneration;

  const pending = (async () => {
    const file = await getCachedModelFile();
    if (!file) throw new Error("Gemma 4 모델이 아직 내려받아지지 않았습니다.");

    // 패키지가 WASM을 함께 들고 와서 무겁다 — 동적 import로 진입 청크와 분리한다.
    const { Engine, loadLiteRtLm, unloadLiteRtLm, getGlobalLiteRtLm } = await import(
      "@litert-lm/core"
    );
    if (freshRuntimeOnNextLoad) {
      // 죽은 GPU 디바이스를 들고 있는 전역 WASM 인스턴스를 내린다(discardGemmaEngine 참고).
      freshRuntimeOnNextLoad = false;
      try {
        unloadLiteRtLm();
      } catch {
        // 로딩 중이면 던진다 — 그때는 어차피 새 인스턴스(새 디바이스)로 뜨는 중이다.
      }
    }
    if (LITERT_WASM_PATH) await loadLiteRtLm(LITERT_WASM_PATH);
    const engine = await Engine.create({
      model: file,
      mainExecutorSettings: { maxNumTokens: 4096 },
    });

    // 엔진이 쓰는 GPU 디바이스가 죽으면(모바일 백그라운드 등) 사용자가 다음 메시지를
    // 보내기 **전에** 미리 버려 둔다 — 그래야 돌아와서 보내는 첫 메시지가 실패하지 않는다.
    // 세대를 확인하는 건, 이미 다른 엔진으로 갈아탄 뒤에 옛 디바이스의 lost가 늦게 도착해
    // 멀쩡한 새 엔진까지 버리는 일을 막으려는 것이다.
    getGlobalLiteRtLm()
      .liteRtLmWasm.preinitializedWebGPUDevice?.lost.then(() => {
        if (generation === engineGeneration) discardGemmaEngine();
      })
      .catch(() => {});

    return engine;
  })();
  enginePromise = pending;

  // 실패한 Promise를 캐시해두면 다시 시도할 수 없으므로 실패 시 캐시를 비운다.
  // (그 사이 다른 엔진으로 갈아탔으면 그쪽은 건드리지 않는다.)
  pending.catch(() => {
    if (enginePromise === pending) enginePromise = null;
  });

  return pending;
}

/** 엔진을 내리고 GPU 메모리를 돌려준다. 모델 파일(OPFS)은 그대로 남는다. */
export async function unloadGemmaEngine(): Promise<void> {
  const pending = enginePromise;
  enginePromise = null;
  if (!pending) return;
  const engine = await pending.catch(() => null);
  await engine?.delete();
}

/**
 * 캐시된 엔진을 **정리를 기다리지 않고** 즉시 버린다. 모바일에서 다른 앱을 보다가 돌아오면
 * WebGPU 컨텍스트가 죽어 있는 경우가 있는데(OS가 백그라운드 탭의 GPU 리소스를 회수한다),
 * 그 상태에서 `unloadGemmaEngine()`처럼 `engine.delete()`를 기다리면 죽은 디바이스를 상대로
 * 또 호출하는 셈이라 실패하거나 걸릴 수 있다. 참조만 먼저 비워서 다음 `loadGemmaEngine()`이
 * 새 엔진을 만들게 하고, 옛 엔진 정리는 되면 좋고 안 돼도 그만인 배경 작업으로 던져둔다.
 *
 * **엔진만 버리면 소용없다 (실제로 겪은 버그).** LiteRT-LM은 GPU 디바이스를 엔진이 아니라
 * **전역 WASM 모듈**(`liteRtLmWasm.preinitializedWebGPUDevice`)에 캐시하고, `Engine.create`는
 * 그게 있으면 새로 만들지 않고 그대로 쓴다. 그래서 엔진만 다시 만들면 **같은 죽은 디바이스**
 * 위에 또 올라가 계속 실패했고, 그 전역을 비우는 건 새로고침뿐이었다. 그래서 여기서
 * `unloadLiteRtLm()`으로 WASM 인스턴스까지 내린다 — 다음 `Engine.create`가 WASM을 다시
 * 띄우고(파일은 HTTP 캐시에 있다) 디바이스도 새로 받는다. 새로고침이 해주던 일과 같다.
 *
 * `useGemmaSession`이 실패를 잡았을 때와, 디바이스의 `lost`가 도착했을 때만 부른다 —
 * 정상적으로 쓰는 중에는 절대 부를 이유가 없다.
 */
export function discardGemmaEngine(): void {
  const pending = enginePromise;
  enginePromise = null;
  // 세대를 올려 두면 이 엔진 위에서 만든 세션이 전부 isStale()이 된다.
  engineGeneration++;
  if (!pending) return;
  // WASM을 여기서 비동기로 내리면, 그 사이 바로 다시 보낸 메시지가 옛 런타임(=죽은 디바이스)을
  // 집어갈 수 있다. 그래서 "다음에 띄울 때 런타임부터 새로"라는 표시만 남기고, 실제로 내리는
  // 건 loadGemmaEngine이 Engine.create 직전에 한다.
  freshRuntimeOnNextLoad = true;
  void pending.then((engine) => engine.delete()).catch(() => {});
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
  const generation = engineGeneration;
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

    isStale() {
      return generation !== engineGeneration;
    },
  };
}
