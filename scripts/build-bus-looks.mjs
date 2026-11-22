// 시·군 시내버스 칠(data/facts.json busLooks)로 게임용 data/build/bus-looks.json을 만든다.
// - 노선 종류의 match(정규식)는 앞뒤 빈칸을 뗀 노선 번호에 맞춘다(시작의 \s*는 지워도 같은 뜻).
// - 색을 못 찾은 종류(todo)는 그 시·군 기본 칠의 색을 쓰고, 차체(vehicle)는 그 종류 것을 둔다.
// - mix: 같은 노선에 칠이 다른 차가 섞여 다니면 그 칠들을 적는다(화면에서 타는 정류장으로 하나를 고른다).
// - data/build/bus.json의 모든 시·군이 들어 있는지, 정규식이 맞는지 확인하고 보고한다.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const facts = JSON.parse(readFileSync(resolve(ROOT, 'data/facts.json'), 'utf8'));
const bus = JSON.parse(readFileSync(resolve(ROOT, 'data/build/bus.json'), 'utf8'));
const src = facts.busLooks?.cities ?? {};

const COLOR_KEYS = ['lower', 'upper', 'roof', 'front', 'stripe'];
// 주소(url)는 facts.json에만 둔다. 배포물에는 바깥 주소를 넣지 않는다.
const KEEP = ['type', 'match', ...COLOR_KEYS, 'pattern', 'vehicle', 'desc', 'source', 'confidence', 'todo'];
const pickOne = (t) => Object.fromEntries(KEEP.filter((k) => t[k] !== undefined && t[k] !== null).map((k) => [k, t[k]]));
const pick = (t) => (t.mix?.length ? { ...pickOne(t), mix: t.mix.map(pickOne) } : pickOne(t));
const hasColor = (t) => Boolean(t?.lower);

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** TAGO 원본에서 노선 종류가 kind인 노선 번호들 → 정규식(없으면 null). 번호는 build-bus처럼 앞뒤 빈칸을 뗀다. */
function tagoMatch(code, kind) {
  const file = resolve(ROOT, `data/raw/tago-bus/${code}.json`);
  if (!existsSync(file)) return null;
  const nos = [...new Set(JSON.parse(readFileSync(file, 'utf8')).routes.filter((r) => (r.routetp ?? '(없음)') === kind).map((r) => String(r.routeno).trim()))].sort();
  return nos.length ? `^(?:${nos.map(escapeRe).join('|')})$` : null;
}

const cities = {};
const problems = [];
for (const [city, entry] of Object.entries(src)) {
  const def = entry.default && hasColor(entry.default) ? pick(entry.default) : null;
  const types = [];
  for (const raw0 of entry.types ?? []) {
    // tagoType: 노선 번호 대신 TAGO 노선 종류(routetp, 예: '직행좌석버스')로 고른다(수도권 넓히기 3단계, 경기·인천).
    // 받아 둔 TAGO 원본(data/raw/tago-bus/<tagoCode>.json)에서 그 종류의 노선 번호를 모아 match를 만든다. '(없음)'은 종류가 비어 있는 노선.
    const raw = raw0.tagoType ? { ...raw0, match: tagoMatch(entry.tagoCode, raw0.tagoType) } : raw0;
    if (!raw.match) continue;
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
  const m = /^([가-힣]{1,3}(?:\([가-힣]{1,3}\))?)\s+(.+)$/.exec(text);
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

// 고속·시외버스 회사별 칠(data/facts.json coachLooks) → data/build/coach-looks.json
// 회사 이름은 게임 화면에 쓰지 않는다(칠을 고르는 데만 쓴다). 주소(url)는 빼고 출처 이름만 둔다.
{
  const coach = facts.coachLooks ?? { companies: {}, terminals: {}, routes: {} };
  const intercity = JSON.parse(readFileSync(resolve(ROOT, 'data/build/intercity.json'), 'utf8'));
  const CKEEP = [...COLOR_KEYS, 'stripe2', 'cap', 'pattern', 'kinds', 'source', 'confidence'];
  const cpick = (t) => Object.fromEntries(CKEEP.filter((k) => t?.[k] !== undefined && t[k] !== null).map((k) => [k, t[k]]));
  const companies = {};
  for (const [id, c] of Object.entries(coach.companies ?? {})) {
    if (!/^#[0-9A-Fa-f]{6}$/.test(c.lower ?? '')) {
      console.log(`! 고속버스 ${id}: 칠 색이 없어 뺐어요`);
      continue;
    }
    companies[id] = cpick(c);
    if (c.premium) companies[id].premium = cpick(c.premium);
    if (c.deluxe) companies[id].deluxe = cpick(c.deluxe);
  }
  const keep = (ids) => (ids ?? []).filter((id) => companies[id]);
  const names = new Set(intercity.terminals.map((t) => t.name));
  const terminals = {};
  for (const [name, ids] of Object.entries(coach.terminals ?? {})) {
    if (!names.has(name)) console.log(`! 고속버스 터미널 이름이 자료에 없어요: ${name}`);
    else if (keep(ids).length) terminals[name] = keep(ids);
  }
  const routes = {};
  for (const [key, ids] of Object.entries(coach.routes ?? {})) if (keep(ids).length) routes[key] = keep(ids);
  writeFileSync(
    resolve(ROOT, 'data/build/coach-looks.json'),
    JSON.stringify({
      _설명:
        '고속·시외버스 회사별 칠. scripts/build-bus-looks.mjs가 data/facts.json coachLooks(출처와 확인 정도)로 만든다. 배차 자료에 회사가 없어서 노선(routes) → 터미널(terminals)에 다니는 회사 가운데 하나를 고른다(src/ui/coach-looks.js). 회사 이름·로고·상징 무늬는 화면에 넣지 않는다.',
      companies,
      terminals,
      routes,
    }) + '\n',
  );
  // 노선마다 회사를 고를 수 있는지
  let byRoute = 0;
  let byTerminal = 0;
  let none = 0;
  for (const r of intercity.routes) {
    const a = intercity.terminals[r[0]].name;
    const b = intercity.terminals[r[1]].name;
    const kindOk = (id) => !companies[id].kinds?.length || companies[id].kinds.includes(r[2]);
    if ([...(routes[`${a}→${b} ${r[2]}`] ?? []), ...(routes[`${b}→${a} ${r[2]}`] ?? [])].some(kindOk)) byRoute++;
    else if ([...(terminals[a] ?? []), ...(terminals[b] ?? [])].some(kindOk)) byTerminal++;
    else none++;
  }
  console.log(`고속·시외버스 회사 ${Object.keys(companies).length}곳, 터미널 ${Object.keys(terminals).length}곳, 노선 ${intercity.routes.length}개: 노선 자료로 ${byRoute}, 터미널 자료로 ${byTerminal}, 그 종류 아무 회사 ${none}`);
}
