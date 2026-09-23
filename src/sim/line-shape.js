// 새 노선을 그릴 모양을 정한다. 순수 함수만 둔다(같은 설계면 늘 같은 모양).
//
// 아이는 칸을 위·아래·옆으로만 이어 선을 긋는다(교육과정 4수03-05). 그대로 그리면 계단 모양이라
// 실제 노선처럼 보이지 않는다. 그래서 그릴 때만 모양을 다듬는다. 공사비와 시간은 여전히 칸으로 센다.
//
//  1. 역은 늘 제자리를 지난다. 기존 역과 같은 칸이면 그 역 자리에 정확히 겹친다(갈아타는 역).
//  2. 역과 역 사이는 그은 칸 안에서 되도록 곧게 편다(계단 → 비스듬한 직선).
//  3. 꺾이는 곳은 둥글게 돈다. 지하철은 더 크게, 경전철은 조금 작게 돈다.
//  4. 둥글게 돌 때 옆 칸으로 조금 부풀 수 있는데, 평지·언덕·들판 쪽으로만 부푼다.
//     바다·강·산 쪽으로는 부풀지 않는다. 그래서 다리와 터널은 곧게 지나간다.

/** 옆 칸으로 부풀 수 있는 거리(칸) */
const MARGIN = 0.35;
/** 둥글게 도는 크기(칸). 실제 곡선 반지름이 아니라 그림에서 보기 좋게 고른 값이다. */
const TURN_RADIUS = { 지하철: 0.9, 경전철: 0.6 };
/** 곧은 길인지 볼 때 몇 칸마다 점을 찍어 볼까 */
const SAMPLE_STEP = 0.05;
/** 둥근 곳을 몇 점으로 그릴까 */
const CURVE_POINTS = 8;
/** 부풀면 안 되는 땅 */
const NO_BULGE = new Set(['sea', 'river', 'mountain']);

function cellCenter(cell, cols) {
  return { x: (cell % cols) + 0.5, y: Math.floor(cell / cols) + 0.5 };
}

/** 점에서 칸(네모)까지의 거리. 칸 안이면 0 */
function distanceToCell(p, cell, cols) {
  const left = cell % cols;
  const top = Math.floor(cell / cols);
  const dx = Math.max(left - p.x, 0, p.x - (left + 1));
  const dy = Math.max(top - p.y, 0, p.y - (top + 1));
  return Math.hypot(dx, dy);
}

/**
 * 선이 지나가도 되는 곳인가. 그은 칸 안이면 된다.
 * 그은 칸 옆이라도 MARGIN 안이고, 그 칸이 바다·강·산이 아니면 된다.
 */
function makeAllowed(pathSet, { cols, rows, terrain }) {
  return (p) => {
    const col = Math.floor(p.x);
    const row = Math.floor(p.y);
    if (col < 0 || row < 0 || col >= cols || row >= rows) return false;
    const cell = row * cols + col;
    if (pathSet.has(cell)) return true;
    if (NO_BULGE.has(terrain?.[row]?.[col])) return false;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const c = col + dc;
        const r = row + dr;
        if (c < 0 || r < 0 || c >= cols || r >= rows) continue;
        const near = r * cols + c;
        if (pathSet.has(near) && distanceToCell(p, near, cols) <= MARGIN) return true;
      }
    }
    return false;
  };
}

/** 두 점 사이 곧은 길이 모두 지나가도 되는 곳인가 */
function clearLine(a, b, allowed) {
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  const steps = Math.max(1, Math.ceil(length / SAMPLE_STEP));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    if (!allowed({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })) return false;
  }
  return true;
}

/** 두 점 사이를 곧게 펴 준다: 그은 칸 안에서 가장 멀리 곧게 갈 수 있는 곳까지 한 번에 간다. */
function pullStraight(points, from, to, allowed) {
  const kept = [from];
  let at = from;
  while (at < to) {
    let next = at + 1;
    for (let k = to; k > at + 1; k--) {
      if (clearLine(points[at], points[k], allowed)) {
        next = k;
        break;
      }
    }
    kept.push(next);
    at = next;
  }
  return kept;
}

/** 꺾인 곳 V를 둥글게: A→V→B에서 V 둘레를 2차 곡선으로 바꾼 점들. 못 바꾸면 null */
function roundCorner(a, v, b, radius, allowed) {
  const la = Math.hypot(a.x - v.x, a.y - v.y);
  const lb = Math.hypot(b.x - v.x, b.y - v.y);
  if (la === 0 || lb === 0) return null;
  // 거의 곧으면 둥글게 할 까닭이 없다.
  const cos = ((a.x - v.x) * (b.x - v.x) + (a.y - v.y) * (b.y - v.y)) / (la * lb);
  if (cos < -0.999) return null;
  for (let d = Math.min(radius, la / 2, lb / 2), tries = 0; tries < 4 && d > 0.05; tries++, d /= 2) {
    const p1 = { x: v.x + ((a.x - v.x) / la) * d, y: v.y + ((a.y - v.y) / la) * d };
    const p2 = { x: v.x + ((b.x - v.x) / lb) * d, y: v.y + ((b.y - v.y) / lb) * d };
    const curve = [];
    for (let i = 0; i <= CURVE_POINTS; i++) {
      const t = i / CURVE_POINTS;
      const u = 1 - t;
      curve.push({ x: u * u * p1.x + 2 * u * t * v.x + t * t * p2.x, y: u * u * p1.y + 2 * u * t * v.y + t * t * p2.y });
    }
    if (curve.every(allowed)) return curve;
  }
  return null;
}

/**
 * 새 노선의 모양.
 * @param {object} p
 * @param {number[]} p.path 그은 칸(차례대로)
 * @param {number[]} p.stations 역을 놓은 칸
 * @param {{cols: number, rows: number, terrain: string[][]}} p.grid
 * @param {Record<string, {x: number, y: number}>} [p.snap] 기존 역과 같은 칸이면 그 역 자리(칸 단위 좌표)
 * @param {string} [p.kind] '지하철' 또는 '경전철'
 * @returns {{points: {x: number, y: number}[], stops: {cell: number, index: number}[]}}
 *   points는 칸 단위 좌표, stops는 역마다 points 안의 자리(역을 놓은 차례대로)
 */
export function lineShape({ path, stations, grid, snap = {}, kind = '경전철' }) {
  if (path.length === 0) return { points: [], stops: [] };
  const { cols } = grid;
  const stationSet = new Set(stations);
  const control = path.map((cell) => snap[cell] ?? cellCenter(cell, cols));
  if (path.length === 1) {
    return { points: [control[0]], stops: stationSet.has(path[0]) ? [{ cell: path[0], index: 0 }] : [] };
  }

  const allowed = makeAllowed(new Set(path), grid);

  // 역과 양 끝은 반드시 지난다. 그 사이만 곧게 편다.
  const anchors = [0];
  for (let i = 1; i < path.length - 1; i++) if (stationSet.has(path[i])) anchors.push(i);
  anchors.push(path.length - 1);
  const keptIndexes = [0];
  for (let k = 0; k + 1 < anchors.length; k++) {
    keptIndexes.push(...pullStraight(control, anchors[k], anchors[k + 1], allowed).slice(1));
  }

  // 역이 아닌 꺾인 곳을 둥글게 한다(역은 제자리를 지나야 한다).
  const radius = TURN_RADIUS[kind] ?? TURN_RADIUS.경전철;
  const points = [];
  const stops = [];
  for (let k = 0; k < keptIndexes.length; k++) {
    const index = keptIndexes[k];
    const v = control[index];
    const isStop = stationSet.has(path[index]);
    const isEnd = k === 0 || k === keptIndexes.length - 1;
    const curve = isStop || isEnd ? null : roundCorner(control[keptIndexes[k - 1]], v, control[keptIndexes[k + 1]], radius, allowed);
    if (curve) points.push(...curve);
    else points.push(v);
    if (isStop) stops.push({ cell: path[index], index: points.length - 1 });
  }
  return { points, stops };
}

/** 선의 길이(칸) */
export function shapeLength(points) {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  return total;
}

/**
 * 두 역 사이 곡선 위의 한 점. t=0이면 앞 역, t=1이면 뒤 역.
 * @param {{x: number, y: number}[]} points lineShape의 points
 * @param {number} from 앞 역의 points 자리
 * @param {number} to 뒤 역의 points 자리
 */
export function pointBetween(points, from, to, t) {
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  const piece = points.slice(lo, hi + 1);
  if (from > to) piece.reverse();
  if (piece.length === 1) return piece[0];
  const target = shapeLength(piece) * Math.max(0, Math.min(1, t));
  let walked = 0;
  for (let i = 1; i < piece.length; i++) {
    const a = piece[i - 1];
    const b = piece[i];
    const step = Math.hypot(b.x - a.x, b.y - a.y);
    if (walked + step >= target && step > 0) {
      const u = (target - walked) / step;
      return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
    }
    walked += step;
  }
  return piece.at(-1);
}
