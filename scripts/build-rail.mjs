// npm run rail: 일반·고속 철도(코레일)의 노선, 역, 선로 모양을 게임 자료로 만든다(data/build/rail.json).
//
// 원본(받는 곳은 scripts/sources.mjs)
//  - 15137040 한국철도공사 철도운행거리 전체(각 선구별 거리표, XLSX, 2024-09-01): 노선별 역 차례와 역 사이 거리(km). 공식 뼈대다.
//  - 15127532 한국철도공사 역 위치 정보(2024-04-01): 여객역 목록으로만 쓴다. 좌표는 틀린 역이 있어(창원중앙 등) 쓰지 않는다.
//  - OpenStreetMap 역 노드(stations.json): 역 자리. 이름(또는 옛 이름)으로 찾는다.
//  - OpenStreetMap 철도 선로(rail-lines.json, railway=rail, 측선 뺌): 선로를 이어 길 그래프를 만들고,
//    역과 역 사이 가장 짧은 선로를 따라 선 모양을 그린다(선로 이름에 기대지 않는다).
// 거리표 차례 가운데 여객역(코레일 목록에 있거나 data/edits/rail-stations.json에 넣은 역)이고 OSM 역 노드가 있는 것만 역으로 둔다.
// 신호장·분기점·화물역은 거리만 더한다. 열차(종류, 시각)는 아직 없다(열차 2단계).
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readCsv } from './lib/csv.mjs';
import { utm52 } from './lib/utm.mjs';
import { readXlsx } from './lib/xlsx.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const raw = (p) => resolve(ROOT, 'data/raw', p);
const config = JSON.parse(readFileSync(resolve(ROOT, 'scripts/config/rail-lines.json'), 'utf8'));
const edits = JSON.parse(readFileSync(resolve(ROOT, 'data/edits/rail-stations.json'), 'utf8'));
const grid = JSON.parse(readFileSync(resolve(ROOT, 'data/build/grid.json'), 'utf8'));
const issues = [];

/** 경위도 → 격자 좌표(km) */
function toGrid(lon, lat) {
  const [e, n] = utm52.forward(lon, lat);
  return { x: (e - grid.origin.easting) / 1000, y: (grid.origin.northing - n) / 1000 };
}
const inGrid = (p) => p.x >= 0 && p.y >= 0 && p.x < grid.cols && p.y < grid.rows;
const round2 = (v) => Math.round(v * 100) / 100;
/** 이름 견주기: 빈칸, 괄호, 끝의 "역"을 뗀다. "김천(구미)" → "김천구미" */
const key = (name) => String(name ?? '').replace(/\s+/g, '').replace(/[()]/g, '').replace(/역$/, '');

// 1. 거리표 사슬: 역 이름이 대각선(한 칸씩 오른쪽 아래)으로 이어지고, 바로 옆(가로) 또는 아래(세로) 칸에 역 사이 거리가 있다.
const isNum = (v) => v !== '' && v !== undefined && Number.isFinite(Number(v));
const isName = (v) => typeof v === 'string' && v.trim() !== '' && !isNum(v) && /[가-힣]/.test(v);
function chains(rows) {
  const at = (r, c) => rows[r]?.[c] ?? '';
  const out = [];
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < (rows[r]?.length ?? 0); c++) {
      if (!isName(at(r, c)) || isName(at(r - 1, c - 1))) continue;
      const seq = [{ name: key(at(r, c)), km: 0 }];
      let rr = r;
      let cc = c;
      while (isName(at(rr + 1, cc + 1))) {
        const across = at(rr, cc + 1);
        const down = at(rr + 1, cc);
        const km = isNum(across) ? Number(across) : isNum(down) ? Number(down) : null;
        rr += 1;
        cc += 1;
        seq.push({ name: key(at(rr, cc)), km });
      }
      if (seq.length >= 3) out.push(seq);
    }
  }
  return out;
}
const sheets = readXlsx(readFileSync(raw('datagokr/15137040.xlsx')));
const allChains = sheets.flatMap((sheet) => chains(sheet.rows).map((seq) => ({ sheet: sheet.name, seq })));

// 2. 여객역 목록(이름만)과 OSM 역 자리
const korailRows = readCsv(raw('datagokr/15127532.csv')).records;
const passenger = new Set(korailRows.map((r) => key(r['역명'])));
// 코레일 좌표(대략)로 지도 안에 있을 법한 역. OSM에 없을 때만 알리려고 쓴다(좌표가 틀린 역이 있어 자리로는 쓰지 않는다).
const koreanInGrid = new Set(korailRows.filter((r) => inGrid(toGrid(Number(r['경도']), Number(r['위도'])))).map((r) => key(r['역명'])));
for (const add of edits.add ?? []) passenger.add(key(add.name));
const osmStations = JSON.parse(readFileSync(raw('osm/stations.json'), 'utf8')).elements.filter(
  (e) => /^(station|halt)$/.test(e.tags?.railway ?? '') && (e.tags?.train === 'yes' || /철도공사|코레일|Korail/i.test(e.tags?.operator ?? '')),
);
/** 이름(또는 옛 이름)이 같은 OSM 역들 */
function osmByName(name) {
  return osmStations
    .filter((e) => [e.tags.name, e.tags.old_name, ...(e.tags.old_name ?? '').split(';')].some((n) => n && key(n) === name))
    .map((e) => {
      const lat = e.lat ?? e.center?.lat;
      const lon = e.lon ?? e.center?.lon;
      const oldNames = String(e.tags.old_name ?? '').split(';').map(key).filter(Boolean);
      return { osm: `${e.type}/${e.id}`, label: key(e.tags.name), oldNames, lat, lon, ...toGrid(lon, lat) };
    });
}

// 3. 선로 그래프: OSM 선로의 점을 마디로, 이웃한 점을 잇는다. 선로끼리 만나는 점은 좌표가 같아 하나로 묶인다.
const osmRail = JSON.parse(readFileSync(raw('osm/rail-lines.json'), 'utf8'));
const nodeOf = new Map();
const nodes = [];
const adj = [];
const node = (g) => {
  const k = `${g.lat.toFixed(7)},${g.lon.toFixed(7)}`;
  if (!nodeOf.has(k)) {
    nodeOf.set(k, nodes.length);
    nodes.push(toGrid(g.lon, g.lat));
    adj.push([]);
  }
  return nodeOf.get(k);
};
for (const way of osmRail.elements) {
  if (!way.geometry) continue;
  for (let i = 1; i < way.geometry.length; i++) {
    const a = node(way.geometry[i - 1]);
    const b = node(way.geometry[i]);
    if (a === b) continue;
    const d = Math.hypot(nodes[a].x - nodes[b].x, nodes[a].y - nodes[b].y);
    adj[a].push([b, d]);
    adj[b].push([a, d]);
  }
}
// 가장 큰 선로 덩어리(본선이 다 이어진 것). 역은 이 덩어리의 마디에 붙인다.
// 역의 승강장 선로는 건넘선(측선으로 빼서 받지 않음)으로만 본선과 이어져 따로 떨어진 조각이 되기 때문이다.
const part = new Int32Array(nodes.length).fill(-1);
let partCount = 0;
const partSize = [];
for (let i = 0; i < nodes.length; i++) {
  if (part[i] >= 0) continue;
  const stack = [i];
  part[i] = partCount;
  let size = 0;
  while (stack.length) {
    const u = stack.pop();
    size += 1;
    for (const [v] of adj[u]) {
      if (part[v] < 0) {
        part[v] = partCount;
        stack.push(v);
      }
    }
  }
  partSize.push(size);
  partCount += 1;
}
const mainPart = partSize.indexOf(Math.max(...partSize));

/** 점에서 가장 가까운 본선 마디와 거리(km) */
function nearestNode(p) {
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < nodes.length; i++) {
    if (part[i] !== mainPart) continue;
    const d = Math.hypot(nodes[i].x - p.x, nodes[i].y - p.y);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return { node: best, km: bestD };
}
/**
 * 출발 후보 마디들에서 도착 후보 마디들까지 가장 짧은 선로(마디 번호 차례). 못 가면 null.
 * 복선은 상행·하행 선로가 따로 그려져 있고 건넘선(측선)을 받지 않아서, 역 둘레의 여러 선로 마디를 후보로 둔다.
 */
function railPath(fromNodes, toNodes, limitKm) {
  const targets = new Set(toNodes);
  const dist = new Map(fromNodes.map((n) => [n, 0]));
  const prev = new Map();
  let reached = null;
  // 작은 이진 힙
  const heap = fromNodes.map((n) => [0, n]);
  const push = (item) => {
    heap.push(item);
    for (let i = heap.length - 1; i > 0; ) {
      const parent = (i - 1) >> 1;
      if (heap[parent][0] <= heap[i][0]) break;
      [heap[parent], heap[i]] = [heap[i], heap[parent]];
      i = parent;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      for (let i = 0; ; ) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top;
  };
  while (heap.length) {
    const [d, u] = pop();
    if (targets.has(u)) {
      reached = u;
      break;
    }
    if (d > (dist.get(u) ?? Infinity) || d > limitKm) continue;
    for (const [v, w] of adj[u]) {
      const nd = d + w;
      if (nd < (dist.get(v) ?? Infinity)) {
        dist.set(v, nd);
        prev.set(v, u);
        push([nd, v]);
      }
    }
  }
  if (reached === null) return null;
  const path = [reached];
  while (prev.has(path[0])) path.unshift(prev.get(path[0]));
  return path;
}

/** 점 둘레 km 안의 본선 마디들 */
function nodesNear(p, km) {
  const list = [];
  for (let i = 0; i < nodes.length; i++) {
    if (part[i] === mainPart && Math.hypot(nodes[i].x - p.x, nodes[i].y - p.y) <= km) list.push(i);
  }
  return list;
}

/** 선 모양을 줄인다(더글라스–퓨커, tol km). */
function simplify(points, tol) {
  if (points.length <= 2) return points;
  const keep = new Array(points.length).fill(false);
  keep[0] = keep[points.length - 1] = true;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop();
    const a = points[s];
    const b = points[e];
    let far = -1;
    let farD = tol;
    for (let i = s + 1; i < e; i++) {
      const p = points[i];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1e-9;
      const d = Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / len;
      if (d > farD) {
        far = i;
        farD = d;
      }
    }
    if (far >= 0) {
      keep[far] = true;
      stack.push([s, far], [far, e]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

// 4. 노선마다: 거리표 사슬(여럿이면 차례로 이음) → 지도 안 여객역 차례, 역 사이 거리, 선 모양
const stations = new Map();
const lines = [];
const findChain = (sheet, names) =>
  allChains.find((c) => c.sheet === sheet && names.every((n) => c.seq.some((p) => p.name === key(n))));
for (const def of config.lines) {
  const along = [];
  for (const [i, part] of def.chains.entries()) {
    const chain = findChain(part.sheet, part.contains);
    if (!chain) {
      issues.push(`${def.name}: 거리표(${part.sheet})에서 ${part.contains.join('·')}이 든 사슬을 찾지 못했어요.`);
      continue;
    }
    // 사슬 안 누적 거리. 뒤 사슬은 앞 사슬의 끝 역(같은 이름)에서 이어 센다.
    let km = 0;
    let started = i === 0;
    const startName = i === 0 ? null : along.at(-1)?.name;
    const base = along.at(-1)?.km ?? 0;
    for (const [k, p] of chain.seq.entries()) {
      if (k > 0) km += p.km ?? 0;
      if (!started) {
        if (p.name !== startName) continue;
        started = true;
        km = 0;
        continue; // 이어 붙이는 역은 이미 있다
      }
      along.push({ name: p.name, km: Math.round((base + km) * 10) / 10 });
    }
  }
  const ids = [];
  const kms = [];
  for (const point of along) {
    // 여객역인지: 코레일 목록(2024-04)에 이름이 있거나, 그 뒤 이름이 바뀐 역이면 OSM의 옛 이름(old_name)이 목록에 있다(예: 신경주 → 경주).
    if (!passenger.has(point.name) && !osmByName(point.name).some((c) => c.oldNames.some((n) => passenger.has(n)))) continue;
    const candidates = osmByName(point.name).filter(inGrid);
    if (candidates.length === 0) {
      if (osmByName(point.name).length === 0 && koreanInGrid.has(point.name)) issues.push(`${def.name} ${point.name}: OSM에 이 이름의 역이 없어 뺐어요(문을 닫았거나 이름이 바뀐 역일 수 있어요).`);
      continue;
    }
    // 같은 이름이 여럿이면 앞 역에 가까운 쪽
    const last = ids.length ? stations.get(ids.at(-1)) : null;
    const s = last ? candidates.sort((a, b) => Math.hypot(a.x - last.x, a.y - last.y) - Math.hypot(b.x - last.x, b.y - last.y))[0] : candidates[0];
    const snap = nearestNode(s);
    if (snap.km > 0.5) {
      issues.push(`${def.name} ${point.name}: 역이 선로에서 ${snap.km.toFixed(1)}km 떨어져 있어 뺐어요.`);
      continue;
    }
    const id = `R-${s.label}`;
    if (!stations.has(id)) stations.set(id, { id, name: s.label, x: round2(s.x), y: round2(s.y), lon: s.lon, lat: s.lat, lines: [], osm: s.osm, node: snap.node });
    if (!stations.get(id).lines.includes(def.id)) stations.get(id).lines.push(def.id);
    if (ids.at(-1) === id) continue;
    ids.push(id);
    kms.push(point.km);
  }
  if (ids.length < 2) {
    issues.push(`${def.name}: 지도 안 여객역이 ${ids.length}개뿐이라 뺐어요.`);
    // 이 노선 때문에 넣은 역은 뺀다(다른 노선에도 있으면 남는다).
    for (const id of ids) {
      const station = stations.get(id);
      station.lines = station.lines.filter((l) => l !== def.id);
      if (station.lines.length === 0) stations.delete(id);
    }
    continue;
  }
  const links = [];
  const paths = [];
  for (let i = 1; i < ids.length; i++) {
    const a = stations.get(ids[i - 1]);
    const b = stations.get(ids[i]);
    const km = Math.round((kms[i] - kms[i - 1]) * 10) / 10;
    const path = railPath(nodesNear(a, 0.6), nodesNear(b, 0.6), km * 2 + 5);
    let points;
    if (path) {
      points = path.map((n) => nodes[n]);
    } else {
      issues.push(`${def.name} ${a.name}–${b.name}: 선로가 이어지지 않아 곧은 선으로 그려요.`);
      points = [a, b];
    }
    const pathKm = points.slice(1).reduce((s, p, k) => s + Math.hypot(p.x - points[k].x, p.y - points[k].y), 0);
    if (path && Math.abs(pathKm - km) > Math.max(1.5, km * 0.15)) {
      issues.push(`${def.name} ${a.name}–${b.name}: 거리표 ${km}km, 그린 선로 ${pathKm.toFixed(1)}km로 달라요.`);
    }
    links.push({ from: ids[i - 1], to: ids[i], km });
    paths.push(simplify(points, 0.02).map((p) => [Math.round(p.x * 100), Math.round(p.y * 100)]));
  }
  lines.push({ id: def.id, name: def.name, kind: def.kind, stations: ids, links, paths });
}

const out = {
  _설명:
    '일반·고속 철도(코레일). lines: 노선(stations 차례, links 역 사이 거리 km는 거리표, paths는 역 사이 선로 모양 [x×100, y×100] 격자 칸 단위), stations: 여객역(x, y는 격자 칸 단위, 자리는 OSM 역 노드). 열차 종류와 시각은 아직 없다. 만든 곳: scripts/build-rail.mjs',
  source:
    '공공데이터포털 15137040 한국철도공사 철도운행거리 전체(각 선구별 거리표, 2024-09-01), 15127532 한국철도공사 역 위치 정보(2024-04-01, 여객역 목록), OpenStreetMap 역과 철도 선로(© OpenStreetMap contributors)',
  lines,
  stations: [...stations.values()].map(({ node: _, ...s }) => s),
  issues,
};
writeFileSync(resolve(ROOT, 'data/build/rail.json'), JSON.stringify(out));
const size = Buffer.byteLength(JSON.stringify(out));
for (const line of lines) {
  console.log(`${line.name}(${line.id}, ${line.kind}): 역 ${line.stations.length}개 ${line.stations.map((id) => stations.get(id).name).join('-')}`);
}
console.log(`여객역 ${stations.size}곳, rail.json ${(size / 1024).toFixed(0)}KB`);
if (issues.length) console.log(`\n확인할 것 ${issues.length}개:\n- ${issues.join('\n- ')}`);
