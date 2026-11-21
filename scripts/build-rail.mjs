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
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readCsv } from './lib/csv.mjs';
import { utm52 } from './lib/utm.mjs';
import { readXlsx } from './lib/xlsx.mjs';
import { readOsmFile } from './lib/osm.mjs';
import { KORAIL_DATE } from './lib/train-dates.mjs';

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
// 열차운행정보(npm run trains로 받은 것)가 있으면, 그날 여객 열차가 실제로 선 역도 여객역으로 본다
// (센텀·신해운대·기장처럼 코레일 역 목록에 없지만 ITX-마음·무궁화호가 서는 역).
const RUN_INFO = raw(`korail/run-info-${KORAIL_DATE}.json`);
// 그날 여객 열차가 선 역(stopsOnly 사슬은 이 역만 쓴다)
const trainStops = new Set();
if (existsSync(RUN_INFO)) {
  const runInfo = JSON.parse(readFileSync(RUN_INFO, 'utf8'));
  for (const list of Object.values(runInfo.runs)) {
    for (const r of list) if (['01', '02', '05', '11'].includes(r.stop_se_cd)) trainStops.add(key(r.stn_nm));
  }
}
for (const n of trainStops) passenger.add(n);
const osmAll = readOsmFile(raw('osm/stations.json')).elements.filter((e) => /^(station|halt)$/.test(e.tags?.railway ?? ''));
const osmStations = osmAll.filter((e) => e.tags?.train === 'yes' || /철도공사|코레일|Korail/i.test(e.tags?.operator ?? ''));
// 열차·운영사 꼬리표가 없는 역 노드(정선선 별어곡·선평·나전). 꼬리표 있는 같은 이름 역이 없을 때만 쓴다(전철역은 뺀다).
const osmLoose = osmAll.filter((e) => !osmStations.includes(e) && !e.tags.operator && !e.tags.subway && !e.tags.light_rail && !/subway|light_rail/.test(e.tags.station ?? ''));
/** 이름(또는 옛 이름)이 같은 OSM 역들 */
// 거리표 이름이 코레일 열차 기록·OSM 이름과 다른 역(거리표 진부오대산 → 진부). 거리표를 읽을 때 바꾼다.
const aliases = config.aliases ?? {};
function osmByName(name) {
  const osmName = name;
  const named = (list) => list.filter((e) => [e.tags.name, e.tags.old_name, ...(e.tags.old_name ?? '').split(';')].some((n) => n && key(n) === osmName));
  const strict = named(osmStations);
  return (strict.length ? strict : named(osmLoose))
    .map((e) => {
      const lat = e.lat ?? e.center?.lat;
      const lon = e.lon ?? e.center?.lon;
      const oldNames = String(e.tags.old_name ?? '').split(';').map(key).filter(Boolean);
      return { osm: `${e.type}/${e.id}`, label: key(e.tags.name), oldNames, lat, lon, ...toGrid(lon, lat) };
    });
}

// 3. 선로 그래프: OSM 선로의 점을 마디로, 이웃한 점을 잇는다. 선로끼리 만나는 점은 좌표가 같아 하나로 묶인다.
const osmRail = readOsmFile(raw('osm/rail-lines.json'));
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
  // 관광 선로(usage=tourism: 레일바이크, 해변열차, 하이원추추파크 전용선 등)는 여객 열차가 다니지 않으므로 길 찾기에서 뺀다.
  if (way.tags?.usage === 'tourism') continue;
  for (let i = 1; i < way.geometry.length; i++) {
    const a = node(way.geometry[i - 1]);
    const b = node(way.geometry[i]);
    if (a === b) continue;
    const d = Math.hypot(nodes[a].x - nodes[b].x, nodes[a].y - nodes[b].y);
    adj[a].push([b, d]);
    adj[b].push([a, d]);
  }
}
// 측선(service 태그)을 받지 않아서 역 구내 건넘선으로만 이어진 노선이 따로 떨어진 조각이 된다(익산역의 장항선 등).
// 큰 조각(마디 JOIN_MIN_NODES개 이상)은 가장 가까운 다른 조각의 마디와 JOIN_KM 안이면 곧은 선로로 잇는다. 더 이을 것이 없을 때까지 되풀이한다.
const JOIN_KM = 0.3;
const JOIN_MIN_NODES = 20;
for (let joinedAny = true; joinedAny; ) {
  joinedAny = false;
  const comp = new Int32Array(nodes.length).fill(-1);
  const sizes = [];
  for (let i = 0; i < nodes.length; i++) {
    if (comp[i] >= 0) continue;
    const stack = [i];
    comp[i] = sizes.length;
    let size = 0;
    while (stack.length) {
      const u = stack.pop();
      size += 1;
      for (const [v] of adj[u]) if (comp[v] < 0) {
        comp[v] = sizes.length;
        stack.push(v);
      }
    }
    sizes.push(size);
  }
  const biggest = sizes.indexOf(Math.max(...sizes));
  // 0.3km 칸에 마디를 나눠 담아 가까운 마디만 견준다
  const cellOf = (p) => `${Math.floor(p.x / JOIN_KM)},${Math.floor(p.y / JOIN_KM)}`;
  const cells = new Map();
  nodes.forEach((p, i) => {
    const k = cellOf(p);
    if (!cells.has(k)) cells.set(k, []);
    cells.get(k).push(i);
  });
  const best = new Map(); // 조각 → [거리, 마디, 이을 마디]
  nodes.forEach((p, i) => {
    const c = comp[i];
    if (c === biggest || sizes[c] < JOIN_MIN_NODES) return;
    const cx = Math.floor(p.x / JOIN_KM);
    const cy = Math.floor(p.y / JOIN_KM);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      for (const j of cells.get(`${cx + dx},${cy + dy}`) ?? []) {
        if (comp[j] === c) continue;
        const d = Math.hypot(nodes[j].x - p.x, nodes[j].y - p.y);
        if (d <= JOIN_KM && d < (best.get(c)?.[0] ?? Infinity)) best.set(c, [d, i, j]);
      }
    }
  });
  for (const [, [d, i, j]] of best) {
    adj[i].push([j, d]);
    adj[j].push([i, d]);
    joinedAny = true;
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

/**
 * 역에서 선로 길을 찾기 시작할 마디의 반경(km). 보통 0.6km.
 * 동백산은 솔안터널 북쪽 입구 마디가 역에서 0.57km라, 0.6km면 똬리굴(10.3km)을 건너뛰고 터널 북쪽에서 바로 시작한다.
 * 그래서 0.25km로 줄인다(우리가 정한 값. 나무위키 「솔안터널」: 동백산–도계 18.2km, 거리표와 같다).
 */
const STATION_SNAP_KM = { 동백산: 0.25 };
const snapKm = (s) => STATION_SNAP_KM[s.name] ?? 0.6;

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
// 여객역 목록에 없지만 지도 안 OSM 코레일 역이 있는 이름: npm run trains가 이 역의 열차 기록도 받아서, 실제로 열차가 서면 여객역으로 본다.
const unconfirmed = new Set();
const findChain = (sheet, names) =>
  allChains.find((c) => c.sheet === sheet && names.every((n) => c.seq.some((p) => p.name === key(n))));
for (const def of config.lines) {
  const along = [];
  for (const [i, part] of def.chains.entries()) {
    const found = findChain(part.sheet, part.contains);
    if (!found) {
      issues.push(`${def.name}: 거리표(${part.sheet})에서 ${part.contains.join('·')}이 든 사슬을 찾지 못했어요.`);
      continue;
    }
    // reverse: 사슬을 거꾸로(역 사이 거리는 뒤 역에 붙어 있으므로 한 칸씩 옮긴다), from·to: 그 두 역 사이만
    let seq = found.seq;
    if (part.reverse) seq = seq.map((p, k) => ({ name: seq[seq.length - 1 - k].name, km: k === 0 ? 0 : seq[seq.length - k].km }));
    if (part.from) seq = seq.slice(seq.findIndex((p) => p.name === key(part.from)));
    if (part.to) seq = seq.slice(0, seq.findIndex((p) => p.name === key(part.to)) + 1);
    const chain = { seq };
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
      along.push({ name: aliases[p.name] ?? p.name, km: Math.round((base + km) * 10) / 10, stopsOnly: Boolean(part.stopsOnly) });
    }
  }
  const ids = [];
  const kms = [];
  for (const point of along) {
    // 여객역인지: 코레일 목록(2024-04)에 이름이 있거나, 그 뒤 이름이 바뀐 역이면 OSM의 옛 이름(old_name)이 목록에 있다(예: 신경주 → 경주).
    // stopsOnly: 수도권처럼 전철만 서는 역이 많은 구간은 그날 여객 열차가 선 역만 쓴다
    const isPassenger = point.stopsOnly ? trainStops.has(point.name) : passenger.has(point.name) || osmByName(point.name).some((c) => c.oldNames.some((n) => passenger.has(n)));
    if (!isPassenger) {
      if (osmByName(point.name).some(inGrid)) unconfirmed.add(point.name);
      continue;
    }
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
  // insert: 거리표(2024-09)보다 뒤에 새 선로로 생긴 역을 두 역 사이에 끼운다(중앙선 군위 등).
  // 거리표에 새 선로 거리가 없어서, 그 구간은 OSM에 그린 선로 길이로 센다(우리가 잰 값, data/SOURCES.md).
  for (const ins of def.insert ?? []) {
    const ia = ids.indexOf(`R-${key(ins.after)}`);
    const ib = ids.indexOf(`R-${key(ins.before)}`);
    const s = osmByName(key(ins.name)).filter(inGrid)[0];
    if (ia < 0 || ib !== ia + 1 || !s) {
      issues.push(`${def.name} ${ins.name}: ${ins.after}–${ins.before} 사이에 끼우지 못했어요.`);
      continue;
    }
    const snap = nearestNode(s);
    const id = `R-${s.label}`;
    const trackKm = (a, b) => {
      const path = railPath(nodesNear(a, 0.6), nodesNear(b, 0.6), 200);
      return path ? path.slice(1).reduce((sum, n, k) => sum + Math.hypot(nodes[n].x - nodes[path[k]].x, nodes[n].y - nodes[path[k]].y), 0) : null;
    };
    const a = stations.get(ids[ia]);
    const b = stations.get(ids[ib]);
    const l1 = trackKm(a, s);
    const l2 = trackKm(s, b);
    if (snap.km > 0.5 || l1 === null || l2 === null) {
      issues.push(`${def.name} ${ins.name}: 선로에 붙이지 못했어요.`);
      continue;
    }
    if (!stations.has(id)) stations.set(id, { id, name: s.label, x: round2(s.x), y: round2(s.y), lon: s.lon, lat: s.lat, lines: [], osm: s.osm, node: snap.node });
    stations.get(id).lines.push(def.id);
    const delta = l1 + l2 - (kms[ib] - kms[ia]);
    ids.splice(ib, 0, id);
    kms.splice(ib, 0, Math.round((kms[ia] + l1) * 10) / 10);
    for (let k = ib + 1; k < kms.length; k++) kms[k] = Math.round((kms[k] + delta) * 10) / 10;
    issues.push(`${def.name} ${ins.after}–${ins.name}–${ins.before}: 거리표에 없는 새 선로라 그린 선로 길이(${l1.toFixed(1)}km, ${l2.toFixed(1)}km)를 써요.`);
  }
  // append: 거리표(2024-09) 사슬 끝 역 뒤로 새로 열린 역을 차례로 잇는다(동해선 영덕 북쪽, 2025-01 개통).
  // 역 사이 거리는 OSM에 그린 선로 길이(우리가 잰 값). 지도 밖 역이 나오면 거기서 멈춘다.
  for (const name of def.append ?? []) {
    const s = osmByName(key(name)).filter(inGrid)[0];
    const last = stations.get(ids.at(-1));
    if (!s || !last) {
      if (!s && osmByName(key(name)).length) break; // 지도 밖
      issues.push(`${def.name} ${name}: 이어 붙이지 못했어요.`);
      break;
    }
    const snap = nearestNode(s);
    const path = railPath(nodesNear(last, 0.6), nodesNear(s, 0.6), 200);
    if (snap.km > 0.5 || !path) {
      issues.push(`${def.name} ${name}: 선로에 붙이지 못했어요.`);
      break;
    }
    const km = path.slice(1).reduce((sum, n, k) => sum + Math.hypot(nodes[n].x - nodes[path[k]].x, nodes[n].y - nodes[path[k]].y), 0);
    const id = `R-${s.label}`;
    if (!stations.has(id)) stations.set(id, { id, name: s.label, x: round2(s.x), y: round2(s.y), lon: s.lon, lat: s.lat, lines: [], osm: s.osm, node: snap.node });
    stations.get(id).lines.push(def.id);
    kms.push(Math.round((kms.at(-1) + km) * 10) / 10);
    ids.push(id);
  }
  if (def.append?.length) issues.push(`${def.name} ${def.append[0]}~: 거리표에 없는 새 구간이라 그린 선로 길이를 써요.`);
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
    const path = railPath(nodesNear(a, snapKm(a)), nodesNear(b, snapKm(b)), km * 2 + 5);
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
  // 여객역인지 아직 모르는 역(열차 기록을 받아 볼 역 이름)
  candidates: [...unconfirmed].sort(),
  issues,
};
writeFileSync(resolve(ROOT, 'data/build/rail.json'), JSON.stringify(out));
const size = Buffer.byteLength(JSON.stringify(out));
for (const line of lines) {
  console.log(`${line.name}(${line.id}, ${line.kind}): 역 ${line.stations.length}개 ${line.stations.map((id) => stations.get(id).name).join('-')}`);
}
console.log(`여객역 ${stations.size}곳, rail.json ${(size / 1024).toFixed(0)}KB`);
if (issues.length) console.log(`\n확인할 것 ${issues.length}개:\n- ${issues.join('\n- ')}`);
