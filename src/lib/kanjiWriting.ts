// 한자 따라 쓰기의 채점. **전부 순수 함수**다(kanjiWriting.test.ts가 실제 KanjiVG 데이터로 고정한다).
//
// 정답은 KanjiVG의 획 경로(필순 그대로)라 LLM이 끼어들 자리가 없다. 학습자가 그은 선과 "지금 차례의
// 획"을 같은 개수의 점으로 다시 나눠 점끼리 거리를 잰다. 좌표는 전부 KanjiVG 캔버스(109×109)
// 단위다 — 화면 크기와 상관없이 같은 기준으로 채점하려고 부르는 쪽이 이 좌표로 바꿔서 넘긴다.
//
// 조용히 틀리는 코드다: 기준이 빡빡하면 제대로 쓴 학습자가 "틀렸어요"를 듣고, 느슨하면 아무렇게나
// 그어도 통과한다. 콘솔은 어느 쪽이든 조용하다. 기준을 바꾸면 테스트부터 돌릴 것.

export type Point = { x: number; y: number };

/** 채점할 때 두 선을 몇 개의 점으로 나눠 비교하나. */
const SAMPLES = 16;
/**
 * 점 사이 평균 거리가 이 값(캔버스 109 기준) 이하면 같은 획으로 본다. 손가락으로 쓰는 걸 전제로
 * 넉넉하게 잡았다 — 칸의 1/7쯤 비껴도 통과한다. 옆 획과는 대개 이보다 멀다.
 */
export const STROKE_TOLERANCE = 15;
/** 이보다 짧은 획(점 丶 등)은 방향을 따지지 않는다 — 손가락으로는 방향이 드러나지 않는다. */
const DOT_LENGTH = 14;
/**
 * 다음 획이 지금 획보다 이만큼 더 가까워야 "순서를 틀렸다"고 본다. 0이면 조금만 비껴 써도(10칸)
 * 옆 획으로 판정돼 11%가 떨어졌고, 5면 0.2%다. 다음 획을 그대로 그으면 여전히 전부 걸린다.
 */
const ORDER_MARGIN = 5;

// ─── KanjiVG 경로 → 점 ──────────────────────────────────────────────────────

/**
 * SVG 경로 문자열을 점 목록으로 바꾼다. KanjiVG가 쓰는 명령(M·C·S·L, 대소문자)만 다룬다 —
 * 데이터 전체(22,356획)에 M/m/C/c/S/s만 나온다.
 */
export function samplePath(d: string, perSegment = 12): Point[] {
  const tokens = d.match(/[MmCcSsLl]|-?(?:\d+(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?/g) ?? [];
  const points: Point[] = [];
  let i = 0;
  let cmd = "";
  let cur: Point = { x: 0, y: 0 };
  let lastCtrl: Point | null = null;
  const num = () => Number(tokens[i++]);

  const cubic = (p1: Point, p2: Point, p3: Point) => {
    const p0 = cur;
    for (let k = 1; k <= perSegment; k++) {
      const t = k / perSegment;
      const u = 1 - t;
      points.push({
        x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
        y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
      });
    }
    lastCtrl = p2;
    cur = p3;
  };

  while (i < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[i])) cmd = tokens[i++];
    const rel = cmd === cmd.toLowerCase();
    const at = (x: number, y: number): Point => (rel ? { x: cur.x + x, y: cur.y + y } : { x, y });
    switch (cmd.toUpperCase()) {
      case "M": {
        cur = at(num(), num());
        points.push(cur);
        lastCtrl = null;
        // M 뒤에 이어지는 좌표는 L이다(SVG 규칙).
        cmd = rel ? "l" : "L";
        break;
      }
      case "L": {
        cur = at(num(), num());
        points.push(cur);
        lastCtrl = null;
        break;
      }
      case "C": {
        const p1 = at(num(), num());
        const p2 = at(num(), num());
        const p3 = at(num(), num());
        cubic(p1, p2, p3);
        break;
      }
      case "S": {
        // 첫 제어점은 직전 곡선의 둘째 제어점을 현재 점에 대해 뒤집은 것이다.
        const prev = lastCtrl as Point | null;
        const p1: Point = prev ? { x: 2 * cur.x - prev.x, y: 2 * cur.y - prev.y } : cur;
        const p2 = at(num(), num());
        const p3 = at(num(), num());
        cubic(p1, p2, p3);
        break;
      }
      default:
        // 모르는 명령 — 더 읽으면 좌표가 어긋나므로 여기서 멈춘다.
        return points;
    }
  }
  // 좌표가 모자란 채 끝난 경로(깨진 데이터)는 NaN이 섞인다 — 그 점은 버린다.
  return points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
}

// ─── 비교 ────────────────────────────────────────────────────────────────────

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function pathLength(points: Point[]): number {
  let total = 0;
  for (let k = 1; k < points.length; k++) total += dist(points[k - 1], points[k]);
  return total;
}

/** 선을 길이 기준으로 고르게 n개 점으로 다시 나눈다(빠르게 그은 곳과 천천히 그은 곳의 점 밀도를 맞춘다). */
export function resample(points: Point[], n = SAMPLES): Point[] {
  if (points.length === 0) return [];
  const total = pathLength(points);
  if (total === 0) return Array.from({ length: n }, () => points[0]);
  const step = total / (n - 1);
  const out: Point[] = [points[0]];
  let acc = 0;
  let k = 1;
  let prev = points[0];
  while (out.length < n - 1 && k < points.length) {
    const next = points[k];
    const seg = dist(prev, next);
    if (acc + seg >= step && seg > 0) {
      const t = (step - acc) / seg;
      const p = { x: prev.x + t * (next.x - prev.x), y: prev.y + t * (next.y - prev.y) };
      out.push(p);
      prev = p;
      acc = 0;
    } else {
      acc += seg;
      prev = next;
      k++;
    }
  }
  while (out.length < n) out.push(points[points.length - 1]);
  return out;
}

/** 같은 개수로 나눈 두 선의 점끼리 평균 거리. */
function meanDistance(a: Point[], b: Point[]): number {
  let sum = 0;
  for (let k = 0; k < a.length; k++) sum += dist(a[k], b[k]);
  return sum / a.length;
}

export type StrokeJudgement =
  | { ok: true }
  | {
      ok: false;
      /**
       * - `direction` — 모양·자리는 맞는데 거꾸로 그었다(오른쪽→왼쪽, 아래→위).
       * - `order` — 뒤에 올 다른 획을 먼저 그었다.
       * - `shape` — 어느 획과도 안 맞는다.
       */
      reason: "direction" | "order" | "shape";
    };

/**
 * 학습자가 그은 선 하나를 채점한다.
 *
 * @param drawn    그은 점들(캔버스 109 좌표)
 * @param strokes  그 글자의 획 경로 전체(필순)
 * @param index    지금 차례의 획 번호
 */
export function judgeStroke(drawn: Point[], strokes: string[], index: number): StrokeJudgement {
  const target = strokes[index];
  if (!target || drawn.length === 0) return { ok: false, reason: "shape" };
  const mine = resample(drawn);
  const expectedRaw = samplePath(target);
  const expected = resample(expectedRaw);
  const isDot = pathLength(expectedRaw) < DOT_LENGTH;

  // 점끼리 평균 거리는 방향을 잘 못 가른다 — 짧은 직선은 거꾸로 맞춰도 평균 거리가 작다(전체 획의
  // 40%가 거꾸로 그어도 통과했다). 그래서 방향은 **양 끝점**으로 따로 본다.
  const shape = Math.min(meanDistance(mine, expected), meanDistance(mine, [...expected].reverse()));
  if (shape > STROKE_TOLERANCE) {
    // 뒤에 올 획 중에 맞는 게 있으면 순서를 틀린 것이다.
    for (let j = index + 1; j < strokes.length; j++) {
      if (strokeDistance(mine, strokes[j]) <= STROKE_TOLERANCE) return { ok: false, reason: "order" };
    }
    return { ok: false, reason: "shape" };
  }

  // 모양은 맞는데 **뒤에 올 다른 획이 확실히 더 가까우면** 그 획을 그은 것이다. 나란한 획(三·言)은
  // 서로 허용 오차 안에 들어서, 이 비교가 없으면 다음 획을 그어도 17%쯤이 통과했다.
  for (let j = index + 1; j < strokes.length; j++) {
    if (strokeDistance(mine, strokes[j]) + ORDER_MARGIN < shape) return { ok: false, reason: "order" };
  }

  if (!isDot) {
    const first = mine[0];
    const last = mine[mine.length - 1];
    const start = expected[0];
    const end = expected[expected.length - 1];
    if (dist(first, end) + dist(last, start) < dist(first, start) + dist(last, end)) {
      return { ok: false, reason: "direction" };
    }
  }
  return { ok: true };
}

/** 그은 선(이미 나눈 것)과 획 하나의 거리 — 방향은 따지지 않는다. */
function strokeDistance(mine: Point[], stroke: string): number {
  const other = resample(samplePath(stroke));
  return Math.min(meanDistance(mine, other), meanDistance(mine, [...other].reverse()));
}

export const STROKE_FEEDBACK: Record<"direction" | "order" | "shape", string> = {
  direction: "방향이 반대예요. 시작점부터 그어 보세요.",
  order: "그 획은 나중에 써요. 순서를 지켜 보세요.",
  shape: "이 획이 아니에요. 다시 그어 보세요.",
};

/** 한 획에서 이만큼 틀리면 그 획을 깜빡여 보여준다. */
export const HINT_AFTER_MISSES = 2;
