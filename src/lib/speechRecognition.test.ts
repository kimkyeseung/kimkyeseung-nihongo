import { describe, expect, it } from "vitest";
import { describeRecognitionEvent, transcriptsOf } from "./speechRecognition";

const result = (isFinal: boolean, ...transcripts: string[]) =>
  Object.assign(
    transcripts.map((transcript) => ({ transcript })),
    { isFinal }
  );

describe("transcriptsOf", () => {
  it("interim·대안을 전부 꺼낸다", () => {
    expect(transcriptsOf({ results: [result(false, "か", "蚊")] })).toEqual({ texts: ["か", "蚊"], isFinal: false });
  });

  it("빈 글자는 후보가 아니다 — 목소리는 잡았는데 받아 적지 못한 최종 결과 (실제 마이크로 겪었다)", () => {
    expect(transcriptsOf({ results: [result(true, "", " ")] })).toEqual({ texts: [], isFinal: true });
    expect(transcriptsOf({ results: [result(true, "", "か")] }).texts).toEqual(["か"]);
  });
});

describe("describeRecognitionEvent", () => {
  it("빈 글자도 그대로 보여준다(디버그용)", () => {
    expect(describeRecognitionEvent({ results: [result(true, "")] })).toBe('final [""]');
  });
});
