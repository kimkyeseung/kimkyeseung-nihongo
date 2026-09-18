import { describe, expect, it } from "vitest";
import {
  DownloadInterruptedError,
  GEMMA_MODEL,
  describeDownloadFailure,
  planResumeWrite,
} from "./gemmaModel";

/**
 * 이어받기 판단은 "조용히 틀리는" 종류의 코드다 — 오프셋이 어긋난 채 이어 붙여도 최종 크기는
 * 맞아떨어질 수 있어서 마지막 크기 검사를 그대로 통과하고, 콘솔에는 아무것도 안 찍힌다.
 * 그 상태로 엔진에 넘기면 2GB를 다시 받기 전까지 원인을 모르는 로딩 실패만 본다.
 */
describe("planResumeWrite", () => {
  const total = GEMMA_MODEL.bytes;

  it("206이면 요청한 지점부터 이어 쓴다", () => {
    expect(planResumeWrite(206, `bytes 1000-${total - 1}/${total}`, null, 1000)).toEqual({
      writeOffset: 1000,
      totalBytes: total,
    });
  });

  it("Content-Range 앞뒤 공백과 여러 칸 띄어쓰기를 견딘다", () => {
    expect(planResumeWrite(206, `  bytes   500-${total - 1}/${total}  `, null, 500)).toEqual({
      writeOffset: 500,
      totalBytes: total,
    });
  });

  it("서버가 엉뚱한 지점을 보내면 거부한다 (조각 오염 방지)", () => {
    // 프록시가 Range를 무시하고 0부터 보내는 경우. 그대로 이어 붙이면 파일이 조용히 망가진다.
    expect(() => planResumeWrite(206, `bytes 0-${total - 1}/${total}`, null, 1000)).toThrow(
      /이어받기 위치/
    );
  });

  it("원본 파일 크기가 달라졌으면 거부한다", () => {
    expect(() => planResumeWrite(206, "bytes 1000-1999/2000", null, 1000)).toThrow(
      /모델 파일이 바뀌었습니다/
    );
  });

  it("Content-Range를 못 읽으면 거부한다", () => {
    expect(() => planResumeWrite(206, null, null, 1000)).toThrow(/이해할 수 없습니다/);
    expect(() => planResumeWrite(206, "bytes */2008432640", null, 1000)).toThrow(
      /이해할 수 없습니다/
    );
  });

  it("200이면 (If-Range 불일치 / Range 미지원) 처음부터 다시 쓴다", () => {
    // 이어받기를 요청했는데 전체가 왔다 = 그 사이 원본이 바뀌었다. 조각을 버려야 한다.
    expect(planResumeWrite(200, null, String(total), 1000)).toEqual({
      writeOffset: 0,
      totalBytes: total,
    });
  });

  it("Content-Length가 없으면 알려진 크기를 분모로 쓴다", () => {
    expect(planResumeWrite(200, null, null, 0).totalBytes).toBe(total);
    expect(planResumeWrite(200, null, "0", 0).totalBytes).toBe(total);
  });

  it("그 밖의 상태 코드는 실패다", () => {
    expect(() => planResumeWrite(416, null, null, 1000)).toThrow(/HTTP 416/);
    expect(() => planResumeWrite(404, null, null, 0)).toThrow(/HTTP 404/);
  });
});

describe("describeDownloadFailure", () => {
  it("중단 + 받아둔 조각이 있으면 이어받기를 안내한다", () => {
    const failure = describeDownloadFailure(
      new DownloadInterruptedError(1_500_000_000, new TypeError("Load failed")),
      1_500_000_000
    );
    expect(failure.resumable).toBe(true);
    expect(failure.message).toContain("이어받기");
    // 브라우저가 준 영어 문구를 그대로 노출하지 않는다.
    expect(failure.message).not.toContain("Load failed");
  });

  it("중단됐지만 받아둔 게 없으면 이어받기를 권하지 않는다", () => {
    const failure = describeDownloadFailure(new DownloadInterruptedError(0, new TypeError()), 0);
    expect(failure.resumable).toBe(false);
    expect(failure.message).not.toContain("이어받기");
  });

  it("그 밖의 오류는 원래 문구를 그대로 보여준다", () => {
    const failure = describeDownloadFailure(new Error("저장 공간이 부족합니다."), 0);
    expect(failure.message).toBe("저장 공간이 부족합니다.");
  });
});
