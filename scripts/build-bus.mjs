// 부산 시내버스 노선을 게임 자료로 만든다(data/build/bus.json).
//
// 원본(공공데이터포털, 이용허락범위 제한 없음)
//  - 15123610 버스노선별 승하차 정보(2023-07-31 판, 1회성): 노선번호, 정류장순서, 정류장코드, 정류장명, 승차·하차 합계
//    하루 자료인지 기간 합계인지는 설명에 없다. 게임은 한 노선 안에서 견준 붐빔으로만 쓴다.
//  - 15084251 버스 정류소 정보(SHP): 정류소 이름과 GPS 좌표(WGS84)
// 두 자료의 정류장 코드가 서로 달라서 정류장 이름으로 잇는다. 같은 이름이 여러 곳(길 건너편, 다른 동네)에 있으면
// 노선을 따라 앞뒤 정류장과 가장 가깝게 이어지는 곳을 고른다(모든 차례를 한꺼번에 보는 최소 거리 고르기).
// 심야 노선은 낮 시간 여행과 하루 운행에 쓰지 않으므로 뺀다.
// 폐선된 노선은 뺀다(data/edits/bus-routes.json). 2025년에 실제로 다닌 노선 목록(15095329)과 견주어
// 목록에 없는데 고침 파일에도 적히지 않은 노선이 있으면 알린다.
// 좌표는 격자 단위(1칸 = 1km, UTM 52N)로 바꾸고 0.01칸(10m)까지만 둔다.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateRawSync } from 'node:zlib';
import { readCsv } from './lib/csv.mjs';
import { orderStops } from './lib/stop-order.mjs';
import { makeUtm, tmEast } from './lib/utm.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const grid = JSON.parse(readFileSync(resolve(ROOT, 'data/build/grid.json'), 'utf8'));
const utm = makeUtm(52);

/** ZIP에서 파일들을 꺼낸다. */
function unzip(buffer) {
  const files = {};
  let end = buffer.length - 22;
  while (buffer.readUInt32LE(end) !== 0x06054b50) end -= 1;
  const count = buffer.readUInt16LE(end + 10);
  let at = buffer.readUInt32LE(end + 16);
  for (let i = 0; i < count; i++) {
    const method = buffer.readUInt16LE(at + 10);
    const packed = buffer.readUInt32LE(at + 20);
    const nameLength = buffer.readUInt16LE(at + 28);
    const extraLength = buffer.readUInt16LE(at + 30);
    const commentLength = buffer.readUInt16LE(at + 32);
    const local = buffer.readUInt32LE(at + 42);
    const name = buffer.subarray(at + 46, at + 46 + nameLength).toString('utf8');
    at += 46 + nameLength + extraLength + commentLength;
    const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
    const body = buffer.subarray(start, start + packed);
    files[name] = method === 0 ? body : inflateRawSync(body);
  }
  return files;
}

/** dBase(DBF) 표를 읽는다(글자는 UTF-8, .cpg에 적혀 있다). */
function readDbf(buffer) {
  const count = buffer.readUInt32LE(4);
  const headerLength = buffer.readUInt16LE(8);
  const recordLength = buffer.readUInt16LE(10);
  const fields = [];
  for (let o = 32; buffer[o] !== 0x0d; o += 32) {
    fields.push({ name: buffer.subarray(o, o + 11).toString('latin1').replace(/\0.*$/, ''), length: buffer[o + 16] });
  }
  const rows = [];
  for (let r = 0; r < count; r++) {
    let o = headerLength + r * recordLength;
    if (buffer[o] === 0x2a) continue; // 지운 줄
    o += 1;
    const row = {};
    for (const field of fields) {
      row[field.name] = buffer.subarray(o, o + field.length).toString('utf8').trim();
      o += field.length;
    }
    rows.push(row);
  }
  return rows;
}

// 1. 정류소 자리
const zip = unzip(readFileSync(resolve(ROOT, 'data/raw/datagokr/15084251.zip')));
const dbfName = Object.keys(zip).find((name) => name.toLowerCase().endsWith('.dbf'));
const stopRows = readDbf(zip[dbfName]);
const byName = new Map();
for (const row of stopRows) {
  const lon = Number(row.gpsx);
  const lat = Number(row.gpsy);
  if (!Number.isFinite(lon) || !Number.isFinite(lat) || lon === 0) continue;
  const [e, n] = utm.forward(lon, lat);
  const x = Math.round((e - grid.origin.easting) / 10) / 100;
  const y = Math.round((grid.origin.northing - n) / 10) / 100;
  const name = row.bstopnm;
  if (!byName.has(name)) byName.set(name, []);
  const list = byName.get(name);
  if (!list.some((p) => p.x === x && p.y === y)) list.push({ x, y });
}

// 2. 노선별 정류장 차례
const csv = new TextDecoder('euc-kr').decode(readFileSync(resolve(ROOT, 'data/raw/datagokr/15123610.csv')));
const lines = csv.split(/\r?\n/).filter(Boolean);
const head = lines.shift().split(',');
const col = (name) => head.indexOf(name);
const [cRoute, cOrder, cName, cBoard, cAlight] = ['노선번호', '정류장순서', '정류장명', '승차합계', '하차합계'].map(col);
const routeRows = new Map();
for (const line of lines) {
  const cells = line.split(',');
  const no = cells[cRoute];
  if (!routeRows.has(no)) routeRows.set(no, []);
  routeRows.get(no).push({ order: Number(cells[cOrder]), name: cells[cName], board: Number(cells[cBoard]) || 0, alight: Number(cells[cAlight]) || 0 });
}

// 이름이 똑같지 않은 정류장: 띄어쓰기와 문장 부호를 뺀 이름으로 찾고,
// 그래도 없으면 "서면역.롯데호텔백화점"처럼 점으로 이은 이름을 나눠 한 부분(3글자 이상)이 같은 곳을 찾는다.
const squash = (name) => name.replace(/[\s.·ㆍ,()]/g, '');
const bySquashed = new Map();
for (const [name, list] of byName) {
  const key = squash(name);
  if (!bySquashed.has(key)) bySquashed.set(key, []);
  bySquashed.get(key).push(...list);
}
const byPart = new Map();
for (const [name, list] of byName) {
  for (const part of name.split(/[.·ㆍ]/).map(squash)) {
    if (part.length < 3) continue;
    if (!byPart.has(part)) byPart.set(part, []);
    byPart.get(part).push(...list);
  }
}
const candidateCache = new Map();
/** 정류장 이름으로 찾은 자리 후보들. 없으면 null */
function candidatesOf(name) {
  if (candidateCache.has(name)) return candidateCache.get(name);
  let found = byName.get(name) ?? bySquashed.get(squash(name)) ?? null;
  if (!found) {
    const list = [];
    for (const part of name.split(/[.·ㆍ]/).map(squash)) {
      if (part.length >= 3) list.push(...(bySquashed.get(part) ?? byPart.get(part) ?? []));
    }
    found = list.length > 0 ? list : null;
  }
  candidateCache.set(name, found);
  return found;
}

/** 같은 이름 후보 가운데 노선을 따라 가장 가깝게 이어지는 자리를 고른다. */
function placeStops(rows) {
  const known = rows.filter((row) => candidatesOf(row.name));
  if (known.length === 0) return [];
  const cands = known.map((row) => candidatesOf(row.name));
  const cost = [cands[0].map(() => 0)];
  const back = [cands[0].map(() => -1)];
  for (let i = 1; i < cands.length; i++) {
    cost.push([]);
    back.push([]);
    for (const [j, p] of cands[i].entries()) {
      let best = Infinity;
      let arg = 0;
      for (const [k, q] of cands[i - 1].entries()) {
        const value = cost[i - 1][k] + Math.hypot(p.x - q.x, p.y - q.y);
        if (value < best - 1e-12) {
          best = value;
          arg = k;
        }
      }
      cost[i].push(best);
      back[i].push(arg);
    }
  }
  let last = cost.at(-1).indexOf(Math.min(...cost.at(-1)));
  const chosen = new Array(cands.length);
  for (let i = cands.length - 1; i >= 0; i--) {
    chosen[i] = cands[i][last];
    last = back[i][last];
  }
  return dropStrays(known.map((row, i) => ({ ...row, ...chosen[i] })));
}

/** 정류장 사이가 이보다 멀면 이상하다고 본다(km). 부산 시내버스 정류장 사이는 대개 1km 안쪽이다. */
const STRAY_KM = 2.5;
const hop = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
/**
 * 같은 이름의 먼 곳을 고른 정류장(앞뒤 정류장과 모두 먼 것)을 뺀다.
 * 처음과 끝 정류장은 한쪽 이웃만 보고, 이웃이 멀면 뺀다.
 */
function dropStrays(placed) {
  const list = [...placed];
  for (let changed = true; changed && list.length > 2; ) {
    changed = false;
    for (let i = 0; i < list.length; i++) {
      const before = i > 0 ? hop(list[i - 1], list[i]) : null;
      const after = i + 1 < list.length ? hop(list[i], list[i + 1]) : null;
      const far = (value) => value === null || value > STRAY_KM;
      const skip = i > 0 && i + 1 < list.length ? hop(list[i - 1], list[i + 1]) : 0;
      if (far(before) && far(after) && skip < Math.min(before ?? Infinity, after ?? Infinity)) {
        list.splice(i, 1);
        changed = true;
        break;
      }
    }
  }
  return list;
}

const stopIndex = new Map();
const stops = [];
const names = [];
const nameIndex = new Map();
const routes = [];
let rowsAll = 0;
let rowsKept = 0;
let boardAll = 0;
let boardKept = 0;
const skipped = [];
const routeEdits = JSON.parse(readFileSync(resolve(ROOT, 'data/edits/bus-routes.json'), 'utf8'));
const removed = new Map(routeEdits.remove.map((r) => [r.no, r]));
const kept = new Set(routeEdits.keep.map((r) => r.no));
/** 노선 이름 꼬리표를 떼고 견준다: 9(통합) → 9, 88-1(A) → 88-1A */
const routeKey = (no) => no.replace(/\((통합|급행|공항|용원)\)$/, '').replace(/\(([AB])\)$/, '$1');
const running2025 = new Set(readCsv(resolve(ROOT, 'data/raw/datagokr/15095329.csv')).records.map((r) => routeKey(r['노선'])));
const unexplained = [];
for (const [no, rows] of [...routeRows].sort((a, b) => a[0].localeCompare(b[0], 'ko', { numeric: true }))) {
  rows.sort((a, b) => a.order - b.order);
  const allBoard = rows.reduce((sum, r) => sum + r.board, 0);
  rowsAll += rows.length;
  boardAll += allBoard;
  if (no.includes('심야')) {
    skipped.push(no);
    continue;
  }
  if (removed.has(no)) {
    skipped.push(`${no}(폐선)`);
    continue;
  }
  if (!running2025.has(routeKey(no)) && !kept.has(no)) unexplained.push(no);
  const placed = placeStops(rows);
  if (placed.length < rows.length * 0.6) {
    skipped.push(`${no}(자리를 찾은 정류장 ${placed.length}/${rows.length})`);
    continue;
  }
  const seq = [];
  for (const stop of placed) {
    const key = `${stop.name}|${stop.x}|${stop.y}`;
    if (!stopIndex.has(key)) {
      if (!nameIndex.has(stop.name)) {
        nameIndex.set(stop.name, names.length);
        names.push(stop.name);
      }
      stopIndex.set(key, stops.length);
      stops.push([Math.round(stop.x * 100), Math.round(stop.y * 100), nameIndex.get(stop.name)]);
    }
    seq.push([stopIndex.get(key), stop.board, stop.alight]);
    boardKept += stop.board;
  }
  rowsKept += placed.length;
  routes.push({ no, stops: seq });
}

const busanOnly = { routes: routes.length, stops: stops.length };
const nameId = (name) => {
  if (!nameIndex.has(name)) {
    nameIndex.set(name, names.length);
    names.push(name);
  }
  return nameIndex.get(name);
};
const rawCsv = (file) => readCsv(resolve(ROOT, 'data/raw/datagokr', file)).records;

/** 경위도 → 격자 좌표(×100). 격자 밖이면 null */
function gridPoint(lon, lat) {
  if (!Number.isFinite(lon) || !Number.isFinite(lat) || lon === 0) return null;
  const [e, n] = utm.forward(lon, lat);
  const x = Math.round((e - grid.origin.easting) / 10);
  const y = Math.round((grid.origin.northing - n) / 10);
  if (x < 0 || y < 0 || x >= grid.cols * 100 || y >= grid.rows * 100) return null;
  return { x, y };
}

/**
 * 노선이 서는 정류장을 넣고 번호를 돌려준다. 이미 넣은 정류장(같은 이름, 40m 안)이 있으면 그 번호를 쓴다.
 * 그래서 부산 버스가 서는 양산 정류장은 부산 노선과 양산 노선이 함께 쓴다.
 */
const routedByName = new Map();
for (const [i, [x, y, n]] of stops.entries()) {
  if (!routedByName.has(names[n])) routedByName.set(names[n], []);
  routedByName.get(names[n]).push(i);
}
function routedStop(name, point) {
  const same = (routedByName.get(name) ?? []).find((i) => Math.hypot(stops[i][0] - point.x, stops[i][1] - point.y) <= 4);
  if (same !== undefined) return same;
  stops.push([point.x, point.y, nameId(name)]);
  if (!routedByName.has(name)) routedByName.set(name, []);
  routedByName.get(name).push(stops.length - 1);
  return stops.length - 1;
}

// 3. 대구 시내버스(대구광역시 15070487 버스 노선 공간정보의 정류장 + 15060936 정류소별·노선별 평균배차간격)
//    자료에 노선별 정류장 차례가 없다. 노선·방향마다 서는 정류장 묶음을 가장 짧게 잇는 차례로 어림한다
//    (scripts/lib/stop-order.mjs, 부산 노선으로 시험하면 이웃한 정류장의 약 94%가 맞는다).
//    방향은 첫차가 이른 끝을 앞으로 둔다. 정방향과 역방향을 이어 한 노선으로 둔다(부산 노선처럼 한 바퀴).
const DAEGU_ZIP = unzip(readFileSync(resolve(ROOT, 'data/raw/datagokr/15070487.zip')));
const daeguBs = readDbf(DAEGU_ZIP[Object.keys(DAEGU_ZIP).find((name) => /^bs_.*\.dbf$/i.test(name))]);
const daeguPos = new Map();
for (const row of daeguBs) {
  const [lon, lat] = tmEast.inverse(Number(row.ngis_x_pos), Number(row.ngis_y_pos));
  const point = gridPoint(lon, lat);
  if (point) daeguPos.set(row.bs_id, { ...point, name: row.bs_nm });
}
const minutesOf = (text) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(text ?? '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
const daeguRows = rawCsv('15060936.csv');
const daeguGroups = new Map(); // 노선 → 방향 → [{id, first}]
const weekdayRoutes = new Set(daeguRows.filter((r) => r['시간표유형'] === '평일').map((r) => r['노선']));
for (const r of daeguRows) {
  // 평일 시간표가 있는 노선은 평일 것만, 없는 노선은 "공통" 것을 쓴다.
  const type = r['시간표유형'];
  if (!(type === '평일' || (type === '공통' && !weekdayRoutes.has(r['노선'])))) continue;
  if (!daeguGroups.has(r['노선'])) daeguGroups.set(r['노선'], new Map());
  const dirs = daeguGroups.get(r['노선']);
  if (!dirs.has(r['진행방향'])) dirs.set(r['진행방향'], new Map());
  const list = dirs.get(r['진행방향']);
  if (!list.has(r['정류소ID'])) list.set(r['정류소ID'], minutesOf(r['첫차']));
}
const daeguStats = { routes: 0, noPlace: 0, rows: 0 };
for (const [no, dirs] of [...daeguGroups].sort((a, b) => a[0].localeCompare(b[0], 'ko', { numeric: true }))) {
  const legs = [];
  for (const dir of ['정방향', '역방향', ...[...dirs.keys()].filter((d) => d !== '정방향' && d !== '역방향')]) {
    const list = dirs.get(dir);
    if (!list) continue;
    const points = [];
    for (const [id, first] of list) {
      daeguStats.rows += 1;
      const place = daeguPos.get(id);
      if (!place) {
        daeguStats.noPlace += 1;
        continue;
      }
      points.push({ ...place, first });
    }
    if (points.length < 2) continue;
    let order = orderStops(points).map((i) => points[i]);
    // 첫차가 이른 끝을 앞으로(앞뒤 다섯 곳의 첫차 평균을 견준다)
    const mean = (list) => {
      const values = list.map((p) => p.first).filter((v) => v !== null);
      return values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0;
    };
    if (mean(order.slice(-5)) < mean(order.slice(0, 5))) order = order.reverse();
    legs.push(order);
  }
  if (legs.length === 0) continue;
  // 두 방향을 이을 때, 둘째 방향의 시작이 첫째 방향의 끝에 가까운 쪽이 되게 한다.
  if (legs.length > 1) {
    const end = legs[0].at(-1);
    const gap = (p) => Math.hypot(p.x - end.x, p.y - end.y);
    if (gap(legs[1].at(-1)) < gap(legs[1][0])) legs[1] = legs[1].reverse();
  }
  const seq = [];
  for (const leg of legs) {
    for (const p of leg) {
      const index = routedStop(p.name, p);
      if (seq.at(-1)?.[0] !== index) seq.push([index, 0, 0]);
    }
  }
  routes.push({ no: `대구 ${no}`, city: '대구', stops: seq, order: '추정' });
  daeguStats.routes += 1;
}

// 4. 양산 시내버스(경상남도 양산시 15160339 노선별 정차 정류장 정보 + 15156436 버스정류장 현황)
//    순번이 있어서 차례는 자료대로다. 교차로(교차로여부 1)는 정류장이 아니라서 뺀다.
//    지금(자료를 받은 2026-10-18) 쓰는 것만 넣는다. 같은 정류장이 부산 자료에 있으면(같은 이름, 40m 안) 그 정류장을 함께 쓴다.
const YANGSAN_DATE = '2026-10-18';
const yangsanPos = new Map();
for (const r of rawCsv('15156436.csv')) {
  if (r['교차로여부'] === '1') continue;
  const point = gridPoint(Number(r['경도']), Number(r['위도']));
  if (point) yangsanPos.set(r['정류장아이디'], { ...point, name: r['정류장명'].trim() });
}
const yangsanRoutes = new Map(); // 노선아이디 → {no, rows}
for (const r of rawCsv('15160339.csv')) {
  if (r['적용시작일'] > YANGSAN_DATE || r['적용종료일'] < YANGSAN_DATE) continue;
  if (!yangsanRoutes.has(r['노선아이디'])) yangsanRoutes.set(r['노선아이디'], { no: r['노선명'].trim(), rows: [] });
  yangsanRoutes.get(r['노선아이디']).rows.push({ order: Number(r['순번']), id: r['정류장아이디'] });
}
const yangsanStats = { routes: 0, rows: 0, placed: 0, skipped: [] };
for (const [, route] of [...yangsanRoutes].sort((a, b) => a[1].no.localeCompare(b[1].no, 'ko', { numeric: true }) || a[0].localeCompare(b[0]))) {
  // 심야 노선은 부산처럼 뺀다.
  if (route.no.includes('심야')) {
    yangsanStats.skipped.push(route.no);
    continue;
  }
  route.rows.sort((a, b) => a.order - b.order);
  const placed = route.rows.map((r) => yangsanPos.get(r.id)).filter(Boolean);
  yangsanStats.rows += route.rows.length;
  if (placed.length < 2) {
    yangsanStats.skipped.push(route.no);
    continue;
  }
  yangsanStats.placed += placed.length;
  const seq = [];
  for (const p of placed) {
    const index = routedStop(p.name, p);
    if (seq.at(-1)?.[0] !== index) seq.push([index, 0, 0]);
  }
  routes.push({ no: `양산 ${route.no}`, city: '양산', stops: seq });
  yangsanStats.routes += 1;
}

// 5. 노선 자료가 없는 정류소(울산·창원·김해·구미·경산·밀양, 자리와 이름만 있다)
//    노선이 서는 정류장 뒤에 붙인다. 격자 밖과, 이미 넣은 곳(같은 이름, 40m 안)은 뺀다.
const busanCount = stops.length;
const taken = new Map(); // 이름 → 이미 넣은 자리들
for (const [x, y, n] of stops) {
  if (!taken.has(names[n])) taken.set(names[n], []);
  taken.get(names[n]).push([x, y]);
}
const extraCounts = {};
const extraSeen = new Set();
function addExtra(city, name, lon, lat, toward) {
  if (!name || !Number.isFinite(lon) || !Number.isFinite(lat) || lon === 0) return;
  const [e, n] = utm.forward(lon, lat);
  const x = Math.round((e - grid.origin.easting) / 10);
  const y = Math.round((grid.origin.northing - n) / 10);
  if (x < 0 || y < 0 || x >= grid.cols * 100 || y >= grid.rows * 100) return;
  // 부산 자료에 이미 있는 곳(같은 이름, 40m 안)은 뺀다. 세 도시 안에서는 똑같은 자리만 뺀다(길 건너편 정류장은 따로 둔다).
  if ((taken.get(name) ?? []).some(([sx, sy]) => Math.hypot(sx - x, sy - y) <= 4)) return;
  const key = `${name}|${x}|${y}`;
  if (extraSeen.has(key)) return;
  extraSeen.add(key);
  stops.push(toward ? [x, y, nameId(name), nameId(toward)] : [x, y, nameId(name)]);
  extraCounts[city] = (extraCounts[city] ?? 0) + 1;
}
for (const r of rawCsv('15052671.csv')) addExtra('울산', r['정류장명']?.trim(), Number(r['경도']), Number(r['위도']), null);
for (const r of rawCsv('15037805.csv')) addExtra('창원', r['정류소명']?.trim(), Number(r['경도']), Number(r['위도']), r['방면']?.trim().replace(/\s*방면$/, '') || null); // 값 끝의 "방면"은 뗀다(화면에서 붙인다)
// 김해: 정류소 현황(15105200)에는 좌표가 없어서, 좌표가 있는 단말기 설치 현황(15104697)의 정류장만 넣는다.
for (const r of rawCsv('15104697.csv')) addExtra('김해', r['정류소명']?.trim(), Number(r['경도']), Number(r['위도']), null);
const gimhaeAll = rawCsv('15105200.csv').length;
for (const r of rawCsv('15049485.csv')) addExtra('구미', r['한글명칭']?.trim(), Number(r['경도']), Number(r['위도']), null);
// 경산: 좌표가 "도분" 꼴이다(12844.56097 = 128도 44.56097분).
const fromDegMin = (value) => {
  const v = Number(value);
  const degrees = Math.floor(v / 100);
  return degrees + (v - degrees * 100) / 60;
};
for (const r of rawCsv('15168960.csv')) addExtra('경산', r['정류장명']?.trim(), fromDegMin(r['경도']), fromDegMin(r['위도']), null);
for (const r of rawCsv('15072448.csv')) addExtra('밀양', r['정류장(소)명']?.trim(), Number(r['정류소위치(경도)']), Number(r['정류소위치(위도)']), null);

const out = {
  _설명:
    '부산 시내버스 노선(심야 노선과 폐선된 노선 뺌. 폐선은 data/edits/bus-routes.json), 대구·양산 시내버스 노선(번호 앞에 도시 이름. city가 있다), 울산·창원·김해·구미·경산·밀양 정류소. 대구 노선은 정류장 차례 자료가 없어 정류장 묶음을 가장 짧게 잇는 차례로 어림했다(order: "추정"). 대구·양산 노선은 승하차 수가 없어 0이다. stops는 [x×100, y×100, 이름 번호, (있으면) 방면 이름 번호](격자 칸 단위), routes의 stops는 [정류장 번호, 승차 합계, 하차 합계](2023-07-31 판 자료. 하루치인지 기간 합계인지는 자료 설명에 없다). extraFrom번부터의 정류장은 노선 자료가 없는 정류소로, 자리와 이름만 있고 서는 노선 자료가 없다. 만든 곳: scripts/build-bus.mjs',
  date: '2023-07-31',
  stopsDate: '2026-09-12',
  source: '공공데이터포털 15123610 부산광역시_버스노선별 승하차 정보, 15084251 부산광역시_버스 정류소 정보',
  routesSource:
    '대구: 공공데이터포털 15070487 대구광역시_버스 노선 공간정보_20260902(정류장), 15060936 대구광역시_시내버스 정류소별_노선별_평균배차간격_20251114(노선·방향별 정류장). 양산: 15160339 경상남도 양산시_버스노선별 정차 정류장 정보_20260714, 15156436 경상남도 양산시_버스정류장 현황_20251212',
  extraFrom: busanCount,
  extraSource:
    '공공데이터포털 15052671 울산광역시_버스 정류소 위치 정보_20260522, 15037805 경상남도 창원시_버스정류소 위치정보_20251231, 15104697 경상남도 김해시_버스정보 안내 단말기(BIT) 설치 현황_20251031, 15049485 경상북도 구미시_버스정류장_20260413, 15168960 경상북도 경산시_버스정류장위치정보_20261001, 15072448 경상남도 밀양시_버스정류장 정보',
  names,
  stops,
  routes,
};
writeFileSync(resolve(ROOT, 'data/build/bus.json'), JSON.stringify(out));
const size = Buffer.byteLength(JSON.stringify(out));
console.log(`노선 ${routes.length}개(부산 ${busanOnly.routes}, 대구 ${daeguStats.routes}, 양산 ${yangsanStats.routes}. 부산에서 뺀 노선 ${skipped.length}개), 노선이 서는 정류장 ${busanCount}곳(부산 ${busanOnly.stops}), 이름 ${names.length}개`);
console.log(`대구: 노선·방향별 정류장 ${daeguStats.rows}줄 가운데 자리를 모르는 것 ${daeguStats.noPlace}줄. 양산: 정류장 차례 ${yangsanStats.placed}/${yangsanStats.rows}(자리를 찾은 것)${yangsanStats.skipped.length ? `, 뺀 노선 ${yangsanStats.skipped.join(', ')}` : ''}`);
console.log(`노선 자료가 없는 정류소: ${Object.entries(extraCounts).map(([city, n]) => `${city} ${n}곳`).join(', ')} (김해는 좌표가 있는 단말기 설치 정류장만. 김해 정류소 현황은 ${gimhaeAll}곳)`);
console.log(`자리를 찾은 정류장 차례 ${rowsKept}/${rowsAll}(${((rowsKept / rowsAll) * 100).toFixed(1)}%), 승차 ${((boardKept / boardAll) * 100).toFixed(1)}%`);
console.log(`bus.json ${(size / 1024).toFixed(0)}KB`);
if (skipped.length) console.log(`뺀 노선: ${skipped.join(', ')}`);
if (unexplained.length) console.log(`2025년 노선 목록(15095329)에 없는데 data/edits/bus-routes.json에 적히지 않은 노선: ${unexplained.join(', ')}`);
