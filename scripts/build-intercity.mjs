// npm run intercity-build: 받은 고속·시외버스 배차(data/raw/intercity/)를 걸어서 여행하기용 자료(data/build/intercity.json)로 만든다.
//  - 터미널 자리: OpenStreetMap 버스터미널(scripts/lib/terminals.mjs가 TAGO 터미널과 이름으로 잇는다)
//  - 배차: 출발 시각, 걸리는 시간, 요금(어른), 등급. 같은 터미널 짝의 같은 배차는 하나로 합친다.
//  - 지도에 넣은 지역 안 터미널끼리만 넣는다. 3km보다 가까운 짝은 뺀다(같은 동네 안).
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { areaTerminals, matchTerminals } from './lib/terminals.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = resolve(ROOT, 'data/raw/intercity');
const places = areaTerminals(ROOT);
const edits = JSON.parse(readFileSync(resolve(ROOT, 'data/edits/bus-terminals.json'), 'utf8')).edits;
/** 가장 최근에 받은 파일. 지역을 더할 때 따로 받은 파일(express-gangwon-날짜.json)은 꼬리표마다 가장 최근 것을 함께 쓴다. */
const filesOf = (prefix) => {
  const all = readdirSync(RAW).filter((f) => f.startsWith(prefix) && f.endsWith('.json')).sort();
  const groups = new Map();
  for (const f of all) groups.set(f.slice(prefix.length).replace(/[0-9]+.json$/, ''), f);
  const base = groups.get('');
  return base ? [base, ...[...groups].filter(([tag]) => tag).map(([, f]) => f)] : [];
};

/** "202611180620" 또는 "20261114054000" → 그날 0시부터 분 */
const minuteOf = (text) => {
  const s = String(text);
  return Number(s.slice(8, 10)) * 60 + Number(s.slice(10, 12));
};
const dayOf = (text) => String(text).slice(0, 8);

const used = new Map(); // OSM 터미널 id → 번호
const terminals = [];
const indexOf = (place, kind) => {
  if (!used.has(place.id)) {
    used.set(place.id, terminals.length);
    terminals.push({ osm: place.id, name: place.name, x: place.x, y: place.y, kinds: [] });
  }
  const t = terminals[used.get(place.id)];
  if (!t.kinds.includes(kind)) t.kinds.push(kind);
  return used.get(place.id);
};
const grades = [];
const gradeOf = (name) => {
  const g = String(name ?? '일반').trim() || '일반';
  if (!grades.includes(g)) grades.push(g);
  return grades.indexOf(g);
};

const routes = new Map(); // "from|to|kind" → Map(trip key → trip)
const stats = {};
let badTimes = 0;
const dates = {};
for (const [kind, prefix] of [
  ['고속', 'express-'],
  ['시외', 'suburbs-'],
]) {
  const files = filesOf(prefix);
  if (!files.length) {
    console.log(`${kind}버스 원본이 없어요(npm run intercity).`);
    continue;
  }
  for (const file of files) {
  const raw = JSON.parse(readFileSync(resolve(RAW, file), 'utf8'));
  dates[kind] = [...new Set([...(dates[kind]?.split(', ') ?? []), raw.runDate])].join(', ');
  const matched = matchTerminals(raw.terminals, places, edits);
  let n = 0;
  let far = 0;
  for (const [pair, list] of Object.entries(raw.pairs)) {
    const [a, b] = pair.split('|');
    const pa = matched.get(a);
    const pb = matched.get(b);
    if (!pa || !pb || pa.id === pb.id) continue;
    if (Math.hypot(pa.x - pb.x, pa.y - pb.y) < 3) {
      far += 1;
      continue;
    }
    const from = indexOf(pa, kind);
    const to = indexOf(pb, kind);
    const key = `${from}|${to}|${kind}`;
    if (!routes.has(key)) routes.set(key, new Map());
    const trips = routes.get(key);
    for (const [dep, arr, charge, grade] of list) {
      const d = minuteOf(dep);
      let dur = minuteOf(arr) - d + (dayOf(arr) > dayOf(dep) ? 1440 : 0);
      if (!(dur > 0)) continue;
      // 원본에 도착 시각이 잘못 적힌 줄이 있다(무안→군산 112km를 2분 등). 곧게 잰 거리를 시속 120km보다 빨리 가는 줄은 뺀다.
      if (Math.hypot(pa.x - pb.x, pa.y - pb.y) / (dur / 60) >= 120) {
        badTimes += 1;
        continue;
      }
      const trip = [d, dur, Number(charge) || null, gradeOf(grade)];
      trips.set(trip.join(','), trip);
      n += 1;
    }
  }
  stats[`${kind} ${file}`] = { pairs: Object.keys(raw.pairs).length, trips: n, nearPairs: far };
  }
}

const out = {
  _설명: '걸어서 여행하기의 고속·시외버스. terminals는 OpenStreetMap 버스터미널 자리(격자 km). routes는 [출발 터미널 번호, 도착 터미널 번호, 종류, 배차들], 배차는 [출발 시각(0시부터 분), 걸리는 시간(분), 어른 요금(원, 모르면 null), 등급 번호(grades)]. 만든 곳: scripts/build-intercity.mjs',
  source: '국토교통부 TAGO 고속버스정보(15098522)·시외버스정보(15098541), 터미널 자리 © OpenStreetMap contributors',
  dates,
  grades,
  terminals,
  routes: [...routes].map(([key, trips]) => {
    const [from, to, kind] = key.split('|');
    return [Number(from), Number(to), kind, [...trips.values()].sort((p, q) => p[0] - q[0] || p[1] - q[1])];
  }).filter((r) => r[3].length).sort((p, q) => p[0] - q[0] || p[1] - q[1] || p[2].localeCompare(q[2])),
};
const text = JSON.stringify(out);
writeFileSync(resolve(ROOT, 'data/build/intercity.json'), text);
console.log(`터미널 ${terminals.length}곳, 노선(터미널 짝) ${out.routes.length}개, 배차 ${out.routes.reduce((s, r) => s + r[3].length, 0)}개, ${(text.length / 1024).toFixed(0)}KB`);
for (const [kind, s] of Object.entries(stats)) console.log(`${kind}: 받은 짝 ${s.pairs}개, 배차 줄 ${s.trips}개, 3km보다 가까워 뺀 짝 ${s.nearPairs}개`);
console.log(`시속 120km보다 빠르게 적힌 배차 줄 ${badTimes}개는 뺐어요(원본의 도착 시각 잘못).`);
