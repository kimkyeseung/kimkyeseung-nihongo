import { describe, expect, it } from "vitest";
import kanjivg from "../data/kanjivg.json";
import { judgeStroke, pathLength, resample, samplePath, type Point } from "./kanjiWriting";

const DATA = kanjivg as Record<string, string[]>;
const shift = (pts: Point[], dx: number, dy: number) => pts.map((p) => ({ x: p.x + dx, y: p.y + dy }));

describe("samplePath", () => {
  it("상대 곡선(c)을 절대 좌표로 따라간다", () => {
    const pts = samplePath("M10,10c0,0,10,0,10,0", 4);
    expect(pts[0]).toEqual({ x: 10, y: 10 });
    expect(pts[pts.length - 1]).toEqual({ x: 20, y: 10 });
  });

  it("S는 직전 제어점을 뒤집어 이어 그린다", () => {
    const pts = samplePath("M0,0C0,10,10,10,10,0S20,-10,20,0", 8);
    const last = pts[pts.length - 1];
    expect(last.x).toBeCloseTo(20);
    expect(last.y).toBeCloseTo(0);
    // 뒤집힌 제어점 때문에 둘째 곡선은 위(음수 y)로 부푼다.
    expect(Math.min(...pts.slice(9).map((p) => p.y))).toBeLessThan(-3);
  });

  it("실제 데이터의 모든 획이 캔버스 안의 점이 된다", () => {
    // 점마다 expect를 부르면 수십만 번이라 느리다 — 벗어난 획만 모아 한 번에 비교한다.
    const bad: string[] = [];
    for (const [kanji, strokes] of Object.entries(DATA)) {
      strokes.forEach((d, i) => {
        const pts = samplePath(d);
        const inside = pts.every((p) => p.x > -5 && p.x < 114 && p.y > -5 && p.y < 114);
        if (pts.length < 2 || !inside) bad.push(`${kanji}${i + 1}`);
      });
    }
    expect(bad).toEqual([]);
  });
});

describe("resample", () => {
  it("길이 기준으로 고르게 나눈다", () => {
    const pts = resample([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 10, y: 0 }], 11);
    expect(pts).toHaveLength(11);
    expect(pts[5].x).toBeCloseTo(5);
    expect(pathLength(pts)).toBeCloseTo(10);
  });
});

describe("judgeStroke — 실제 KanjiVG 전체(2,135자)", () => {
  const all = Object.entries(DATA);

  it("정답 획을 그대로, 또는 조금(칸의 1/10) 비껴 그으면 통과한다", () => {
    let shiftedFail = 0;
    let total = 0;
    for (const [, strokes] of all) {
      strokes.forEach((d, i) => {
        const pts = samplePath(d);
        expect(judgeStroke(pts, strokes, i)).toEqual({ ok: true });
        total++;
        if (!judgeStroke(shift(pts, 8, 6), strokes, i).ok) shiftedFail++;
      });
    }
    // 가까이 붙은 획이 많은 글자에서 드물게 떨어진다(측정값 0.2%). 1%를 넘으면 기준이 빡빡해진 것.
    expect(shiftedFail / total).toBeLessThan(0.01);
  });

  it("다음 획을 먼저 그으면 절대 통과하지 않는다", () => {
    for (const [, strokes] of all) {
      for (let i = 0; i + 1 < strokes.length; i++) {
        expect(judgeStroke(samplePath(strokes[i + 1]), strokes, i).ok).toBe(false);
      }
    }
  });

  it("점이 아닌 획을 거꾸로 그으면 방향이 틀렸다고 한다", () => {
    for (const [, strokes] of all) {
      strokes.forEach((d, i) => {
        const pts = samplePath(d);
        if (pathLength(pts) < 20) return;
        expect(judgeStroke([...pts].reverse(), strokes, i)).toEqual({ ok: false, reason: "direction" });
      });
    }
  });
});

describe("judgeStroke — 한 글자씩", () => {
  it("三: 둘째 획 차례에 셋째 획을 그으면 순서 오류", () => {
    const s = DATA["三"];
    expect(judgeStroke(samplePath(s[2]), s, 1)).toEqual({ ok: false, reason: "order" });
  });

  it("엉뚱한 곳에 그은 선은 모양 오류", () => {
    const s = DATA["一"];
    const diagonal = [{ x: 10, y: 10 }, { x: 100, y: 100 }];
    expect(judgeStroke(diagonal, s, 0)).toEqual({ ok: false, reason: "shape" });
  });

  it("탭 한 번(점 하나)은 긴 획으로 통과하지 않는다", () => {
    const s = DATA["一"];
    expect(judgeStroke([{ x: 54, y: 54 }], s, 0).ok).toBe(false);
  });
});
