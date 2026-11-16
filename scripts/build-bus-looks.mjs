// 시·군 시내버스 칠(data/facts.json busLooks)로 게임용 data/build/bus-looks.json을 만든다.
// - 노선 종류의 match(정규식)는 앞뒤 빈칸을 뗀 노선 번호에 맞춘다(시작의 \s*는 지워도 같은 뜻).
// - 색을 못 찾은 종류(todo)는 그 시·군 기본 칠의 색을 쓰고, 차체(vehicle)는 그 종류 것을 둔다.
// - data/build/bus.json의 모든 시·군이 들어 있는지, 정규식이 맞는지 확인하고 보고한다.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const facts = JSON.parse(readFileSync(resolve(ROOT, 'data/facts.json'), 'utf8'));
const bus = JSON.parse(readFileSync(resolve(ROOT, 'data/build/bus.json'), 'utf8'));
const src = facts.busLooks?.cities ?? {};

const COLOR_KEYS = ['lower', 'upper', 'roof', 'front', 'stripe'];
// 주소(url)는 facts.json에만 둔다. 배포물에는 바깥 주소를 넣지 않는다.
const KEEP = ['type', 'match', ...COLOR_KEYS, 'pattern', 'vehicle', 'desc', 'source', 'confidence', 'todo'];
const pick = (t) => Object.fromEntries(KEEP.filter((k) => t[k] !== undefined && t[k] !== null).map((k) => [k, t[k]]));
const hasColor = (t) => Boolean(t?.lower);

const cities = {};
const problems = [];
for (const [city, entry] of Object.entries(src)) {
  const def = entry.default && hasColor(entry.default) ? pick(entry.default) : null;
  const types = [];
  for (const raw of entry.types ?? []) {
    const t = pick(raw);
    try {
      new RegExp(t.match);
    } catch {
      problems.push(`${city} ${t.type}: 정규식이 잘못됨 ${t.match}`);
      continue;
    }
    if (!hasColor(t) && def) {
      for (const k of COLOR_KEYS) if (def[k]) t[k] = def[k];
      t.pattern = t.pattern ?? def.pattern;
      t.todo = t.todo ?? '이 노선 종류의 칠은 확인하지 못해 시·군 기본 칠을 써요';
    }
    types.push(t);
  }
  cities[city] = { types, default: def ?? (entry.default ? pick(entry.default) : null) };
}

// 확인: bus.json 노선마다 칠이 정해지는지
const count = { 노선: 0, 종류: 0, 기본: 0, 없음: 0 };
const missingCity = new Set();
for (const r of bus.routes ?? []) {
  const text = String(r.no ?? '');
  const m = /^([가-힣]{1,3})\s+(.+)$/.exec(text);
  const city = m ? m[1] : '부산';
  const no = (m ? m[2] : text).trim();
  count.노선++;
  const c = cities[city];
  if (!c) {
    missingCity.add(city);
    count.없음++;
    continue;
  }
  if (c.types.some((t) => new RegExp(t.match).test(no))) count.종류++;
  else if (hasColor(c.default)) count.기본++;
  else count.없음++;
}

const out = {
  _설명:
    '시·군 시내버스 칠. scripts/build-bus-looks.mjs가 data/facts.json busLooks(출처와 확인 정도)로 만든다. 노선 번호(도시 이름 뒤)를 types의 match에 차례로 맞추고, 안 맞으면 default를 쓴다. 회사 이름·로고·상징 무늬는 넣지 않는다.',
  cities,
};
writeFileSync(resolve(ROOT, 'data/build/bus-looks.json'), JSON.stringify(out) + '\n');
console.log(`시·군 ${Object.keys(cities).length}곳, 노선 종류 ${Object.values(cities).reduce((n, c) => n + c.types.length, 0)}개`);
console.log(`노선 ${count.노선}개: 종류로 정함 ${count.종류}, 기본 칠 ${count.기본}, 칠 없음(게임 기본 초록) ${count.없음}`);
if (missingCity.size) console.log(`칠 자료가 없는 시·군: ${[...missingCity].join(', ')}`);
for (const p of problems) console.log(`! ${p}`);
const todo = Object.entries(cities).flatMap(([c, e]) => [...e.types, e.default].filter((t) => t?.todo).map((t) => `${c} ${t.type ?? '기본'}`));
console.log(`확인 필요(todo) ${todo.length}곳`);
