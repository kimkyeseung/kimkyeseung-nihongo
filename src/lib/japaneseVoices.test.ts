import { describe, expect, it } from "vitest";
import {
  listeningRate,
  pickJapaneseVoice,
  pickSpeakerVoices,
  rankJapaneseVoices,
  splitForSpeech,
  type VoiceLike,
} from "./japaneseVoices";

// 음성을 잘못 골라도 소리는 난다 — 콘솔은 조용하고 발음만 과장되게 들린다(macOS에서 Eddy가 골라지고
// 있었다). 청해는 A/B가 같은 목소리·같은 음높이면 누가 말하는지 못 가려서 문제를 풀 수 없다.

const v = (name: string, lang = "ja-JP", isDefault = false): VoiceLike => ({ name, lang, default: isDefault });

// macOS Ventura+의 실제 순서 — 캐릭터 목소리가 앞을 차지한다.
const MAC = [v("Eddy (日本語（日本）)"), v("Flo (日本語（日本）)"), v("Kyoko"), v("Grandma (日本語（日本）)"), v("Samantha", "en-US")];

describe("pickJapaneseVoice", () => {
  it("목록 맨 앞의 캐릭터 목소리(Eddy)가 아니라 Kyoko를 고른다", () => {
    expect(pickJapaneseVoice(MAC)?.name).toBe("Kyoko");
  });

  it("고품질 버전이 있으면 그쪽을 고른다", () => {
    expect(pickJapaneseVoice([v("Kyoko"), v("Kyoko (Enhanced)")])?.name).toBe("Kyoko (Enhanced)");
  });

  it("Siri 음성(O-ren)이 Kyoko보다 먼저다", () => {
    expect(pickJapaneseVoice([v("Kyoko"), v("O-ren (Premium)")])?.name).toBe("O-ren (Premium)");
  });

  it("일본어 음성이 없으면 null", () => {
    expect(pickJapaneseVoice([v("Samantha", "en-US")])).toBeNull();
    expect(pickJapaneseVoice([])).toBeNull();
  });

  it("캐릭터 목소리뿐이어도 없는 것보다는 낫다", () => {
    expect(pickJapaneseVoice([v("Eddy (日本語（日本）)")])?.name).toBe("Eddy (日本語（日本）)");
  });

  it("점수가 같으면 먼저 나온 것", () => {
    expect(pickJapaneseVoice([v("Unknown A"), v("Unknown B")])?.name).toBe("Unknown A");
  });
});

describe("rankJapaneseVoices", () => {
  it("일본어만, 캐릭터 목소리는 맨 뒤로", () => {
    expect(rankJapaneseVoices(MAC).map((x) => x.name)).toEqual([
      "Kyoko",
      "Eddy (日本語（日本）)",
      "Flo (日本語（日本）)",
      "Grandma (日本語（日本）)",
    ]);
  });
});

describe("pickSpeakerVoices — 청해의 A/B 화자", () => {
  it("다른 사람의 음성이 둘 있으면 각각 쓴다", () => {
    const s = pickSpeakerVoices([v("Kyoko"), v("Otoya")])!;
    expect(s.A.voice.name).toBe("Kyoko");
    expect(s.B.voice.name).toBe("Otoya");
    expect(s.A.pitch).toBe(1);
    expect(s.B.pitch).toBe(1);
  });

  it("같은 사람의 품질만 다른 음성(Kyoko / Kyoko Enhanced)은 다른 화자로 치지 않는다", () => {
    const s = pickSpeakerVoices([v("Kyoko"), v("Kyoko (Enhanced)")])!;
    expect(s.A.voice.name).toBe("Kyoko (Enhanced)");
    expect(s.B.voice.name).toBe("Kyoko (Enhanced)");
    expect(s.B.pitch).toBeGreaterThan(s.A.pitch);
  });

  it("캐릭터 목소리를 B로 쓰지 않는다 — 같은 목소리에 음높이만 올린다", () => {
    const s = pickSpeakerVoices(MAC)!;
    expect(s.A.voice.name).toBe("Kyoko");
    expect(s.B.voice.name).toBe("Kyoko");
    expect(s.B.pitch).toBeGreaterThan(1);
  });

  it("일본어 음성이 하나뿐이면 같은 목소리, B만 음높이를 올린다", () => {
    const s = pickSpeakerVoices([v("Google 日本語")])!;
    expect(s.B.voice).toBe(s.A.voice);
    expect(s.B.pitch).not.toBe(s.A.pitch);
  });

  it("일본어 음성이 없으면 null — 청해를 건너뛴다", () => {
    expect(pickSpeakerVoices([v("Samantha", "en-US")])).toBeNull();
    expect(pickSpeakerVoices([])).toBeNull();
  });
});

describe("listeningRate", () => {
  it("N5·N4 0.9, N3 0.95, N2·N1 1.0", () => {
    expect(listeningRate("N5")).toBe(0.9);
    expect(listeningRate("N4")).toBe(0.9);
    expect(listeningRate("N3")).toBe(0.95);
    expect(listeningRate("N2")).toBe(1);
    expect(listeningRate("N1")).toBe(1);
  });
});

describe("splitForSpeech", () => {
  it("짧은 문장은 앞 조각에 붙인다", () => {
    expect(splitForSpeech("はい。そうです。")).toEqual(["はい。 そうです。"]);
  });

  it("120자를 넘으면 나눈다", () => {
    const long = "あ".repeat(100) + "。";
    expect(splitForSpeech(long + long)).toHaveLength(2);
  });
});
