// 차도 자료(data/build/roads.json)를 다루는 계산. 순수 함수만 둔다.
// 좌표는 격자 좌표(km, 왼쪽 위가 0)를 쓴다. 택시는 이 길을 따라 가장 빨리 가는 길로 달린다.

/** 도로 종류별 택시 빠르기(km/h): 1 간선, 2 주간선, 3 보조간선, 4 일반. 우리가 정한 값(신호와 막힘을 어림). */
export const ROAD_KMH = { 1: 50, 2: 38, 3: 30, 4: 24 };

/**
 * roads.json을 쓰기 좋은 모양으로 푼다.
 * @param {{unit: number, nodes: number[], edges: Array<[number, number, number, number, number[]]>}} data
 * @returns {{nodes: Array<[number, number]>, edges: {a: number, b: number, cls: number, km: number, pts: Array<[number, number]>}[], adj: number[][]}}
 */
export function decodeRoads(data) {
  const unit = data.unit;
  const nodes = [];
  for (let i = 0; i < data.nodes.length; i += 2) nodes.push([data.nodes[i] * unit, data.nodes[i + 1] * unit]);
  const adj = nodes.map(() => []);
  const edges = data.edges.map(([a, b, cls, meters, mid], index) => {
    const pts = [nodes[a]];
    let x = data.nodes[a * 2];
    let y = data.nodes[a * 2 + 1];
    for (let k = 0; k < mid.length; k += 2) {
      x += mid[k];
      y += mid[k + 1];
      pts.push([x * unit, y * unit]);
    }
    pts.push(nodes[b]);
    adj[a].push(index);
    if (b !== a) adj[b].push(index);
    return { a, b, cls, km: meters / 1000, pts };
  });
  return { nodes, edges, adj };
}

/**
 * 칸(1km)마다 그 칸을 지나는 토막 번호. 그리기와 가까운 길 찾기에 쓴다.
 * @returns {Map<string, number[]>} "열,행" → 토막 번호들
 */
export function indexRoads(roads) {
  const index = new Map();
  roads.edges.forEach((edge, i) => {
    const seen = new Set();
    for (let k = 1; k < edge.pts.length; k++) {
      const [x0, y0] = edge.pts[k - 1];
      const [x1, y1] = edge.pts[k];
      const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 0.5));
      for (let s = 0; s <= steps; s++) {
        const key = `${Math.floor(x0 + ((x1 - x0) * s) / steps)},${Math.floor(y0 + ((y1 - y0) * s) / steps)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (!index.has(key)) index.set(key, []);
        index.get(key).push(i);
      }
    }
  });
  return index;
}

/** 점에서 선분까지 가장 가까운 점 */
function nearestOnSegment(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = dx * dx + dy * dy;
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len));
  const q = [a[0] + dx * t, a[1] + dy * t];
  return { q, t, d: Math.hypot(p[0] - q[0], p[1] - q[1]) };
}

/**
 * 가장 가까운 차도 위 점(maxKm 안에서).
 * @param {{x: number, y: number}} point
 * @returns {{edge: number, seg: number, t: number, point: [number, number], km: number} | null}
 *   seg: 토막 안 선분 번호, t: 그 선분 위 자리(0~1), km: 점에서 길까지 거리
 */
export function nearestRoad(roads, index, point, maxKm = 0.05) {
  const p = [point.x, point.y];
  let best = null;
  const c0 = Math.floor(point.x);
  const r0 = Math.floor(point.y);
  const seen = new Set();
  for (let dc = -1; dc <= 1; dc++) {
    for (let dr = -1; dr <= 1; dr++) {
      for (const i of index.get(`${c0 + dc},${r0 + dr}`) ?? []) {
        if (seen.has(i)) continue;
        seen.add(i);
        const pts = roads.edges[i].pts;
        for (let k = 1; k < pts.length; k++) {
          const hit = nearestOnSegment(p, pts[k - 1], pts[k]);
          if (hit.d <= maxKm && (!best || hit.d < best.km - 1e-12)) best = { edge: i, seg: k - 1, t: hit.t, point: hit.q, km: hit.d };
        }
      }
    }
  }
  return best;
}

/** 토막 안 한 자리에서 토막 앞 끝(a)과 뒤 끝(b)까지 거리(km)와 그 사이 점들 */
function splitEdge(edge, seg, t) {
  const pts = edge.pts;
  const at = [pts[seg][0] + (pts[seg + 1][0] - pts[seg][0]) * t, pts[seg][1] + (pts[seg + 1][1] - pts[seg][1]) * t];
  const toA = [at, ...pts.slice(0, seg + 1).reverse()];
  const toB = [at, ...pts.slice(seg + 1)];
  const lengthOf = (list) => list.slice(1).reduce((sum, q, k) => sum + Math.hypot(q[0] - list[k][0], q[1] - list[k][1]), 0);
  // 그린 모양 길이와 거리표 길이가 조금 달라서, 실제 길이(km)를 모양 길이 비율로 나눈다
  const shapeA = lengthOf(toA);
  const shapeB = lengthOf(toB);
  const whole = shapeA + shapeB || 1;
  return { at, toA, toB, kmA: (edge.km * shapeA) / whole, kmB: (edge.km * shapeB) / whole };
}

/** 작은 우선순위 줄(가장 작은 값부터 꺼낸다) */
class Heap {
  constructor() {
    this.items = [];
  }
  push(cost, value) {
    const items = this.items;
    items.push([cost, value]);
    let i = items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (items[parent][0] <= items[i][0]) break;
      [items[parent], items[i]] = [items[i], items[parent]];
      i = parent;
    }
  }
  pop() {
    const items = this.items;
    const top = items[0];
    const last = items.pop();
    if (items.length) {
      items[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < items.length && items[l][0] < items[m][0]) m = l;
        if (r < items.length && items[r][0] < items[m][0]) m = r;
        if (m === i) break;
        [items[m], items[i]] = [items[i], items[m]];
        i = m;
      }
    }
    return top;
  }
  get size() {
    return this.items.length;
  }
}

/**
 * 택시 길: 탄 곳(길 위 점)에서 내릴 곳(길 위 점)까지 가장 빨리 가는 길(일방통행·신호는 빼고 어림).
 * @param {{edge: number, seg: number, t: number}} start nearestRoad 결과
 * @param {{edge: number, seg: number, t: number}} end nearestRoad 결과
 * @returns {{points: Array<[number, number]>, km: number, minutes: number} | null}
 */
export function taxiRoute(roads, start, end) {
  const minutesOf = (km, cls) => (km / ROAD_KMH[cls]) * 60;
  const s = splitEdge(roads.edges[start.edge], start.seg, start.t);
  const e = splitEdge(roads.edges[end.edge], end.seg, end.t);
  const startEdge = roads.edges[start.edge];
  const endEdge = roads.edges[end.edge];
  // 같은 토막 위면 그 위로 바로 간다
  let direct = null;
  if (start.edge === end.edge) {
    const before = start.seg < end.seg || (start.seg === end.seg && start.t <= end.t);
    const pts = startEdge.pts;
    const path = before ? [s.at, ...pts.slice(start.seg + 1, end.seg + 1), e.at] : [s.at, ...pts.slice(end.seg + 1, start.seg + 1).reverse(), e.at];
    const km = Math.abs(s.kmA - e.kmA);
    direct = { points: path, km, minutes: minutesOf(km, startEdge.cls) };
  }
  const n = roads.nodes.length;
  const best = new Float64Array(n).fill(Infinity);
  const dist = new Float64Array(n).fill(Infinity);
  const via = new Int32Array(n).fill(-1); // 들어온 토막
  const heap = new Heap();
  const seed = (node, minutes, km) => {
    if (minutes < best[node]) {
      best[node] = minutes;
      dist[node] = km;
      via[node] = -2; // 출발 토막에서 바로
      heap.push(minutes, node);
    }
  };
  seed(startEdge.a, minutesOf(s.kmA, startEdge.cls), s.kmA);
  seed(startEdge.b, minutesOf(s.kmB, startEdge.cls), s.kmB);
  const startFrom = new Map([
    [startEdge.a, 'A'],
    [startEdge.b, 'B'],
  ]);
  const goalA = endEdge.a;
  const goalB = endEdge.b;
  let done = 0;
  while (heap.size) {
    const [cost, node] = heap.pop();
    if (cost > best[node]) continue;
    if (++done > n) break;
    for (const i of roads.adj[node]) {
      const edge = roads.edges[i];
      const next = edge.a === node ? edge.b : edge.a;
      const c = cost + minutesOf(edge.km, edge.cls);
      if (c < best[next]) {
        best[next] = c;
        dist[next] = dist[node] + edge.km;
        via[next] = i;
        heap.push(c, next);
      }
    }
  }
  const viaA = best[goalA] + minutesOf(e.kmA, endEdge.cls);
  const viaB = best[goalB] + minutesOf(e.kmB, endEdge.cls);
  const total = Math.min(viaA, viaB);
  if (!Number.isFinite(total) && !direct) return null;
  if (direct && direct.minutes <= total) return direct;
  // 갈림점을 거꾸로 따라가며 모양을 잇는다
  const goal = viaA <= viaB ? goalA : goalB;
  const tail = goal === goalA ? [...e.toA].reverse() : [...e.toB].reverse();
  const pieces = [tail];
  let node = goal;
  while (via[node] >= 0) {
    const edge = roads.edges[via[node]];
    const pts = edge.b === node ? edge.pts : [...edge.pts].reverse();
    pieces.push(pts);
    node = edge.a === node ? edge.b : edge.a;
  }
  pieces.push(startFrom.get(node) === 'A' || node === startEdge.a ? s.toA : s.toB);
  const points = [];
  for (const piece of pieces.reverse()) {
    for (const q of piece) {
      const last = points.at(-1);
      if (!last || Math.abs(last[0] - q[0]) > 1e-9 || Math.abs(last[1] - q[1]) > 1e-9) points.push(q);
    }
  }
  const km = dist[goal] + (goal === goalA ? e.kmA : e.kmB);
  return { points, km, minutes: total };
}

/**
 * 길 모양 위에서 비율(0~1)만큼 간 자리. 택시가 달리는 모습에 쓴다.
 * @returns {{x: number, y: number, angle: number}}
 */
export function pointAlong(points, ratio) {
  if (points.length === 1) return { x: points[0][0], y: points[0][1], angle: 0 };
  const lengths = [];
  let total = 0;
  for (let k = 1; k < points.length; k++) {
    const d = Math.hypot(points[k][0] - points[k - 1][0], points[k][1] - points[k - 1][1]);
    lengths.push(d);
    total += d;
  }
  let left = Math.max(0, Math.min(1, ratio)) * total;
  for (let k = 0; k < lengths.length; k++) {
    if (left <= lengths[k] || k === lengths.length - 1) {
      const t = lengths[k] === 0 ? 0 : Math.min(1, left / lengths[k]);
      const [x0, y0] = points[k];
      const [x1, y1] = points[k + 1];
      return { x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t, angle: Math.atan2(y1 - y0, x1 - x0) };
    }
    left -= lengths[k];
  }
  const last = points.at(-1);
  return { x: last[0], y: last[1], angle: 0 };
}
