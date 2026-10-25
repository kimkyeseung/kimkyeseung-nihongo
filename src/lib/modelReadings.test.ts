import { describe, expect, it } from "vitest";
import { stripModelReadings } from "./modelReadings";

// 모델이 쓴 읽기는 자주 틀린다(面白い → おもろい, 教えてください → しちゃいてください — 실제 답변).
// 걷어내지 못하면 사전 후리가나 옆에 틀린 읽기가 뜨고, 너무 걷어내면 뜻풀이가 사라진다. 화면은 멀쩡하다.
describe("stripModelReadings", () => {
  it("백틱 바로 뒤의 가나 괄호를 지운다", () => {
    expect(stripModelReadings("- `面白い` (おもろい): 형용사")).toBe("- `面白い`: 형용사");
    expect(stripModelReadings("- `教えてください` (しちゃいてください): 요청")).toBe("- `教えてください`: 요청");
    expect(stripModelReadings("`日本語`（にほんご）")).toBe("`日本語`");
    expect(stripModelReadings("`コーヒー` (コーヒー)")).toBe("`コーヒー`");
  });

  it("백틱 안 끝의 읽기를 지우고, 같이 적은 뜻은 밖으로 뺀다", () => {
    expect(stripModelReadings("동사 `楽しむ(たのしむ)`의")).toBe("동사 `楽しむ`의");
    expect(stripModelReadings("형용사 `面白い(おもしろい, 재미있는)`의 과거형")).toBe(
      "형용사 `面白い` (재미있는)의 과거형"
    );
  });

  it("뜻이나 한글 소리를 적은 괄호, 예문의 번역은 그대로 둔다", () => {
    const text = [
      "- `水` (물): 명사",
      "- `は` (와): 조사",
      "`水を飲みました。`",
      "*(물을 마셨습니다.)*",
      "`食べる` (to eat)",
    ].join("\n");
    expect(stripModelReadings(text)).toBe(text);
  });

  it("백틱이 아닌 본문의 괄호는 건드리지 않는다", () => {
    const text = "면백이(おもしろい)는 이렇게 읽어요";
    expect(stripModelReadings(text)).toBe(text);
  });

  it("실제 답변 한 덩어리", () => {
    const raw = "- `日本語` (にほんご): 명사, 일본어\n- `本当に` (ほんとうに): 부사\n- `面白い` (おもろい): 형용사";
    expect(stripModelReadings(raw)).toBe("- `日本語`: 명사, 일본어\n- `本当に`: 부사\n- `面白い`: 형용사");
  });
});
