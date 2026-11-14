// npm run intercity: 국토교통부 TAGO 고속버스정보(15098522)와 시외버스정보(15098541)로
// 지도 안 터미널끼리 다니는 고속·시외버스의 배차(출발·도착 시각, 요금, 등급)를 받아 data/raw/intercity/에 둔다.
// (네트워크와 인증키를 쓴다. 인증키는 저장하지 않는다.)
//
//  - 터미널 자리는 TAGO에 없어서 OpenStreetMap 버스터미널과 이름으로 잇는다(scripts/lib/terminals.mjs, data/edits/bus-terminals.json).
//    지도에 넣은 지역 안에서 이어진 터미널끼리만 부른다.
//  - 고속버스는 정한 날(EXPRESS_DATE, 이틀 안의 평일)의 배차를 받는다.
//  - 시외버스는 그날 배차만 주어서, 받는 날의 배차를 받는다. 시외버스는 길가 정류소까지 터미널로 적혀 있어서,
//    OpenStreetMap 이름에 "터미널"이 든 곳끼리만 부른다(부르는 수를 하루 허용량 안에 둔다).
//  - 받다가 멈추면 다시 돌릴 때 이어서 받는다(임시 파일). 하루 허용량을 넘으면(결과 코드 22) 멈춘다.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { readApiKey } from './lib/api-key.mjs';
import { areaTerminals, matchTerminals } from './lib/terminals.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
/** 고속버스 배차를 받을 날: 다가오는 평일. TAGO는 이틀 뒤까지만 배차를 준다(2026-11-14에 11-17부터는 빈 결과). */
export const EXPRESS_DATE = process.argv.find((a) => a.startsWith('--express-date='))?.split('=')[1] ?? '20261116';
const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10).replace(/-/g, '');
const SUBURBS_DATE = process.argv.find((a) => a.startsWith('--suburbs-date='))?.split('=')[1] ?? today;

const key = readApiKey();
if (!key) {
  console.log('인증키가 없어요. npm run api-key로 먼저 저장해요.');
  process.exit(1);
}
const encodedKey = encodeURIComponent(key);
let calls = 0;
async function getJson(base, op, params) {
  const q = new URLSearchParams({ ...params, _type: 'json' }).toString();
  for (let attempt = 1; attempt <= 4; attempt++) {
    calls += 1;
    try {
      const res = await fetch(`https://apis.data.go.kr/1613000/${base}/${op}?serviceKey=${encodedKey}&${q}`, { signal: AbortSignal.timeout(60_000) });
      const text = await res.text();
      if (res.ok) {
        const json = JSON.parse(text);
        const code = String(json?.response?.header?.resultCode ?? '00');
        if (code === '00' || code === '03') return json;
        if (code === '22') {
          console.log('오늘 부를 수 있는 수를 넘었어요. 내일 다시 돌리면 이어서 받아요.');
          process.exit(2);
        }
        console.log(`  결과 코드 ${code}. 다시 해요.`);
      } else console.log(`  HTTP ${res.status}. 다시 해요.`);
    } catch (error) {
      console.log(`  ${error.message}. 다시 해요.`);
    }
    await sleep(attempt * 3000);
  }
  return null;
}
const items = (json) => [].concat(json?.response?.body?.items?.item ?? []);
async function allTerminals(base, op) {
  const out = [];
  for (let page = 1; page < 20; page++) {
    const json = await getJson(base, op, { numOfRows: 1000, pageNo: page });
    const list = items(json);
    out.push(...list);
    if (list.length < 1000) break;
  }
  return out;
}

const places = areaTerminals(ROOT);
const edits = JSON.parse(readFileSync(resolve(ROOT, 'data/edits/bus-terminals.json'), 'utf8')).edits;
const OUT = resolve(ROOT, 'data/raw/intercity');
mkdirSync(OUT, { recursive: true });

/** 터미널 짝마다 배차를 받는다(네 개씩 함께). 받은 짝은 임시 파일에 적어 둔다. */
async function fetchPairs(label, base, op, ids, date) {
  const partialPath = resolve(tmpdir(), `busan-subway-${label}-${date}.json`);
  const done = existsSync(partialPath) ? JSON.parse(readFileSync(partialPath, 'utf8')) : {};
  const queue = [];
  for (const a of ids) for (const b of ids) if (a.id !== b.id && a.place.id !== b.place.id && !(`${a.id}|${b.id}` in done)) queue.push([a, b]);
  console.log(`${label}: 터미널 ${ids.length}개, 부를 짝 ${queue.length}개(앞서 받은 짝 ${Object.keys(done).length}개)`);
  let n = 0;
  async function worker() {
    while (queue.length) {
      const [a, b] = queue.shift();
      const json = await getJson(base, op, { depTerminalId: a.id, arrTerminalId: b.id, depPlandTime: date, numOfRows: 500, pageNo: 1 });
      if (json) done[`${a.id}|${b.id}`] = items(json).map((t) => [t.depPlandTime, t.arrPlandTime, t.charge, t.gradeNm, t.routeId]);
      n += 1;
      if (n % 100 === 0) {
        writeFileSync(partialPath, JSON.stringify(done));
        console.log(`  ${n}번째 짝`);
      }
      await sleep(40);
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()]);
  writeFileSync(partialPath, JSON.stringify(done));
  return done;
}

function save(name, data, lockKey, url) {
  const text = JSON.stringify(data);
  const file = `data/raw/intercity/${name}`;
  writeFileSync(resolve(ROOT, file), text);
  const lockPath = resolve(ROOT, 'data/raw-lock.json');
  const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
  lock[lockKey] = { file, url, bytes: Buffer.byteLength(text), sha256: createHash('sha256').update(text).digest('hex'), fetched: today.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3'), note: '인증키가 필요한 API(npm run intercity). 주소에는 인증키를 적지 않는다.' };
  writeFileSync(lockPath, JSON.stringify(Object.fromEntries(Object.entries(lock).sort(([a], [b]) => a.localeCompare(b))), null, 2) + '\n');
  console.log(`저장: ${file} ${(text.length / 1024).toFixed(0)}KB`);
}

const only = process.argv.find((a) => a.startsWith('--only='))?.split('=')[1];

if (!only || only === 'express') {
  const terminals = await allTerminals('ExpBusInfo', 'GetExpBusTrminlList');
  const matched = matchTerminals(terminals, places, edits);
  const ids = terminals.filter((t) => matched.has(t.terminalId)).map((t) => ({ id: t.terminalId, place: matched.get(t.terminalId) }));
  const pairs = await fetchPairs('express', 'ExpBusInfo', 'GetStrtpntAlocFndExpbusInfo', ids, EXPRESS_DATE);
  save(`express-${EXPRESS_DATE}.json`, { source: '공공데이터포털 15098522 국토교통부_(TAGO)_고속버스정보', runDate: EXPRESS_DATE, terminals, pairs: Object.fromEntries(Object.entries(pairs).filter(([, v]) => v.length)) }, 'intercity-express', 'https://apis.data.go.kr/1613000/ExpBusInfo/GetStrtpntAlocFndExpbusInfo');
}
if (!only || only === 'suburbs') {
  const terminals = await allTerminals('SuburbsBusInfo', 'GetSuberbsBusTrminlList');
  const matched = matchTerminals(terminals, places, edits);
  const ids = terminals.filter((t) => matched.get(t.terminalId)?.isTerminal).map((t) => ({ id: t.terminalId, place: matched.get(t.terminalId) }));
  const pairs = await fetchPairs('suburbs', 'SuburbsBusInfo', 'GetStrtpntAlocFndSuberbsBusInfo', ids, SUBURBS_DATE);
  save(`suburbs-${SUBURBS_DATE}.json`, { source: '공공데이터포털 15098541 국토교통부_(TAGO)_시외버스정보', runDate: SUBURBS_DATE, terminals, pairs: Object.fromEntries(Object.entries(pairs).filter(([, v]) => v.length)) }, 'intercity-suburbs', 'https://apis.data.go.kr/1613000/SuburbsBusInfo/GetStrtpntAlocFndSuberbsBusInfo');
}
console.log(`API를 ${calls}번 불렀어요.`);
