// npm run roads: OpenStreetMap 차도(data/raw/osm/roads.json)를 걸어서 여행하기용 길 자료로 만든다(data/build/roads.json).
//
// - 고속도로는 빼고 간선(trunk), 주간선(primary), 보조간선(secondary), 일반(tertiary) 도로와 그 연결로만 쓴다.
// - 길이 만나는 점(두 길 이상이 함께 쓰는 OSM 노드)과 길 끝을 갈림점으로 두고, 갈림점 사이를 한 토막으로 자른다.
//   택시는 이 토막들을 이어 가장 빨리 가는 길로 달린다(src/sim/roads.js).
// - 토막 모양은 15m 오차로 줄이고(Douglas-Peucker), 좌표는 10m 단위 정수로 적는다.
// - 일방통행, 회전 금지, 신호는 넣지 않는다(어림).
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { simplify } from './build/districts.mjs';
import { utm52 } from './lib/utm.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const grid = JSON.parse(readFileSync(resolve(ROOT, 'data/build/grid.json'), 'utf8'));
const osm = JSON.parse(readFileSync(resolve(ROOT, 'data/raw/osm/roads.json'), 'utf8'));

/** 도로 종류: 1 간선, 2 주간선, 3 보조간선, 4 일반 */
const CLASS = { trunk: 1, primary: 2, secondary: 3, tertiary: 4 };
const UNIT = 0.01; // 좌표 단위(km) = 10m
const TOLERANCE_M = 15;

/** 경위도 → 격자 좌표(m) */
function toMeters(lon, lat) {
  const [e, n] = utm52.forward(lon, lat);
  return [e - grid.origin.easting, grid.origin.northing - n];
}
const inGrid = ([x, y]) => x >= 0 && y >= 0 && x < grid.cols * 1000 && y < grid.rows * 1000;

// 1. 길마다 노드와 좌표, 종류
const ways = [];
const uses = new Map(); // OSM 노드 id → 쓰는 횟수
for (const e of osm.elements) {
  if (e.type !== 'way' || !e.geometry || !e.nodes) continue;
  const cls = CLASS[String(e.tags?.highway ?? '').replace(/_link$/, '')];
  if (!cls) continue;
  const pts = e.geometry.map((g) => (g ? toMeters(g.lon, g.lat) : null));
  ways.push({ cls, nodes: e.nodes, pts });
  e.nodes.forEach((id, i) => uses.set(id, (uses.get(id) ?? 0) + (i === 0 || i === e.nodes.length - 1 ? 2 : 1)));
}

// 2. 갈림점 사이 토막으로 자르기(지도 밖으로 나가면 거기서 끊는다)
const junction = new Map(); // OSM 노드 id → 갈림점 번호
const nodeXY = [];
const nodeOf = (id, p) => {
  if (!junction.has(id)) {
    junction.set(id, nodeXY.length / 2);
    nodeXY.push(Math.round(p[0] / 10), Math.round(p[1] / 10));
  }
  return junction.get(id);
};
const edges = [];
let pointsIn = 0;
let pointsOut = 0;
for (const way of ways) {
  let run = [];
  let runIds = [];
  const flush = () => {
    if (run.length >= 2) {
      const a = nodeOf(runIds[0], run[0]);
      const b = nodeOf(runIds.at(-1), run.at(-1));
      const simple = simplify(run, TOLERANCE_M);
      let length = 0;
      for (let k = 1; k < run.length; k++) length += Math.hypot(run[k][0] - run[k - 1][0], run[k][1] - run[k - 1][1]);
      const mid = simple.slice(1, -1).map((q) => [Math.round(q[0] / 10), Math.round(q[1] / 10)]);
      if (a !== b || mid.length) edges.push({ a, b, cls: way.cls, length, mid });
      pointsIn += run.length;
      pointsOut += simple.length;
    }
    run = [];
    runIds = [];
  };
  way.pts.forEach((p, i) => {
    if (!p || !inGrid(p)) {
      flush();
      return;
    }
    run.push(p);
    runIds.push(way.nodes[i]);
    // 갈림점에서 토막을 끊고, 그 점에서 새 토막을 시작한다
    if (run.length > 1 && (uses.get(way.nodes[i]) ?? 0) > 1 && i < way.pts.length - 1) {
      flush();
      run.push(p);
      runIds.push(way.nodes[i]);
    }
  });
  flush();
}

// 3. 두 토막만 만나고 종류가 같은 갈림점은 지운다(한 길이 OSM에서 여러 조각으로 나뉜 곳)
const touching = new Map(); // 갈림점 → 토막들
for (const e of edges) {
  for (const n of [e.a, e.b]) {
    if (!touching.has(n)) touching.set(n, new Set());
    touching.get(n).add(e);
  }
}
const xy = (n) => [nodeXY[n * 2], nodeXY[n * 2 + 1]];
let merged = 0;
for (const [n, set] of touching) {
  if (set.size !== 2) continue;
  const [e1, e2] = [...set];
  if (e1.cls !== e2.cls || e1 === e2 || e1.a === e1.b || e2.a === e2.b) continue;
  // e1이 n에서 끝나고 e2가 n에서 시작하게 돌린다
  const flip = (e) => ({ ...e, a: e.b, b: e.a, mid: [...e.mid].reverse() });
  const f1 = e1.b === n ? e1 : flip(e1);
  const f2 = e2.a === n ? e2 : flip(e2);
  if (f1.a === f2.b) continue; // 고리가 되면 두지 않는다
  const joined = { a: f1.a, b: f2.b, cls: e1.cls, length: e1.length + e2.length, mid: [...f1.mid, xy(n), ...f2.mid] };
  for (const e of [e1, e2]) for (const m of [e.a, e.b]) touching.get(m)?.delete(e);
  touching.get(joined.a).add(joined);
  touching.get(joined.b).add(joined);
  touching.delete(n);
  merged += 1;
}
const alive = new Set();
for (const set of touching.values()) for (const e of set) alive.add(e);
// 쓰는 갈림점만 남기고 번호를 다시 매긴다
const renum = new Map();
const nodesOut = [];
const idOf = (n) => {
  if (!renum.has(n)) {
    renum.set(n, nodesOut.length / 2);
    nodesOut.push(...xy(n));
  }
  return renum.get(n);
};
const finalEdges = [];
for (const e of alive) {
  const a = idOf(e.a);
  const b = idOf(e.b);
  const flat = [];
  let [px, py] = xy(e.a);
  for (const [qx, qy] of e.mid) {
    flat.push(qx - px, qy - py);
    px = qx;
    py = qy;
  }
  finalEdges.push([a, b, e.cls, Math.round(e.length), flat]);
}
edges.length = 0;
edges.push(...finalEdges);
nodeXY.length = 0;
nodeXY.push(...nodesOut);
console.log(`이어 붙인 갈림점 ${merged}개`);

const byClass = {};
for (const e of edges) byClass[e[2]] = (byClass[e[2]] ?? 0) + e[3] / 1000;
const out = {
  _설명:
    '걸어서 여행하기의 차도. nodes는 갈림점 [x, y, x, y, ...](10m 단위, 격자 왼쪽 위 기준). edges는 [갈림점 a, 갈림점 b, 종류(1 간선, 2 주간선, 3 보조간선, 4 일반), 길이(m), 사이 점(앞 점에서 옮긴 만큼, 10m 단위 [dx, dy, ...])]. 일방통행과 신호는 넣지 않았다.',
  source: 'OpenStreetMap 차도(highway=trunk·primary·secondary·tertiary와 연결로), © OpenStreetMap contributors, ODbL',
  unit: UNIT,
  nodes: nodeXY,
  edges,
};
const text = JSON.stringify(out);
writeFileSync(resolve(ROOT, 'data/build/roads.json'), text);
console.log(`도로 토막 ${edges.length}개, 갈림점 ${nodeXY.length / 2}개, 점 ${pointsIn} → ${pointsOut}`);
console.log(`종류별 길이(km): ${Object.entries(byClass).map(([k, v]) => `${k}: ${Math.round(v)}`).join(', ')}`);
console.log(`roads.json ${(text.length / 1024).toFixed(0)}KB`);
