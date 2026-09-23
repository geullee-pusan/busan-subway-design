// 부산 시내버스 노선을 게임 자료로 만든다(data/build/bus.json).
//
// 원본(공공데이터포털, 이용허락범위 제한 없음)
//  - 15123610 버스노선별 승하차 정보(2023-07-31 판, 1회성): 노선번호, 정류장순서, 정류장코드, 정류장명, 승차·하차 합계
//    하루 자료인지 기간 합계인지는 설명에 없다. 게임은 한 노선 안에서 견준 붐빔으로만 쓴다.
//  - 15084251 버스 정류소 정보(SHP): 정류소 이름과 GPS 좌표(WGS84)
// 두 자료의 정류장 코드가 서로 달라서 정류장 이름으로 잇는다. 같은 이름이 여러 곳(길 건너편, 다른 동네)에 있으면
// 노선을 따라 앞뒤 정류장과 가장 가깝게 이어지는 곳을 고른다(모든 차례를 한꺼번에 보는 최소 거리 고르기).
// 심야 노선은 낮 시간 여행과 하루 운행에 쓰지 않으므로 뺀다.
// 좌표는 격자 단위(1칸 = 1km, UTM 52N)로 바꾸고 0.01칸(10m)까지만 둔다.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateRawSync } from 'node:zlib';
import { makeUtm } from './lib/utm.mjs';

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
for (const [no, rows] of [...routeRows].sort((a, b) => a[0].localeCompare(b[0], 'ko', { numeric: true }))) {
  rows.sort((a, b) => a.order - b.order);
  const allBoard = rows.reduce((sum, r) => sum + r.board, 0);
  rowsAll += rows.length;
  boardAll += allBoard;
  if (no.includes('심야')) {
    skipped.push(no);
    continue;
  }
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

const out = {
  _설명:
    '부산 시내버스 노선(심야 노선 뺌). stops는 [x×100, y×100, 이름 번호](격자 칸 단위), routes의 stops는 [정류장 번호, 승차 합계, 하차 합계](2023-07-31 판 자료. 하루치인지 기간 합계인지는 자료 설명에 없다). 만든 곳: scripts/build-bus.mjs',
  date: '2023-07-31',
  stopsDate: '2026-09-12',
  source: '공공데이터포털 15123610 부산광역시_버스노선별 승하차 정보, 15084251 부산광역시_버스 정류소 정보',
  names,
  stops,
  routes,
};
writeFileSync(resolve(ROOT, 'data/build/bus.json'), JSON.stringify(out));
const size = Buffer.byteLength(JSON.stringify(out));
console.log(`노선 ${routes.length}개(뺀 노선 ${skipped.length}개), 정류장 ${stops.length}곳, 이름 ${names.length}개`);
console.log(`자리를 찾은 정류장 차례 ${rowsKept}/${rowsAll}(${((rowsKept / rowsAll) * 100).toFixed(1)}%), 승차 ${((boardKept / boardAll) * 100).toFixed(1)}%`);
console.log(`bus.json ${(size / 1024).toFixed(0)}KB`);
if (skipped.length) console.log(`뺀 노선: ${skipped.join(', ')}`);
