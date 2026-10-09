/**
 * 마이크에서 "한 번의 발화"를 직접 잘라 16kHz 모노로 돌려준다 — 브라우저 음성 인식에 기대지 않는
 * 발음 판정의 첫 단계(시험 중, `/lab/asr`). 말 시작·끝은 소리 크기(RMS)로만 판단한다.
 *
 * - 처음 300ms로 주변 소음 크기를 재고, 그 3배(최소 0.015)를 넘는 프레임이 이어지면 말이 시작된 것.
 * - 말이 시작되기 전 300ms를 미리 남겨 둔다(첫 자음이 잘리면 か가 は로 들린다 — 모델 시험에서 봤다).
 * - 조용한 구간이 `endSilenceMs` 이어지거나 `maxMs`가 지나면 끝.
 */

export type VoiceClip = {
  /** 16kHz 모노. */
  samples: Float32Array;
  /** 듣기 시작부터 말이 시작되기까지(ms). 2초 규칙에 쓴다. */
  onsetMs: number;
  /** 잘라낸 길이(ms). */
  durationMs: number;
};

export type ListenOptions = {
  /** 말이 끝났다고 볼 조용한 시간. 세 번 이어 읽기는 사이 쉼이 있어 길게 준다. */
  endSilenceMs?: number;
  /** 말이 시작되지 않으면 포기할 시간. */
  noSpeechMs?: number;
  /** 한 발화의 최대 길이. */
  maxMs?: number;
  /** 매 프레임 소리 크기(0~1) — 화면의 레벨 미터용. */
  onLevel?: (rms: number) => void;
  signal?: AbortSignal;
};

const TARGET_RATE = 16000;
const PRE_ROLL_MS = 300;
const POST_ROLL_MS = 250;
const CALIBRATE_MS = 300;

export class VoiceCapture {
  private readonly stream: MediaStream;
  private readonly ctx: AudioContext;

  private constructor(stream: MediaStream, ctx: AudioContext) {
    this.stream = stream;
    this.ctx = ctx;
  }

  /** 마이크 권한을 묻고 연다. 여러 번 듣는 동안 한 번만 연다(권한 창을 매번 띄우지 않으려고). */
  static async open(): Promise<VoiceCapture> {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    const ctx = new AudioContext();
    await ctx.resume();
    return new VoiceCapture(stream, ctx);
  }

  close() {
    this.stream.getTracks().forEach((t) => t.stop());
    void this.ctx.close();
  }

  /** 한 번의 발화를 듣는다. 말이 없으면 null. */
  listen(opts: ListenOptions = {}): Promise<VoiceClip | null> {
    const { endSilenceMs = 500, noSpeechMs = 5000, maxMs = 4000, onLevel, signal } = opts;
    const ctx = this.ctx;
    const rate = ctx.sampleRate;
    const source = ctx.createMediaStreamSource(this.stream);
    // ScriptProcessor는 낡았지만 Safari까지 별도 파일 없이 돈다(AudioWorklet은 모듈 파일이 필요하다).
    const proc = ctx.createScriptProcessor(1024, 1, 1);
    const mute = ctx.createGain();
    mute.gain.value = 0;
    source.connect(proc);
    proc.connect(mute);
    mute.connect(ctx.destination);

    const frameMs = (1024 / rate) * 1000;
    const preRollFrames = Math.ceil(PRE_ROLL_MS / frameMs);
    const frames: Float32Array[] = [];
    let elapsed = 0;
    let noiseSum = 0;
    let noiseCount = 0;
    let threshold = 0.015;
    let loudRun = 0;
    let quietMs = 0;
    let startIndex = -1;
    let onsetMs = 0;

    return new Promise((resolve) => {
      let done = false;
      const finish = (clipEnd: number | null) => {
        if (done) return;
        done = true;
        proc.onaudioprocess = null;
        source.disconnect();
        proc.disconnect();
        mute.disconnect();
        signal?.removeEventListener("abort", onAbort);
        if (clipEnd === null || startIndex < 0) return resolve(null);
        const from = Math.max(0, startIndex - preRollFrames);
        const to = Math.min(frames.length, clipEnd + Math.ceil(POST_ROLL_MS / frameMs));
        const joined = concat(frames.slice(from, to));
        void resample(joined, rate).then((samples) =>
          resolve({ samples, onsetMs, durationMs: Math.round((samples.length / TARGET_RATE) * 1000) })
        );
      };
      const onAbort = () => finish(null);
      signal?.addEventListener("abort", onAbort);

      proc.onaudioprocess = (e) => {
        const data = new Float32Array(e.inputBuffer.getChannelData(0));
        frames.push(data);
        elapsed += frameMs;
        const level = rms(data);
        onLevel?.(level);

        if (elapsed <= CALIBRATE_MS) {
          noiseSum += level;
          noiseCount += 1;
          threshold = Math.max(0.015, (noiseSum / noiseCount) * 3);
          return;
        }

        if (startIndex < 0) {
          loudRun = level > threshold ? loudRun + 1 : 0;
          // 60ms쯤 이어져야 말로 본다(딸깍 소리 하나에 시작되지 않게).
          if (loudRun * frameMs >= 60) {
            startIndex = frames.length - loudRun;
            onsetMs = Math.round(elapsed - loudRun * frameMs);
          } else if (elapsed > noSpeechMs) {
            finish(null);
          }
          return;
        }

        quietMs = level < threshold * 0.6 ? quietMs + frameMs : 0;
        const spoken = elapsed - onsetMs;
        if (quietMs >= endSilenceMs) finish(frames.length - Math.floor(quietMs / frameMs));
        else if (spoken >= maxMs) finish(frames.length);
      };
    });
  }
}

function rms(data: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
  return Math.sqrt(sum / data.length);
}

function concat(parts: Float32Array[]): Float32Array<ArrayBuffer> {
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

async function resample(data: Float32Array<ArrayBuffer>, rate: number): Promise<Float32Array> {
  if (rate === TARGET_RATE) return data;
  const length = Math.ceil((data.length * TARGET_RATE) / rate);
  const offline = new OfflineAudioContext(1, length, TARGET_RATE);
  const buffer = offline.createBuffer(1, data.length, rate);
  buffer.copyToChannel(data, 0);
  const src = offline.createBufferSource();
  src.buffer = buffer;
  src.connect(offline.destination);
  src.start();
  const rendered = await offline.startRendering();
  return rendered.getChannelData(0).slice();
}

/** 16kHz 16bit 모노 WAV. */
export function encodeWav(samples: Float32Array, rate = TARGET_RATE): ArrayBuffer {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  v.setUint32(4, 36 + samples.length * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buf;
}
