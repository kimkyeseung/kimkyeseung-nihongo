import type { JlptLevel } from "../types/jlpt";

// 일본어 음성(SpeechSynthesis) 고르기 — 발음 버튼(useJapaneseSpeech)과 레벨 진단의 청해 플레이어가
// 같이 쓴다. 기기마다 목록도 순서도 달라서 "첫 번째"를 쓰면 안 된다(macOS는 캐릭터 목소리 Eddy가
// 맨 앞이다). 틀려도 소리는 나니까 콘솔은 조용하다 — `japaneseVoices.test.ts`가 고정한다.

/** 테스트에서 진짜 SpeechSynthesisVoice 없이 쓰려고 필요한 필드만 */
export type VoiceLike = Pick<SpeechSynthesisVoice, "name" | "lang" | "default">;

/**
 * macOS(Ventura+)가 기본으로 깔아두는 "캐릭터" 목소리들. ja-JP 목록의 맨 앞을 차지하는데
 * (예전 코드가 목록 첫 번째를 골라서 Eddy가 쓰이고 있었다) 과장된 연기 톤이라 발음 학습에는
 * 부적합하다. 이름만으로 거르므로 소문자로 비교한다.
 */
const NOVELTY_VOICES = [
  "eddy",
  "flo",
  "grandma",
  "grandpa",
  "reed",
  "rocko",
  "sandy",
  "shelley",
  "bells",
  "boing",
  "bubbles",
  "jester",
  "organ",
  "superstar",
  "trinoids",
  "whisper",
  "wobble",
  "zarvox",
  "bad news",
  "good news",
  "cellos",
  "bahh",
];

/** 플랫폼별 "제대로 된" 일본어 음성 이름. 뒤로 갈수록 우선순위가 낮다. */
const PREFERRED_VOICES = [
  "o-ren", // macOS Siri 음성(가장 자연스럽다)
  "hattori", // macOS Siri 음성
  "google 日本語", // Chrome 기본 일본어 음성
  "kyoko", // macOS 표준 일본어 음성
  "otoya",
  "nanami", // Windows/Edge
  "ayumi",
  "haruka",
  "ichiro",
  "keita",
  "sayaka",
];

/** 이름에 붙어 있으면 같은 화자의 고품질(추가 다운로드) 버전이라는 표시. */
const QUALITY_HINTS = ["premium", "enhanced", "neural", "natural", "siri"];

function isNovelty(voice: VoiceLike): boolean {
  const name = voice.name.toLowerCase();
  return NOVELTY_VOICES.some((n) => name.startsWith(n));
}

function scoreVoice(voice: VoiceLike): number {
  const name = voice.name.toLowerCase();
  if (isNovelty(voice)) return -100;

  let score = 0;
  const preferredIndex = PREFERRED_VOICES.findIndex((n) => name.includes(n));
  if (preferredIndex >= 0) score += 50 - preferredIndex;
  if (QUALITY_HINTS.some((hint) => name.includes(hint))) score += 20;
  if (voice.lang === "ja-JP") score += 2;
  if (voice.default) score += 1;
  return score;
}

/** 일본어 음성을 좋은 순으로. 같은 점수면 원래 순서를 지킨다. 캐릭터 목소리는 맨 뒤다. */
export function rankJapaneseVoices<V extends VoiceLike>(voices: readonly V[]): V[] {
  return voices
    .filter((v) => v.lang.toLowerCase().startsWith("ja"))
    .map((v, i) => ({ v, i, s: scoreVoice(v) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map(({ v }) => v);
}

/**
 * 가장 자연스러운 일본어 음성. 캐릭터 목소리뿐이어도 없는 것보다는 낫다(발음 버튼이 아예 안 나는 것보다).
 * 예전 `pickJapaneseVoice`와 같은 결과다 — 동점이면 먼저 나온 쪽.
 */
export function pickJapaneseVoice<V extends VoiceLike>(voices: readonly V[]): V | null {
  return rankJapaneseVoices(voices)[0] ?? null;
}

/** "Kyoko (Enhanced)"와 "Kyoko"는 같은 사람이다 — 품질 표시·괄호를 떼고 비교한다. */
function speakerName(voice: VoiceLike): string {
  let name = voice.name.toLowerCase().replace(/\(.*?\)/g, " ");
  for (const hint of QUALITY_HINTS) name = name.split(hint).join(" ");
  return name.replace(/\s+/g, " ").trim();
}

export type SpeakerVoices<V> = {
  A: { voice: V; pitch: number };
  B: { voice: V; pitch: number };
};

/** 같은 목소리로 B를 읽을 때의 음높이 — 둘이 대화한다는 게 들려야 한다. */
const SAME_VOICE_B_PITCH = 1.3;

/**
 * 청해 대화의 A/B 화자 목소리. 쓸 만한(캐릭터가 아닌) 음성이 **다른 사람으로** 둘 이상이면 각각,
 * 아니면 같은 목소리에 B만 음높이를 올린다. 일본어 음성이 없으면 null — 청해를 건너뛴다.
 */
export function pickSpeakerVoices<V extends VoiceLike>(voices: readonly V[]): SpeakerVoices<V> | null {
  const ranked = rankJapaneseVoices(voices);
  const best = ranked[0];
  if (!best) return null;
  const other = ranked.find((v) => !isNovelty(v) && speakerName(v) !== speakerName(best));
  if (other && !isNovelty(best)) return { A: { voice: best, pitch: 1 }, B: { voice: other, pitch: 1 } };
  return { A: { voice: best, pitch: 1 }, B: { voice: best, pitch: SAME_VOICE_B_PITCH } };
}

/** 청해 속도 — 급수가 낮을수록 천천히(N5·N4 0.9, N3 0.95, N2·N1 1.0). */
export function listeningRate(level: JlptLevel): number {
  if (level === "N5" || level === "N4") return 0.9;
  if (level === "N3") return 0.95;
  return 1;
}

/**
 * 긴 문장을 문장부호 단위로 끊는다. Chrome에는 긴 발화가 15초쯤에서 잘려버리는 버그가 있는데,
 * 문장 단위로 나눠 큐에 넣으면 그 버그를 피하면서 문장 사이 호흡도 자연스러워진다.
 */
export function splitForSpeech(text: string): string[] {
  const sentences = text.match(/[^。．.！!？?\n]+[。．.！!？?]*\s*/g) ?? [text];
  const chunks: string[] = [];

  for (const sentence of sentences) {
    const piece = sentence.trim();
    if (!piece) continue;
    const last = chunks[chunks.length - 1];
    // 너무 잘게 쪼개면 오히려 뚝뚝 끊겨 들려서, 짧은 문장은 앞 조각에 붙인다.
    if (last && last.length + piece.length <= 120) chunks[chunks.length - 1] = `${last} ${piece}`;
    else chunks.push(piece);
  }

  return chunks.length > 0 ? chunks : [text];
}
