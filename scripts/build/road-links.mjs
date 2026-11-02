// 걸어서 갈 수 없는 곳을 게임에서 임의로 잇는다(실제 길이 아니다). npm run roads가 쓴다.
//
// - 랜드마크에서 가장 가까운 길이 조금이라도 떨어져 있으면, 그 길에서 랜드마크까지 곧은 길을 하나 낸다.
// - 본 길망과 끊어진 길 묶음은 가장 가까운 본 길로 잇는다. OSM에서 받지 않은 샛길과 다리 때문에 끊긴 곳이 많다.
//   maxGapM보다 멀면 잇지 않되(배로 가는 섬), 랜드마크 곁의 묶음은 거리를 따지지 않고 잇는다.
import { MADE_ROAD } from '../../src/sim/roads.js';

const UNITS_PER_KM = 100; // 좌표 단위 10m
const CELL = UNITS_PER_KM;
/** 길이 이보다 멀면 누른 곳에서 길을 찾지 못한다(src/ui/walk-screen.js walkTo의 0.3km보다 조금 안쪽) */
const SPUR_KM = 0.25;
/** 넓은 곳은 가운데까지 가지 않아도 된다. 길이 반지름의 이 비율 안에 있으면 길을 내지 않는다. */
const SPUR_RADIUS_SHARE = 0.4;
/** 이만큼 가까운 두 점(10m 단위)은 길을 내지 않고 한 갈림점으로 합친다. 아주 짧은 길은 방향을 알 수 없어 걷다가 멈춘다. */
const MERGE_UNITS = 2;

function nearestOnSegment(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = dx * dx + dy * dy;
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len));
  const q = [a[0] + dx * t, a[1] + dy * t];
  return { q, d: Math.hypot(p[0] - q[0], p[1] - q[1]) };
}

/**
 * @param {{nodes: number[], edges: Array<[number, number, number, number, number[], number?]>}} data 10m 단위 갈림점과 토막(사이 점은 옮긴 만큼)
 * @param {Array<{x: number, y: number, radius: number}>} landmarks 좌표와 반지름은 km
 * @returns {{nodes: number[], edges: Array, spurs: number, links: number, longestM: number}}
 */
export function addMadeRoads(data, landmarks, { maxGapM = 1000 } = {}) {
  const nodes = [];
  for (let i = 0; i < data.nodes.length; i += 2) nodes.push([data.nodes[i], data.nodes[i + 1]]);
  const edges = data.edges.map(([a, b, cls, meters, mid, name]) => {
    const pts = [nodes[a]];
    let [x, y] = nodes[a];
    for (let k = 0; k < mid.length; k += 2) {
      x += mid[k];
      y += mid[k + 1];
      pts.push([x, y]);
    }
    pts.push(nodes[b]);
    return { a, b, cls, meters, pts, name };
  });

  // 이어진 묶음
  const parent = nodes.map((_, i) => i);
  const find = (n) => {
    let r = n;
    while (parent[r] !== r) r = parent[r];
    while (parent[n] !== r) [parent[n], n] = [r, parent[n]];
    return r;
  };
  const union = (p, q) => {
    parent[find(p)] = find(q);
  };
  for (const e of edges) union(e.a, e.b);

  // 1km 칸 → 그 칸을 지나는 토막
  const cells = new Map();
  const register = (i) => {
    const seen = new Set();
    const pts = edges[i].pts;
    for (let k = 1; k < pts.length; k++) {
      const [x0, y0] = pts[k - 1];
      const [x1, y1] = pts[k];
      const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / (CELL / 2)));
      for (let s = 0; s <= steps; s++) {
        const key = `${Math.floor((x0 + ((x1 - x0) * s) / steps) / CELL)},${Math.floor((y0 + ((y1 - y0) * s) / steps) / CELL)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (!cells.has(key)) cells.set(key, []);
        cells.get(key).push(i);
      }
    }
  };
  edges.forEach((_, i) => register(i));

  /** 점에서 가장 가까운 길 위 자리. 가까운 칸부터 넓혀 가며 본다. */
  const nearest = (p, accept, maxUnits) => {
    const c0 = Math.floor(p[0] / CELL);
    const r0 = Math.floor(p[1] / CELL);
    let best = null;
    const seen = new Set();
    for (let ring = 0; ring < 300; ring++) {
      const closest = (ring - 1) * CELL;
      if (closest > maxUnits || (best && best.d <= closest)) break;
      for (let dc = -ring; dc <= ring; dc++) {
        for (let dr = -ring; dr <= ring; dr++) {
          if (Math.max(Math.abs(dc), Math.abs(dr)) !== ring) continue;
          for (const i of cells.get(`${c0 + dc},${r0 + dr}`) ?? []) {
            if (seen.has(i)) continue;
            seen.add(i);
            if (accept && !accept(edges[i])) continue;
            const pts = edges[i].pts;
            for (let k = 1; k < pts.length; k++) {
              const hit = nearestOnSegment(p, pts[k - 1], pts[k]);
              if (hit.d <= maxUnits && (!best || hit.d < best.d)) best = { edge: i, seg: k - 1, q: hit.q, d: hit.d };
            }
          }
        }
      }
    }
    return best;
  };

  const newNode = (p) => {
    nodes.push(p);
    parent.push(nodes.length - 1);
    return nodes.length - 1;
  };

  /** 길 위 자리에 갈림점을 둔다(토막 가운데면 두 토막으로 자른다) */
  const attach = ({ edge: i, seg, q }) => {
    const e = edges[i];
    const pts = e.pts;
    const at = [Math.round(q[0]), Math.round(q[1])];
    if (Math.hypot(at[0] - pts[0][0], at[1] - pts[0][1]) <= 1) return e.a;
    if (Math.hypot(at[0] - pts.at(-1)[0], at[1] - pts.at(-1)[1]) <= 1) return e.b;
    const same = (u, v) => u[0] === v[0] && u[1] === v[1];
    const head = pts.slice(0, seg + 1);
    if (same(head.at(-1), at)) head.pop();
    const tail = pts.slice(seg + 1);
    if (same(tail[0], at)) tail.shift();
    const first = [...head, at];
    const second = [at, ...tail];
    const shape = (list) => list.slice(1).reduce((sum, u, k) => sum + Math.hypot(u[0] - list[k][0], u[1] - list[k][1]), 0);
    const part = shape(first) / (shape(first) + shape(second) || 1);
    const n = newNode(at);
    union(n, e.a);
    const firstM = Math.round(e.meters * part);
    edges.push({ a: n, b: e.b, cls: e.cls, meters: e.meters - firstM, pts: second, name: e.name });
    register(edges.length - 1);
    Object.assign(e, { b: n, meters: firstM, pts: first });
    return n;
  };

  let longestM = 0;
  const alias = new Map();
  const real = (n) => {
    let r = n;
    while (alias.has(r)) r = alias.get(r);
    return r;
  };
  const made = (from, to) => {
    const a = real(from);
    const b = real(to);
    if (a === b) return;
    if (Math.hypot(nodes[a][0] - nodes[b][0], nodes[a][1] - nodes[b][1]) <= MERGE_UNITS) {
      alias.set(b, a);
      union(a, b);
      return;
    }
    const meters = Math.round(Math.hypot(nodes[a][0] - nodes[b][0], nodes[a][1] - nodes[b][1]) * 10);
    edges.push({ a, b, cls: MADE_ROAD, meters, pts: [nodes[a], nodes[b]] });
    register(edges.length - 1);
    union(a, b);
    longestM = Math.max(longestM, meters);
  };

  // 1. 길이 먼 랜드마크까지 길을 낸다
  let spurs = 0;
  for (const lm of landmarks) {
    const p = [Math.round(lm.x * UNITS_PER_KM), Math.round(lm.y * UNITS_PER_KM)];
    const hit = nearest(p, null, Infinity);
    if (!hit || hit.d / UNITS_PER_KM <= Math.min(lm.radius * SPUR_RADIUS_SHARE, SPUR_KM)) continue;
    made(attach(hit), newNode(p));
    spurs += 1;
  }

  // 2. 끊어진 묶음을 본 길망에 잇는다. 이은 묶음은 본 길망이 되므로 더 잇지 못할 때까지 되풀이한다.
  const totals = new Map();
  for (const e of edges) totals.set(find(e.a), (totals.get(find(e.a)) ?? 0) + e.meters);
  const mainNode = [...totals.entries()].reduce((p, q) => (q[1] > p[1] ? q : p))[0];
  const onMain = (e) => find(e.a) === find(mainNode);
  // 랜드마크 곁(들어왔다고 보는 거리 + 누른 곳에서 길을 찾는 거리)의 묶음은 멀어도 잇는다
  const mustJoin = [];
  for (const lm of landmarks) {
    const p = [lm.x * UNITS_PER_KM, lm.y * UNITS_PER_KM];
    const reach = (lm.radius + 0.3) * UNITS_PER_KM;
    const keep = new Set();
    for (;;) {
      const hit = nearest(p, (e) => !onMain(e) && !keep.has(find(e.a)), reach);
      if (!hit) break;
      keep.add(find(edges[hit.edge].a));
      mustJoin.push(edges[hit.edge].a);
    }
  }
  const maxUnits = maxGapM / 10;
  let links = 0;
  for (let changed = true; changed; ) {
    changed = false;
    const must = new Set(mustJoin.map(find));
    const groups = new Map();
    edges.forEach((e, i) => {
      if (onMain(e)) return;
      const root = find(e.a);
      if (!groups.has(root)) groups.set(root, []);
      groups.get(root).push(i);
    });
    for (const [root, list] of groups) {
      let best = null;
      for (const i of list) {
        edges[i].pts.forEach((p, k) => {
          const hit = nearest(p, onMain, best ? best.hit.d : must.has(root) ? Infinity : maxUnits);
          if (hit && (!best || hit.d < best.hit.d)) best = { hit, from: { edge: i, seg: Math.max(0, k - 1), q: p } };
        });
      }
      if (!best) continue;
      made(attach(best.from), attach(best.hit));
      links += 1;
      changed = true;
    }
  }

  // 쓰는 갈림점만 남기고, 다시 사이 점을 옮긴 만큼으로 적는다
  const renum = new Map();
  const outNodes = [];
  const idOf = (n) => {
    if (!renum.has(n)) {
      renum.set(n, outNodes.length / 2);
      outNodes.push(...nodes[n]);
    }
    return renum.get(n);
  };
  const outEdges = [];
  for (const e of edges) {
    const a = real(e.a);
    const b = real(e.b);
    if (a === b && e.pts.length <= 2) continue;
    const flat = [];
    let prev = nodes[a];
    for (const p of e.pts.slice(1, -1)) {
      flat.push(p[0] - prev[0], p[1] - prev[1]);
      prev = p;
    }
    outEdges.push(e.name === undefined ? [idOf(a), idOf(b), e.cls, e.meters, flat] : [idOf(a), idOf(b), e.cls, e.meters, flat, e.name]);
  }
  return { nodes: outNodes, edges: outEdges, spurs, links, longestM };
}
