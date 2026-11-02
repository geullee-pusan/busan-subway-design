// 길 자료(data/build/roads.json)를 다루는 계산. 순수 함수만 둔다.
// 좌표는 격자 좌표(km, 왼쪽 위가 0)를 쓴다. 택시는 이 길을 따라 가장 빨리 가는 길로 달리고,
// 사람은 이 길 위로만 걷는다(차도와 동네 길).

/** 도로 종류별 택시 빠르기(km/h): 1 간선, 2 주간선, 3 보조간선, 4 일반, 5 동네 길. 우리가 정한 값(신호와 막힘을 어림). */
export const ROAD_KMH = { 1: 50, 2: 38, 3: 30, 4: 24, 5: 18 };
/** 게임에서 임의로 이은 길의 종류(실제 길이 아니다). 사람만 걷고 택시는 다니지 않는다. */
export const MADE_ROAD = 6;

/** base64 글자 → 바이트 */
function fromBase64(text) {
  const table = new Int16Array(128).fill(-1);
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  for (let i = 0; i < chars.length; i++) table[chars.charCodeAt(i)] = i;
  const clean = text.replace(/=+$/, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let bits = 0;
  let value = 0;
  let k = 0;
  for (let i = 0; i < clean.length; i++) {
    value = ((value << 6) | table[clean.charCodeAt(i)]) & 0xffffff;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[k++] = (value >> bits) & 255;
    }
  }
  return out;
}

/**
 * 촘촘하게 담은 길 자료(packed)를 숫자 목록으로 푼다. 숫자마다 7비트씩 이어 적고(LEB128), 음수는 지그재그로 적었다.
 * 차례: 갈림점 수, 갈림점 [dx, dy]…(앞 갈림점에서 옮긴 만큼), 토막 수,
 *       토막마다 [a(앞 토막의 a에서 옮긴 만큼), b-a, 종류, 길이(m), 사이 점 수, 사이 점 [dx, dy]…, 길 이름 번호+1]
 */
function unpack(text) {
  const bytes = fromBase64(text);
  let i = 0;
  const next = () => {
    let result = 0;
    let scale = 1;
    for (;;) {
      const byte = bytes[i++];
      result += (byte & 127) * scale;
      if (byte < 128) return result;
      scale *= 128;
    }
  };
  const signed = () => {
    const v = next();
    return v % 2 ? -(v + 1) / 2 : v / 2;
  };
  const nodeCount = next();
  const nodes = new Array(nodeCount * 2);
  let x = 0;
  let y = 0;
  for (let n = 0; n < nodeCount; n++) {
    x += signed();
    y += signed();
    nodes[n * 2] = x;
    nodes[n * 2 + 1] = y;
  }
  const edgeCount = next();
  const edges = new Array(edgeCount);
  let a = 0;
  for (let e = 0; e < edgeCount; e++) {
    a += signed();
    const b = a + signed();
    const cls = next();
    const meters = next();
    const count = next();
    const mid = new Array(count * 2);
    for (let k = 0; k < count * 2; k++) mid[k] = signed();
    const name = next() - 1;
    edges[e] = name >= 0 ? [a, b, cls, meters, mid, name] : [a, b, cls, meters, mid];
  }
  return { nodes, edges };
}


/**
 * roads.json을 쓰기 좋은 모양으로 푼다.
 * @param {{unit: number, nodes: number[], edges: Array<[number, number, number, number, number[]]>}} data
 * @returns {{nodes: Array<[number, number]>, edges: {a: number, b: number, cls: number, km: number, pts: Array<[number, number]>}[], adj: number[][]}}
 */
export function decodeRoads(input) {
  const data = input.packed ? { ...input, ...unpack(input.packed) } : input;
  const unit = data.unit;
  const names = data.names ?? [];
  const nodes = [];
  for (let i = 0; i < data.nodes.length; i += 2) nodes.push([data.nodes[i] * unit, data.nodes[i + 1] * unit]);
  const adj = nodes.map(() => []);
  const edges = data.edges.map(([a, b, cls, meters, mid, name], index) => {
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
    return { a, b, cls, km: meters / 1000, pts, name: name === undefined ? null : names[name] };
  });
  return { nodes, edges, adj };
}

/**
 * 칸(1km)마다 그 칸을 지나는 토막 번호. 그리기와 가까운 길 찾기에 쓴다. accept가 있으면 그 토막만 넣는다.
 * @returns {Map<string, number[]>} "열,행" → 토막 번호들
 */
export function indexRoads(roads, accept = null) {
  const index = new Map();
  roads.edges.forEach((edge, i) => {
    if (accept && !accept(edge)) return;
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
export function nearestRoad(roads, index, point, maxKm = 0.05, accept = null) {
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
        if (accept && !accept(roads.edges[i])) continue;
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
  return routeOnRoads(roads, start, end, (km, cls) => (cls === MADE_ROAD ? Infinity : (km / ROAD_KMH[cls]) * 60));
}

/**
 * 걷는 길: 길 위 한 점에서 다른 점까지 가장 짧은 길(차도와 동네 길 모두).
 * @returns {{points: Array<[number, number]>, km: number, minutes: number} | null} minutes 자리에는 km가 들어 있다
 */
export function walkRoute(roads, start, end) {
  return routeOnRoads(roads, start, end, (km) => km);
}

/** 두 길 위 점 사이 가장 값싼 길. costOf(km, 종류) → 값 */
function routeOnRoads(roads, start, end, costOf) {
  const minutesOf = costOf;
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
    // 두 끝이 다 정해졌고 남은 것이 더 비싸면 그만 찾는다
    if (Number.isFinite(best[goalA]) && Number.isFinite(best[goalB]) && cost > Math.max(best[goalA], best[goalB])) break;
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

/** 길 위 자리 {edge, seg, t}의 좌표 */
export function placeOn(roads, at) {
  const pts = roads.edges[at.edge].pts;
  const [x0, y0] = pts[at.seg];
  const [x1, y1] = pts[at.seg + 1];
  return { x: x0 + (x1 - x0) * at.t, y: y0 + (y1 - y0) * at.t };
}

/**
 * 길을 따라 걷기. 누른 방향과 맞는 쪽으로 지금 길을 따라가고, 갈림점에서는 누른 방향과 가장 비슷한 길로 꺾는다.
 * 누른 방향과 맞는 길이 없으면 갈림점에서 선다.
 * @param {{edge: number, seg: number, t: number}} at 지금 자리
 * @param {{dx: number, dy: number}} dir 누른 방향
 * @param {number} km 걸을 거리
 * @returns {{at: {edge: number, seg: number, t: number}, x: number, y: number, km: number}}
 */
export function walkAlong(roads, at, dir, km) {
  const len = Math.hypot(dir.dx, dir.dy);
  let state = { ...at };
  let left = km;
  let moved = 0;
  if (!(len > 0) || !(km > 0)) return { at: state, ...placeOn(roads, state), km: 0 };
  const ux = dir.dx / len;
  const uy = dir.dy / len;
  const segVec = (edge, seg) => {
    const pts = roads.edges[edge].pts;
    const vx = pts[seg + 1][0] - pts[seg][0];
    const vy = pts[seg + 1][1] - pts[seg][1];
    const l = Math.hypot(vx, vy);
    return { vx: l ? vx / l : 0, vy: l ? vy / l : 0, l };
  };
  // 지금 선분에서 앞(+1)으로 갈지 뒤(-1)로 갈지. 길과 거의 직각으로 누르면 길 가운데에서는 서 있는다.
  /** 갈림점에서 누른 방향과 가장 비슷한 길(skip: 그 토막을 그 방향으로는 고르지 않는다) */
  const choose = (node, skipEdge = -1, skipSign = 0) => {
    let best = null;
    for (const i of roads.adj[node]) {
      const e = roads.edges[i];
      const outs = [];
      if (e.a === node) outs.push({ seg: 0, t: 0, sign: 1, ...segVec(i, 0) });
      if (e.b === node) {
        const last = e.pts.length - 2;
        const w = segVec(i, last);
        outs.push({ seg: last, t: 1, sign: -1, vx: -w.vx, vy: -w.vy });
      }
      for (const o of outs) {
        if (i === skipEdge && o.sign === skipSign) continue;
        const fit = o.vx * ux + o.vy * uy;
        if (!best || fit > best.fit) best = { fit, edge: i, seg: o.seg, t: o.t, sign: o.sign };
      }
    }
    return best && best.fit >= 0.3 ? best : null;
  };
  let v = segVec(state.edge, state.seg);
  const along = v.vx * ux + v.vy * uy;
  let sign = along >= 0 ? 1 : -1;
  const lastSeg = roads.edges[state.edge].pts.length - 2;
  const atA = state.seg === 0 && state.t <= 0.001;
  const atB = state.seg === lastSeg && state.t >= 0.999;
  if (atA || atB) {
    // 갈림점에 서 있으면 거기서 이어지는 모든 길 가운데 고른다
    const pick = choose(atA ? roads.edges[state.edge].a : roads.edges[state.edge].b);
    if (!pick) return { at: state, ...placeOn(roads, state), km: 0 };
    state = { edge: pick.edge, seg: pick.seg, t: pick.t };
    sign = pick.sign;
  } else if (Math.abs(along) < 0.25) {
    // 길과 거의 직각으로 누르면, 누른 쪽으로 꺾을 수 있는 가까운 갈림점까지 길을 따라간다(없으면 선다)
    const edge = roads.edges[state.edge];
    /** 지금 자리에서 토막의 뒤 끝(s=1) 또는 앞 끝(s=-1)까지 거리 */
    const toEnd = (s) => {
      let km = 0;
      for (let k = 0; k <= lastSeg; k++) {
        const l = segVec(state.edge, k).l;
        if (k === state.seg) km += (s > 0 ? 1 - state.t : state.t) * l;
        else if ((s > 0 && k > state.seg) || (s < 0 && k < state.seg)) km += l;
      }
      return km;
    };
    const options = [1, -1]
      .map((s) => ({ s, pick: choose(s > 0 ? edge.b : edge.a, state.edge, -s), km: toEnd(s) }))
      .filter((o) => o.pick)
      .sort((a, b) => a.km - b.km);
    if (!options.length) return { at: state, ...placeOn(roads, state), km: 0 };
    sign = options[0].s;
  }
  for (let guard = 0; guard < 500 && left > 1e-9; guard++) {
    v = segVec(state.edge, state.seg);
    const room = sign > 0 ? (1 - state.t) * v.l : state.t * v.l;
    if (left < room) {
      state.t += (sign * left) / (v.l || 1);
      moved += left;
      left = 0;
      break;
    }
    moved += room;
    left -= room;
    const pts = roads.edges[state.edge].pts;
    if (sign > 0 && state.seg + 1 < pts.length - 1) {
      state = { edge: state.edge, seg: state.seg + 1, t: 0 };
      continue;
    }
    if (sign < 0 && state.seg > 0) {
      state = { edge: state.edge, seg: state.seg - 1, t: 1 };
      continue;
    }
    // 토막 끝(갈림점): 누른 방향과 가장 비슷한 다음 길로 꺾는다
    const edge = roads.edges[state.edge];
    const node = sign > 0 ? edge.b : edge.a;
    // 온 길로 바로 되돌아가지 않는다
    const best = choose(node, state.edge, -sign);
    if (!best) {
      state = { edge: state.edge, seg: state.seg, t: sign > 0 ? 1 : 0 };
      break;
    }
    state = { edge: best.edge, seg: best.seg, t: best.t };
    sign = best.sign;
  }
  state.t = Math.max(0, Math.min(1, state.t));
  return { at: state, ...placeOn(roads, state), km: moved };
}
